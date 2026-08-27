from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID

# --- AUTH SCHEMAS ---
class UserSignup(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str
    role: str = Field("employee", pattern="^(pending|employee|admin|superadmin)$")
    lab_id: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: UUID
    email: str
    full_name: str
    role: str
    lab_id: Optional[str] = None
    status: str

class UserProfile(BaseModel):
    id: UUID
    email: str
    full_name: Optional[str] = None
    role: str
    lab_id: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- ATTENDANCE SCHEMAS ---
class AttendanceActionRequest(BaseModel):
    image: str # Base64 encoded JPEG image

class AttendanceResponse(BaseModel):
    id: UUID
    user_id: UUID
    check_in: datetime
    check_out: Optional[datetime] = None
    created_at: datetime
    check_in_image: Optional[str] = None
    check_out_image: Optional[str] = None

    class Config:
        from_attributes = True

# --- WORK UPLOADS (REPORTS) SCHEMAS ---
class ReportUploadRequest(BaseModel):
    report_text: str = Field(..., min_length=10)

class ReportUploadResponse(BaseModel):
    id: UUID
    user_id: UUID
    report_text: str
    summary: Optional[str] = None
    blockers: List[str] = []
    metrics: Dict[str, Any] = {}
    created_at: datetime

    class Config:
        from_attributes = True

# --- TASK SCHEMAS ---
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    assigned_to: Optional[UUID] = None
    workspace_id: Optional[UUID] = None
    due_date: Optional[datetime] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[UUID] = None
    workspace_id: Optional[UUID] = None
    due_date: Optional[datetime] = None
    status: Optional[str] = Field(None, pattern="^(pending|in_progress|completed)$")

class TaskResponse(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    assigned_to: Optional[UUID] = None
    workspace_id: Optional[UUID] = None
    due_date: Optional[datetime] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- WORKSPACE SCHEMAS ---
class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None

class WorkspaceResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class WorkspaceMemberAdd(BaseModel):
    user_id: UUID

class WorkspaceMemberResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    user_id: UUID
    created_at: datetime
    email: Optional[str] = None
    full_name: Optional[str] = None

    class Config:
        from_attributes = True

# --- MESSAGE (CHAT) SCHEMAS ---
class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1)
    receiver_id: Optional[UUID] = None

class MessageResponse(BaseModel):
    id: UUID
    sender_id: UUID
    receiver_id: Optional[UUID] = None
    content: str
    created_at: datetime
    full_name: Optional[str] = None

    class Config:
        from_attributes = True

# --- ALERT SCHEMAS ---
class AlertCreate(BaseModel):
    target_type: str = Field(..., pattern="^(global|workspace|user|lab)$")
    target_id: Optional[UUID] = None # Null for global, workspace_id or user_id otherwise
    target_lab: Optional[str] = None
    title: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    priority: str = Field("normal", pattern="^(low|normal|high|critical)$")

class AlertResponse(BaseModel):
    id: UUID
    sender_id: UUID
    target_type: str
    target_id: Optional[UUID] = None
    target_lab: Optional[str] = None
    title: str
    content: str
    priority: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- RAG SUMMARIZER SCHEMAS ---
class SummarizeRequest(BaseModel):
    employee_id: UUID
    query: str

class SummarizeResponse(BaseModel):
    summary: str
    sources: List[Dict[str, Any]]

# --- DOSSIER RAG SCHEMAS ---
class DossierQueryRequest(BaseModel):
    query: str = Field(..., min_length=3)

class DossierQueryResponse(BaseModel):
    query: str
    intent: str
    resolved_entities: Dict[str, Any]
    response: str
    provider: str
    model: str
    source_count: int
    sources: List[Dict[str, Any]]

class DossierSyncResponse(BaseModel):
    status: str
    synced_records: Dict[str, int]

