from fastapi import APIRouter, Depends, HTTPException, status
from app.models.schemas import ReportUploadRequest
from app.services.ai_agent import AIAgentService
from app.core.security import require_employee
from typing import Dict, Any

router = APIRouter()

@router.post("/parse-report", response_model=Dict[str, Any])
async def parse_report(payload: ReportUploadRequest, current_user: Dict[str, Any] = Depends(require_employee)):
    try:
        ai_data = await AIAgentService.parse_report(payload.report_text)
        return ai_data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI Agent parsing failed: {str(e)}"
        )
