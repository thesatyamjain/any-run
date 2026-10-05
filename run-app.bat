@echo off
setlocal
cd /d "%~dp0"

set "EXE_PATH=%~dp0dist-desktop\AnyRun-win32-x64\AnyRun.exe"

:: 1. If standalone binary exists, fast-sync latest sources (10ms) and launch immediately
if exist "%EXE_PATH%" (
    if exist "%~dp0src" (
        robocopy "%~dp0src" "%~dp0dist-desktop\AnyRun-win32-x64\resources\app\src" /E /XO /NDL /NFL /NJH /NJS >nul 2>&1
        copy /Y "%~dp0package.json" "%~dp0dist-desktop\AnyRun-win32-x64\resources\app\package.json" >nul 2>&1
    )
    start "" "%EXE_PATH%" %*
    exit /b 0
)

:: 2. Otherwise check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH and standalone AnyRun.exe is not yet packaged.
    echo Please install Node.js from https://nodejs.org/ or run 'npm run build:app'.
    pause
    exit /b 1
)

:: 3. Build standalone app if missing
if not exist "%EXE_PATH%" (
    echo [AnyRun] Standalone app not found. Packaging now (this only happens once)...
    call node scripts/package-app.js
    if exist "%EXE_PATH%" (
        start "" "%EXE_PATH%" %*
        exit /b 0
    )
)

:: 4. Fallback to electron development runner
if exist "%~dp0node_modules\.bin\electron.cmd" (
    start "" "%~dp0node_modules\.bin\electron.cmd" src/desktop/main.js %*
) else (
    start "" npx electron src/desktop/main.js %*
)
exit /b 0
