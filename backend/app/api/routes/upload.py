"""API routes for PDF upload."""
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.models import get_db, Analysis
from app.core.config import settings
from app.core.security import validate_pdf_file, sanitize_filename, validate_file_size
from app.schemas.pfmea import UploadResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload a PDF file for PFMEA analysis.
    
    Args:
        background_tasks: FastAPI background tasks
        file: Uploaded PDF file
        db: Database session
        
    Returns:
        Upload response with analysis ID
    """
    # Validate file
    validate_pdf_file(file)
    
    # Read file content to check size
    content = await file.read()
    validate_file_size(len(content))
    
    # Reset file pointer
    await file.seek(0)
    
    # Sanitize filename
    safe_filename = sanitize_filename(file.filename)
    
    # Save file
    file_path = settings.upload_dir / safe_filename
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    # Create analysis record
    analysis = Analysis(
        filename=safe_filename,
        file_path=str(file_path),
        status="pending"
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    
    logger.info(f"Uploaded PDF: {safe_filename} (Analysis ID: {analysis.id})")
    
    return UploadResponse(
        analysis_id=analysis.id,
        filename=safe_filename,
        status="pending",
        message="File uploaded successfully. Analysis will begin shortly."
    )






