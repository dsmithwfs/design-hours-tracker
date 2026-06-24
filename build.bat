@echo off
echo === Design Hours Tracker — Electron Build ===
echo.

where node >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Download from https://nodejs.org
    pause
    exit /b 1
)

echo [1/2] Installing dependencies...
npm install
if %errorLevel% neq 0 ( echo npm install failed. & pause & exit /b 1 )

echo.
echo [2/2] Building Windows installer...
npm run dist
if %errorLevel% neq 0 ( echo Build failed. & pause & exit /b 1 )

echo.
echo ============================================
echo Done! Installer is in the dist\ folder.
echo ============================================
echo.
pause
