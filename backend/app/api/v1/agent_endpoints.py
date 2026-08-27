from fastapi import APIRouter, Depends, HTTPException, status
from app.models.schemas import ReportUploadRequest, DossierQueryRequest, DossierQueryResponse, DossierSyncResponse
from app.services.ai_agent import AIAgentService
from app.services.dossier_vector_service import DossierVectorService
from app.pipelines.rag_pipeline import AIDossierRAGPipeline
from app.core.security import require_employee, require_admin
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

@router.post("/dossier-query", response_model=DossierQueryResponse)
async def query_dossier(payload: DossierQueryRequest, current_user: Dict[str, Any] = Depends(require_admin)):
    try:
        result = await AIDossierRAGPipeline.execute_rag(payload.query)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI Dossier query failed: {str(e)}"
        )

@router.post("/dossier-sync", response_model=DossierSyncResponse)
async def sync_dossier_embeddings(current_user: Dict[str, Any] = Depends(require_admin)):
    try:
        stats = await DossierVectorService.sync_telemetry_to_supabase()
        return DossierSyncResponse(status="success", synced_records=stats)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Dossier telemetry sync failed: {str(e)}"
        )

