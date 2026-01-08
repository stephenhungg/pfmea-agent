"""Security and validation utilities."""
from pathlib import Path
from fastapi import UploadFile, HTTPException
from app.core.config import settings


def validate_pdf_file(file: UploadFile) -> None:
    """
    Validate uploaded PDF file.
    
    Args:
        file: Uploaded file object
        
    Raises:
        HTTPException: If file validation fails
    """
    # Check file extension
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=400,
            detail="File must be a PDF (.pdf extension required)"
        )
    
    # Check content type
    if file.content_type not in settings.allowed_file_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(settings.allowed_file_types)}"
        )
    
    # Note: Actual file size check happens in upload route after reading
    # Magic byte validation would require reading file content first


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent path traversal and other security issues.
    
    Args:
        filename: Original filename
        
    Returns:
        Sanitized filename
    """
    # Remove path components
    safe_name = Path(filename).name
    
    # Remove any remaining dangerous characters
    safe_name = "".join(c for c in safe_name if c.isalnum() or c in "._-")
    
    # Ensure it's not empty
    if not safe_name:
        safe_name = "upload.pdf"
    
    return safe_name


def validate_file_size(file_size: int) -> None:
    """
    Validate file size against maximum allowed size.
    
    Args:
        file_size: File size in bytes
        
    Raises:
        HTTPException: If file is too large
    """
    max_size = settings.max_upload_size_mb * 1024 * 1024
    if file_size > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum allowed size of {settings.max_upload_size_mb}MB"
        )

