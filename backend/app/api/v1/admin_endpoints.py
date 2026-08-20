from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import httpx
import json
import os
from app.core.config import settings
from app.db.supabase import get_supabase_client
from app.core.security import require_admin
from app.models.schemas import (
    AttendanceResponse, ReportUploadResponse, TaskCreate, TaskResponse,
    WorkspaceCreate, WorkspaceResponse, WorkspaceMemberAdd, WorkspaceMemberResponse,
    AlertCreate, AlertResponse, UserProfile, TaskUpdate, SummarizeRequest, SummarizeResponse,
    MessageResponse, MessageCreate
)
from app.services.vector_db import VectorDBService
from typing import List, Dict, Any
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
async def get_all_employees(current_user: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    resp = supabase.table("profiles")\
        .select("*")\
        .order("full_name")\
        .execute()
    return resp.data

@router.post("/employees/{user_id}/approve", response_model=Dict[str, Any])
async def approve_employee(user_id: UUID, current_user: Dict[str, Any] = Depends(require_admin)):
    supabase = get_supabase_client()
    
    # Check if the user exists
    user_check = supabase.table("profiles").select("*").eq("id", str(user_id)).execute()
    if not user_check.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Researcher profile not found."
        )
    
    # Update user's role to 'employee'
    supabase.table("profiles").update({"role": "employee"}).eq("id", str(user_id)).execute()
    
    # Update auth user metadata for consistency
    try:
        supabase.auth.admin.update_user_by_id(
            str(user_id),
            {"user_metadata": {"role": "employee"}}
        )
    except Exception as e:
        print(f"Auth metadata update failed: {e}")
        
    return {"status": "success", "message": "Employee approved successfully."}

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
        
        # Support both 'message' and 'content'
        content = payload.get("message") or payload.get("content")
        # Support both 'target_user_id' and 'target_id'
        target_id = payload.get("target_user_id") or payload.get("target_id")
        
        target_type = payload.get("target_type")
        if not target_type:
            # Infer target_type
            target_type = "user" if target_id else "global"
            
        title = payload.get("title") or "Admin Notice"
        priority = payload.get("priority") or "normal"
        
        if not content:
            raise HTTPException(status_code=400, detail="Message/content is required")
            
        insert_data = {
            "sender_id": str(sender_id),
            "target_type": target_type,
            "target_id": str(target_id) if target_id else None,
            "title": title,
            "content": content,
            "priority": priority
        }
        
        resp = supabase.table("alerts").insert(insert_data).execute()
        if not resp.data:
            raise HTTPException(status_code=500, detail="Failed to insert alert.")
            
        return resp.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create alert: {str(e)}"
        )

# --- 5. RAG AI SUMMARIZER ENDPOINT ---

SUMMARIZER_SYSTEM_PROMPT = """You are a strict, factual AI lab supervisor at the National Center of Artificial Intelligence (NCAI). Your job is to compile a progress report, identify blockers, and reconstruct session logs for a researcher using ONLY the provided vector database context chunks.

CRITICAL INSTRUCTIONS:
1. Your response must be strictly factual and based ONLY on the provided context. Do NOT make up any achievements, dates, numbers, or details.
2. If the context does not contain details relevant to the admin's query, state clearly: "Based on the retrieved research data, no information is available regarding [query]." Do not speculate.
3. Structure your response with these clear sections:
   ### PROGRESS SUMMARY
   - (bullet points of verified progress)
   
   ### DETECTED BLOCKERS & RISKS
   - (bullet points of any verified blockers/errors, or "No blockers found.")
   
   ### SESSION RECONSTRUCTION
   - (brief chronological reconstruction of activities found in logs/chat)
"""

@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_employee_data(payload: SummarizeRequest, current_user: Dict[str, Any] = Depends(require_admin)):
    employee_id = str(payload.employee_id)
    query = payload.query
    
    # 1. Query matching chunks from Vector DB (Chroma)
    matching_chunks = VectorDBService.query_user_data(user_id=employee_id, query=query, limit=8)
    
    if not matching_chunks:
        return SummarizeResponse(
            summary="Based on the retrieved research data, no logs or messages exist in the vector database for this employee.",
            sources=[]
        )
        
    # Compile context
    context_lines = []
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
        
    context_str = "\n\n".join(context_lines)
    
    # Call OpenRouter LLM
    api_key = settings.OPEN_ROUTER_API_KEY or os.environ.get("Open_Router_1")
    if not api_key:
        fallback_summary = f"### PROGRESS SUMMARY\n- Found {len(sources)} matching data chunks in vector database.\n- [Preview chunk 1]: {sources[0]['content'][:150]}...\n\n### DETECTED BLOCKERS & RISKS\n- Please configure the OpenRouter API key to synthesize these logs into a factual AI summary.\n\n### SESSION RECONSTRUCTION\n- Logs span multiple workspace submissions."
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
        print(f"Error in summarize_employee_data: {e}")
        return SummarizeResponse(
            summary=f"Error generating AI summary: {str(e)}",
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
            "workspace_id": workspace_id,
            "user_id": str(admin_id),
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
        
        # 1. Fetch employee profile to get full name
        profile_resp = supabase.table("profiles").select("full_name").eq("id", str(employee_id)).execute()
        if not profile_resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee profile not found."
            )
        employee_name = profile_resp.data[0].get("full_name") or "Employee"
        
        # 2. Get workspace for this DM
        workspace_name = f"DM: Admin & {employee_name}"
        ws_resp = supabase.table("workspaces").select("*").eq("name", workspace_name).execute()
        if not ws_resp.data:
            return []  # No messages yet
            
        workspace_id = ws_resp.data[0]["id"]
        
        # 3. Fetch messages sorted by created_at ascending
        messages_resp = supabase.table("messages")\
            .select("*, profiles(full_name)")\
            .eq("workspace_id", workspace_id)\
            .order("created_at", desc=False)\
            .execute()
            
        output = []
        for msg in messages_resp.data:
            profiles = msg.get("profiles", {}) or {}
            output.append({
                "id": msg["id"],
                "workspace_id": msg["workspace_id"],
                "user_id": msg["user_id"],
                "content": msg["content"],
                "created_at": msg["created_at"],
                "full_name": profiles.get("full_name", "Unknown")
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
async def post_admin_employee_chat(employee_id: UUID, payload: MessageCreate, current_user: Dict[str, Any] = Depends(require_admin)):
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
            "workspace_id": workspace_id,
            "user_id": str(admin_id),
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
            VectorDBService.add_message(
                user_id=str(admin_id),
                workspace_id=str(workspace_id),
                message_id=str(msg_data["id"]),
                content=content
            )
        except Exception as ve:
            print(f"VectorDB indexing error in admin chat: {str(ve)}")
            
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
