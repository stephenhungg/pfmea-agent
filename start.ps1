# PFMEA Analysis Tool - Auto Setup & Start Script (Windows PowerShell)
# This script automatically configures and starts the entire application
# With auto-installation support for Python, Node.js, and Ollama

# Set error handling - use Continue to prevent script stopping on non-critical errors
$ErrorActionPreference = "Continue"

# Colors for output
function Write-Info { Write-Host "ℹ $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "✓ $args" -ForegroundColor Green }
function Write-Warning { Write-Host "⚠ $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "✗ $args" -ForegroundColor Red }
function Write-Header {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $args" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
}

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Header "PFMEA Analysis Tool - Auto Setup & Start"

# Check if running on Windows
if (-not $IsWindows -and $PSVersionTable.PSVersion.Major -ge 6) {
    Write-Error "This script is designed for Windows only."
    Write-Info "For macOS/Linux, please use: ./start.sh"
    exit 1
}
if ($PSVersionTable.Platform -eq "Unix") {
    Write-Error "This script is designed for Windows only."
    Write-Info "For macOS/Linux, please use: ./start.sh"
    exit 1
}

# Check for clear-db flag
$ClearDB = $false
if ($args -contains "--clear-db" -or $args -contains "-c") {
    $ClearDB = $true
}

# Track if we need to restart after installations
$NeedsRestart = $false

# Check prerequisites
Write-Info "Checking prerequisites..."

#region ==================== PYTHON ====================

# Function to test if a Python command works
function Test-PythonCommand {
    param($cmd)
    
    $oldErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    
    try {
        $cmdInfo = Get-Command $cmd -ErrorAction SilentlyContinue
        if (-not $cmdInfo) {
            $ErrorActionPreference = $oldErrorAction
            return $null
        }
        
        $cmdPath = $cmdInfo.Source
        if (-not $cmdPath) { $cmdPath = $cmd }
        
        $output = & $cmdPath --version 2>&1 | Out-String
        
        if ($output -and $output -match "Python\s+(\d+)\.(\d+)") {
            $ErrorActionPreference = $oldErrorAction
            return $output.Trim()
        }
    } catch {
        # Command not found
    } finally {
        $ErrorActionPreference = $oldErrorAction
    }
    return $null
}

# Function to download and install Python
function Install-Python {
    Write-Warning "Python 3.11+ is required but not found."
    Write-Host ""
    $response = Read-Host "Would you like to automatically download and install Python 3.12? (Y/N)"
    
    if ($response -match "^[Yy]") {
        Write-Info "Downloading Python 3.12 installer..."
        
        $pythonUrl = "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe"
        $installerPath = Join-Path $env:TEMP "python-3.12.7-installer.exe"
        
        try {
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $pythonUrl -OutFile $installerPath -UseBasicParsing
            Write-Success "Downloaded Python installer"
            
            Write-Info "Installing Python 3.12 (this may take a minute)..."
            
            $installArgs = "/quiet InstallAllUsers=0 PrependPath=1 Include_test=0"
            Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -NoNewWindow
            
            Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
            
            Write-Success "Python installation completed!"
            
            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            
            return $true
            
        } catch {
            Write-Error "Failed to download or install Python: $_"
            Write-Info "Please install Python manually from: https://www.python.org/downloads/"
            return $false
        }
    } else {
        Write-Info "Please install Python 3.11+ manually from: https://www.python.org/downloads/"
        Write-Info "Make sure to check 'Add Python to PATH' during installation!"
        return $false
    }
}

# Check Python
$pythonCmdName = $null
$pythonVersion = $null

$testVersion = Test-PythonCommand "python"
if ($testVersion) {
    $pythonCmdName = "python"
    $pythonVersion = $testVersion
} else {
    $testVersion = Test-PythonCommand "python3"
    if ($testVersion) {
        $pythonCmdName = "python3"
        $pythonVersion = $testVersion
    } else {
        $testVersion = Test-PythonCommand "py"
        if ($testVersion) {
            $pythonCmdName = "py"
            $pythonVersion = $testVersion
        }
    }
}

if ($null -eq $pythonCmdName) {
    $installed = Install-Python
    if (-not $installed) {
        exit 1
    }
    $NeedsRestart = $true
    
    # Try to find Python again after installation
    $testVersion = Test-PythonCommand "python"
    if ($testVersion) {
        $pythonCmdName = "python"
        $pythonVersion = $testVersion
    } else {
        $testVersion = Test-PythonCommand "py"
        if ($testVersion) {
            $pythonCmdName = "py"
            $pythonVersion = $testVersion
        }
    }
    
    if ($null -eq $pythonCmdName) {
        Write-Warning "Python installed but not found in PATH yet."
        Write-Info "Please close this window and run the script again."
        pause
        exit 0
    }
}

# Get full path to Python
$ErrorActionPreference = "SilentlyContinue"
$pythonCmdInfo = Get-Command $pythonCmdName -ErrorAction SilentlyContinue
if ($pythonCmdInfo -and $pythonCmdInfo.Source) {
    $pythonCmd = $pythonCmdInfo.Source
} else {
    $pythonCmd = $pythonCmdName
}
$ErrorActionPreference = "Continue"

Write-Success "Python found: $pythonVersion"

# Check Python version (3.11+)
$versionMatch = $pythonVersion -match "Python (\d+)\.(\d+)"
if ($versionMatch) {
    $major = [int]$matches[1]
    $minor = [int]$matches[2]
    if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 11)) {
        Write-Error "Python 3.11+ is required. Found: $major.$minor"
        Write-Info "Please upgrade Python from: https://www.python.org/downloads/"
        exit 1
    }
}

#endregion

#region ==================== NODE.JS ====================

# Function to install Node.js
function Install-NodeJS {
    Write-Warning "Node.js 18+ is required but not found."
    Write-Host ""
    $response = Read-Host "Would you like to automatically download and install Node.js 22 LTS? (Y/N)"
    
    if ($response -match "^[Yy]") {
        Write-Info "Downloading Node.js 22 LTS installer..."
        
        # Node.js 22 LTS installer (64-bit)
        $nodeUrl = "https://nodejs.org/dist/v22.12.0/node-v22.12.0-x64.msi"
        $installerPath = Join-Path $env:TEMP "node-v22.12.0-x64.msi"
        
        try {
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $nodeUrl -OutFile $installerPath -UseBasicParsing
            Write-Success "Downloaded Node.js installer"
            
            Write-Info "Installing Node.js 22 LTS (this may take a minute)..."
            
            # Install Node.js silently
            $installArgs = "/i `"$installerPath`" /quiet /norestart"
            Start-Process -FilePath "msiexec.exe" -ArgumentList $installArgs -Wait -NoNewWindow
            
            Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
            
            Write-Success "Node.js installation completed!"
            
            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            
            return $true
            
        } catch {
            Write-Error "Failed to download or install Node.js: $_"
            Write-Info "Please install Node.js manually from: https://nodejs.org/"
            return $false
        }
    } else {
        Write-Info "Please install Node.js 18+ manually from: https://nodejs.org/"
        return $false
    }
}

# Check Node.js
$nodeFound = $false
$ErrorActionPreference = "SilentlyContinue"
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
$ErrorActionPreference = "Continue"

if ($nodeCmd) {
    try {
        $nodeVersion = & node --version 2>&1
        if ($nodeVersion -match "v(\d+)") {
            $nodeMajor = [int]$matches[1]
            if ($nodeMajor -ge 18) {
                Write-Success "Node.js found: $nodeVersion"
                $nodeFound = $true
            } else {
                Write-Warning "Node.js version too old: $nodeVersion (need v18+)"
            }
        }
    } catch {
        # Node not working
    }
}

if (-not $nodeFound) {
    $installed = Install-NodeJS
    if (-not $installed) {
        exit 1
    }
    $NeedsRestart = $true
    
    # Try to find Node again
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    $ErrorActionPreference = "SilentlyContinue"
    $nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
    $ErrorActionPreference = "Continue"
    
    if ($nodeCmd) {
        $nodeVersion = & node --version 2>&1
        Write-Success "Node.js found: $nodeVersion"
    } else {
        Write-Warning "Node.js installed but not found in PATH yet."
        Write-Info "Please close this window and run the script again."
        pause
        exit 0
    }
}

# Check npm (comes with Node.js)
$ErrorActionPreference = "SilentlyContinue"
$npmCmd = Get-Command "npm" -ErrorAction SilentlyContinue
$ErrorActionPreference = "Continue"

if ($npmCmd) {
    $npmVersion = & npm --version 2>&1
    Write-Success "npm found: v$npmVersion"
} else {
    Write-Error "npm not found. It should be installed with Node.js."
    Write-Info "Please reinstall Node.js from: https://nodejs.org/"
    exit 1
}

#endregion

#region ==================== OLLAMA ====================

# Function to install Ollama
function Install-Ollama {
    Write-Warning "Ollama is not installed (required for AI features)."
    Write-Host ""
    $response = Read-Host "Would you like to automatically download and install Ollama? (Y/N)"
    
    if ($response -match "^[Yy]") {
        Write-Info "Downloading Ollama installer..."
        
        # Ollama Windows installer
        $ollamaUrl = "https://ollama.com/download/OllamaSetup.exe"
        $installerPath = Join-Path $env:TEMP "OllamaSetup.exe"
        
        try {
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $ollamaUrl -OutFile $installerPath -UseBasicParsing
            Write-Success "Downloaded Ollama installer"
            
            Write-Info "Installing Ollama..."
            Write-Info "Note: The Ollama installer may show a window. Please follow the prompts."
            
            # Run Ollama installer (it doesn't support fully silent install)
            Start-Process -FilePath $installerPath -Wait
            
            Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
            
            Write-Success "Ollama installation completed!"
            
            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            
            return $true
            
        } catch {
            Write-Error "Failed to download or install Ollama: $_"
            Write-Info "Please install Ollama manually from: https://ollama.ai"
            return $false
        }
    } else {
        Write-Warning "Skipping Ollama installation. AI features will not work."
        return $false
    }
}

# Check Ollama
$OllamaAvailable = $false
$ErrorActionPreference = "SilentlyContinue"
$ollamaCmd = Get-Command "ollama" -ErrorAction SilentlyContinue
$ErrorActionPreference = "Continue"

if ($ollamaCmd) {
    Write-Success "Ollama found"
    $OllamaAvailable = $true
    
    # Check if Ollama is running
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        Write-Success "Ollama server is running"
    } catch {
        Write-Warning "Ollama server is not running. Starting Ollama..."
        
        # Try to start Ollama
        try {
            Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
            Start-Sleep -Seconds 3
            
            # Check again
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
                Write-Success "Ollama server started"
            } catch {
                Write-Warning "Could not start Ollama server automatically."
                Write-Info "Please start Ollama manually or check if it's running in the system tray."
            }
        } catch {
            Write-Warning "Could not start Ollama server."
        }
    }
    
    # Check if model is available
    if ($OllamaAvailable) {
        $models = & ollama list 2>&1 | Out-String
        if ($models -notmatch "llama3.2:3b") {
            Write-Warning "LLM model not found. Pulling llama3.2:3b (this may take a while)..."
            Write-Info "Model size: ~2GB. Please wait..."
            & ollama pull llama3.2:3b
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Model pulled successfully"
            } else {
                Write-Warning "Failed to pull model. You can pull manually with: ollama pull llama3.2:3b"
            }
        } else {
            Write-Success "LLM model available: llama3.2:3b"
        }
    }
} else {
    $installed = Install-Ollama
    if ($installed) {
        $OllamaAvailable = $true
        $NeedsRestart = $true
        
        # Try to find Ollama again
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        $ErrorActionPreference = "SilentlyContinue"
        $ollamaCmd = Get-Command "ollama" -ErrorAction SilentlyContinue
        $ErrorActionPreference = "Continue"
        
        if ($ollamaCmd) {
            Write-Success "Ollama found"
            
            # Start Ollama server
            Write-Info "Starting Ollama server..."
            Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
            Start-Sleep -Seconds 3
            
            # Pull model
            Write-Info "Pulling LLM model (llama3.2:3b)..."
            Write-Info "Model size: ~2GB. Please wait..."
            & ollama pull llama3.2:3b
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Model pulled successfully"
            }
        } else {
            Write-Warning "Ollama installed but not found in PATH yet."
            Write-Info "You may need to restart your computer for Ollama to work."
        }
    } else {
        Write-Warning "Continuing without Ollama. AI features will not work."
    }
}

#endregion

# Check if restart needed
if ($NeedsRestart) {
    Write-Host ""
    Write-Warning "Some software was just installed."
    Write-Info "It's recommended to close this window and run the script again"
    Write-Info "to ensure all PATH changes take effect."
    Write-Host ""
    $continue = Read-Host "Continue anyway? (Y/N)"
    if ($continue -notmatch "^[Yy]") {
        exit 0
    }
}

#region ==================== BACKEND SETUP ====================

Write-Header "Setting up Backend"

Set-Location backend

# Create virtual environment if it doesn't exist
if (-not (Test-Path "venv")) {
    Write-Info "Creating Python virtual environment..."
    & $pythonCmd -m venv venv
    Write-Success "Virtual environment created"
}

# Activate virtual environment
$venvActivate = Join-Path $PWD "venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
    & $venvActivate
} else {
    Write-Error "Failed to activate virtual environment"
    exit 1
}

# Install/upgrade dependencies (requirements.txt)
Write-Info "Installing Python dependencies from requirements.txt..."
$venvPython = Join-Path $PWD "venv\Scripts\python.exe"
& $venvPython -m pip install --quiet --upgrade pip 2>&1 | Out-Null
& $venvPython -m pip install --quiet -r requirements.txt
if ($LASTEXITCODE -eq 0) {
    Write-Success "Backend dependencies installed (requirements.txt)"
} else {
    Write-Warning "Some dependencies may have failed to install. Check backend.log for details."
}

# Create uploads directory
if (-not (Test-Path "uploads")) {
    New-Item -ItemType Directory -Path "uploads" | Out-Null
}
Write-Success "Backend ready"

Set-Location ..

#endregion

#region ==================== FRONTEND SETUP ====================

Write-Header "Setting up Frontend"

Set-Location frontend

# Install dependencies (npm install)
if (-not (Test-Path "node_modules")) {
    Write-Info "Installing Node.js dependencies (npm install)..."
    Write-Info "This may take a minute on first run..."
    & npm install 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Frontend dependencies installed (npm install)"
    } else {
        Write-Warning "npm install may have had issues. Check frontend.log for details."
    }
} else {
    Write-Success "Frontend dependencies already installed"
}

Set-Location ..

#endregion

#region ==================== DATABASE ====================

# Clear database if requested
if ($ClearDB) {
    Write-Warning "Clearing database..."
    Set-Location backend
    
    if (Test-Path "venv\Scripts\Activate.ps1") {
        & "venv\Scripts\Activate.ps1"
        
        if (Test-Path "pfmea.db") {
            $clearScript = @"
import os
import sys
sys.path.insert(0, os.getcwd())

from app.models.database import engine, Base
from app.models.analysis import Analysis, PFMEAResult

print("Dropping existing tables...")
Base.metadata.drop_all(bind=engine, checkfirst=True)

print("Recreating tables...")
Base.metadata.create_all(bind=engine)

print("Database cleared and reinitialized")
"@
            $venvPython = Join-Path $PWD "venv\Scripts\python.exe"
            $clearScript | & $venvPython
            Write-Success "Database cleared"
        } else {
            Write-Info "No database file found, will be created on first run."
        }
    }
    Set-Location ..
} elseif (Test-Path "backend\pfmea.db") {
    Write-Info "Database exists. Use --clear-db flag to clear it on startup."
}

#endregion

#region ==================== CONFIG ====================

# Create .env file if it doesn't exist
if (-not (Test-Path "backend\.env")) {
    Write-Info "Creating backend\.env configuration file..."
    $envContent = @"
# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b

# Application
DEBUG=false

# File Upload
MAX_UPLOAD_SIZE_MB=50

# Database
DATABASE_URL=sqlite:///./pfmea.db

# CORS
ENABLE_CORS=true
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
"@
    $envContent | Out-File -FilePath "backend\.env" -Encoding utf8
    Write-Success "Configuration file created"
}

#endregion

#region ==================== PROCESS MANAGEMENT ====================

Write-Header "Checking for Existing Processes"

function Kill-Port {
    param($Port, $Service)
    
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($connections) {
            $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
            Write-Warning "Found existing $Service process(es) on port $Port. Killing..."
            foreach ($pid in $pids) {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 2
            Write-Success "Killed existing $Service process(es)"
        } else {
            Write-Success "Port $Port is free"
        }
    } catch {
        Write-Warning "Cannot check for existing processes on port $Port"
    }
}

function Kill-ProcessByName {
    param($Pattern, $Service)
    
    try {
        $processes = Get-Process | Where-Object { $_.ProcessName -like "*$Pattern*" } -ErrorAction SilentlyContinue
        if ($processes) {
            $pids = $processes | Select-Object -ExpandProperty Id -Unique
            Write-Warning "Found existing $Service process(es). Killing..."
            foreach ($pid in $pids) {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 1
            Write-Success "Killed existing $Service process(es)"
        }
    } catch {
        # Ignore errors
    }
}

Write-Info "Checking for existing server processes..."
Kill-ProcessByName "uvicorn" "backend"
Kill-ProcessByName "vite" "frontend"
Kill-Port 8000 "backend"
Kill-Port 5173 "frontend"

#endregion

#region ==================== START SERVERS ====================

Write-Header "Starting Servers"

function Cleanup {
    Write-Info "`nShutting down servers..."
    Kill-Port 8000 "backend"
    Kill-Port 5173 "frontend"
    Write-Success "Servers stopped"
    exit 0
}

$null = Register-EngineEvent PowerShell.Exiting -Action { Cleanup }

# Start backend
Write-Info "Starting backend server on http://localhost:8000"
Set-Location backend
$backendLog = Join-Path $ScriptDir "backend.log"
$pythonExe = Join-Path $PWD "venv\Scripts\python.exe"
Start-Process -FilePath $pythonExe -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000" -RedirectStandardOutput $backendLog -RedirectStandardError $backendLog -WindowStyle Hidden -PassThru | Out-Null
Set-Location ..

# Wait for backend
Write-Info "Waiting for backend to start..."
Start-Sleep -Seconds 3
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Success "Backend server is running"
} catch {
    Write-Warning "Backend may still be starting. Check backend.log if issues occur."
}

# Start frontend
Write-Info "Starting frontend server on http://localhost:5173"
Set-Location frontend
$frontendLog = Join-Path $ScriptDir "frontend.log"
Start-Process -FilePath "npm" -ArgumentList "run", "dev" -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendLog -WindowStyle Hidden -PassThru | Out-Null
Set-Location ..

Start-Sleep -Seconds 2

#endregion

#region ==================== DONE ====================

Write-Header "Application Started Successfully!"

Write-Host "✓ Backend:  http://localhost:8000" -ForegroundColor Green
Write-Host "✓ Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "Open your browser and navigate to: " -NoNewline
Write-Host "http://localhost:5173" -ForegroundColor Cyan
Write-Host ""

if (-not $OllamaAvailable) {
    Write-Host "⚠ Warning: Ollama is not available. AI/LLM features will not work." -ForegroundColor Yellow
    Write-Host "   Install from: https://ollama.ai" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "Press Ctrl+C to stop all servers" -ForegroundColor Yellow
Write-Host ""

Write-Info "Server logs:"
Write-Host "  Backend:  type backend.log" -ForegroundColor Cyan
Write-Host "  Frontend: type frontend.log" -ForegroundColor Cyan
Write-Host ""

Write-Host "Servers are running in the background." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop all servers..." -ForegroundColor Yellow
Write-Host ""

# Wait for user interrupt
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} catch {
    Cleanup
}

#endregion
