@echo off
rem AIStudio offline installer entry: forwards to install-windows.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" %*
pause
