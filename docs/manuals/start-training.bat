@echo off
rem Windows double-click entry: start only the local training manual.
setlocal
cd /d "%~dp0..\.."
call npm run training
endlocal
