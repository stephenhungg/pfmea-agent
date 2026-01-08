"""Database models for PFMEA analyses."""
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.models.database import Base


class Analysis(Base):
    """Model for storing PDF analysis sessions."""
    __tablename__ = "analyses"
    
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)  # When analysis finished
    status = Column(String, default="pending")  # pending, processing, completed, failed
    error_message = Column(Text, nullable=True)
    
    # Relationships
    pfmea_results = relationship("PFMEAResult", back_populates="analysis", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Analysis(id={self.id}, filename='{self.filename}', status='{self.status}')>"


class PFMEAResult(Base):
    """Model for storing individual PFMEA analysis results."""
    __tablename__ = "pfmea_results"
    
    id = Column(Integer, primary_key=True, index=True)
    analysis_id = Column(Integer, ForeignKey("analyses.id"), nullable=False)
    
    # Process information
    process = Column(String, nullable=False)
    subprocess = Column(Text, nullable=True)
    
    # Failure analysis
    failure_mode = Column(Text, nullable=False)
    potential_effect = Column(Text, nullable=False)
    
    # Ratings
    severity = Column(Integer, nullable=False)  # 1-5
    severity_justification = Column(Text, nullable=True)
    occurrence = Column(Integer, nullable=False)  # 1-5
    occurrence_justification = Column(Text, nullable=True)
    detection = Column(Integer, nullable=True)  # Deprecated: No longer used (kept for backward compatibility)
    detection_justification = Column(Text, nullable=True)  # Deprecated: No longer used
    
    # Calculated fields
    rpn = Column(Integer, nullable=False)
    risk_level = Column(String, nullable=False)  # low, medium, high
    action_required = Column(String, nullable=False)  # yes, no, maybe
    
    # Additional information
    control_point = Column(Text, nullable=True)
    confidence = Column(String, nullable=True)  # confidence score from validation
    
    # LLM reasoning (for transparency)
    analysis_reasoning = Column(Text, nullable=True)
    validation_reasoning = Column(Text, nullable=True)
    correction_reasoning = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    analysis = relationship("Analysis", back_populates="pfmea_results")
    
    def __repr__(self):
        return f"<PFMEAResult(id={self.id}, process='{self.process}', rpn={self.rpn}, risk_level='{self.risk_level}')>"






