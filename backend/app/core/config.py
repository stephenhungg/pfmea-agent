"""Application configuration settings."""
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    """Application settings."""
    
    # Application
    app_name: str = "PFMEA Analysis Tool"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # Database
    database_url: str = "sqlite:///./pfmea.db"
    
    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:4b"  # Detailed mode model
    ollama_fast_model: str = "llama3.2:3b"  # Fast mode model (smaller/faster)
    ollama_timeout: float = 300.0  # 5 minutes timeout for slow models
    
    # Analysis settings
    # This is the DEFAULT - can be overridden per-analysis via API
    include_justifications: bool = True  # True = detailed mode, False = fast mode
    
    # File upload
    max_upload_size_mb: int = 50
    upload_dir: Path = Path("./uploads")
    allowed_file_types: list[str] = ["application/pdf"]
    
    # Security
    enable_cors: bool = True
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()

# Create upload directory if it doesn't exist
settings.upload_dir.mkdir(parents=True, exist_ok=True)

