@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM PFMEA Analysis Tool - Windows Auto-Installer & Launcher
REM Double-click this file to install and start the application
REM ============================================================

title PFMEA Analysis Tool
color 0F

echo.
echo  ============================================================
echo.
echo           PFMEA ANALYSIS TOOL
echo.
echo     Process Failure Mode and Effects Analysis
echo.
echo  ============================================================
echo.

cd /d "%~dp0"

REM Check if running as admin (needed for some installs)
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] Some features may require administrator privileges.
    echo     If installation fails, right-click this file and
    echo     select "Run as administrator"
    echo.
)

REM ============================================================
REM STEP 1: Check/Install Ollama
REM ============================================================
echo [1/4] Checking Ollama...

where ollama >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo      Ollama not found. Installing...
    echo.
    
    REM Try winget first (Windows 10/11)
    where winget >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo      Installing via Windows Package Manager...
        winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
        if !ERRORLEVEL! EQU 0 (
            echo      [OK] Ollama installed successfully
            echo.
            echo      !! IMPORTANT !! Please restart your computer, then
            echo      double-click this launcher again.
            echo.
            pause
            exit /b 0
        )
    )
    
    REM Fallback: Download installer directly
    echo      Downloading Ollama installer...
    set OLLAMA_URL=https://ollama.ai/download/OllamaSetup.exe
    set OLLAMA_INSTALLER=%TEMP%\OllamaSetup.exe
    
    powershell -Command "Invoke-WebRequest -Uri '%OLLAMA_URL%' -OutFile '%OLLAMA_INSTALLER%'" 2>nul
    if exist "%OLLAMA_INSTALLER%" (
        echo      Running Ollama installer...
        echo      Please follow the installation prompts.
        start /wait "" "%OLLAMA_INSTALLER%"
        del "%OLLAMA_INSTALLER%" 2>nul
        echo.
        echo      !! IMPORTANT !! Please restart your computer, then
        echo      double-click this launcher again.
        echo.
        pause
        exit /b 0
    ) else (
        echo      [ERROR] Could not download Ollama.
        echo      Please install manually from: https://ollama.ai/download
        start https://ollama.ai/download
        pause
        exit /b 1
    )
)
echo      [OK] Ollama installed

REM Start Ollama if not running
curl -s http://localhost:11434/api/tags >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo      Starting Ollama service...
    start /min "" ollama serve
    timeout /t 5 /nobreak >nul
)
echo      [OK] Ollama running

REM ============================================================
REM STEP 2: Check/Install Python
REM ============================================================
echo.
echo [2/4] Checking Python...

set PYTHON_CMD=
where python >nul 2>&1 && set PYTHON_CMD=python
if not defined PYTHON_CMD (
    where python3 >nul 2>&1 && set PYTHON_CMD=python3
)
if not defined PYTHON_CMD (
    where py >nul 2>&1 && set PYTHON_CMD=py
)

if not defined PYTHON_CMD (
    echo      Python not found. Installing...
    echo.
    
    REM Try winget first
    where winget >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo      Installing via Windows Package Manager...
        winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements
        if !ERRORLEVEL! EQU 0 (
            echo      [OK] Python installed successfully
            set PYTHON_CMD=python
            REM Refresh PATH
            call refreshenv >nul 2>&1
        )
    )
    
    REM Check again
    where python >nul 2>&1 && set PYTHON_CMD=python
    
    if not defined PYTHON_CMD (
        REM Fallback: Download installer
        echo      Downloading Python installer...
        set PYTHON_URL=https://www.python.org/ftp/python/3.12.0/python-3.12.0-amd64.exe
        set PYTHON_INSTALLER=%TEMP%\python-installer.exe
        
        powershell -Command "Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_INSTALLER%'" 2>nul
        if exist "%PYTHON_INSTALLER%" (
            echo      Running Python installer...
            echo      !! IMPORTANT !! Check "Add Python to PATH" at the bottom!
            start /wait "" "%PYTHON_INSTALLER%" /passive InstallAllUsers=0 PrependPath=1 Include_test=0
            del "%PYTHON_INSTALLER%" 2>nul
            set PYTHON_CMD=python
            echo.
            echo      !! IMPORTANT !! Please restart your computer, then
            echo      double-click this launcher again.
            echo.
            pause
            exit /b 0
        ) else (
            echo      [ERROR] Could not download Python.
            echo      Please install manually from: https://www.python.org/downloads/
            echo      !! Make sure to check "Add Python to PATH" !!
            start https://www.python.org/downloads/
            pause
            exit /b 1
        )
    )
)
echo      [OK] Python found: %PYTHON_CMD%

REM ============================================================
REM STEP 3: Check/Install Node.js
REM ============================================================
echo.
echo [3/4] Checking Node.js...

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo      Node.js not found. Installing...
    echo.
    
    REM Try winget first
    where winget >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo      Installing via Windows Package Manager...
        winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
        if !ERRORLEVEL! EQU 0 (
            echo      [OK] Node.js installed successfully
            REM Refresh PATH
            call refreshenv >nul 2>&1
        )
    )
    
    REM Check again
    where node >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        REM Fallback: Download installer
        echo      Downloading Node.js installer...
        set NODE_URL=https://nodejs.org/dist/v20.10.0/node-v20.10.0-x64.msi
        set NODE_INSTALLER=%TEMP%\node-installer.msi
        
        powershell -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_INSTALLER%'" 2>nul
        if exist "%NODE_INSTALLER%" (
            echo      Running Node.js installer...
            start /wait msiexec /i "%NODE_INSTALLER%" /passive
            del "%NODE_INSTALLER%" 2>nul
            echo.
            echo      !! IMPORTANT !! Please restart your computer, then
            echo      double-click this launcher again.
            echo.
            pause
            exit /b 0
        ) else (
            echo      [ERROR] Could not download Node.js.
            echo      Please install manually from: https://nodejs.org/
            start https://nodejs.org/
            pause
            exit /b 1
        )
    )
)
echo      [OK] Node.js found

REM ============================================================
REM STEP 4: Download AI Models
REM ============================================================
echo.
echo [4/4] Checking AI models...

REM Pull models - idempotent, won't re-download if present
echo      Checking qwen3:4b model...
echo      If not present, will download ~2.5GB - may take 5-10 minutes
ollama pull qwen3:4b
echo      [OK] qwen3:4b ready

echo.
echo      Checking llama3.2:3b model...
echo      If not present, will download ~2GB - may take 3-5 minutes
ollama pull llama3.2:3b
echo      [OK] llama3.2:3b ready

REM ============================================================
REM SETUP: Install application dependencies
REM ============================================================
echo.
echo [*] Setting up application...

REM Create Python virtual environment
if not exist "backend\venv" (
    echo      Creating Python environment...
    cd backend
    %PYTHON_CMD% -m venv venv
    cd ..
)

REM Install Python dependencies
echo      Installing Python packages...
echo      (This may take 2-5 minutes - progress will be shown below)
echo.
pushd "%~dp0backend"
if not exist venv\Scripts\python.exe call %PYTHON_CMD% -m venv venv
call venv\Scripts\python.exe -m pip install --upgrade pip
call venv\Scripts\python.exe -m pip install -r requirements.txt
popd
echo.
echo      [OK] Python packages installed

REM Install Node dependencies
if exist frontend\node_modules goto skip_npm
echo      Installing frontend packages...
echo      (This may take 1-3 minutes - progress will be shown below)
echo.
pushd "%~dp0frontend"
call npm install
popd
echo.
:skip_npm
echo      [OK] Frontend packages ready

REM Create config file
if exist backend\.env goto skip_env
echo      Creating configuration...
echo OLLAMA_BASE_URL=http://localhost:11434> backend\.env
echo OLLAMA_MODEL=qwen3:4b>> backend\.env
echo DEBUG=false>> backend\.env
echo MAX_UPLOAD_SIZE_MB=50>> backend\.env
echo DATABASE_URL=sqlite:///./pfmea.db>> backend\.env
:skip_env
echo      [OK] Setup complete

REM ============================================================
REM START APPLICATION
REM ============================================================
echo.
echo ============================================================
echo.
echo   STARTING APPLICATION...
echo.
echo   Two server windows will open - DO NOT CLOSE THEM!
echo.
echo ============================================================
echo.

REM Kill any existing processes on our ports
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

REM Start backend
echo [*] Starting backend server...
set BACKEND_PATH=%~dp0backend
start "PFMEA-Backend" cmd /k "cd /d "%BACKEND_PATH%" && venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

timeout /t 3 /nobreak >nul

REM Start frontend
echo [*] Starting frontend server...
set FRONTEND_PATH=%~dp0frontend
start "PFMEA-Frontend" cmd /k "cd /d %FRONTEND_PATH% && npm run dev"

timeout /t 5 /nobreak >nul

REM Open browser
echo.
echo ============================================================
echo.
color 0A
echo   SUCCESS! APPLICATION IS READY
echo.
echo   Opening browser to: http://localhost:5173
echo.
echo   TO STOP: Close the "PFMEA-Backend" and "PFMEA-Frontend"
echo            command windows
echo.
echo ============================================================
echo.
color 0F

start http://localhost:5173

echo Press any key to close this window...
echo (The app will keep running in the other windows)
pause >nul
