# PFMEA Analysis Tool

A secure, locally-hosted Process Failure Mode and Effects Analysis (PFMEA) tool that uses generative AI to analyze work instruction PDFs and generate comprehensive risk assessments.

## Features

- **PDF Upload & Parsing**: Extracts operation details, equipment, and control points from work instruction PDFs
- **Agentic AI Analysis**: Multi-step self-validating pipeline (ANALYZE → RATE → VALIDATE → CORRECT → FINALIZE)
- **RPN Calculation**: Implements exact risk prioritization matrix with severity, occurrence, and detection ratings
- **Interactive Results Table**: Sortable, expandable PFMEA results with detailed justifications
- **Export Functionality**: Export results to CSV or Excel
- **100% Local Processing**: All data stays on your machine - no external API calls

## Architecture

- **Backend**: FastAPI (Python) with SQLite database
- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **LLM**: Ollama (local LLM server)
- **Security**: Local-only processing, input validation, secure file handling

## Prerequisites

1. **Python 3.11+** (Windows: auto-installation available via startup script)
2. **Node.js 18+**
3. **Ollama** installed with a model (default: `llama3.2:3b`) - optional, but required for LLM features

### Installing Ollama

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Download from https://ollama.ai/download
```

### Pulling a Model

```bash
ollama pull llama3.2:3b
```

**Note:** The default model is `llama3.2:3b` (smaller, faster). You can change this in `backend/app/core/config.py` or `backend/.env`.

## Quick Start (Recommended)

**Just run one command and everything is set up automatically:**

### macOS / Linux:
```bash
./start.sh
```

### Windows:
```cmd
start.bat
```

Or double-click `start.bat` in Windows Explorer.

**🚀 NEW: Windows auto-installation!** If Python is not installed, the script will offer to download and install it automatically. See [WINDOWS_SETUP.md](WINDOWS_SETUP.md) for details.

**To clear the database on startup (removes all previous analyses):**

### macOS / Linux:
```bash
./start.sh --clear-db
```

### Windows:
```powershell
.\start.ps1 --clear-db
```

This script will:
- ✅ Check all prerequisites (Python, Node.js, Ollama)
- 🪟 **Windows**: Offer to auto-install Python if not found
- ✅ Set up Python virtual environment
- ✅ Install all dependencies
- ✅ Check/start Ollama server
- ✅ Pull LLM model if needed
- ✅ Start both backend and frontend servers
- ✅ Open the app at `http://localhost:5173`

**That's it!** The application will be ready to use.

---

## Manual Setup (Alternative)

If you prefer to set up manually or the auto-setup script doesn't work:

### Backend

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Start the backend server:
```bash
uvicorn app.main:app --reload --port 8000
```

The backend will be available at `http://localhost:8000`

### Frontend

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Usage

### Using the Auto-Start Script (Easiest)

1. **Run the startup script:**
   - **macOS/Linux:** `./start.sh`
   - **Windows:** `.\start.ps1` or double-click `start.bat`

2. **Open your browser** and navigate to `http://localhost:5173`

3. **Upload a PDF** work instruction file

4. **Wait for analysis** to complete (this may take several minutes depending on PDF complexity)

5. **Review results** in the interactive table

6. **Export results** to CSV or Excel as needed

### Manual Start

1. **Start Ollama** (if not running as a service):
```bash
ollama serve
```

2. **Start the backend** (from `backend/` directory):
```bash
uvicorn app.main:app --reload --port 8000
```

3. **Start the frontend** (from `frontend/` directory):
```bash
npm run dev
```

4. **Open the application** in your browser at `http://localhost:5173`

## Configuration

### Backend Configuration

Edit `backend/app/core/config.py` or create a `.env` file in the `backend/` directory:

```env
# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b

# File Upload
MAX_UPLOAD_SIZE_MB=50

# Database
DATABASE_URL=sqlite:///./pfmea.db
```

### Frontend Configuration

The frontend is configured to proxy API requests to `http://localhost:8000`. This can be changed in `frontend/vite.config.ts`.

## Project Structure

```
pfmea-agent/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry
│   │   ├── api/routes/          # API endpoints
│   │   ├── services/            # Business logic
│   │   │   ├── pdf_parser.py    # PDF extraction
│   │   │   ├── llm_service.py   # Ollama integration
│   │   │   ├── agent_pipeline.py # Agentic validation
│   │   │   └── pfmea_engine.py  # RPN calculation
│   │   ├── models/              # Database models
│   │   ├── schemas/             # Pydantic schemas
│   │   └── core/                # Configuration
│   ├── rating_scales.json       # Rating scale definitions
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── pages/               # Page components
│   │   └── services/            # API client
│   └── package.json
└── README.md
```

## Rating Scales

The tool uses standardized PFMEA rating scales:

- **Severity (1-5)**: Impact on product performance and manufacturing process
- **Occurrence (1-5)**: Frequency/likelihood of failure
- **Detection (1-5)**: Likelihood of detecting failure before it reaches the customer

Risk levels are determined using a 5x5 matrix for each severity level, resulting in:
- **Low (Green)**: No further controls required
- **Medium (Yellow)**: Pursue additional controls or document
- **High (Red)**: Apply controls, design/process change may be required

## Security

- All processing happens locally - no data leaves your machine
- PDF file validation (type, size, magic bytes)
- Input sanitization before LLM prompts
- SQLite database stored locally with proper permissions
- No authentication required (single-user local tool)

## Troubleshooting

### Ollama Connection Issues

If you see "LLM service error", ensure:
1. Ollama is running: `ollama serve` (or check if it's running as a service on Windows)
2. The model is pulled: `ollama pull llama3.2:3b`
3. The base URL in config matches your Ollama instance

### PDF Parsing Issues

If operations aren't being extracted:
- Ensure the PDF contains structured tables with operation details
- Check that the PDF is not password-protected
- Verify the PDF is not corrupted

### Analysis Takes Too Long

The agentic pipeline performs multiple LLM calls per failure mode:
- Consider using a faster model if `llama3.2:3b` is too slow for your system
- Reduce the number of operations in the PDF
- Increase timeout in `backend/app/core/config.py`

### Windows-Specific Issues

- **PowerShell Execution Policy:** If you get an execution policy error, run:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
- **Port Already in Use:** The script will try to kill existing processes, but if that fails, manually kill processes using ports 8000 or 5173 using Task Manager or:
  ```powershell
  Get-NetTCPConnection -LocalPort 8000 | Select-Object -ExpandProperty OwningProcess | Stop-Process -Force
  ```
- **Ollama Service:** On Windows, Ollama usually runs as a background service. Check Task Manager to ensure it's running.

## License

This project is for internal use only.

