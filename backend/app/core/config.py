try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
    HAS_PYDANTIC_SETTINGS = True
except ImportError:
    HAS_PYDANTIC_SETTINGS = False

from pydantic import Field
from typing import Optional
import os

# Try loading .env variables manually using dotenv if available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Helper to read from .env file directly if dotenv is not present
if not os.environ.get("SUPABASE_URL"):
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    os.environ[k] = v

if HAS_PYDANTIC_SETTINGS:
    class Settings(BaseSettings):
        PROJECT_NAME: str = "WorkSphere AI"
        PROJECT_VERSION: str = "1.0.0"
        
        SUPABASE_URL: str
        SUPABASE_SERVICE_ROLE_KEY: str
        
        # AI Configuration
        OPENAI_API_KEY: Optional[str] = None
        OPEN_ROUTER_API_KEY: Optional[str] = Field(default=None, validation_alias="Open_Router_1")

        model_config = SettingsConfigDict(
            env_file=".env",
            env_file_encoding="utf-8",
            extra="ignore"
        )
    settings = Settings()  # type: ignore
else:
    class SettingsFallback:
        PROJECT_NAME: str = "WorkSphere AI"
        PROJECT_VERSION: str = "1.0.0"
        
        @property
        def SUPABASE_URL(self) -> str:
            return os.environ.get("SUPABASE_URL", "")
            
        @property
        def SUPABASE_SERVICE_ROLE_KEY(self) -> str:
            return os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
            
        @property
        def OPENAI_API_KEY(self) -> Optional[str]:
            return os.environ.get("OPENAI_API_KEY")
            
        @property
        def OPEN_ROUTER_API_KEY(self) -> Optional[str]:
            return os.environ.get("Open_Router_1") or os.environ.get("OPEN_ROUTER_API_KEY")

    settings = SettingsFallback()  # type: ignore