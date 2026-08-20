import os
from supabase import create_client, Client
from app.core.config import settings

_supabase: Client = None

def get_supabase_client() -> Client:
    global _supabase
    if _supabase is None:
        try:
            from dotenv import load_dotenv
            load_dotenv(override=True)
        except ImportError:
            pass
        url = os.environ.get("SUPABASE_URL") or settings.SUPABASE_URL
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or settings.SUPABASE_SERVICE_ROLE_KEY
        _supabase = create_client(url, key)
    return _supabase