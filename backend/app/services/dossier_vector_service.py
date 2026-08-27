import os
import httpx
from typing import List, Dict, Any, Optional
from app.db.supabase import get_supabase_client

class DossierVectorService:
    """
    Manages vector embeddings generation (using Cohere with HuggingFace fallback)
    and ingestion into Supabase pgvector (public.dossier_embeddings table).
    """

    @staticmethod
    async def get_embeddings(texts: List[str], is_query: bool = False) -> List[List[float]]:
        """
        Generates vector embeddings for a list of texts.
        Uses Cohere (1024-dim) as primary and HuggingFace (384-dim, padded to 1024) as fallback.
        """
        cohere_key = os.environ.get("COHERE_API_KEY_1")
        hf_key = os.environ.get("HF_API_KEY_1")

        if not cohere_key and not hf_key:
            # Safe mock fallback for local testing without internet
            print("[DossierVectorService] WARNING: No API keys configured. Generating mock embeddings.")
            return [[0.1] * 1024 for _ in texts]

        # 1. Try Cohere (embed-english-v3.0, 1024 dimensions)
        if cohere_key:
            try:
                url = "https://api.cohere.com/v1/embed"
                headers = {
                    "Authorization": f"Bearer {cohere_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "texts": texts,
                    "model": "embed-english-v3.0",
                    "input_type": "search_query" if is_query else "search_document"
                }
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(url, json=payload, headers=headers)
                    if response.status_code == 200:
                        embs = response.json().get("embeddings")
                        if embs:
                            return [[float(x) for x in emb] for emb in embs]
                    else:
                        print(f"[DossierVectorService] Cohere API error ({response.status_code}): {response.text}")
            except Exception as e:
                print(f"[DossierVectorService] Cohere embedding generation failed: {e}")

        # 2. Try HuggingFace (sentence-transformers/all-MiniLM-L6-v2, 384 dimensions -> padded to 1024)
        if hf_key:
            try:
                url = "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2"
                headers = {
                    "Authorization": f"Bearer {hf_key}",
                    "Content-Type": "application/json"
                }
                payload = {"inputs": texts}
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(url, json=payload, headers=headers)
                    if response.status_code == 200:
                        res_data = response.json()
                        embeddings = []
                        if isinstance(res_data, list) and len(res_data) > 0:
                            if isinstance(res_data[0], list):
                                for item in res_data:
                                    embeddings.append([float(x) for x in item])
                            else:
                                embeddings.append([float(x) for x in res_data])

                        # Pad embeddings to 1024 dimensions to match Supabase pgvector column
                        padded_embeddings = []
                        for emb in embeddings:
                            if len(emb) < 1024:
                                emb = emb + [0.0] * (1024 - len(emb))
                            padded_embeddings.append(emb[:1024])
                        return padded_embeddings
                    else:
                        print(f"[DossierVectorService] HF API error ({response.status_code}): {response.text}")
            except Exception as e:
                print(f"[DossierVectorService] HuggingFace embedding generation failed: {e}")

        # Final local mock fallback if both APIs failed
        print("[DossierVectorService] WARNING: Embedding APIs failed or are offline. Using mock fallback.")
        return [[0.1] * 1024 for _ in texts]

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> List[str]:
        """
        Chunks text into manageable sizes with overlap.
        """
        if not text:
            return []
        chunks = []
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunks.append(text[start:end])
            if end == len(text):
                break
            start += chunk_size - overlap
        return chunks

    @classmethod
    async def ingest_document(
        cls, 
        content: str, 
        user_id: str, 
        lab_id: Optional[str], 
        doc_type: str, 
        source_id: str, 
        created_at: Optional[str] = None
    ) -> int:
        """
        Chunks, embeds, and stores text document content in Supabase.
        """
        # Chunk text
        chunks = cls.chunk_text(content)
        if not chunks:
            return 0

        # Generate embeddings in batch
        embeddings = await cls.get_embeddings(chunks, is_query=False)

        # Build records to insert
        records = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            metadata = {
                "user_id": user_id,
                "lab_id": lab_id,
                "doc_type": doc_type,
                "source_id": source_id,
                "chunk_index": i,
                "created_at": created_at
            }
            records.append({
                "content": chunk,
                "embedding": embedding,
                "metadata": metadata
            })

        # Insert to Supabase pgvector table
        try:
            supabase = get_supabase_client()
            res = supabase.table("dossier_embeddings").insert(records).execute()
            return len(records)
        except Exception as e:
            print(f"[DossierVectorService] Failed to ingest vectors to Supabase: {e}")
            # If the database table is not migrated yet, we can print a warning.
            return 0

    @classmethod
    async def sync_telemetry_to_supabase(cls) -> Dict[str, Any]:
        """
        Retrieves raw telemetry data (daily reports, attendance, tasks),
        chunks and embeds them, and uploads them to Supabase pgvector dossier_embeddings.
        """
        supabase = get_supabase_client()
        stats = {"documents": 0, "attendance": 0, "tasks": 0, "errors": 0}

        try:
            # 1. Fetch profiles to map user_id -> lab_id
            profiles_res = supabase.table("profiles").select("id, lab_id, full_name").execute()
            user_lab_map = {
                str(p["id"]): {
                    "lab_id": p.get("lab_id"), 
                    "full_name": p.get("full_name")
                } 
                for p in profiles_res.data
            }

            # Clear existing embeddings to avoid duplication during full sync
            # For simplicity, we can truncate the table or let it add new ones.
            # In a production script we might delete prior entries.
            try:
                supabase.table("dossier_embeddings").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            except Exception as de:
                print(f"[DossierVectorService] Failed to clear prior embeddings: {de}")

            # 2. Sync Daily Reports (work_uploads table)
            reports_res = supabase.table("work_uploads").select("*").execute()
            for r in reports_res.data:
                user_id = str(r["user_id"])
                profile = user_lab_map.get(user_id, {})
                lab_id = profile.get("lab_id")
                report_content = (
                    f"Employee Daily Work Report\n"
                    f"Researcher: {profile.get('full_name', 'Unknown')}\n"
                    f"Date: {r.get('created_at', '')}\n"
                    f"Report Text: {r.get('report_text', '')}\n"
                    f"Summary: {r.get('summary', '')}\n"
                    f"Blockers: {r.get('blockers', '')}\n"
                    f"Metrics: {r.get('metrics', '')}"
                )
                cnt = await cls.ingest_document(
                    content=report_content,
                    user_id=user_id,
                    lab_id=lab_id,
                    doc_type="document",
                    source_id=str(r["id"]),
                    created_at=r.get("created_at")
                )
                stats["documents"] += cnt

            # 3. Sync Attendance Records (attendance table)
            attendance_res = supabase.table("attendance").select("*").execute()
            for att in attendance_res.data:
                user_id = str(att["user_id"])
                profile = user_lab_map.get(user_id, {})
                lab_id = profile.get("lab_id")
                attendance_text = (
                    f"Employee Attendance Log\n"
                    f"Researcher: {profile.get('full_name', 'Unknown')}\n"
                    f"Date: {att.get('created_at', '')}\n"
                    f"Checked In: {att.get('check_in', '')}\n"
                    f"Checked Out: {att.get('check_out') or 'Active'}"
                )
                cnt = await cls.ingest_document(
                    content=attendance_text,
                    user_id=user_id,
                    lab_id=lab_id,
                    doc_type="attendance",
                    source_id=str(att["id"]),
                    created_at=att.get("created_at")
                )
                stats["attendance"] += cnt

            # 4. Sync Tasks (tasks table)
            tasks_res = supabase.table("tasks").select("*").execute()
            for t in tasks_res.data:
                assigned_to = t.get("assigned_to")
                if not assigned_to:
                    continue
                user_id = str(assigned_to)
                profile = user_lab_map.get(user_id, {})
                lab_id = profile.get("lab_id")
                task_text = (
                    f"Task Assignment Log\n"
                    f"Title: {t.get('title', '')}\n"
                    f"Description: {t.get('description', '')}\n"
                    f"Assigned To: {profile.get('full_name', 'Unknown')}\n"
                    f"Workspace ID: {t.get('workspace_id', '')}\n"
                    f"Status: {t.get('status', 'pending')}\n"
                    f"Due Date: {t.get('due_date', '')}"
                )
                cnt = await cls.ingest_document(
                    content=task_text,
                    user_id=user_id,
                    lab_id=lab_id,
                    doc_type="task",
                    source_id=str(t["id"]),
                    created_at=t.get("created_at")
                )
                stats["tasks"] += cnt

        except Exception as e:
            print(f"[DossierVectorService] Ingestion sync process encountered error: {e}")
            stats["errors"] += 1

        return stats

    @classmethod
    async def query_vector_data(
        cls, 
        query: str, 
        user_id: Optional[str] = None, 
        lab_id: Optional[str] = None, 
        limit: int = 8
    ) -> List[Dict[str, Any]]:
        """
        Generates query embedding and runs a similarity match using the match_dossier_embeddings RPC.
        Filters by user_id and/or lab_id if specified.
        """
        # Generate query embedding
        embeddings = await cls.get_embeddings([query], is_query=True)
        if not embeddings:
            return []
        query_vector = embeddings[0]

        try:
            supabase = get_supabase_client()
            rpc_args = {
                "query_embedding": query_vector,
                "match_threshold": 0.0, # Retrieve best matching vectors regardless of score floor
                "match_count": limit,
                "filter_user_id": user_id,
                "filter_lab_id": lab_id
            }
            res = supabase.rpc("match_dossier_embeddings", rpc_args).execute()
            return res.data or []
        except Exception as e:
            print(f"[DossierVectorService] Similarity RPC query failed: {e}")
            return []
