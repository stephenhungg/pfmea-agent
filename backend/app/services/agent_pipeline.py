"""Agentic pipeline for PFMEA analysis with self-validation."""
import json
import logging
import asyncio
from typing import Dict, Any, List, Optional, Callable, Awaitable
from pathlib import Path
from app.services.llm_service import OllamaService
from app.services.pfmea_engine import RiskMatrix, get_rating_scales, format_rating_justification
from app.core.config import settings

logger = logging.getLogger(__name__)


class AgenticPFMEAPipeline:
    """
    Agentic pipeline for PFMEA analysis.
    
    Implements: ANALYZE → RATE → VALIDATE → CORRECT → FINALIZE
    """
    
    def __init__(self, include_justifications: bool = None):
        """Initialize the agentic pipeline.
        
        Args:
            include_justifications: Whether to generate detailed justifications.
                                   If None, uses the config setting.
                                   Set to False for faster analysis (uses smaller model).
        """
        # Justification setting - False = faster analysis
        self.include_justifications = include_justifications if include_justifications is not None else settings.include_justifications
        # Use fast model for fast mode (no justifications)
        fast_mode = not self.include_justifications
        self.llm = OllamaService(fast_mode=fast_mode)
        self.scales = get_rating_scales()
        self.max_retries = 2  # Fewer retries to fail faster
        # Process one failure mode at a time - Ollama can only handle 1 request at a time
        # Multiple concurrent requests cause timeouts
        self.failure_mode_concurrency = 1
        logger.info(f"Pipeline initialized with include_justifications={self.include_justifications}, model={self.llm.model}")
    
    async def _send_progress_non_blocking(self, progress_callback, message: Dict[str, Any]):
        """Send progress update without blocking (fire-and-forget)."""
        if progress_callback:
            try:
                # Don't await - fire and forget for non-critical updates
                asyncio.create_task(progress_callback(message))
            except Exception as e:
                logger.warning(f"Failed to send progress update: {e}")
    
    def _build_system_prompt(self) -> str:
        """Build system prompt with rating scale definitions."""
        if self.include_justifications:
            scales_text = json.dumps(self.scales, indent=2)
            return f"""You are an expert in Process Failure Mode and Effects Analysis (PFMEA). 
Your task is to analyze manufacturing processes and identify potential failure modes, their effects, and assign appropriate ratings.

RATING SCALES:
{scales_text}

You must:
1. Accurately identify failure modes based on process steps
2. Assess potential effects on product performance and manufacturing
3. Assign ratings (1-5) that match the scale criteria exactly
4. Provide clear justifications for each rating
5. Be thorough and conservative in your assessments

Always output valid JSON with the exact structure requested."""
        else:
            # FAST MODE - guide the model to actually think
            return """You are an experienced manufacturing quality engineer performing PFMEA analysis.
Your job is to assess real risk levels for manufacturing failure modes.

IMPORTANT: Actually analyze each failure mode - don't just give default values.
- Consider the specific failure and its real-world impact
- High severity failures include safety issues, total product loss, line shutdowns
- High occurrence means poor process control, frequent defects
- Low severity means minor cosmetic issues with no functional impact
- Low occurrence means robust processes with good controls

Output valid JSON only."""
    
    def _build_analyze_prompt(self, process_step: Dict[str, Any], context: Dict[str, Any]) -> str:
        """Build prompt for ANALYZE step."""
        process_text = process_step.get("operation", "")
        subprocess_text = process_step.get("subprocess", "")
        details = process_step.get("details", "")
        
        if self.include_justifications:
            # Detailed mode - full prompt
            steps = process_step.get("steps", [])
            equipment = context.get("equipment", [])
            control_points = context.get("control_points", [])
            
            prompt = f"""Analyze the following manufacturing work instruction and identify potential failure modes.

WORK INSTRUCTION INFORMATION:
- Process: {process_text}
- Sub-Process: {subprocess_text if subprocess_text else "N/A (main process level)"}
- Details: {details[:500] if details else "N/A"}
- Steps: {json.dumps(steps, indent=2) if steps else "N/A"}
- Equipment: {', '.join(equipment) if equipment else "N/A"}
- Control Points: {', '.join(control_points) if control_points else "N/A"}

Your task is to identify potential failure modes for this work instruction step. Consider:
- What could go wrong during this process/subprocess?
- What are the potential effects on the product or manufacturing process?
- Think about human error, equipment failure, material issues, environmental factors, etc.

For each potential failure mode, identify:
1. The failure mode (what could go wrong - be specific to this process/subprocess)
2. The potential effect (impact on product performance, manufacturing process, or safety)

IMPORTANT: The failure modes should be specific to the work instruction step being analyzed.
If a subprocess is provided, focus on failure modes for that specific subprocess.
If only a main process is provided, identify failure modes at the process level.

Output JSON with this structure:
{{
  "failure_modes": [
    {{
      "failure_mode": "specific description of what could fail in this step",
      "potential_effect": "description of the impact on product or process"
    }}
  ],
  "reasoning": "explanation of your analysis"
}}"""
        else:
            # FAST MODE - prompt that generates one specific failure mode
            prompt = f"""You are analyzing a manufacturing process step for potential failures.

PROCESS: {process_text}
STEP DETAILS: {subprocess_text or details[:150] if details else "General process step"}

Identify the single most critical failure mode that could realistically occur in this specific step.
Consider: equipment failures, operator errors, material defects, process variations, environmental factors.

For the failure mode:
- Be specific to THIS process (not generic)
- Describe the actual mechanism of failure
- Explain the real impact on the product or downstream processes

Output as JSON:
{{"failure_modes": [{{"failure_mode": "specific failure description", "potential_effect": "actual impact"}}]}}"""
        
        return prompt
    
    def _build_rate_prompt(self, failure_mode: str, effect: str, process_step: Dict[str, Any]) -> str:
        """Build prompt for RATE step."""
        if self.include_justifications:
            prompt = f"""Rate the following failure mode using the provided scales.

FAILURE MODE: {failure_mode}
POTENTIAL EFFECT: {effect}

PROCESS CONTEXT:
{json.dumps(process_step, indent=2)}

Assign ratings (1-5) for:
1. SEVERITY: Impact of the effect (use product_performance or manufacturing_process criteria)
2. OCCURRENCE: Likelihood of the failure occurring (use qualitative description)

For each rating, provide:
- The rating value (1-5)
- Detailed justification explaining why this rating matches the scale criteria

Output JSON with this structure:
{{
  "severity": <1-5>,
  "severity_justification": "detailed explanation",
  "occurrence": <1-5>,
  "occurrence_justification": "detailed explanation",
  "reasoning": "overall reasoning for the ratings"
}}"""
        else:
            # Fast mode - clearer prompt without example values that get copied
            prompt = f"""Analyze this manufacturing failure mode and assign risk ratings.

FAILURE: {failure_mode}
EFFECT: {effect}

SEVERITY SCALE (how bad is the effect):
5 = Catastrophic - total product loss, safety hazard, line shutdown
4 = Major - significant defects, >10% scrap, major rework needed  
3 = Moderate - noticeable defects, some rework, customer complaint
2 = Minor - slight defects, minor rework, internal detection
1 = Negligible - barely noticeable, no real impact

OCCURRENCE SCALE (how likely to happen):
5 = Very High - happens frequently, poor process control
4 = High - happens regularly, known recurring issue
3 = Moderate - occasional failures, inconsistent process
2 = Low - rare failures, good process control
1 = Very Low - extremely rare, excellent controls

Think about this specific failure mode and its effect. Then output JSON:
{{"severity": YOUR_RATING_1_TO_5, "occurrence": YOUR_RATING_1_TO_5}}"""
        return prompt
    
    def _build_validate_prompt(
        self,
        failure_mode: str,
        effect: str,
        severity: int,
        occurrence: int,
        justifications: Dict[str, str]
    ) -> str:
        """Build prompt for VALIDATE step."""
        severity_criteria = self.scales["severity"].get(str(severity), {})
        occurrence_criteria = self.scales["occurrence"].get(str(occurrence), {})
        
        if self.include_justifications:
            prompt = f"""Review and validate the following PFMEA ratings for consistency.

FAILURE MODE: {failure_mode}
POTENTIAL EFFECT: {effect}

CURRENT RATINGS:
- Severity: {severity}
  Justification: {justifications.get('severity', 'N/A')}
  Scale Criteria for {severity}: {severity_criteria}
  
- Occurrence: {occurrence}
  Justification: {justifications.get('occurrence', 'N/A')}
  Scale Criteria for {occurrence}: {occurrence_criteria}

Check if:
1. Each rating matches its scale criteria
2. The justifications support the assigned ratings
3. The ratings are consistent with each other
4. Any ratings need adjustment

Output JSON with this structure:
{{
  "is_valid": true/false,
  "issues": ["list of any issues found"],
  "corrected_ratings": {{
    "severity": <1-5 or null if correct>,
    "occurrence": <1-5 or null if correct>
  }},
  "correction_reasoning": "explanation of any corrections needed"
}}"""
        else:
            # Fast mode - simpler validation
            prompt = f"""Quickly validate these PFMEA ratings.

FAILURE MODE: {failure_mode}
POTENTIAL EFFECT: {effect}

RATINGS: Severity={severity}, Occurrence={occurrence}
Severity {severity} criteria: {severity_criteria}
Occurrence {occurrence} criteria: {occurrence_criteria}

Are the ratings appropriate? Output JSON:
{{
  "is_valid": true/false,
  "corrected_ratings": {{"severity": <1-5 or null>, "occurrence": <1-5 or null>}}
}}"""
        return prompt

    async def _generate_with_retry(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        json_mode: bool = True,
        temperature: float = 0.7,
        retries: int = 2,
        base_delay: float = 5.0,
    ) -> Dict[str, Any]:
        """
        Call LLM with lightweight retries on timeouts to reduce transient failures.
        """
        attempt = 0
        while True:
            try:
                return await self.llm.generate(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    json_mode=json_mode,
                    temperature=temperature,
                )
            except Exception as e:
                attempt += 1
                message = str(e).lower()
                is_timeout = "timed out" in message or "timeout" in message
                if attempt <= retries and is_timeout:
                    delay = base_delay * attempt
                    logger.warning(f"LLM timeout (attempt {attempt}/{retries + 1}); retrying in {delay}s...")
                    await asyncio.sleep(delay)
                    continue
                raise
    
    async def analyze_step(
        self,
        process_step: Dict[str, Any],
        context: Dict[str, Any],
        progress_callback: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Run full agentic pipeline for a process step.
        
        Args:
            process_step: Process step information
            context: Additional context (equipment, control points, etc.)
            
        Returns:
            List of PFMEA results (one per failure mode)
        """
        system_prompt = self._build_system_prompt()
        results = []
        
        # STEP 1: ANALYZE
        step_name = process_step.get('operation', 'Unknown')
        logger.info(f"ANALYZE: Processing step '{step_name}'")
        
        if progress_callback:
            await progress_callback({
                "step": "analyze",
                "status": "started",
                "message": f"Analyzing process step: {step_name}",
                "process_step": step_name,
                "llm_action": "Calling LLM to identify failure modes..."
            })
        
        logger.info(f"Building analyze prompt for step: {step_name}")
        analyze_prompt = self._build_analyze_prompt(process_step, context)
        logger.info(f"Prompt length: {len(analyze_prompt)} characters")
        
        if progress_callback:
            await progress_callback({
                "step": "analyze",
                "status": "processing",
                "message": "LLM is analyzing the process step...",
                "llm_action": "Generating failure modes"
            })
        
        analyze_result = await self._generate_with_retry(analyze_prompt, system_prompt)
        logger.info(f"ANALYZE result: {json.dumps(analyze_result, indent=2)[:500]}")
        
        failure_modes = analyze_result.get("failure_modes", [])
        analysis_reasoning = analyze_result.get("reasoning", "")
        
        if progress_callback:
            await progress_callback({
                "step": "analyze",
                "status": "completed",
                "message": f"Identified {len(failure_modes)} potential failure mode(s)",
                "reasoning": analysis_reasoning,
                "failure_modes_count": len(failure_modes)
            })
        
        if not failure_modes:
            logger.warning("No failure modes identified")
            return results
        
        # In fast mode, limit to 1 failure mode per operation for speed
        if not self.include_justifications and len(failure_modes) > 1:
            logger.info(f"FAST MODE: Limiting from {len(failure_modes)} to 1 failure mode")
            failure_modes = failure_modes[:1]
        
        # Process failure modes concurrently with semaphore to limit concurrency
        semaphore = asyncio.Semaphore(self.failure_mode_concurrency)  # Process a few failure modes concurrently
        
        async def process_failure_mode(fm_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
            """Process a single failure mode through the full pipeline."""
            async with semaphore:
                failure_mode = fm_data.get("failure_mode", "")
                effect = fm_data.get("potential_effect", "")
                
                if not failure_mode or not effect:
                    return None
                
                # STEP 2: RATE
                logger.info(f"RATE: Rating failure mode '{failure_mode[:50]}...'")
                
                if progress_callback:
                    await progress_callback({
                        "step": "rate",
                        "status": "started",
                        "message": f"Rating failure mode: {failure_mode[:100]}...",
                        "failure_mode": failure_mode,
                        "effect": effect,
                        "llm_action": "Calling LLM to assign severity and occurrence ratings..."
                    })
                
                logger.info(f"Building rate prompt for failure mode: {failure_mode[:50]}")
                rate_prompt = self._build_rate_prompt(failure_mode, effect, process_step)
                
                if progress_callback:
                    await progress_callback({
                        "step": "rate",
                        "status": "processing",
                        "message": "LLM is assigning ratings...",
                        "llm_action": "Evaluating ratings against scale criteria"
                    })
                
                rate_result = await self._generate_with_retry(rate_prompt, system_prompt)
                logger.info(f"RATE result: S={rate_result.get('severity')}, O={rate_result.get('occurrence')}")
                
                # Extract ratings - handle both int and dict formats
                severity = rate_result.get("severity")
                occurrence = rate_result.get("occurrence")
                
                # If LLM returned dict instead of int, try to extract a number
                if isinstance(severity, dict):
                    # Try to get first numeric value from dict
                    for v in severity.values():
                        try:
                            severity = int(str(v).strip())
                            break
                        except:
                            pass
                if isinstance(occurrence, dict):
                    for v in occurrence.values():
                        try:
                            occurrence = int(str(v).strip())
                            break
                        except:
                            pass
                
                # Try to convert string to int
                try:
                    if not isinstance(severity, int):
                        severity = int(str(severity).strip())
                    if not isinstance(occurrence, int):
                        occurrence = int(str(occurrence).strip())
                except:
                    pass
                
                # Validate ratings are in range
                if not all(isinstance(r, int) and 1 <= r <= 5 for r in [severity, occurrence]):
                    logger.warning(f"Invalid ratings after parsing: S={severity}, O={occurrence}")
                    # Default to medium ratings instead of failing
                    severity = 3 if not isinstance(severity, int) or severity < 1 or severity > 5 else severity
                    occurrence = 3 if not isinstance(occurrence, int) or occurrence < 1 or occurrence > 5 else occurrence
                    logger.info(f"Using default ratings: S={severity}, O={occurrence}")
            
                justifications = {
                    "severity": rate_result.get("severity_justification", ""),
                    "occurrence": rate_result.get("occurrence_justification", "")
                }
                
                if progress_callback:
                    await progress_callback({
                        "step": "rate",
                        "status": "completed",
                        "message": f"Assigned ratings: S={severity}, O={occurrence}",
                        "ratings": {
                            "severity": severity,
                            "occurrence": occurrence
                        },
                        "justifications": justifications
                    })
                
                # STEP 3 & 4: VALIDATE & CORRECT (with retries)
                # Skip validation entirely in fast mode for maximum speed
                # Also skip for low-risk items (RPN < 9)
                initial_rpn = RiskMatrix.calculate_rpn(severity, occurrence)
                skip_validation = not self.include_justifications or initial_rpn < 9
                
                retry_count = 0
                validation_reasoning = ""
                correction_reasoning = ""
                
                if skip_validation:
                    # FAST PATH: Skip validation entirely - just use initial ratings
                    if not self.include_justifications:
                        logger.info(f"FAST MODE: Skipping validation entirely")
                        validation_reasoning = "Fast mode - validation skipped"
                    else:
                        logger.info(f"Skipping validation for low-risk item (RPN={initial_rpn})")
                        validation_reasoning = "Low-risk item - validation skipped"
                    # No validation loop - go straight to finalize
                else:
                    # SLOW PATH: Run validation loop
                    max_retries_for_item = self.max_retries
                    while retry_count < max_retries_for_item:
                        logger.info(f"VALIDATE: Attempt {retry_count + 1} for failure mode '{failure_mode[:50]}...'")
                        
                        if progress_callback:
                            await progress_callback({
                                "step": "validate",
                                "status": "started",
                                "message": f"Validating ratings (attempt {retry_count + 1}/{self.max_retries})...",
                                "attempt": retry_count + 1
                            })
                        
                        validate_prompt = self._build_validate_prompt(
                            failure_mode, effect, severity, occurrence, justifications
                        )
                        validate_result = await self._generate_with_retry(validate_prompt, system_prompt)
                        
                        is_valid = validate_result.get("is_valid", False)
                        validation_reasoning = validate_result.get("reasoning", "")
                        issues = validate_result.get("issues", [])
                        
                        if progress_callback:
                            await progress_callback({
                                "step": "validate",
                                "status": "completed",
                                "message": "Validation completed" if is_valid else f"Validation found issues: {', '.join(issues) if issues else 'Ratings need adjustment'}",
                                "is_valid": is_valid,
                                "issues": issues,
                                "reasoning": validation_reasoning
                            })
                        
                        if is_valid:
                            break
                        
                        # CORRECT: Adjust ratings if needed
                        if progress_callback:
                            await progress_callback({
                                "step": "correct",
                                "status": "started",
                                "message": "Correcting ratings based on validation feedback...",
                            })
                        
                        corrected = validate_result.get("corrected_ratings", {})
                        if corrected.get("severity"):
                            severity = corrected["severity"]
                        if corrected.get("occurrence"):
                            occurrence = corrected["occurrence"]
                        
                        correction_reasoning = validate_result.get("correction_reasoning", "")
                        retry_count += 1
                        
                        if progress_callback:
                            await progress_callback({
                                "step": "correct",
                                "status": "completed",
                                "message": "Ratings corrected, re-validating...",
                                "correction_reasoning": correction_reasoning
                            })
                        
                        if retry_count < self.max_retries:
                            # Re-rate with corrections
                            rate_prompt = self._build_rate_prompt(failure_mode, effect, process_step)
                            rate_result = await self._generate_with_retry(rate_prompt, system_prompt)
                            severity = rate_result.get("severity", severity)
                            occurrence = rate_result.get("occurrence", occurrence)
                            justifications = {
                                "severity": rate_result.get("severity_justification", ""),
                                "occurrence": rate_result.get("occurrence_justification", "")
                            }
                
                # STEP 5: FINALIZE
                if progress_callback:
                    await progress_callback({
                        "step": "finalize",
                        "status": "started",
                        "message": "Finalizing PFMEA result...",
                    })
                
                confidence = 1.0 - (0.2 * retry_count)
                confidence_str = f"{confidence:.1f}"
                
                # Calculate RPN and risk level (using SEV × OCC only)
                rpn = RiskMatrix.calculate_rpn(severity, occurrence)
                risk_level = RiskMatrix.get_risk_level(severity, occurrence)
                action_required = RiskMatrix.get_action_required(risk_level)
                
                if progress_callback:
                    await progress_callback({
                        "step": "finalize",
                        "status": "completed",
                        "message": f"PFMEA result finalized: RPN={rpn}, Risk={risk_level.upper()}",
                        "rpn": rpn,
                        "risk_level": risk_level,
                        "action_required": action_required
                    })
                
                # Format justifications with scale criteria (or use placeholder in fast mode)
                if self.include_justifications and justifications.get("severity"):
                    severity_just = format_rating_justification(
                        "severity", severity, justifications["severity"], self.scales
                    )
                else:
                    severity_just = f"Rating {severity} assigned based on scale criteria"
                
                if self.include_justifications and justifications.get("occurrence"):
                    occurrence_just = format_rating_justification(
                        "occurrence", occurrence, justifications["occurrence"], self.scales
                    )
                else:
                    occurrence_just = f"Rating {occurrence} assigned based on scale criteria"
                
                # Extract process and subprocess correctly
                process_name = process_step.get("operation") or "Unknown Process"
                # Ensure process_name is never empty or None
                if not process_name or not process_name.strip():
                    logger.warning(f"Empty process name detected in process_step: {process_step}")
                    process_name = "Unknown Process"
                subprocess_name = process_step.get("subprocess")

                logger.info(f"FINALIZE: process='{process_name}', subprocess='{subprocess_name}'")
                
                # If no subprocess, use the first step or details as subprocess
                if not subprocess_name:
                    steps = process_step.get("steps", [])
                    if steps:
                        subprocess_name = steps[0] if isinstance(steps[0], str) else str(steps[0])
                    else:
                        details = process_step.get("details", "")
                        if details:
                            # Extract first meaningful line as subprocess
                            first_line = details.split('\n')[0].strip()
                            if first_line and len(first_line) < 100:
                                subprocess_name = first_line
                
                # Get control point - first from process step, then from context
                control_point = process_step.get("control_point", "")
                if not control_point and context.get("control_points"):
                    control_point = ", ".join(context.get("control_points", []))
                
                result = {
                    "process": process_name,
                    "subprocess": subprocess_name or "",
                    "failure_mode": failure_mode,
                    "potential_effect": effect,
                    "severity": severity,
                    "severity_justification": severity_just,
                    "occurrence": occurrence,
                    "occurrence_justification": occurrence_just,
                    "rpn": rpn,
                    "risk_level": risk_level,
                    "action_required": action_required,
                    "control_point": control_point,
                    "confidence": confidence_str,
                    "analysis_reasoning": analysis_reasoning,
                    "validation_reasoning": validation_reasoning,
                    "correction_reasoning": correction_reasoning
                }
                
                logger.info(f"FINALIZE: Completed analysis for '{failure_mode[:50]}...' (RPN={rpn}, Risk={risk_level})")
                
                # Stream the result via WebSocket for real-time updates (non-blocking)
                if progress_callback:
                    # This is critical, so we await it
                    await progress_callback({
                        "step": "result",
                        "status": "new_result",
                        "message": f"New PFMEA result: {failure_mode[:50]}...",
                        "result": result
                    })
                
                return result
        
        # Process all failure modes concurrently
        tasks = [process_failure_mode(fm_data) for fm_data in failure_modes]
        failure_mode_results = await asyncio.gather(*tasks)
        
        # Filter out None results and add to results list
        results.extend([r for r in failure_mode_results if r is not None])
        
        return results

