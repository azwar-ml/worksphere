from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.db.supabase import get_supabase_client
from typing import Dict, Any

security_scheme = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security_scheme)) -> Dict[str, Any]:
    token = credentials.credentials
    supabase = get_supabase_client()
    try:
        # Validate token with Supabase Auth
        user_resp = supabase.auth.get_user(token)
        if not user_resp or not user_resp.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token."
            )
        auth_user = user_resp.user
        
        # Query public.profiles to retrieve role information
        profile_resp = supabase.table("profiles").select("*").eq("id", auth_user.id).execute()
        if not profile_resp.data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User profile not found in profiles database."
            )
        
        profile = profile_resp.data[0]
        return {
            "id": auth_user.id,
            "email": auth_user.email,
            "full_name": profile.get("full_name"),
            "role": profile.get("role", "employee"),
            "lab_id": profile.get("lab_id"),
            "status": profile.get("status", "pending")
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )

def require_role(allowed_roles: list):
    async def role_dependency(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if current_user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource."
            )
        return current_user
    return role_dependency

require_employee = require_role(["employee", "admin", "superadmin"])
require_admin = require_role(["admin", "superadmin"])
require_superadmin = require_role(["superadmin"])
