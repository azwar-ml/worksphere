# Triggered Uvicorn Reload - Parsers Installed
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
import os
from app.db.supabase import get_supabase_client
from app.core.security import require_employee
from app.models.schemas import (
    AttendanceResponse, ReportUploadRequest, ReportUploadResponse, 
    TaskResponse, WorkspaceResponse, MessageResponse, AlertResponse,
    AttendanceActionRequest, MessageCreate
)
from app.services.ai_agent import AIAgentService
from app.services.face_validation import FaceValidationService
from app.services.vector_db import VectorDBService

try:
    import pypdf
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

try:
    import docx2txt
    HAS_DOCX2TXT = True
except ImportError:
    HAS_DOCX2TXT = False

from typing import List, Dict, Any
from datetime import datetime, timezone
from uuid import UUID

router = APIRouter()

# --- 1. ATTENDANCE ENDPOINTS ---

@router.post("/attendance/check-in", response_model=AttendanceResponse)
async def check_in(payload: AttendanceActionRequest, current_user: Dict[str, Any] = Depends(require_employee)):
    supabase = get_supabase_client()
    user_id = current_user["id"]
    
    # Verify face validation using MediaPipe
    if not FaceValidationService.validate_face(payload.image):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Face validation failed. Please make sure your face is visible."
        )
    
    # Check if already checked in (active record without checkout)
    active_resp = supabase.table("attendance")\
        .select("*")\
        .eq("user_id", user_id)\
        .is_("check_out", "null")\
        .execute()
        
    if active_resp.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already checked in. Check out first."
        )
        
    # Insert check-in log
    now_utc = datetime.now(timezone.utc).isoformat()
    insert_resp = supabase.table("attendance").insert({
        "user_id": user_id,
        "check_in": now_utc,
        "check_in_image": payload.image
    }).execute()
    
    if not insert_resp.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record check-in."
        )
        
    return insert_resp.data[0]

@router.post("/attendance/check-out", response_model=AttendanceResponse)
async def check_out(payload: AttendanceActionRequest, current_user: Dict[str, Any] = Depends(require_employee)):
    supabase = get_supabase_client()
    user_id = current_user["id"]
    
    # Verify face validation using MediaPipe
    if not FaceValidationService.validate_face(payload.image):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Face validation failed. Please make sure your face is visible."
        )
    
    # Get active record
    active_resp = supabase.table("attendance")\
        .select("*")\
        .eq("user_id", user_id)\
        .is_("check_out", "null")\
        .execute()
        
    if not active_resp.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have no active check-in logs. Check in first."
        )
        
    log_id = active_resp.data[0]["id"]
    now_utc = datetime.now(timezone.utc).isoformat()
    
    # Update check-out timestamp
    update_resp = supabase.table("attendance").update({
        "check_out": now_utc,
        "check_out_image": payload.image
    }).eq("id", log_id).execute()
    
    if not update_resp.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record check-out."
        )
        
    return update_resp.data[0]

@router.get("/attendance/history", response_model=List[AttendanceResponse])
async def get_attendance_history(current_user: Dict[str, Any] = Depends(require_employee)):
    supabase = get_supabase_client()
    user_id = current_user["id"]
    
    history_resp = supabase.table("attendance")\
        .select("*")\
        .eq("user_id", user_id)\
        .order("check_in", desc=True)\
        .execute()
        
    return history_resp.data

# --- 2. WORK UPLOADS (REPORTS) ENDPOINTS ---

@router.post("/work/upload", response_model=ReportUploadResponse)
async def upload_report(payload: ReportUploadRequest, current_user: Dict[str, Any] = Depends(require_employee)):
    supabase = get_supabase_client()
    user_id = current_user["id"]
    
    # 1. Execute AI parsing logic via agent
    ai_analysis = await AIAgentService.parse_report(payload.report_text)
    
    # 2. Insert report and AI outputs into database
    insert_resp = supabase.table("work_uploads").insert({
        "user_id": user_id,
        "report_text": payload.report_text,
        "summary": ai_analysis.get("summary"),
        "blockers": ai_analysis.get("blockers"),
        "metrics": ai_analysis.get("metrics")
    }).execute()
    
    if not insert_resp.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save report submission."
        )
        
    return insert_resp.data[0]

@router.post("/work/upload-file", response_model=ReportUploadResponse)
async def upload_file(file: UploadFile = File(...), current_user: Dict[str, Any] = Depends(require_employee)):
    supabase = get_supabase_client()
    user_id = current_user["id"]
    file_name = file.filename
    
    # Read file content
    contents = await file.read()
    text_content = ""
    
    file_ext = os.path.splitext(file_name)[1].lower()
    if file_ext == ".txt":
        try:
            text_content = contents.decode("utf-8")
        except UnicodeDecodeError:
            text_content = contents.decode("latin-1")
    elif file_ext == ".pdf":
        import io
        if not HAS_PYPDF:
            print("VectorDB (Upload): pypdf not installed. Falling back to plain text extraction.")
            text_content = contents.decode("utf-8", errors="ignore")
        else:
            try:
                pdf_reader = pypdf.PdfReader(io.BytesIO(contents))
                text_chunks = []
                for page in pdf_reader.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_chunks.append(page_text)
                text_content = "\n".join(text_chunks)
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to parse PDF file: {str(e)}"
                )
    elif file_ext == ".docx":
        import io
        if not HAS_DOCX2TXT:
            print("VectorDB (Upload): docx2txt not installed. Falling back to plain text extraction.")
            text_content = contents.decode("utf-8", errors="ignore")
        else:
            try:
                text_content = docx2txt.process(io.BytesIO(contents))
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to parse DOCX file: {str(e)}"
                )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Please upload PDF, DOCX, or TXT."
        )
        
    if not text_content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file contains no readable text."
        )

    # Vectorize chunks in ChromaDB
    VectorDBService.add_document(user_id=str(user_id), file_name=file_name, text=text_content)
    
    # Parse first 2000 characters for meta-extraction
    ai_analysis = await AIAgentService.parse_report(text_content[:2000])
    
    # Insert record into work_uploads table to keep history in Supabase
    insert_resp = supabase.table("work_uploads").insert({
        "user_id": user_id,
        "report_text": f"[File: {file_name}] - {text_content[:800]}...",
        "summary": ai_analysis.get("summary") or f"Research log file '{file_name}' uploaded and indexed.",
        "blockers": ai_analysis.get("blockers") or [],
        "metrics": {
            "file_name": file_name,
            "file_size_bytes": len(contents),
            "char_count": len(text_content),
            **ai_analysis.get("metrics", {})
        }
    }).execute()
    
    if not insert_resp.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save report submission."
        )
        
    return insert_resp.data[0]

@router.get("/work/history", response_model=List[ReportUploadResponse])
async def get_report_history(current_user: Dict[str, Any] = Depends(require_employee)):
    supabase = get_supabase_client()
    user_id = current_user["id"]
    
    reports_resp = supabase.table("work_uploads")\
        .select("*")\
        .eq("user_id", user_id)\
        .order("created_at", desc=True)\
        .execute()
        
    return reports_resp.data

# --- 3. TASKS ENDPOINTS ---

@router.get("/tasks/my-tasks", response_model=List[TaskResponse])
async def get_my_tasks(current_user: Dict[str, Any] = Depends(require_employee)):
    import traceback
    try:
        supabase = get_supabase_client()
        user_id = current_user["id"]
        
        # 1. Fetch tasks assigned directly to the user
        personal_tasks_resp = supabase.table("tasks")\
            .select("*")\
            .eq("assigned_to", str(user_id))\
            .execute()
        personal_tasks = (personal_tasks_resp.data or []) if personal_tasks_resp else []
        
        # 2. Fetch tasks associated with workspaces the user belongs to
        member_resp = supabase.table("workspace_members")\
            .select("workspace_id")\
            .eq("user_id", str(user_id))\
            .execute()
        member_data = (member_resp.data or []) if member_resp else []
        workspace_ids = [m["workspace_id"] for m in member_data if m and m.get("workspace_id")]
        
        workspace_tasks = []
        if workspace_ids:
            workspace_tasks_resp = supabase.table("tasks")\
                .select("*")\
                .in_("workspace_id", workspace_ids)\
                .execute()
            workspace_tasks = (workspace_tasks_resp.data or []) if workspace_tasks_resp else []
            
        # 3. Combine and deduplicate
        all_tasks_dict = {}
        for task in personal_tasks + workspace_tasks:
            if task and task.get("id"):
                all_tasks_dict[task["id"]] = task
            
        combined_tasks = list(all_tasks_dict.values())
        
        # 4. Sort by due_date (nulls last)
        def sort_key(t):
            due = t.get("due_date")
            return due if due else "9999-12-31T23:59:59"
            
        combined_tasks.sort(key=sort_key)
        return combined_tasks
    except Exception as e:
        print("CRITICAL ENDPOINT CRASH in get_my_tasks:")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch tasks: {str(e)}"
        )

@router.patch("/tasks/{task_id}/status", response_model=TaskResponse)
async def update_task_status(task_id: UUID, status: str, current_user: Dict[str, Any] = Depends(require_employee)):
    supabase = get_supabase_client()
    user_id = current_user["id"]
    
    # Verify task is assigned to user or user is admin
    task_resp = supabase.table("tasks").select("*").eq("id", task_id).execute()
    if not task_resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
        
    task = task_resp.data[0]
    is_admin = current_user["role"] in ["admin", "superadmin"]
    if task["assigned_to"] != str(user_id) and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to update this task."
        )
        
    if status not in ["pending", "in_progress", "completed"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status.")
        
    update_resp = supabase.table("tasks").update({"status": status}).eq("id", task_id).execute()
    return update_resp.data[0]

# --- 4. WORKSPACES & CHAT ENDPOINTS ---

@router.get("/workspaces", response_model=List[WorkspaceResponse])
async def get_my_workspaces(current_user: Dict[str, Any] = Depends(require_employee)):
    try:
        supabase = get_supabase_client()
        user_id = current_user["id"]
        
        # Admins and superadmins see all workspaces
        if current_user.get("role") in ["admin", "superadmin"]:
            workspace_resp = supabase.table("workspaces").select("*").order("name").execute()
            return workspace_resp.data or []
            
        # Regular employees see only workspaces they belong to
        member_resp = supabase.table("workspace_members")\
            .select("workspace_id")\
            .eq("user_id", str(user_id))\
            .execute()
            
        w_ids = [m["workspace_id"] for m in member_resp.data if m.get("workspace_id")]
        
        if not w_ids:
            return []
            
        workspace_resp = supabase.table("workspaces")\
            .select("*")\
            .in_("id", w_ids)\
            .order("name")\
            .execute()
            
        return workspace_resp.data or []
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch workspaces: {str(e)}"
        )

@router.get("/workspaces/{workspace_id}/messages", response_model=List[MessageResponse])
async def get_workspace_messages(workspace_id: UUID, current_user: Dict[str, Any] = Depends(require_employee)):
    supabase = get_supabase_client()
    user_id = current_user["id"]
    
    # Check membership unless admin
    if current_user["role"] not in ["admin", "superadmin"]:
        member_check = supabase.table("workspace_members")\
            .select("*")\
            .eq("workspace_id", workspace_id)\
            .eq("user_id", user_id)\
            .execute()
        if not member_check.data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this workspace."
            )
            
    # Fetch messages where receiver_id is NULL
    messages_resp = supabase.table("messages")\
        .select("*")\
        .is_("receiver_id", "null")\
        .order("created_at", desc=False)\
        .execute()
        
    sender_ids = list(set(msg["sender_id"] for msg in messages_resp.data))
    profiles_map = {}
    if sender_ids:
        profiles_resp = supabase.table("profiles").select("id, full_name").in_("id", sender_ids).execute()
        profiles_map = {p["id"]: p["full_name"] for p in profiles_resp.data}
        
    # Flatten the join result
    output = []
    for msg in messages_resp.data:
        sender_name = profiles_map.get(msg["sender_id"], "Unknown")
        output.append({
            "id": msg["id"],
            "sender_id": msg["sender_id"],
            "receiver_id": msg.get("receiver_id"),
            "content": msg["content"],
            "created_at": msg["created_at"],
            "full_name": sender_name
        })
        
    return output

@router.post("/workspaces/{workspace_id}/messages", response_model=MessageResponse)
async def post_workspace_message(
    workspace_id: UUID, 
    payload: MessageCreate, 
    current_user: Dict[str, Any] = Depends(require_employee)
):
    supabase = get_supabase_client()
    user_id = current_user["id"]
    content = payload.content
    
    # Verify membership
    if current_user["role"] not in ["admin", "superadmin"]:
        member_check = supabase.table("workspace_members")\
            .select("*")\
            .eq("workspace_id", workspace_id)\
            .eq("user_id", user_id)\
            .execute()
        if not member_check.data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not belong to this workspace."
            )
            
    # Find the other member in the workspace to be the receiver
    receiver_id = payload.receiver_id
    if not receiver_id:
        other_member = supabase.table("workspace_members")\
            .select("user_id")\
            .eq("workspace_id", workspace_id)\
            .neq("user_id", user_id)\
            .limit(1).execute()
        receiver_id = other_member.data[0]["user_id"] if other_member.data else None
        
    # Insert message
    try:
        insert_resp = supabase.table("messages").insert({
            "sender_id": str(user_id),
            "receiver_id": str(receiver_id) if receiver_id else None,
            "content": content
        }).execute()
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Supabase message insert error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to post message: {str(e)}"
        )
    
    if not insert_resp.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to insert message into Supabase database."
        )
        
    msg_data = insert_resp.data[0]
    msg_data["full_name"] = current_user.get("full_name", "")
    
    # Index message text in vector database for Admin RAG AI Summarizer
    try:
        VectorDBService.add_message(
            user_id=str(user_id),
            workspace_id=str(workspace_id),
            message_id=str(msg_data["id"]),
            content=content
        )
    except Exception as ve:
        print(f"VectorDB indexing error: {str(ve)}")
    
    return msg_data

# --- 5. ALERTS ENDPOINTS ---

@router.get("/alerts", response_model=List[AlertResponse])
async def get_employee_alerts(current_user: Dict[str, Any] = Depends(require_employee)):
    import traceback
    try:
        supabase = get_supabase_client()
        user_id = current_user["id"]
        
        # 1. Fetch workspaces the user is in
        member_resp = supabase.table("workspace_members")\
            .select("workspace_id")\
            .eq("user_id", str(user_id))\
            .execute()
        member_data = (member_resp.data or []) if member_resp else []
        w_ids = {str(m["workspace_id"]) for m in member_data if m and m.get("workspace_id")}
        
        # 2. Fetch all alerts from database
        alerts_resp = supabase.table("alerts").select("*").execute()
        raw_alerts = (alerts_resp.data or []) if alerts_resp else []
        
        # 3. Filter alerts in Python to make it extremely crash-safe and consistent
        filtered_alerts = []
        for alert in raw_alerts:
            if not alert:
                continue
            target_type = alert.get("target_type")
            target_id = alert.get("target_id")
            
            # Allow:
            # - global/broadcast alerts
            # - alerts targeted directly to this employee (target_type == 'user')
            # - alerts targeted to workspaces this employee belongs to (target_type == 'workspace')
            if (
                target_type == "global"
                or (target_type == "user" and target_id == str(user_id))
                or (target_type == "workspace" and target_id in w_ids)
            ):
                filtered_alerts.append(alert)
                
        # Sort by created_at descending
        filtered_alerts.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return filtered_alerts
    except Exception as e:
        print("CRITICAL ENDPOINT CRASH in get_employee_alerts:")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch employee alerts: {str(e)}"
        )

@router.get("/alerts/my-alerts", response_model=List[AlertResponse])
async def get_my_alerts(current_user: Dict[str, Any] = Depends(require_employee)):
    return await get_employee_alerts(current_user)

# --- 6. EMPLOYEE DELETION ENDPOINTS ---

@router.delete("/employee/attendance/{record_id}")
async def delete_my_attendance(record_id: UUID, current_user: Dict[str, Any] = Depends(require_employee)):
    try:
        supabase = get_supabase_client()
        user_id = current_user["id"]
        
        # Strict owner check: delete record where id matches record_id AND user_id matches logged-in user
        resp = supabase.table("attendance")\
            .delete()\
            .eq("id", str(record_id))\
            .eq("user_id", str(user_id))\
            .execute()
            
        return {"status": "success", "message": "Attendance record deleted successfully."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete attendance record: {str(e)}"
        )

@router.delete("/employee/work-uploads/{upload_id}")
async def delete_my_work_upload(upload_id: UUID, current_user: Dict[str, Any] = Depends(require_employee)):
    try:
        supabase = get_supabase_client()
        user_id = current_user["id"]
        
        # Strict owner check: delete record where id matches upload_id AND user_id matches logged-in user
        resp = supabase.table("work_uploads")\
            .delete()\
            .eq("id", str(upload_id))\
            .eq("user_id", str(user_id))\
            .execute()
            
        return {"status": "success", "message": "Work report submission deleted successfully."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete work report submission: {str(e)}"
        )
