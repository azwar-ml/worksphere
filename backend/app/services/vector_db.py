import os
import json
from typing import List, Dict, Any

try:
    import chromadb
    from chromadb.utils import embedding_functions
    HAS_CHROMA = True
except ImportError:
    HAS_CHROMA = False

DB_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "chroma_db"
)
FALLBACK_FILE = os.path.join(DB_DIR, "fallback_db.json")

class VectorDBService:
    _client = None
    _collection = None
    
    # Database fallback for offline environment
    _offline_db = []

    @classmethod
    def _load_fallback_db(cls):
        if not os.path.exists(FALLBACK_FILE):
            cls._offline_db = []
            return
        try:
            with open(FALLBACK_FILE, "r", encoding="utf-8") as f:
                cls._offline_db = json.load(f)
        except Exception as e:
            print(f"VectorDB Fallback: Failed to load database: {e}")
            cls._offline_db = []

    @classmethod
    def _save_fallback_db(cls):
        try:
            os.makedirs(DB_DIR, exist_ok=True)
            with open(FALLBACK_FILE, "w", encoding="utf-8") as f:
                json.dump(cls._offline_db, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"VectorDB Fallback: Failed to save database: {e}")

    @classmethod
    def get_collection(cls):
        if not HAS_CHROMA:
            return None
            
        if cls._collection is None:
            db_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                "chroma_db"
            )
            os.makedirs(db_path, exist_ok=True)
            cls._client = chromadb.PersistentClient(path=db_path)
            emb_fn = embedding_functions.DefaultEmbeddingFunction()
            cls._collection = cls._client.get_or_create_collection(
                name="ncai_workspace_data",
                embedding_function=emb_fn
            )
        return cls._collection

    @classmethod
    def add_document(cls, user_id: str, file_name: str, text: str) -> None:
        """
        Chunks text and uploads it to Chroma vector database or in-memory fallback.
        """
        # Common text chunking logic
        chunk_size = 600
        overlap = 80
        chunks = []
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunks.append(text[start:end])
            if end == len(text):
                break
            start += chunk_size - overlap

        if not HAS_CHROMA:
            print("VectorDB: chromadb not installed. Ingesting to offline fallback memory database.")
            cls._load_fallback_db()
            for i, chunk in enumerate(chunks):
                clean_filename = "".join([c if c.isalnum() else "_" for c in file_name])
                cls._offline_db.append({
                    "id": f"doc_{user_id}_{clean_filename}_{i}",
                    "content": chunk,
                    "metadata": {
                        "user_id": user_id,
                        "file_name": file_name,
                        "type": "document",
                        "chunk_index": i
                    }
                })
            cls._save_fallback_db()
            print(f"VectorDB (Fallback): Ingested '{file_name}' successfully ({len(chunks)} chunks).")
            return

        try:
            collection = cls.get_collection()
            ids = []
            metadatas = []
            documents = []

            for i, chunk in enumerate(chunks):
                clean_filename = "".join([c if c.isalnum() else "_" for c in file_name])
                chunk_id = f"doc_{user_id}_{clean_filename}_{i}"
                ids.append(chunk_id)
                metadatas.append({
                    "user_id": user_id,
                    "file_name": file_name,
                    "type": "document",
                    "chunk_index": i
                })
                documents.append(chunk)

            if ids:
                collection.upsert(
                    ids=ids,
                    metadatas=metadatas,
                    documents=documents
                )
                print(f"VectorDB: Successfully added document '{file_name}' ({len(ids)} chunks).")
        except Exception as e:
            print(f"VectorDB: Failed to index document: {e}")

    @classmethod
    def add_message(cls, user_id: str, workspace_id: str, message_id: str, content: str) -> None:
        """
        Adds a single chat message to the vector database or in-memory fallback.
        """
        if not HAS_CHROMA:
            print("VectorDB: chromadb not installed. Ingesting message to offline fallback memory database.")
            cls._load_fallback_db()
            cls._offline_db.append({
                "id": f"msg_{message_id}",
                "content": content,
                "metadata": {
                    "user_id": user_id,
                    "workspace_id": workspace_id,
                    "type": "message"
                }
            })
            cls._save_fallback_db()
            return

        try:
            collection = cls.get_collection()
            chunk_id = f"msg_{message_id}"
            collection.upsert(
                ids=[chunk_id],
                metadatas=[{
                    "user_id": user_id,
                    "workspace_id": workspace_id,
                    "type": "message"
                }],
                documents=[content]
            )
            print(f"VectorDB: Indexed message '{message_id}' from user '{user_id}'.")
        except Exception as e:
            print(f"VectorDB: Failed to index message: {e}")

    @classmethod
    def query_user_data(cls, user_id: str, query: str, limit: int = 8) -> List[Dict[str, Any]]:
        """
        Queries Chroma for vector-matching chunks filtered by user_id, or in-memory fallback.
        """
        if not HAS_CHROMA:
            print("VectorDB: chromadb not installed. Querying offline fallback memory database.")
            cls._load_fallback_db()
            query_words = [w.lower() for w in query.split() if len(w) > 2]
            scored_matches = []
            
            for item in cls._offline_db:
                if item["metadata"]["user_id"] == user_id:
                    score = 0
                    content_lower = item["content"].lower()
                    for word in query_words:
                        if word in content_lower:
                            score += 1
                    # Give slightly higher preference to matching metadata file name
                    file_name = item["metadata"].get("file_name", "").lower()
                    for word in query_words:
                        if word in file_name:
                            score += 1.5
                    
                    scored_matches.append((score, item))
            
            # Sort by score descending
            scored_matches.sort(key=lambda x: x[0], reverse=True)
            
            # Retrieve matches with positive score or fallback to all researcher logs if no matches
            results = [item for score, item in scored_matches if score > 0]
            if not results:
                results = [item for score, item in scored_matches]
                
            return results[:limit]

        try:
            collection = cls.get_collection()
            where_filter = {"user_id": user_id}
            results = collection.query(
                query_texts=[query],
                n_results=limit,
                where=where_filter
            )
            
            outputs = []
            if results and "documents" in results and results["documents"]:
                docs = results["documents"][0]
                metas = results["metadatas"][0] if "metadatas" in results else []
                ids = results["ids"][0] if "ids" in results else []
                for idx, doc in enumerate(docs):
                    outputs.append({
                        "id": ids[idx] if idx < len(ids) else "",
                        "content": doc,
                        "metadata": metas[idx] if idx < len(metas) else {}
                    })
            return outputs
        except Exception as e:
            print(f"VectorDB: Query failed: {e}")
            return []
