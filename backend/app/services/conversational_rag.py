import os
import httpx
from typing import List, Dict, Any, Optional

# Import LangChain Core elements which are fully installed and available
from langchain_core.embeddings import Embeddings
from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from langchain_core.language_models.llms import LLM

# Try importing standard LangChain modules (for environments where they are fully installed)
# We handle ImportErrors gracefully so that the application runs immediately without throwing exceptions.
try:
    from langchain.embeddings import CohereEmbeddings
    from langchain_community.embeddings import HuggingFaceInferenceAPIEmbeddings
    from langchain_community.vectorstores import Chroma
    from langchain.chains import ConversationalRetrievalChain
    from langchain.memory import ConversationBufferMemory
    HAS_FULL_LANGCHAIN = True
except ImportError:
    HAS_FULL_LANGCHAIN = False

# Import the existing services
from app.services.llm_fallback import SmartLLMFallbackManager
import chromadb
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings as ChromaEmbeddings


# =====================================================================
# 1. CLOUD EMBEDDINGS ONLY (CRITICAL)
# =====================================================================

class CohereCloudEmbeddings(Embeddings):
    """
    Custom LangChain Embeddings implementation for Cohere.
    Calls Cohere's Cloud API directly to avoid downloading any local models.
    """
    def __init__(self, api_key: str, model: str = "embed-english-v3.0"):
        self.api_key = api_key
        self.model = model
        self.api_url = "https://api.cohere.com/v1/embed"

    def _embed(self, texts: List[str], input_type: str = "search_document") -> List[List[float]]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "texts": texts,
            "model": self.model,
            "input_type": input_type
        }
        response = httpx.post(self.api_url, json=payload, headers=headers, timeout=30.0)
        if response.status_code != 200:
            raise Exception(f"Cohere API Error ({response.status_code}): {response.text}")
        return [[float(x) for x in emb] for emb in response.json().get("embeddings", [])]

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self._embed(texts, input_type="search_document")

    def embed_query(self, text: str) -> List[float]:
        return self._embed([text], input_type="search_query")[0]


class HuggingFaceCloudEmbeddings(Embeddings):
    """
    Custom LangChain Embeddings implementation for Hugging Face Inference API.
    Calls Hugging Face's Cloud API directly to avoid downloading any local models.
    """
    def __init__(self, api_key: str, model: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self.api_key = api_key
        self.model = model
        self.api_url = f"https://api-inference.huggingface.co/models/{self.model}"

    def _embed(self, texts: List[str]) -> List[List[float]]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {"inputs": texts}
        response = httpx.post(self.api_url, json=payload, headers=headers, timeout=30.0)
        if response.status_code != 200:
            raise Exception(f"Hugging Face API Error ({response.status_code}): {response.text}")
        
        res_data = response.json()
        embeddings = []
        if isinstance(res_data, list) and len(res_data) > 0:
            if isinstance(res_data[0], list):
                for item in res_data:
                    embeddings.append([float(x) for x in item])
            else:
                embeddings.append([float(x) for x in res_data])
        
        # Ensure 1024-dim compatibility if needed or return direct embeddings
        return embeddings

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self._embed(texts)

    def embed_query(self, text: str) -> List[float]:
        return self._embed([text])[0]


class ChromaCloudEmbeddingFunction(EmbeddingFunction):
    """
    Bridges LangChain's Embeddings interface with Chroma's native EmbeddingFunction.
    Forces Chroma to use cloud embeddings, explicitly replacing the default local model
    and disabling local SSD downloads.
    """
    def __init__(self, langchain_embeddings: Embeddings):
        self.langchain_embeddings = langchain_embeddings

    def __call__(self, input: Documents) -> ChromaEmbeddings:
        # Chroma expects documents as a list of strings, returns list of lists of floats
        return self.langchain_embeddings.embed_documents(list(input))


def get_cloud_embeddings_instance() -> Embeddings:
    """
    Creates an Embeddings instance using keys from the environment.
    Prioritizes Cohere and falls back to Hugging Face.
    """
    cohere_key = os.environ.get("COHERE_API_KEY_1")
    hf_key = os.environ.get("HF_API_KEY_1")

    if cohere_key:
        print("[ConversationalRAG] Using Cohere Cloud Embeddings.")
        return CohereCloudEmbeddings(api_key=cohere_key)
    elif hf_key:
        print("[ConversationalRAG] Using Hugging Face Cloud Embeddings.")
        return HuggingFaceCloudEmbeddings(api_key=hf_key)
    else:
        raise ValueError(
            "CRITICAL: No cloud API keys found. Please configure COHERE_API_KEY_1 "
            "or HF_API_KEY_1 in your .env file."
        )


# =====================================================================
# 2. CHROMADB METADATA FILTERING CAPABILITY
# =====================================================================

class ChromaLangChainRetriever(BaseRetriever):
    """
    LangChain compatible Retriever that queries ChromaDB natively.
    Ensures metadata isolation by allowing user_id or lab_id filters.
    """
    collection: Any
    user_id: Optional[str] = None
    lab_id: Optional[str] = None
    limit: int = 8

    class Config:
        arbitrary_types_allowed = True

    def _get_relevant_documents(self, query: str, *, run_manager=None) -> List[Document]:
        # Formulate Chroma query filter dict
        where_filter = {}
        if self.user_id:
            where_filter["user_id"] = self.user_id
        if self.lab_id:
            where_filter["lab_id"] = self.lab_id

        # Query ChromaDB collection natively
        # If where_filter is empty, search without filters
        results = self.collection.query(
            query_texts=[query],
            n_results=self.limit,
            where=where_filter if where_filter else None
        )

        documents = []
        if results and "documents" in results and results["documents"]:
            docs = results["documents"][0]
            metadatas = results["metadatas"][0] if "metadatas" in results else []
            ids = results["ids"][0] if "ids" in results else []
            
            for idx, content in enumerate(docs):
                meta = metadatas[idx] if idx < len(metadatas) else {}
                doc_id = ids[idx] if idx < len(ids) else f"chunk_{idx}"
                meta["source_id"] = doc_id
                
                documents.append(
                    Document(page_content=content, metadata=meta)
                )
        return documents


# =====================================================================
# 3. CUSTOM LANGCHAIN LLM WRAPPER
# =====================================================================

class SmartLLMLangChainWrapper(LLM):
    """
    Wraps the existing SmartLLMFallbackManager to make it fully compatible
    with LangChain pipelines and chains.
    """
    system_prompt: Optional[str] = None
    temperature: float = 0.2

    @property
    def _llm_type(self) -> str:
        return "smart_llm_fallback_manager"

    def _call(self, prompt: str, stop: Optional[List[str]] = None, run_manager=None, **kwargs: Any) -> str:
        import asyncio
        import concurrent.futures
        
        async def run_async():
            return await SmartLLMFallbackManager.generate_response(
                prompt=prompt,
                system_prompt=self.system_prompt,
                temperature=self.temperature
            )

        try:
            loop = asyncio.get_running_loop()
            # If an event loop is already running, run the coroutine in a separate event loop in a new thread
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(lambda: asyncio.run(run_async()))
                response_dict = future.result()
        except RuntimeError:
            # If no event loop is running, run until complete in a new loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            response_dict = loop.run_until_complete(run_async())
            loop.close()

        return response_dict.get("content", "Insufficient telemetry")

    async def _acall(self, prompt: str, stop: Optional[List[str]] = None, run_manager=None, **kwargs: Any) -> str:
        """Asynchronous execution for FastAPI and other async environments."""
        response_dict = await SmartLLMFallbackManager.generate_response(
            prompt=prompt,
            system_prompt=self.system_prompt,
            temperature=self.temperature
        )
        return response_dict.get("content", "Insufficient telemetry")


# =====================================================================
# 4. CONVERSATIONAL Retreival CHAIN & MEMORY
# =====================================================================

class ConversationalRAGManager:
    """
    Manages the conversational retrieval loop using Cloud Embeddings,
    Conversational Memory, System Prompt persona, and Metadata Filtering.
    """

    def __init__(self):
        # Initialize cloud embeddings
        self.embeddings = get_cloud_embeddings_instance()
        
        # Initialize ChromaDB persistent client
        self.db_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "chroma_db"
        )
        os.makedirs(self.db_path, exist_ok=True)
        self.chroma_client = chromadb.PersistentClient(path=self.db_path)
        
        # Replace the default local embedding function with the Cloud Embedding function.
        # This completely disables local downloads of sentence-transformers models.
        self.chroma_emb_fn = ChromaCloudEmbeddingFunction(self.embeddings)
        self.collection = self.chroma_client.get_or_create_collection(
            name="ncai_dossier_data",
            embedding_function=self.chroma_emb_fn
        )
        
        # The Persona and System Prompt exactly as requested
        self.system_prompt = (
            "You are the WorkSphere AI Dossier Assistant, an elite analytical AI for NCAI Superadmins. "
            "Answer questions based ONLY on the retrieved context. You can summarize lab milestones, "
            "track individual employee progress, and explain the WorkSphere platform architecture. "
            "If the context does not contain the answer, state 'Insufficient telemetry.' "
            "Maintain a highly professional, secure administrative tone."
        )

    async def query_conversational_rag(
        self, 
        query: str, 
        chat_history: List[Dict[str, str]], 
        user_id: Optional[str] = None, 
        lab_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes a conversational QA step using memory and metadata filtering.
        
        Args:
            query: The user's follow-up question
            chat_history: List of past messages e.g., [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
            user_id: Optional metadata filter for employee data isolation
            lab_id: Optional metadata filter for lab data isolation
        """
        # Initialize LLM wrapper with our System Prompt
        llm = SmartLLMLangChainWrapper(
            system_prompt=self.system_prompt,
            temperature=0.1
        )

        # 1. METADATA FILTERING CAPABILITY:
        # Create a custom retriever that passes filters to Chroma DB during search
        retriever = ChromaLangChainRetriever(
            collection=self.collection,
            user_id=user_id,
            lab_id=lab_id,
            limit=6
        )

        # Retrieve relevant context
        docs = retriever._get_relevant_documents(query)
        context_text = "\n\n".join([
            f"Source {i+1} [Type: {doc.metadata.get('type', 'doc')}]: {doc.page_content}"
            for i, doc in enumerate(docs)
        ])

        # 2. CONVERSATIONAL MEMORY RESOLUTION:
        # Resolve contextual follow-up questions using chat history
        history_str = ""
        for msg in chat_history:
            role = "Superadmin" if msg.get("role") == "user" else "Assistant"
            history_str += f"{role}: {msg.get('content')}\n"

        # Construct prompt containing history, context, and current query
        prompt = (
            f"Below is the conversation history, followed by retrieved database context.\n\n"
            f"=== Conversation History ===\n"
            f"{history_str}\n"
            f"=== Retrieved Context ===\n"
            f"{context_text or 'No telemetry context retrieved.'}\n\n"
            f"Superadmin Query: {query}\n"
        )

        # Generate response using LLM asynchronously
        response = await llm._acall(prompt)

        return {
            "query": query,
            "response": response,
            "resolved_filters": {
                "user_id": user_id,
                "lab_id": lab_id
            },
            "source_count": len(docs),
            "sources": [
                {
                    "content": doc.page_content,
                    "metadata": doc.metadata
                } for doc in docs
            ]
        }

    async def get_employee_structured_metadata(self, user_id: str) -> str:
        """
        Fetches structured profile data, active tasks, attendance, and upload count from Supabase
        for the given employee to enrich the prompt context.
        """
        from app.db.supabase import get_supabase_client
        try:
            supabase = get_supabase_client()
            
            # Fetch profile
            profile_res = supabase.table("profiles").select("full_name").eq("id", user_id).execute()
            full_name = profile_res.data[0].get("full_name") if (profile_res.data and len(profile_res.data) > 0) else "Unknown Employee"
            
            # Fetch tasks (pending status count + titles)
            tasks_res = supabase.table("tasks").select("title, status").eq("assigned_to", user_id).execute()
            active_tasks = [t.get("title") for t in tasks_res.data if t.get("status") != "completed"]
            active_tasks_count = len(active_tasks)
            active_tasks_str = ", ".join(active_tasks) if active_tasks else "None"
            
            # Fetch attendance count
            attendance_res = supabase.table("attendance").select("id").eq("user_id", user_id).execute()
            attendance_count = len(attendance_res.data) if attendance_res.data else 0
            
            # Fetch work uploads count
            uploads_res = supabase.table("work_uploads").select("id").eq("user_id", user_id).execute()
            uploads_count = len(uploads_res.data) if uploads_res.data else 0
            
            summary = (
                f"Employee Name: {full_name}\n"
                f"Active Tasks: {active_tasks_count} ({active_tasks_str})\n"
                f"Uploads: {uploads_count}\n"
                f"Logged Attendance Days: {attendance_count}"
            )
            return summary
        except Exception as e:
            print(f"[ConversationalRAG] Failed to fetch structured metadata for {user_id}: {e}")
            return f"Employee Name: Unknown. Active Tasks: 0. Uploads: 0. Logged Attendance Days: 0 (Metadata retrieval failed)"

    async def route_and_query(
        self,
        query: str,
        chat_history: List[Dict[str, str]],
        target_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Intelligent Query Router:
        1. Classifies query into 'general', 'employee_dossier', or 'lab_aggregate'.
        2. Routes to standard conversation (for general) or retrieve context (for dossier/lab).
        3. Returns a dynamic conversational response based on structured metadata and vector data.
        """
        # Initialize LangChain LLM wrapper
        llm = SmartLLMLangChainWrapper(
            system_prompt=None,
            temperature=0.0
        )
        
        classification_prompt = (
            "You are an elite intent classification routing agent for NCAI. "
            "Classify the following user query into one of three routing categories:\n"
            "1. 'general': For greetings, general conversation, or non-specific questions.\n"
            "2. 'employee_dossier': If the query asks about a specific employee's progress, work, log, actions, or status.\n"
            "3. 'lab_aggregate': If the query asks about a laboratory, collective team progress, or aggregated lab milestones.\n\n"
            "Query: {query}\n\n"
            "Respond with ONLY one word from: ['general', 'employee_dossier', 'lab_aggregate']. Do not include any extra text."
        ).format(query=query)

        # Call LLM to classify intent
        intent_response = await llm._acall(classification_prompt)
        intent = intent_response.strip().lower().replace("'", "").replace('"', "").strip()
        
        # Clean up classification result to ensure strict route matching
        if "employee" in intent or "dossier" in intent:
            intent = "employee_dossier"
        elif "lab" in intent or "aggregate" in intent:
            intent = "lab_aggregate"
        else:
            intent = "general"

        print(f"[ConversationalRAG] Intelligent Query Routing: Classified intent as '{intent}'")

        # Route to standard conversational LLM chain (no vector search)
        if intent == "general":
            history_str = ""
            for msg in chat_history:
                role = "Superadmin" if msg.get("role") == "user" else "Assistant"
                history_str += f"{role}: {msg.get('content')}\n"

            general_prompt = (
                f"You are the WorkSphere AI Assistant, a professional analytical AI for NCAI Superadmins.\n\n"
                f"=== Conversation History ===\n"
                f"{history_str}\n"
                f"Superadmin: {query}"
            )
            response = await llm._acall(general_prompt)
            return {
                "query": query,
                "intent": "general",
                "response": response,
                "resolved_entities": {"target_id": target_id},
                "source_count": 0,
                "sources": []
            }
            
        # Route to vector retriever with employee_dossier user_id filter
        elif intent == "employee_dossier":
            # 1. Retrieve structured metadata from Supabase
            metadata_summary = "Employee Name: Unknown. Active Tasks: 0. Uploads: 0."
            if target_id:
                metadata_summary = await self.get_employee_structured_metadata(target_id)

            # 2. Retrieve vector documents
            retriever = ChromaLangChainRetriever(
                collection=self.collection,
                user_id=target_id,  # Filters on user_id metadata matching target_id
                limit=6
            )
            docs = retriever._get_relevant_documents(query)
            
            # Formulate vector logs text
            context_text = "\n\n".join([f"Document chunk: {doc.page_content}" for doc in docs]) if docs else ""
            
            history_str = ""
            for msg in chat_history:
                role = "Superadmin" if msg.get("role") == "user" else "Assistant"
                history_str += f"{role}: {msg.get('content')}\n"

            # 3. Inject new System Prompt rules
            dossier_system_prompt = (
                "You are the WorkSphere AI Dossier Assistant. You are analyzing an employee's profile. "
                "You will be provided with their 'Structured Metadata' (tasks, attendance) and their 'Vector Database Logs' (uploaded files, chat history). "
                "If the Vector Database Logs are empty, DO NOT say 'No logs or messages exist in the vector database.' Instead, converse naturally with the Superadmin. "
                "Acknowledge what the Superadmin asked, explain politely that the employee hasn't uploaded any documents yet, "
                "but offer to discuss their active tasks or attendance based on the Structured Metadata provided."
            )

            prompt = (
                f"{dossier_system_prompt}\n\n"
                f"=== Conversation History ===\n"
                f"{history_str}\n"
                f"=== Structured Metadata ===\n"
                f"{metadata_summary}\n\n"
                f"=== Vector Database Logs ===\n"
                f"{context_text or 'No vector database logs found.'}\n\n"
                f"Superadmin Query: {query}"
            )
            
            # Run LLM with custom system prompt rules
            llm_dossier = SmartLLMLangChainWrapper(
                system_prompt=dossier_system_prompt,
                temperature=0.15
            )
            response = await llm_dossier._acall(prompt)
            
            return {
                "query": query,
                "intent": "employee_dossier",
                "response": response,
                "resolved_entities": {"target_id": target_id},
                "source_count": len(docs),
                "sources": [{"content": doc.page_content, "metadata": doc.metadata} for doc in docs]
            }

        # Route to vector retriever with lab_aggregate lab_id filter
        elif intent == "lab_aggregate":
            retriever = ChromaLangChainRetriever(
                collection=self.collection,
                lab_id=target_id,  # Filters on lab_id metadata matching target_id
                limit=6
            )
            docs = retriever._get_relevant_documents(query)
            
            if not docs:
                return {
                    "query": query,
                    "intent": "lab_aggregate",
                    "response": "I don't have any logged telemetry for that yet.",
                    "resolved_entities": {"target_id": target_id},
                    "source_count": 0,
                    "sources": []
                }
                
            context_text = "\n\n".join([f"Lab Document chunk: {doc.page_content}" for doc in docs])
            
            history_str = ""
            for msg in chat_history:
                role = "Superadmin" if msg.get("role") == "user" else "Assistant"
                history_str += f"{role}: {msg.get('content')}\n"

            prompt = (
                f"{self.system_prompt}\n\n"
                f"=== Conversation History ===\n"
                f"{history_str}\n"
                f"=== Retrieved Lab Telemetry Context ===\n"
                f"{context_text}\n\n"
                f"Superadmin Query: {query}"
            )
            
            # Inject system prompt and run LLM
            llm_lab = SmartLLMLangChainWrapper(
                system_prompt=self.system_prompt,
                temperature=0.1
            )
            response = await llm_lab._acall(prompt)
            
            return {
                "query": query,
                "intent": "lab_aggregate",
                "response": response,
                "resolved_entities": {"target_id": target_id},
                "source_count": len(docs),
                "sources": [{"content": doc.page_content, "metadata": doc.metadata} for doc in docs]
            }


# =====================================================================
# 5. STANDARD LANGCHAIN IMPLEMENTATION (IF PACKAGES ARE INSTALLED)
# =====================================================================

def standard_langchain_conversational_rag(
    query: str,
    persist_directory: str,
    cohere_api_key: str,
    user_id: Optional[str] = None,
    lab_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Standard LangChain implementation showing how to write the chain using 
    ConversationalRetrievalChain, ConversationBufferMemory, and standard Chroma wrapper.
    This acts as reference code when all dependencies are installed.
    """
    if not HAS_FULL_LANGCHAIN:
        raise ImportError(
            "standard_langchain_conversational_rag requires full langchain, "
            "langchain_community, and langchain_cohere installed."
        )

    # 1. Cloud Embeddings only - no local downloads
    embeddings = CohereEmbeddings(
        cohere_api_key=cohere_api_key,
        model="embed-english-v3.0"
    )

    # Load Chroma using cloud embeddings
    db = Chroma(
        collection_name="ncai_workspace_data",
        embedding_function=embeddings,
        persist_directory=persist_directory
    )

    # 2. Metadata filtering passed as search_kwargs during retrieval
    search_kwargs = {}
    filters = {}
    if user_id:
        filters["user_id"] = user_id
    if lab_id:
        filters["lab_id"] = lab_id
    
    if filters:
        search_kwargs["filter"] = filters

    retriever = db.as_retriever(
        search_type="similarity",
        search_kwargs=search_kwargs
    )

    # 3. Conversation Memory
    memory = ConversationBufferMemory(
        memory_key="chat_history",
        return_messages=True
    )

    # 4. Persona and System Prompt injection
    from langchain.chat_models import ChatCohere
    from langchain.prompts import PromptTemplate

    system_prompt = (
        "You are the WorkSphere AI Dossier Assistant, an elite analytical AI for NCAI Superadmins. "
        "Answer questions based ONLY on the retrieved context. You can summarize lab milestones, "
        "track individual employee progress, and explain the WorkSphere platform architecture. "
        "If the context does not contain the answer, state 'Insufficient telemetry.' "
        "Maintain a highly professional, secure administrative tone.\n\n"
        "Context:\n{context}\n\n"
        "Chat History:\n{chat_history}\n\n"
        "Question: {question}"
    )
    QA_PROMPT = PromptTemplate(
        template=system_prompt,
        input_variables=["context", "chat_history", "question"]
    )

    # Build chain
    qa_chain = ConversationalRetrievalChain.from_llm(
        llm=ChatCohere(cohere_api_key=cohere_api_key, temperature=0.1),
        retriever=retriever,
        memory=memory,
        combine_docs_chain_kwargs={"prompt": QA_PROMPT}
    )

    # Run the chain
    result = qa_chain({"question": query})
    return {
        "answer": result["answer"],
        "source_documents": result.get("source_documents", [])
    }
