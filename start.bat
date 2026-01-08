@echo off
REM PFMEA Analysis Tool - Auto Setup & Start Script (Windows Batch)
REM This is a fallback script for older Windows systems without PowerShell

REM Set local environment
setlocal enabledelayedexpansion

echo.
echo ========================================================================
echo   PFMEA Analysis Tool - Auto Setup & Start
echo ========================================================================
echo.

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=!SCRIPT_DIR:~0,-1!"

REM Check for PowerShell
where powershell >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Using PowerShell script for better compatibility...
    cd /d "!SCRIPT_DIR!"
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!\start.ps1" %*
    set "EXIT_CODE=!ERRORLEVEL!"
    exit /b !EXIT_CODE!
)

echo ERROR: PowerShell is required to run this script.
echo.
echo Please either:
echo   1. Install PowerShell (recommended)
echo   2. Or run the setup commands manually (see README.md)
echo.
pause
exit /b 1



