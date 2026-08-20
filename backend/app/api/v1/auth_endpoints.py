from fastapi import APIRouter, Depends, HTTPException, status
from app.db.supabase import get_supabase_client
from app.models.schemas import UserSignup, UserLogin, TokenResponse, UserProfile
from app.core.security import get_current_user
from typing import Dict, Any

router = APIRouter()

@router.post("/signup", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def signup(user_data: UserSignup):
    supabase = get_supabase_client()
    user_id = None
    try:
        # Method 1: Create user with Supabase Auth Admin API (auto-confirms & bypasses rate limits)
        try:
            auth_response = supabase.auth.admin.create_user({
                "email": user_data.email,
                "password": user_data.password,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": user_data.full_name,
                    "role": "pending"
                }
            })
            if auth_response and auth_response.user:
                user_id = auth_response.user.id
        except Exception as admin_err:
            # Method 2: Fall back to standard client sign_up if admin API fails
            auth_response = supabase.auth.sign_up({
                "email": user_data.email,
                "password": user_data.password,
                "options": {
                    "data": {
                        "full_name": user_data.full_name,
                        "role": "pending"
                    }
                }
            })
            if auth_response and auth_response.user:
                user_id = auth_response.user.id
            else:
                raise admin_err
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Signup failed: User creation failed."
            )
        
        # Fallback profile insertion (in case SQL trigger was not executed)
        try:
            profile_check = supabase.table("profiles").select("*").eq("id", user_id).execute()
            if not profile_check.data:
                supabase.table("profiles").insert({
                    "id": user_id,
                    "email": user_data.email,
                    "full_name": user_data.full_name,
                    "role": "pending"
                }).execute()
        except Exception as profile_err:
            # If the database write fails (e.g. table doesn't exist yet), report clear instructions
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"User created in Auth, but failed to insert profile database. Ensure backend/schema.sql has been run. Error: {str(profile_err)}"
            )

        return {
            "status": "success",
            "message": "Access request submitted",
            "role": "pending"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Registration error: {str(e)}"
        )

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    supabase = get_supabase_client()
    try:
        # Sign in with Supabase Auth
        auth_response = supabase.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password
        })
        
        if not auth_response.session or not auth_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Login failed: Invalid credentials."
            )
            
        user_id = auth_response.user.id
        access_token = auth_response.session.access_token
        refresh_token = auth_response.session.refresh_token
        
        # Fetch role and details from profiles
        profile_resp = supabase.table("profiles").select("*").eq("id", user_id).execute()
        
        # Fallback: create profile if missing
        if not profile_resp.data:
            metadata = auth_response.user.user_metadata or {}
            full_name = metadata.get("full_name", "")
            role = metadata.get("role", "employee")
            supabase.table("profiles").insert({
                "id": user_id,
                "email": credentials.email,
                "full_name": full_name,
                "role": role
            }).execute()
            role = role
            full_name = full_name
        else:
            profile = profile_resp.data[0]
            role = profile.get("role", "employee")
            full_name = profile.get("full_name", "")
            
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user_id=user_id,
            email=credentials.email,
            full_name=full_name,
            role=role
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Login failed: {str(e)}"
        )

@router.get("/me", response_model=UserProfile)
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    supabase = get_supabase_client()
    profile_resp = supabase.table("profiles").select("*").eq("id", current_user["id"]).single().execute()
    if not profile_resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found."
        )
    return profile_resp.data
