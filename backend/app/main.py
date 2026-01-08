"""FastAPI application entry point."""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import upload, analysis, export, websocket
from app.models import init_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug
)


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup."""
    init_db()

# CORS middleware
if settings.enable_cors:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include routers
app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(analysis.router, prefix="/api", tags=["analysis"])
app.include_router(export.router, prefix="/api", tags=["export"])
app.include_router(websocket.router, prefix="/ws", tags=["websocket"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "status": "running"
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/api/test")
async def test():
    """Test endpoint for debugging."""
    return {"message": "Backend is working!", "status": "ok"}

