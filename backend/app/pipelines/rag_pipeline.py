import json
import re
from typing import Dict, Any, List, Optional
from app.db.supabase import get_supabase_client
from app.services.llm_fallback import SmartLLMFallbackManager
from app.services.dossier_vector_service import DossierVectorService

# Master System Prompt exactly as requested
MASTER_SYSTEM_PROMPT = (
    "You are the WorkSphere AI Dossier Assistant, an elite analytical AI for NCAI Superadmins. "
    "Using the provided retrieved context, answer the Superadmin's query. "
    "1. For individual employees: Summarize their attendance, daily work, and performance concisely. "
    "2. For labs/collectives: Aggregate the data to provide high-level statistics. "
    "3. For WorkSphere AI: Explain the project as our secure, centralized lab management platform. "
    "Maintain a conversational, professional tone. If information is missing from the context, "
    "explicitly state 'Insufficient telemetry' instead of hallucinating."
)

class AIDossierRAGPipeline:
    """
    RAG Pipeline for compiling dossier analyses of researchers, labs, or platform info.
    """

    @classmethod
    async def detect_intent_and_entities(cls, query: str) -> Dict[str, Any]:
        """
        Uses a lightweight LLM call to classify the intent and target entities.
        Falls back to keyword matching if LLM fails.
        """
        supabase = get_supabase_client()
        
        # 1. Fetch active profiles and labs to help the LLM match names/IDs accurately
        profiles = []
        labs = []
        try:
            p_res = supabase.table("profiles").select("id, email, full_name, lab_id").execute()
            profiles = p_res.data or []
            l_res = supabase.table("labs").select("id, name").execute()
            labs = l_res.data or []
        except Exception as e:
            print(f"[RAGPipeline] Failed to fetch entities for intent detection: {e}")

        # Construct lookup databases
        profile_list_str = "\n".join([
            f"- Name: {p['full_name']}, Email: {p['email']}, ID: {p['id']}, Lab ID: {p.get('lab_id')}"
            for p in profiles
        ])
        lab_list_str = "\n".join([
            f"- Name: {l['name']}, ID: {l['id']}"
            for l in labs
        ])

        system_instruction = (
            "You are a routing and classification agent. Your job is to classify the intent of a superadmin query "
            "and extract target entities. You must return ONLY a JSON object and nothing else. Do not wrap in markdown.\n\n"
            "Classification Rules:\n"
            "- intent: 'individual' (query about a specific researcher/employee), 'lab' (query about a specific lab or its collective statistics), "
            "'platform' (query about the WorkSphere AI platform/project itself), or 'general' (anything else).\n"
            "- target_user_id: The UUID of the matched employee if intent is 'individual' (must match one of the IDs below), else null.\n"
            "- target_lab_id: The ID of the matched lab if intent is 'lab' (must match one of the IDs below), else null.\n\n"
            f"Available Employees:\n{profile_list_str}\n\n"
            f"Available Labs:\n{lab_list_str}\n\n"
            "JSON Format:\n"
            "{\n"
            '  "intent": "individual" | "lab" | "platform" | "general",\n'
            '  "target_user_id": "UUID" | null,\n'
            '  "target_lab_id": "string" | null\n'
            "}"
        )

        try:
            # Try LLM-based intent classification
            res = await SmartLLMFallbackManager.generate_response(
                prompt=f"Query: {query}",
                system_prompt=system_instruction,
                temperature=0.0 # Strict classification
            )
            
            content = res["content"].strip()
            # Remove potential markdown wrappers
            if content.startswith("```json"):
                content = content[7:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

            parsed = json.loads(content)
            return {
                "intent": parsed.get("intent", "general"),
                "target_user_id": parsed.get("target_user_id"),
                "target_lab_id": parsed.get("target_lab_id"),
                "method": "llm"
            }
        except Exception as err:
            print(f"[RAGPipeline] LLM intent detection failed ({err}). Falling back to keyword search.")
            
            # Simple keyword fallback matching
            query_lower = query.lower()
            
            # Check individual employees
            for p in profiles:
                full_name = p.get("full_name") or ""
                email = p.get("email") or ""
                if (full_name and full_name.lower() in query_lower) or (email and email.lower() in query_lower):
                    return {
                        "intent": "individual",
                        "target_user_id": str(p["id"]),
                        "target_lab_id": None,
                        "method": "keyword_fallback"
                    }

            # Check labs
            for l in labs:
                name = l.get("name") or ""
                lab_id = l.get("id") or ""
                if (name and name.lower() in query_lower) or (lab_id and lab_id.lower() in query_lower):
                    return {
                        "intent": "lab",
                        "target_user_id": None,
                        "target_lab_id": lab_id,
                        "method": "keyword_fallback"
                    }

            # Check platform keywords
            platform_keywords = ["worksphere", "platform", "project", "system", "portal", "rag engine", "ncai"]
            if any(k in query_lower for k in platform_keywords):
                return {
                    "intent": "platform",
                    "target_user_id": None,
                    "target_lab_id": None,
                    "method": "keyword_fallback"
                }

            return {
                "intent": "general",
                "target_user_id": None,
                "target_lab_id": None,
                "method": "keyword_fallback"
            }

    @classmethod
    async def execute_rag(cls, query: str) -> Dict[str, Any]:
        """
        Executes the full conversational retrieval loop.
        1. Classifies intent & entities.
        2. Queries database using similarity matching and metadata filters.
        3. Formulates response using the Master System Prompt.
        """
        # Step 1: Detect intent and setup metadata filters
        classification = await cls.detect_intent_and_entities(query)
        intent = classification["intent"]
        user_id = classification["target_user_id"]
        lab_id = classification["target_lab_id"]

        print(f"[RAGPipeline] Query intent: '{intent}' (User: {user_id}, Lab: {lab_id}) via {classification['method']}")

        # Step 2: Retrieve relevant telemetry context from pgvector
        matching_chunks = await DossierVectorService.query_vector_data(
            query=query,
            user_id=user_id,
            lab_id=lab_id,
            limit=10
        )

        sources = []
        context_parts = []
        for idx, chunk in enumerate(matching_chunks):
            meta = chunk.get("metadata", {})
            doc_type = meta.get("doc_type", "document")
            source_date = meta.get("created_at") or "Unknown"
            
            src_desc = f"[Type: {doc_type}, Date: {source_date}]"
            context_parts.append(f"--- Source {idx+1} {src_desc} ---\n{chunk.get('content')}")
            
            sources.append({
                "id": chunk.get("id"),
                "doc_type": doc_type,
                "content": chunk.get("content"),
                "metadata": meta
            })

        context_str = "\n\n".join(context_parts) if context_parts else ""

        # Step 3: Run retrieval chain / Synthesize response
        # In case context is completely missing, the model is instructed to say 'Insufficient telemetry'
        prompt = f"Superadmin Query: {query}\n\nRetrieved Telemetry Context:\n{context_str or 'No telemetry context retrieved.'}"

        try:
            llm_res = await SmartLLMFallbackManager.generate_response(
                prompt=prompt,
                system_prompt=MASTER_SYSTEM_PROMPT,
                temperature=0.2
            )
            
            return {
                "query": query,
                "intent": intent,
                "resolved_entities": {
                    "user_id": user_id,
                    "lab_id": lab_id
                },
                "response": llm_res["content"],
                "provider": llm_res["provider"],
                "model": llm_res["model"],
                "source_count": len(sources),
                "sources": sources
            }
        except Exception as e:
            return {
                "query": query,
                "intent": intent,
                "resolved_entities": {
                    "user_id": user_id,
                    "lab_id": lab_id
                },
                "response": "Insufficient telemetry",
                "error": str(e),
                "provider": "None (Failed)",
                "model": "None (Failed)",
                "source_count": len(sources),
                "sources": sources
            }
