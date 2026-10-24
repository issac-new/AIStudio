@echo off
REM ============================================================
REM SwarmTeam Installer — double-click or run from cmd
REM ============================================================
REM Calls the PowerShell installer with execution policy bypass
REM ============================================================

cd /d "%~dp0"
echo.
echo ============================================================
echo   SwarmTeam Offline Installer
echo   Launching PowerShell installer...
echo ============================================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1"

echo.
echo ============================================================
echo   Installation finished. Press any key to exit.
echo ============================================================
pause >nul
