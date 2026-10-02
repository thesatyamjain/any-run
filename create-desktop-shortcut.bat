@echo off
setlocal
cd /d "%~dp0"

echo [AnyRun] Creating desktop shortcut...
node scripts/create-shortcut.js

if %errorlevel% equ 0 (
    echo [AnyRun] Done! You can now launch AnyRun directly from your Desktop.
) else (
    echo [AnyRun] Failed to create shortcut.
)
timeout /t 3 >nul
exit /b %errorlevel%
