import unittest
import os
import sys
import json
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

# Add root folder to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main
fastapi_app = main.app

from app.core.security import require_admin
from app.services.llm_fallback import SmartLLMFallbackManager
from app.services.dossier_vector_service import DossierVectorService
from app.pipelines.rag_pipeline import AIDossierRAGPipeline

# Setup test user session details (Superadmin)
TEST_SUPERADMIN = {
    "id": "00000000-0000-0000-0000-000000000001",
    "email": "superadmin@ncai.gov",
    "role": "superadmin",
    "full_name": "NCAI Director",
    "lab_id": None,
    "status": "approved"
}

# Override FastAPI authentication dependency for tests
fastapi_app.dependency_overrides[require_admin] = lambda: TEST_SUPERADMIN

class TestDossierRAGEngine(unittest.IsolatedAsyncioTestCase):
    
    def setUp(self):
        self.client = TestClient(fastapi_app)

    async def test_1_smart_llm_fallback_success(self):
        """
        Verify that SmartLLMFallbackManager returns a response from the first working provider.
        """
        # Mock httpx.AsyncClient response to return 200 OK for Gemini Primary
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [{"text": "Hello Superadmin, how can I assist you today?"}]
                    }
                }
            ]
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            
            res = await SmartLLMFallbackManager.generate_response("Hi", temperature=0.2)
            
            self.assertEqual(res["content"], "Hello Superadmin, how can I assist you today?")
            self.assertEqual(res["provider"], "Gemini Primary")
            self.assertEqual(res["model"], "gemini-2.5-flash")

    async def test_2_smart_llm_fallback_failover(self):
        """
        Verify that SmartLLMFallbackManager automatically fails over to the next provider in sequence if primary fails.
        """
        # Primary Gemini fails (status 503), Secondary Gemini fails (status 503), but OpenRouter Primary succeeds (status 200)
        mock_fail = MagicMock()
        mock_fail.status_code = 503
        mock_fail.text = "Service Unavailable"

        mock_success = MagicMock()
        mock_success.status_code = 200
        mock_success.json.return_value = {
            "choices": [
                {
                    "message": {"content": "This is a response generated via OpenRouter fallback."}
                }
            ]
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            # First call fails (Gemini 1), second fails (Gemini 2), third succeeds (OpenRouter)
            mock_post.side_effect = [mock_fail, mock_fail, mock_success]
            
            res = await SmartLLMFallbackManager.generate_response("Hi", temperature=0.2)
            
            self.assertEqual(res["content"], "This is a response generated via OpenRouter fallback.")
            self.assertEqual(res["provider"], "OpenRouter Primary")
            self.assertEqual(res["model"], "openai/gpt-4o-mini")

    def test_3_chunk_text(self):
        """
        Verify text chunking logic operates correctly.
        """
        text = "abcdefghij" # 10 chars
        chunks = DossierVectorService.chunk_text(text, chunk_size=5, overlap=2)
        # Should chunk to:
        # 1. 'abcde' (0-5)
        # 2. 'defgh' (3-8) (starts at 5 - 2 = 3)
        # 3. 'ghij' (6-10) (starts at 8 - 2 = 6)
        self.assertEqual(len(chunks), 3)
        self.assertEqual(chunks[0], "abcde")
        self.assertEqual(chunks[1], "defgh")
        self.assertEqual(chunks[2], "ghij")

    async def test_4_embedding_generation_dimension(self):
        """
        Verify Cohere V3 embedding dimension matching.
        """
        # Mock Cohere embedding response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "embeddings": [[0.5] * 1024]
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            embeddings = await DossierVectorService.get_embeddings(["test text"])
            self.assertEqual(len(embeddings), 1)
            self.assertEqual(len(embeddings[0]), 1024)

    async def test_5_intent_detection(self):
        """
        Verify intent detection resolution.
        """
        # Mock profiles and labs
        mock_profiles = MagicMock()
        mock_profiles.data = [
            {"id": "00000000-0000-0000-0000-000000000004", "full_name": "Employee One", "email": "employee1@ncai.gov", "lab_id": "ai"}
        ]
        mock_labs = MagicMock()
        mock_labs.data = [
            {"id": "ai", "name": "Artificial Intelligence Lab"}
        ]

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.execute.side_effect = [mock_profiles, mock_labs]

        # Mock LLM response for intent classification
        mock_llm_res = {
            "content": json.dumps({
                "intent": "individual",
                "target_user_id": "00000000-0000-0000-0000-000000000004",
                "target_lab_id": None
            }),
            "provider": "Gemini Primary",
            "model": "gemini-2.5-flash"
        }

        with patch("app.pipelines.rag_pipeline.get_supabase_client", return_value=mock_supabase), \
             patch("app.services.llm_fallback.SmartLLMFallbackManager.generate_response", new_callable=AsyncMock, return_value=mock_llm_res):
            
            res = await AIDossierRAGPipeline.detect_intent_and_entities("Tell me about Employee One")
            
            self.assertEqual(res["intent"], "individual")
            self.assertEqual(res["target_user_id"], "00000000-0000-0000-0000-000000000004")
            self.assertEqual(res["target_lab_id"], None)

    def test_6_api_endpoint_query(self):
        """
        Verify calling the FastAPI endpoint for dossier-query works.
        """
        mock_rag_result = {
            "query": "Tell me about employee one",
            "intent": "individual",
            "resolved_entities": {
                "user_id": "00000000-0000-0000-0000-000000000004",
                "lab_id": None
            },
            "response": "Employee One works diligently in the AI Lab. Attendance is 100%.",
            "provider": "Gemini Primary",
            "model": "gemini-2.5-flash",
            "source_count": 1,
            "sources": []
        }

        with patch("app.pipelines.rag_pipeline.AIDossierRAGPipeline.execute_rag", new_callable=AsyncMock, return_value=mock_rag_result):
            response = self.client.post("/api/v1/agent/dossier-query", json={
                "query": "Tell me about employee one"
            })
            
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["intent"], "individual")
            self.assertEqual(data["response"], "Employee One works diligently in the AI Lab. Attendance is 100%.")

    def test_7_api_endpoint_sync(self):
        """
        Verify calling the FastAPI endpoint for dossier-sync works.
        """
        mock_sync_result = {
            "documents": 12,
            "attendance": 5,
            "tasks": 3,
            "errors": 0
        }

        with patch("app.services.dossier_vector_service.DossierVectorService.sync_telemetry_to_supabase", new_callable=AsyncMock, return_value=mock_sync_result):
            response = self.client.post("/api/v1/agent/dossier-sync")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["status"], "success")
            self.assertEqual(data["synced_records"]["documents"], 12)

if __name__ == "__main__":
    unittest.main()
