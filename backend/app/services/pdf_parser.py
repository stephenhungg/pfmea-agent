"""PDF parsing service for extracting work instructions."""
import pdfplumber
from pathlib import Path
from typing import List, Dict, Optional, Any
import logging
import re

# Try to import PyMuPDF (optional fallback)
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

logger = logging.getLogger(__name__)


class PDFParser:
    """Service for parsing PDF work instructions."""
    
    def __init__(self, pdf_path: Path):
        """
        Initialize PDF parser.
        
        Args:
            pdf_path: Path to PDF file
        """
        self.pdf_path = pdf_path
        self.tables: List[Dict[str, Any]] = []
        self.text_content: str = ""
        
    def parse(self) -> Dict[str, Any]:
        """
        Parse PDF and extract structured data.
        
        Strategy: Always prefer TEXT-based parsing for work instructions since
        table extraction often fails due to PDF layout issues. Tables are used
        as supplementary source for equipment and control points.
        
        Returns:
            Dictionary containing extracted data:
            - operations: List of operation details
            - equipment: List of equipment
            - control_points: List of control points
            - raw_text: Full text content
        """
        operations = []
        equipment = []
        control_points = []
        table_operations = []
        
        try:
            with pdfplumber.open(self.pdf_path) as pdf:
                # First pass: Extract all text content
                for page_num, page in enumerate(pdf.pages):
                    page_text = page.extract_text()
                    if page_text:
                        self.text_content += f"\n--- Page {page_num + 1} ---\n{page_text}\n"
                
                # Second pass: Try to extract from tables (for equipment/control points)
                for page_num, page in enumerate(pdf.pages):
                    page_tables = page.extract_tables()
                    for table in page_tables:
                        if table:
                            self._process_work_instruction_table(table, table_operations, equipment, control_points)
        except Exception as e:
            logger.warning(f"pdfplumber extraction failed: {e}, trying PyMuPDF")
            self._extract_with_pymupdf()
        
        # ALWAYS try text-based parsing first - it's more reliable for work instructions
        if self.text_content:
            logger.info("Parsing operations from text content (primary method)")
            operations = self._parse_work_instructions_from_text(self.text_content)
            logger.info(f"Text parsing found {len(operations)} operations")

        # If text parsing found fewer operations than table parsing, use table results
        if len(table_operations) > len(operations):
            logger.info(f"Table parsing found more operations ({len(table_operations)} vs {len(operations)}), using table results")
            operations = table_operations

        # If we have both, try to merge process headers from table operations into text operations
        elif len(table_operations) > 0 and len(operations) > 0:
            logger.info("Attempting to merge process headers from table operations")
            # Build a map of process numbers to names from table operations
            process_map = {}
            for table_op in table_operations:
                if table_op.get("operation") and not table_op.get("operation").startswith("PROCESS "):
                    # Extract process number from subprocess if available
                    subprocess = table_op.get("subprocess", "")
                    match = re.match(r'^(\d+)\.', subprocess)
                    if match:
                        process_num = match.group(1)
                        process_map[process_num] = table_op["operation"]

            # Update generic process names in operations
            for op in operations:
                if op.get("operation", "").startswith("PROCESS "):
                    # Extract the process number
                    match = re.match(r'PROCESS (\d+)', op["operation"])
                    if match:
                        process_num = match.group(1)
                        if process_num in process_map:
                            logger.info(f"Replacing '{op['operation']}' with '{process_map[process_num]}'")
                            op["operation"] = process_map[process_num]
        
        # Extract equipment and control points from text as fallback
        if not equipment and self.text_content:
            equipment = self._extract_equipment_from_text(self.text_content)
        
        if not control_points and self.text_content:
            control_points = self._extract_control_points_from_text(self.text_content)
        
        logger.info(f"Parsed {len(operations)} operations, {len(equipment)} equipment items, {len(control_points)} control points")
        
        # Log detailed operation info for debugging
        for idx, op in enumerate(operations):
            subprocess_preview = op.get('subprocess', 'N/A')
            if subprocess_preview and len(subprocess_preview) > 50:
                subprocess_preview = subprocess_preview[:50] + "..."
            logger.info(f"Operation {idx + 1}: process='{op.get('operation', 'N/A')}', subprocess='{subprocess_preview}'")
        
        return {
            "operations": operations,
            "equipment": equipment,
            "control_points": control_points,
            "raw_text": self.text_content
        }
    
    def _process_work_instruction_table(self, table: List[List], operations: List, equipment: List, control_points: List):
        """
        Process work instruction table.
        
        Handles tables with format:
        | OPERATION DETAILS | EQUIPMENT REQUIRED | CONTROL POINT |
        | 1. KITTING/LABELING | ... | ... |
        | 1.1. Kit all components... | Zebra Label Printer | F1 |
        """
        if not table or len(table) < 2:
            return
        
        # Get headers
        headers = [str(cell).strip().lower() if cell else "" for cell in table[0]]
        logger.info(f"Table headers: {headers}")
        
        # Skip PFMEA tables (output data)
        if any("sev" in h or "occ" in h or "rpn" in h or "severity" in h or "occurrence" in h for h in headers):
            logger.info("Skipping PFMEA table - this is output data, not input")
            return
        
        # Find column indices - ensure they're distinct
        operation_col = None
        equipment_col = None
        control_col = None
        assigned_cols = set()
        
        for idx, header in enumerate(headers):
            h = header.lower()
            # Check operation column first (most important)
            if operation_col is None and any(kw in h for kw in ["operation", "detail", "step", "procedure", "instruction"]):
                operation_col = idx
                assigned_cols.add(idx)
            # Check equipment column (skip if already assigned)
            elif equipment_col is None and idx not in assigned_cols and any(kw in h for kw in ["equipment", "tool", "machine", "required"]):
                equipment_col = idx
                assigned_cols.add(idx)
            # Check control column (skip if already assigned)
            elif control_col is None and idx not in assigned_cols and any(kw in h for kw in ["control", "checkpoint"]):
                # Only match "control" or "checkpoint", not generic "point"
                if "control" in h or "checkpoint" in h:
                    control_col = idx
                    assigned_cols.add(idx)
        
        # If no operation column found, try first column
        if operation_col is None and len(headers) > 0:
            operation_col = 0
        
        logger.info(f"Table headers detected: {headers}")
        logger.info(f"Table columns - Operation: {operation_col}, Equipment: {equipment_col}, Control: {control_col}")
        
        # Log first few rows to debug
        for i, row in enumerate(table[:5]):
            logger.info(f"Table row {i}: {[str(cell)[:50] if cell else 'None' for cell in row]}")
        
        # Track current main process
        current_process = None
        current_equipment = None
        current_control_point = None
        
        # Process rows
        for row in table[1:]:
            if not row or not any(row):
                continue
            
            # Get operation details text
            op_text = ""
            if operation_col is not None and operation_col < len(row) and row[operation_col]:
                op_text = str(row[operation_col]).strip()
            
            # Get equipment - validate it's a reasonable equipment name, not raw text
            row_equipment = None
            if equipment_col is not None and equipment_col < len(row) and row[equipment_col]:
                row_equipment = str(row[equipment_col]).strip()
                # Only add if it looks like an equipment name (not too long, no numbered sections)
                if row_equipment and len(row_equipment) < 100 and not re.match(r'^\d+\.', row_equipment):
                    if row_equipment not in equipment:
                        equipment.append(row_equipment)
                    current_equipment = row_equipment
            
            # Get control point - validate it's a reasonable control point (F1, C1, DHR, etc.)
            row_control = None
            if control_col is not None and control_col < len(row) and row[control_col]:
                row_control = str(row[control_col]).strip()
                # Only add if it looks like a control point code (short, alphanumeric)
                if row_control and len(row_control) < 50 and not re.match(r'^\d+\.', row_control):
                    if row_control not in control_points:
                        control_points.append(row_control)
                    current_control_point = row_control
            
            if not op_text:
                continue
            
            # Parse the operation text for process/subprocess structure
            parsed_ops = self._parse_operation_cell(op_text, current_equipment or row_equipment, current_control_point or row_control)
            
            for op in parsed_ops:
                # Update current process if this is a main process
                if op.get("is_main_process"):
                    current_process = op["operation"]
                else:
                    # If this is a subprocess and we have a current process, use it
                    if current_process and not op.get("operation"):
                        op["operation"] = current_process
                
                # Add equipment and control point
                if row_equipment:
                    op["equipment"] = row_equipment
                if row_control:
                    op["control_point"] = row_control
                
                operations.append(op)
    
    def _parse_operation_cell(self, text: str, equipment: str = None, control_point: str = None) -> List[Dict[str, Any]]:
        """
        Parse an operation cell that may contain multiple processes/subprocesses.
        
        Handles formats like:
        - "1. KITTING/LABELING"
        - "1.1. Kit all components per work order bill of materials."
        - "2.1. Insert pins into soldering fixture..."
        """
        operations = []
        lines = text.split('\n')
        
        current_process = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Check for main process: "1. KITTING/LABELING" or "2. ASSEMBLE PCBA"
            # Pattern: number followed by period/space, then ALL CAPS text
            main_process_match = re.match(r'^(\d+)[\.\)]\s*([A-Z][A-Z\s/\-]+)$', line)
            if main_process_match:
                process_name = main_process_match.group(2).strip()
                current_process = process_name
                operations.append({
                    "operation": process_name,
                    "subprocess": None,
                    "details": "",
                    "steps": [],
                    "is_main_process": True
                })
                continue
            
            # Check for subprocess: "1.1. Kit all components..." or "2.1. Insert pins..."
            # Pattern: number.number followed by period/space, then description
            subprocess_match = re.match(r'^(\d+)\.(\d+)[\.\)]\s*(.+)$', line)
            if subprocess_match:
                process_num = subprocess_match.group(1)
                subprocess_text = subprocess_match.group(3).strip()

                # If no current_process, use generic process name based on number
                process_name = current_process if current_process else f"PROCESS {process_num}"

                operations.append({
                    "operation": process_name,
                    "subprocess": subprocess_text,
                    "details": subprocess_text,
                    "steps": [subprocess_text],
                    "is_main_process": False,
                    "equipment": equipment,
                    "control_point": control_point
                })
                continue
            
            # If line doesn't match patterns, it might be continuation text
            # Add to last operation's details if exists
            if operations and line:
                last_op = operations[-1]
                if last_op.get("details"):
                    last_op["details"] += " " + line
                else:
                    last_op["details"] = line
                if line not in last_op.get("steps", []):
                    last_op.setdefault("steps", []).append(line)
        
        return operations
    
    def _parse_work_instructions_from_text(self, text: str) -> List[Dict[str, Any]]:
        """
        Parse work instructions from raw text content.
        
        Identifies structure like:
        1. KITTING/LABELING
           1.1. Kit all components...
           1.2. Print labels...
        2. ASSEMBLE PCBA
           2.1. Insert pins...
        """
        operations = []
        current_process = None
        
        lines = text.split('\n')
        
        for line in lines:
            line_stripped = line.strip()
            if not line_stripped:
                continue
            
            # Main process pattern: "1. KITTING/LABELING" (number + ALL CAPS)
            main_match = re.match(r'^(\d+)[\.\)]\s*([A-Z][A-Z\s/\-]+)$', line_stripped)
            if main_match:
                current_process = main_match.group(2).strip()
                logger.info(f"Found main process: {current_process}")
                continue
            
            # Subprocess pattern: "1.1. Description text..."
            sub_match = re.match(r'^(\d+)\.(\d+)[\.\)]\s*(.+)$', line_stripped)
            if sub_match:
                process_num = sub_match.group(1)
                subprocess_text = sub_match.group(3).strip()

                # If no current_process, try to infer from the process number
                process_name = current_process
                if not process_name:
                    # Try to find the main process by looking back through operations
                    for op in reversed(operations):
                        if op.get("is_main_process") and op.get("operation"):
                            process_name = op["operation"]
                            break
                    # If still not found, use a generic process name based on the number
                    if not process_name:
                        process_name = f"PROCESS {process_num}"
                        logger.warning(f"Main process header not found for subprocess {line_stripped}, using generic name: {process_name}")

                operations.append({
                    "operation": process_name,
                    "subprocess": subprocess_text,
                    "details": subprocess_text,
                    "steps": [subprocess_text]
                })
                logger.info(f"Found subprocess: {process_name} -> {subprocess_text[:50]}...")
                continue
            
            # Alternative main process pattern: Just ALL CAPS header
            if re.match(r'^[A-Z][A-Z\s/\-]{3,}$', line_stripped) and len(line_stripped) < 50:
                current_process = line_stripped
                logger.info(f"Found main process (caps only): {current_process}")
                continue
        
        return operations
    
    def _extract_equipment_from_text(self, text: str) -> List[str]:
        """Extract equipment names from text."""
        equipment = []
        
        # Common equipment patterns
        patterns = [
            r'(?:equipment|tool|machine)[:\s]+([A-Za-z0-9\-\s]+)',
            r'using\s+([A-Z][A-Za-z0-9\-\s]+)',
            r'([A-Z][a-z]+\s+(?:Printer|Station|Machine|Tool|Fixture))',
            r'(FX-\d+)',
            r'(M-[A-Z]+-\d+)'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                eq = match.strip()
                if eq and len(eq) > 2 and eq not in equipment:
                    equipment.append(eq)
        
        return equipment
    
    def _extract_control_points_from_text(self, text: str) -> List[str]:
        """Extract control points from text."""
        control_points = []
        
        # Control point patterns (F1, C1, D1, E1, DHR, etc.)
        patterns = [
            r'\b([A-Z]\d)\b',  # F1, C1, D1, E1
            r'\b(DHR)\b',
            r'control\s+point[:\s]+([A-Za-z0-9\-]+)'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                cp = match.strip().upper()
                if cp and cp not in control_points:
                    control_points.append(cp)
        
        return control_points
    
    def _extract_with_pymupdf(self):
        """Fallback extraction using PyMuPDF."""
        if not PYMUPDF_AVAILABLE:
            logger.warning("PyMuPDF not available. Using pdfplumber only.")
            return
        
        try:
            doc = fitz.open(self.pdf_path)
            for page_num, page in enumerate(doc):
                text = page.get_text()
                if text:
                    self.text_content += f"\n--- Page {page_num + 1} ---\n{text}\n"
            doc.close()
        except Exception as e:
            logger.error(f"PyMuPDF extraction failed: {e}")
            raise


def parse_pdf(pdf_path: Path) -> Dict[str, Any]:
    """
    Convenience function to parse a PDF file.
    
    Args:
        pdf_path: Path to PDF file
        
    Returns:
        Parsed data dictionary
    """
    parser = PDFParser(pdf_path)
    return parser.parse()
