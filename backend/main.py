from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from postgrest.types import CountMethod
from app.core.config import settings
from app.db.supabase import get_supabase_client

# Import API endpoints
from app.api.v1.auth_endpoints import router as auth_router
from app.api.v1.user_endpoints import router as user_router
from app.api.v1.admin_endpoints import router as admin_router
from app.api.v1.agent_endpoints import router as agent_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    description="Gen AI Research Lab Management System for NCAI"
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register endpoints under Prefix /api/v1
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(user_router, prefix="/api/v1/user", tags=["Employee Portal"])
app.include_router(admin_router, prefix="/api/v1/admin", tags=["Admin Control Panel"])
app.include_router(agent_router, prefix="/api/v1/agent", tags=["AI Agents"])

@app.get("/")
async def root():
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "message": "WorkSphere AI Engine is running securely."
    }

@app.get("/db-check")
async def check_db_connection():
    try:
        supabase = get_supabase_client()
        response = supabase.table("profiles").select("*", count=CountMethod.exact).execute()
        return {
            "status": "connected",
            "message": "Successfully connected to Supabase PostgreSQL database!",
            "profiles_count": response.count
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to connect to Supabase: {str(e)}"
        }

# --- Conversational RAG Router API ---
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from app.services.conversational_rag import ConversationalRAGManager

class ChatRequest(BaseModel):
    query: str
    chat_history: List[Dict[str, str]] = Field(default_factory=list)
    target_id: Optional[str] = None

# Initialize conversational RAG manager lazily
conversational_rag_manager = None

@app.post("/api/v1/chat")
async def chat_endpoint(payload: ChatRequest):
    global conversational_rag_manager
    if conversational_rag_manager is None:
        conversational_rag_manager = ConversationalRAGManager()
        
    try:
        result = await conversational_rag_manager.route_and_query(
            query=payload.query,
            chat_history=payload.chat_history,
            target_id=payload.target_id
        )
        return result
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=500,
            detail=f"Conversational chat routing failed: {str(e)}"
        )