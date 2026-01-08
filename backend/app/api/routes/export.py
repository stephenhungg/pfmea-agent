"""API routes for exporting PFMEA results."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import pandas as pd
import io
from typing import Literal

from app.models import get_db, Analysis, PFMEAResult

router = APIRouter()


@router.get("/export/{analysis_id}")
async def export_analysis(
    analysis_id: int,
    format: Literal["csv", "excel"] = "csv",
    db: Session = Depends(get_db)
):
    """
    Export PFMEA results to CSV or Excel.
    
    Args:
        analysis_id: Analysis ID
        format: Export format (csv or excel)
        db: Database session
        
    Returns:
        File download response
    """
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    results = db.query(PFMEAResult).filter(
        PFMEAResult.analysis_id == analysis_id
    ).all()
    
    if not results:
        raise HTTPException(status_code=404, detail="No results found for this analysis")
    
    # Prepare data for export - match PFMEA standard format
    data = []
    for idx, result in enumerate(results, start=1):
        data.append({
            "ID": idx,
            "Process": result.process,
            "Sub-Process": result.subprocess or "",
            "Failure Mode": result.failure_mode,
            "Potential Effect": result.potential_effect,
            "SEV": result.severity,
            "OCC": result.occurrence,
            "RPN": result.rpn,
            "Risk Level": result.risk_level.capitalize(),
            "Action Req'd?": "Yes" if result.action_required and result.action_required.lower() == "yes" else "No" if result.action_required and result.action_required.lower() == "no" else "Maybe",
            "Control Point": result.control_point or "",
            "Confidence": result.confidence or "",
            "Severity Justification": result.severity_justification or "",
            "Occurrence Justification": result.occurrence_justification or ""
        })
    
    df = pd.DataFrame(data)
    
    if format == "csv":
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode()),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=pfmea_analysis_{analysis_id}.csv"
            }
        )
    
    elif format == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="PFMEA Results")
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=pfmea_analysis_{analysis_id}.xlsx"
            }
        )






