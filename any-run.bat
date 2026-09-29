@echo off
setlocal
cd /d "%~dp0"

:: Check if node is available
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH.
    echo Please install Node.js from https://nodejs.org/ to run AnyRun.
    pause
    exit /b 1
)

:: Launch AnyRun in background (window hidden) and exit CMD immediately
start "" wscript //nologo "%~dp0any-run.vbs" %*
exit /b 0
