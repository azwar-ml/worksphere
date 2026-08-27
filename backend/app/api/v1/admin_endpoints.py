from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
import httpx
import json
import os
from app.core.config import settings
from app.db.supabase import get_supabase_client
from app.core.security import require_admin, require_superadmin
from app.models.schemas import (
    AttendanceResponse, ReportUploadResponse, TaskCreate, TaskResponse,
    WorkspaceCreate, WorkspaceResponse, WorkspaceMemberAdd, WorkspaceMemberResponse,
    AlertCreate, AlertResponse, UserProfile, TaskUpdate, SummarizeRequest, SummarizeResponse,
    MessageResponse, MessageCreate
)
from app.services.vector_db import VectorDBService
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from uuid import UUID

router = APIRouter()

# --- 1. GLOBAL REVIEWS ---

@router.get("/attendance", response_model=List[Dict[str, Any]])
async def get_all_attendance(current_user: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    resp = supabase.table("attendance")\
        .select("*, profiles(full_name, email)")\
        .order("check_in", desc=True)\
        .execute()
        
    output = []
    for log in resp.data:
        profile = log.get("profiles") or {}
        output.append({
            "id": log["id"],
            "user_id": log["user_id"],
            "check_in": log["check_in"],
            "check_out": log["check_out"],
            "created_at": log["created_at"],
            "full_name": profile.get("full_name", "Unknown"),
            "email": profile.get("email", "Unknown"),
            "check_in_image": log.get("check_in_image"),
            "check_out_image": log.get("check_out_image")
        })
    return output

@router.get("/reports", response_model=List[Dict[str, Any]])
async def get_all_reports(current_user: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    resp = supabase.table("work_uploads")\
        .select("*, profiles(full_name, email)")\
        .order("created_at", desc=True)\
        .execute()
        
    output = []
    for report in resp.data:
        profile = report.get("profiles") or {}
        output.append({
            "id": report["id"],
            "user_id": report["user_id"],
            "report_text": report["report_text"],
            "summary": report["summary"],
            "blockers": report["blockers"] or [],
            "metrics": report["metrics"] or {},
            "created_at": report["created_at"],
            "full_name": profile.get("full_name", "Unknown"),
            "email": profile.get("email", "Unknown")
        })
    return output

@router.get("/employees", response_model=List[UserProfile])
async def get_all_employees(lab_id: Optional[str] = None, current_user: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    role = current_user.get("role")
    query = supabase.table("profiles").select("*").order("full_name")
    
    if role == "superadmin":
        if lab_id:
            query = query.eq("lab_id", lab_id)
    else:
        admin_lab_id = current_user.get("lab_id")
        if not admin_lab_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admin is not assigned to any lab.")
        query = query.eq("lab_id", admin_lab_id)
        
    resp = query.execute()
    return resp.data

@router.get("/researchers", response_model=List[UserProfile])
async def get_researchers(lab_id: Optional[str] = None, current_user: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    role = current_user.get("role")
    query = supabase.table("profiles").select("*").eq("status", "approved").eq("role", "employee").order("full_name")
    
    if role == "superadmin":
        if lab_id:
            query = query.eq("lab_id", lab_id)
    else:
        admin_lab_id = current_user.get("lab_id")
        if not admin_lab_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admin is not assigned to any lab.")
        query = query.eq("lab_id", admin_lab_id)
        
    resp = query.execute()
    return resp.data

@router.get("/pending", response_model=List[UserProfile])
async def get_pending_users(lab_id: Optional[str] = None, current_user: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    role = current_user.get("role")
    query = supabase.table("profiles").select("*").eq("status", "pending").order("full_name")
    
    if role == "superadmin":
        if lab_id:
            query = query.eq("lab_id", lab_id)
    else:
        admin_lab_id = current_user.get("lab_id")
        if not admin_lab_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admin is not assigned to any lab.")
        query = query.eq("lab_id", admin_lab_id)
        
    resp = query.execute()
    return resp.data

async def handle_user_approval(user_id: UUID, current_user: Dict[str, Any]):
    supabase = get_supabase_client()
    role = current_user.get("role")
    
    user_check = supabase.table("profiles").select("*").eq("id", str(user_id)).execute()
    if not user_check.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    
    target_user = user_check.data[0]
    
    if role == "superadmin":
        pass
    else:
        admin_lab_id = current_user.get("lab_id")
        if not admin_lab_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admin is not assigned to any lab.")
        if target_user.get("lab_id") != admin_lab_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only approve users belonging to your assigned lab.")
            
    target_role = target_user.get("role") or "employee"
    supabase.table("profiles").update({"status": "approved", "role": target_role}).eq("id", str(user_id)).execute()
    
    try:
        supabase.auth.admin.update_user_by_id(
            str(user_id),
            {"user_metadata": {"status": "approved", "role": target_role}}
        )
    except Exception as e:
        print(f"Auth metadata update failed: {e}")
        
    return {"status": "success", "message": "User approved successfully."}

@router.post("/employees/{user_id}/approve", response_model=Dict[str, Any])
async def approve_employee(user_id: UUID, current_user: Dict[str, Any] = Depends(require_admin)):
    return await handle_user_approval(user_id, current_user)

@router.post("/approve/{user_id}", response_model=Dict[str, Any])
async def approve_user(user_id: UUID, current_user: Dict[str, Any] = Depends(require_admin)):
    return await handle_user_approval(user_id, current_user)

# --- 2. WORKSPACE CONTROLS ---

@router.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(payload: WorkspaceCreate, current_user: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    
    # Check if duplicate name
    dup_check = supabase.table("workspaces").select("*").eq("name", payload.name).execute()
    if dup_check.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Workspace with name '{payload.name}' already exists."
        )
        
    resp = supabase.table("workspaces").insert({
        "name": payload.name,
        "description": payload.description
    }).execute()
    
    return resp.data[0]

@router.get("/workspaces/{workspace_id}/members", response_model=List[WorkspaceMemberResponse])
async def get_workspace_members(workspace_id: UUID, current_user: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    resp = supabase.table("workspace_members")\
        .select("*, profiles(full_name, email)")\
        .eq("workspace_id", workspace_id)\
        .execute()
        
    output = []
    for member in resp.data:
        profile = member.get("profiles") or {}
        output.append({
            "id": member["id"],
            "workspace_id": member["workspace_id"],
            "user_id": member["user_id"],
            "created_at": member["created_at"],
            "full_name": profile.get("full_name"),
            "email": profile.get("email")
        })
    return output

@router.post("/workspaces/{workspace_id}/members", response_model=WorkspaceMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_workspace_member(workspace_id: UUID, payload: WorkspaceMemberAdd, current_user: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    
    # Check if already a member
    dup = supabase.table("workspace_members")\
        .select("*")\
        .eq("workspace_id", workspace_id)\
        .eq("user_id", payload.user_id)\
        .execute()
    if dup.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already a member of this workspace.")
        
    insert_resp = supabase.table("workspace_members").insert({
        "workspace_id": workspace_id,
        "user_id": payload.user_id
    }).execute()
    
    # Retrieve user email/name for response
    user_resp = supabase.table("profiles").select("*").eq("id", payload.user_id).single().execute()
    profile = user_resp.data
    
    member_data = insert_resp.data[0]
    return WorkspaceMemberResponse(
        id=member_data["id"],
        workspace_id=member_data["workspace_id"],
        user_id=member_data["user_id"],
        created_at=member_data["created_at"],
        full_name=profile.get("full_name"),
        email=profile.get("email")
    )

@router.delete("/workspaces/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_workspace_member(workspace_id: UUID, user_id: UUID, current_user: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    resp = supabase.table("workspace_members")\
        .delete()\
        .eq("workspace_id", workspace_id)\
        .eq("user_id", user_id)\
        .execute()
    if not resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership record not found.")
    return None

# --- 3. TASK CONTROLS ---

@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(payload: Dict[str, Any], current_user: Dict[str, Any] = Depends(require_admin)):
    try:
        supabase = get_supabase_client()
        
        # Support both 'assigned_to' and 'assignee_id'
        assigned_to = payload.get("assignee_id") or payload.get("assigned_to")
        # Support both 'due_date' and 'deadline'
        due_date = payload.get("deadline") or payload.get("due_date")
        
        title = payload.get("title")
        description = payload.get("description")
        workspace_id = payload.get("workspace_id")
        
        if not title:
            raise HTTPException(status_code=400, detail="Title is required")
            
        insert_data = {
            "title": title,
            "description": description,
            "assigned_to": str(assigned_to) if assigned_to else None,
            "workspace_id": str(workspace_id) if workspace_id else None,
            "due_date": due_date
        }
        
        resp = supabase.table("tasks").insert(insert_data).execute()
        if not resp.data:
            raise HTTPException(status_code=500, detail="Failed to insert task.")
            
        return resp.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create task: {str(e)}"
        )

@router.get("/tasks", response_model=List[TaskResponse])
async def get_all_tasks(current_user: Dict[str, Any] = Depends(require_admin)):
    try:
        supabase = get_supabase_client()
        resp = supabase.table("tasks").select("*").order("created_at", desc=True).execute()
        return resp.data or []
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch tasks: {str(e)}"
        )

@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def admin_update_task(task_id: UUID, payload: TaskUpdate, current_user: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    
    # Check if exists
    check = supabase.table("tasks").select("*").eq("id", task_id).execute()
    if not check.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
        
    update_data = {}
    if payload.title is not None:
        update_data["title"] = payload.title
    if payload.description is not None:
        update_data["description"] = payload.description
    if payload.assigned_to is not None:
        update_data["assigned_to"] = str(payload.assigned_to) if payload.assigned_to else None
    if payload.workspace_id is not None:
        update_data["workspace_id"] = str(payload.workspace_id) if payload.workspace_id else None
    if payload.due_date is not None:
        update_data["due_date"] = payload.due_date.isoformat() if payload.due_date else None
    if payload.status is not None:
        update_data["status"] = payload.status
        
    if not update_data:
        return check.data[0]
        
    resp = supabase.table("tasks").update(update_data).eq("id", task_id).execute()
    return resp.data[0]

@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: UUID, current_user: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    resp = supabase.table("tasks").delete().eq("id", task_id).execute()
    if not resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    return None

# --- 4. ALERTS CONTROLS ---

@router.post("/alerts", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
async def broadcast_alert(payload: Dict[str, Any], current_user: Dict[str, Any] = Depends(require_admin)):
    try:
        supabase = get_supabase_client()
        sender_id = current_user["id"]
        role = current_user.get("role")
        
        content = payload.get("message") or payload.get("content")
        target_id = payload.get("target_user_id") or payload.get("target_id")
        target_type = payload.get("target_type")
        target_lab = payload.get("target_lab")
        
        if not target_type:
            target_type = "user" if target_id else ("lab" if target_lab else "global")
            
        title = payload.get("title") or "Admin Notice"
        priority = payload.get("priority") or "normal"
        
        if not content:
            raise HTTPException(status_code=400, detail="Message/content is required")
            
        if role == "superadmin":
            pass
        else:
            admin_lab_id = current_user.get("lab_id")
            if not admin_lab_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admin is not assigned to any lab.")
            if target_type == "global":
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Lab Admins cannot dispatch global alerts.")
            target_lab = admin_lab_id
            target_type = "lab"
            
        insert_data = {
            "sender_id": str(sender_id),
            "target_type": target_type,
            "target_id": str(target_id) if target_id else None,
            "target_lab": target_lab,
            "title": title,
            "content": content,
            "priority": priority
        }
        
        resp = supabase.table("alerts").insert(insert_data).execute()
        if not resp.data:
            raise HTTPException(status_code=500, detail="Failed to insert alert.")
            
        return resp.data[0]
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create alert: {str(e)}"
        )

@router.get("/alerts", response_model=List[AlertResponse])
async def get_admin_alerts(current_user: Dict[str, Any] = Depends(require_admin)):
    try:
        supabase = get_supabase_client()
        role = current_user.get("role")
        
        alerts_resp = supabase.table("alerts").select("*").execute()
        raw_alerts = (alerts_resp.data or []) if alerts_resp else []
        
        if role == "superadmin":
            filtered_alerts = raw_alerts
        else:
            admin_lab_id = current_user.get("lab_id")
            filtered_alerts = []
            for alert in raw_alerts:
                if not alert:
                    continue
                target_type = alert.get("target_type")
                target_lab = alert.get("target_lab")
                if target_type == "global" or (target_type == "lab" and target_lab == admin_lab_id):
                    filtered_alerts.append(alert)
                    
        filtered_alerts.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return filtered_alerts
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch alerts: {str(e)}"
        )

# --- 5. RAG AI SUMMARIZER ENDPOINT ---

SUMMARIZER_SYSTEM_PROMPT = """You are a strict, factual AI lab supervisor at the National Center of Artificial Intelligence (NCAI). Your job is to compile a progress report, identify blockers, and reconstruct session logs for a researcher using ONLY the provided vector database context chunks and structured metadata (Tasks/Attendance).

CRITICAL INSTRUCTIONS:
1. Your response must be strictly factual and based ONLY on the provided context and metadata. Do NOT make up any achievements, dates, numbers, or details.
2. If the vector logs are empty but metadata exists, acknowledge the missing vector logs naturally and summarize their active tasks and recent attendance instead. Do not return hardcoded error messages.
3. If no information is available regarding the specific query, state clearly: "Based on the retrieved research data, no information is available regarding [query]." Do not speculate.
4. Structure your response with these clear sections:
   ### PROGRESS SUMMARY
   - (bullet points of verified progress from logs and active tasks)
   
   ### DETECTED BLOCKERS & RISKS
   - (bullet points of any verified blockers/errors, or "No blockers found.")
   
   ### ATTENDANCE & METADATA
   - (brief summary of their recent check-ins and structured task metadata)
"""

@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_employee_data(payload: SummarizeRequest, current_user: Dict[str, Any] = Depends(require_admin)):
    employee_id = str(payload.employee_id)
    query = payload.query
    
    # 1. Query matching chunks from Vector DB (Chroma)
    matching_chunks = VectorDBService.query_user_data(user_id=employee_id, query=query, limit=8)
    
    # 2. Fetch structured metadata (Tasks, Attendance)
    supabase = get_supabase_client()
    tasks_meta = []
    try:
        tasks_res = supabase.table("tasks").select("*").eq("assigned_to", employee_id).in_("status", ["pending", "in_progress"]).execute()
        if tasks_res.data:
            tasks_meta = [f"- Task: {t['title']} (Due: {t.get('due_date')})" for t in tasks_res.data]
    except Exception as e:
        print(f"Error fetching tasks metadata for LLM: {e}")
        
    attendance_meta = []
    try:
        att_res = supabase.table("attendance").select("*").eq("user_id", employee_id).order("check_in", desc=True).limit(5).execute()
        if att_res.data:
            attendance_meta = [f"- Check-in: {a['check_in']} | Check-out: {a.get('check_out')}" for a in att_res.data]
    except Exception as e:
        print(f"Error fetching attendance metadata for LLM: {e}")
        
    # Compile context
    context_lines = []
    if tasks_meta:
        context_lines.append("=== ACTIVE TASKS ===")
        context_lines.extend(tasks_meta)
        context_lines.append("")
        
    if attendance_meta:
        context_lines.append("=== RECENT ATTENDANCE ===")
        context_lines.extend(attendance_meta)
        context_lines.append("")
    
    if not matching_chunks:
        context_lines.append("=== VECTOR LOGS ===")
        context_lines.append("No unstructured logs or chat messages found in vector database.")
        
    sources = []
    for chunk in matching_chunks:
        meta = chunk["metadata"]
        ctype = meta.get("type", "document")
        if ctype == "document":
            src_desc = f"[File: {meta.get('file_name')} Chunk: {meta.get('chunk_index')}]"
        else:
            src_desc = f"[Workspace Chat Message]"
            
        context_lines.append(f"Source {src_desc}:\n{chunk['content']}\n---")
        sources.append({
            "id": chunk["id"],
            "type": ctype,
            "description": src_desc,
            "content": chunk["content"]
        })
        
    context_str = "\n".join(context_lines)
    
    # Call OpenRouter LLM
    api_key = settings.OPEN_ROUTER_API_KEY or os.environ.get("Open_Router_1")
    if not api_key:
        preview = sources[0]['content'][:150] + "..." if sources else "- No vector logs available for this employee."
        fallback_summary = f"### PROGRESS SUMMARY\n- Found {len(sources)} matching data chunks in vector database.\n- [Preview chunk 1]: {preview}\n\n### DETECTED BLOCKERS & RISKS\n- Please configure the OpenRouter API key to synthesize these logs into a factual AI summary.\n\n### SESSION RECONSTRUCTION\n- Logs span multiple workspace submissions."
        return SummarizeResponse(
            summary=fallback_summary,
            sources=sources
        )
        
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/google/antigravity",
        "X-Title": "WorkSphere AI"
    }
    
    llm_payload = {
        "model": "openai/gpt-4o-mini",
        "messages": [
            {"role": "system", "content": SUMMARIZER_SYSTEM_PROMPT},
            {"role": "user", "content": f"Context:\n{context_str}\n\nQuery: {query}"}
        ],
        "temperature": 0.1
    }
    
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(url, json=llm_payload, headers=headers)
            if response.status_code != 200:
                raise Exception(f"OpenRouter status {response.status_code}: {response.text}")
            
            result = response.json()
            summary_content = result["choices"][0]["message"]["content"]
            return SummarizeResponse(
                summary=summary_content,
                sources=sources
            )
    except Exception as e:
        print(f"LLM Generation Error: {str(e)}")
        preview = sources[0]['content'][:150] + "..." if sources else "- No vector logs available for this employee."
        fallback_summary = f"### PROGRESS SUMMARY\n- Found {len(sources)} matching data chunks in vector database.\n- [Preview chunk 1]: {preview}\n\n### DETECTED BLOCKERS & RISKS\n- LLM Generation Error: {str(e)}\n\n### SESSION RECONSTRUCTION\n- Logs span multiple workspace submissions."
        return SummarizeResponse(
            summary=fallback_summary,
            sources=sources
        )

# --- 6. EMPLOYEE LOGS & DIRECT MESSAGE CONTROLS ---

@router.get("/employees/{employee_id}/attendance", response_model=List[Dict[str, Any]])
async def get_employee_attendance(employee_id: UUID, current_user: Dict[str, Any] = Depends(require_admin)):
    try:
        supabase = get_supabase_client()
        resp = supabase.table("attendance")\
            .select("*, profiles(full_name, email)")\
            .eq("user_id", str(employee_id))\
            .order("check_in", desc=True)\
            .execute()
            
        output = []
        for log in resp.data:
            profile = log.get("profiles") or {}
            output.append({
                "id": log["id"],
                "user_id": log["user_id"],
                "check_in": log["check_in"],
                "check_out": log["check_out"],
                "created_at": log["created_at"],
                "full_name": profile.get("full_name", "Unknown"),
                "email": profile.get("email", "Unknown"),
                "check_in_image": log.get("check_in_image"),
                "check_out_image": log.get("check_out_image")
            })
        return output
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch employee attendance logs: {str(e)}"
        )

@router.get("/employees/{employee_id}/reports", response_model=List[Dict[str, Any]])
async def get_employee_reports(employee_id: UUID, current_user: Dict[str, Any] = Depends(require_admin)):
    try:
        supabase = get_supabase_client()
        resp = supabase.table("work_uploads")\
            .select("*, profiles(full_name, email)")\
            .eq("user_id", str(employee_id))\
            .order("created_at", desc=True)\
            .execute()
            
        output = []
        for report in resp.data:
            profile = report.get("profiles") or {}
            output.append({
                "id": report["id"],
                "user_id": report["user_id"],
                "report_text": report["report_text"],
                "summary": report["summary"],
                "blockers": report["blockers"] or [],
                "metrics": report["metrics"] or {},
                "created_at": report["created_at"],
                "full_name": profile.get("full_name", "Unknown"),
                "email": profile.get("email", "Unknown")
            })
        return output
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch employee reports: {str(e)}"
        )

class DirectMessagePayload(BaseModel):
    message: str

@router.post("/employees/{employee_id}/direct-message")
async def send_direct_message(employee_id: UUID, payload: DirectMessagePayload, current_user: Dict[str, Any] = Depends(require_admin)):
    try:
        supabase = get_supabase_client()
        admin_id = current_user["id"]
        message_text = payload.message
        
        # 1. Insert alert
        alert_resp = supabase.table("alerts").insert({
            "sender_id": str(admin_id),
            "target_type": "user",
            "target_id": str(employee_id),
            "title": "Admin Direct Message",
            "content": message_text,
            "priority": "high"
        }).execute()
        
        # 2. Insert chat message into direct message workspace
        profile_resp = supabase.table("profiles").select("full_name").eq("id", str(employee_id)).execute()
        employee_name = profile_resp.data[0].get("full_name") if (profile_resp.data and profile_resp.data[0].get("full_name")) else "Employee"
        workspace_name = f"DM: Admin & {employee_name}"
        ws_check = supabase.table("workspaces").select("*").eq("name", workspace_name).execute()
        if ws_check.data:
            workspace_id = ws_check.data[0]["id"]
        else:
            ws_create = supabase.table("workspaces").insert({
                "name": workspace_name,
                "description": f"Direct message channel between Admin and employee {employee_name}"
            }).execute()
            workspace_id = ws_create.data[0]["id"]
            
            supabase.table("workspace_members").insert([
                {"workspace_id": workspace_id, "user_id": str(admin_id)},
                {"workspace_id": workspace_id, "user_id": str(employee_id)}
            ]).execute()
            
        supabase.table("messages").insert({
            "sender_id": str(admin_id),
            "receiver_id": str(employee_id),
            "content": message_text
        }).execute()
        
        return {"status": "success", "message": "Direct message sent to both alerts and chat history successfully."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send direct message: {str(e)}"
        )

@router.get("/chat/{employee_id}", response_model=List[MessageResponse])
async def get_admin_employee_chat(employee_id: UUID, current_user: Dict[str, Any] = Depends(require_admin)):
    try:
        supabase = get_supabase_client()
        admin_id = current_user["id"]
        
        # 1. Fetch employee profile to get full name
        profile_resp = supabase.table("profiles").select("full_name").eq("id", str(employee_id)).execute()
        if not profile_resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee profile not found."
            )
        employee_name = profile_resp.data[0].get("full_name") or "Employee"
        
        # 2. Fetch messages sorted by created_at ascending
        messages_resp = supabase.table("messages")\
            .select("*")\
            .or_(f"and(sender_id.eq.{admin_id},receiver_id.eq.{employee_id}),and(sender_id.eq.{employee_id},receiver_id.eq.{admin_id})")\
            .order("created_at", desc=False)\
            .execute()
            
        sender_ids = list(set(msg["sender_id"] for msg in messages_resp.data))
        profiles_map = {}
        if sender_ids:
            profiles_resp = supabase.table("profiles").select("id, full_name").in_("id", sender_ids).execute()
            profiles_map = {p["id"]: p["full_name"] for p in profiles_resp.data}
            
        output = []
        for msg in messages_resp.data:
            sender_name = profiles_map.get(msg["sender_id"], "Unknown")
            output.append({
                "id": msg["id"],
                "sender_id": msg["sender_id"],
                "receiver_id": msg["receiver_id"],
                "content": msg["content"],
                "created_at": msg["created_at"],
                "full_name": sender_name
            })
        return output
    except Exception as e:
        print(f"Error in get_admin_employee_chat: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load chat: {str(e)}"
        )

@router.post("/chat/{employee_id}", response_model=MessageResponse)
async def post_admin_employee_chat(
    employee_id: UUID, 
    payload: MessageCreate, 
    request: Request,
    current_user: Dict[str, Any] = Depends(require_admin)
):
    try:
        supabase = get_supabase_client()
        admin_id = current_user["id"]
        content = payload.content
        
        # 1. Fetch employee profile to get full name
        profile_resp = supabase.table("profiles").select("full_name").eq("id", str(employee_id)).execute()
        if not profile_resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee profile not found."
            )
        employee_name = profile_resp.data[0].get("full_name") or "Employee"
        
        # 2. Get or create 2-person DM workspace
        workspace_name = f"DM: Admin & {employee_name}"
        ws_check = supabase.table("workspaces").select("*").eq("name", workspace_name).execute()
        if ws_check.data:
            workspace_id = ws_check.data[0]["id"]
        else:
            ws_create = supabase.table("workspaces").insert({
                "name": workspace_name,
                "description": f"Direct message channel between Admin and employee {employee_name}"
            }).execute()
            workspace_id = ws_create.data[0]["id"]
            
            # Add both Admin and Employee as members
            supabase.table("workspace_members").insert([
                {"workspace_id": workspace_id, "user_id": str(admin_id)},
                {"workspace_id": workspace_id, "user_id": str(employee_id)}
            ]).execute()
            
        # 3. Insert new message from the Admin
        insert_resp = supabase.table("messages").insert({
            "sender_id": str(admin_id),
            "receiver_id": str(employee_id),
            "content": content
        }).execute()
        
        if not insert_resp.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to insert message."
            )
            
        msg_data = insert_resp.data[0]
        msg_data["full_name"] = current_user.get("full_name") or "Admin"
        
        # 4. Index in Vector DB
        try:
            # We don't have workspace_id in messages anymore, so we skip it or pass a dummy one if VectorDBService requires it
            VectorDBService.add_message(
                user_id=str(admin_id),
                workspace_id=str(workspace_id), # Keep workspace_id here for VectorDB if it still needs it
                message_id=str(msg_data["id"]),
                content=content
            )
        except Exception as ve:
            print(f"VectorDB indexing error in admin chat: {str(ve)}")
            
        # 5. Make POST request to FastAPI RAG endpoint to generate bot response
        try:
            auth_header = request.headers.get("Authorization")
            async with httpx.AsyncClient(timeout=45.0) as http_client:
                rag_url = "http://127.0.0.1:8000/api/v1/agent/dossier-query"
                headers_dict = {}
                if auth_header:
                    headers_dict["Authorization"] = auth_header
                
                rag_resp = await http_client.post(
                    rag_url,
                    json={"query": content},
                    headers=headers_dict
                )
                
                if rag_resp.status_code == 200:
                    rag_data = rag_resp.json()
                    ai_reply = rag_data.get("response")
                    
                    if ai_reply:
                        # Insert AI reply back to messages database
                        supabase.table("messages").insert({
                            "sender_id": str(employee_id),  # AI Bot acts as employee responding
                            "receiver_id": str(admin_id),
                            "content": ai_reply
                        }).execute()
        except Exception as rag_err:
            print(f"RAG pipeline call error in post_admin_employee_chat: {str(rag_err)}")
            
        return msg_data
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in post_admin_employee_chat: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to post chat message: {str(e)}"
        )

class ProfileUpdatePayload(BaseModel):
    role: Optional[str] = None
    lab_id: Optional[str] = None
    status: Optional[str] = None

@router.patch("/profiles/{user_id}", response_model=Dict[str, Any])
async def update_user_profile(user_id: UUID, payload: ProfileUpdatePayload, current_user: Dict[str, Any] = Depends(require_superadmin)):
    supabase = get_supabase_client()
    
    user_check = supabase.table("profiles").select("*").eq("id", str(user_id)).execute()
    if not user_check.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
        
    update_data = {}
    if payload.role is not None:
        if payload.role not in ['superadmin', 'admin', 'employee']:
            raise HTTPException(status_code=400, detail="Invalid role value")
        update_data["role"] = payload.role
    if payload.lab_id is not None:
        update_data["lab_id"] = payload.lab_id if payload.lab_id else None
    if payload.status is not None:
        if payload.status not in ['pending', 'approved', 'rejected']:
            raise HTTPException(status_code=400, detail="Invalid status value")
        update_data["status"] = payload.status
        
    if not update_data:
        return {"status": "success", "message": "No changes made."}
        
    supabase.table("profiles").update(update_data).eq("id", str(user_id)).execute()
    
    try:
        auth_meta = {}
        if "role" in update_data:
            auth_meta["role"] = update_data["role"]
        if "status" in update_data:
            auth_meta["status"] = update_data["status"]
        if "lab_id" in update_data:
            auth_meta["lab_id"] = update_data["lab_id"]
            
        if auth_meta:
            supabase.auth.admin.update_user_by_id(
                str(user_id),
                {"user_metadata": auth_meta}
            )
    except Exception as e:
        print(f"Auth metadata update failed in patch profile: {e}")
        
    return {"status": "success", "message": "Profile updated successfully."}
