"""Pydantic schemas for PFMEA API."""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class PFMEAResultSchema(BaseModel):
    """Schema for PFMEA result."""
    id: Optional[int] = None
    process: str
    subprocess: Optional[str] = None
    failure_mode: str
    potential_effect: str
    severity: int
    severity_justification: Optional[str] = None
    occurrence: int
    occurrence_justification: Optional[str] = None
    detection: Optional[int] = None  # Deprecated - no longer used
    detection_justification: Optional[str] = None  # Deprecated
    rpn: int
    risk_level: str
    action_required: str
    control_point: Optional[str] = None
    confidence: Optional[str] = None
    
    class Config:
        from_attributes = True


class AnalysisSchema(BaseModel):
    """Schema for analysis."""
    id: int
    filename: str
    status: str
    uploaded_at: datetime
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    
    class Config:
        from_attributes = True


class AnalysisWithResultsSchema(AnalysisSchema):
    """Schema for analysis with results."""
    pfmea_results: List[PFMEAResultSchema] = []


class UploadResponse(BaseModel):
    """Response for file upload."""
    analysis_id: int
    filename: str
    status: str
    message: str


class AnalysisStatusResponse(BaseModel):
    """Response for analysis status."""
    analysis_id: int
    status: str
    progress: Optional[float] = None
    message: Optional[str] = None






