@echo off
setlocal enabledelayedexpansion
rem REAP installer (Windows) — installs Skills\ prompt packs into your AI coding agent.
rem Usage: setup.bat [agent]   agent: hermes | claude-code | codex | all (default: all detected)
cd /d "%~dp0"

where python >nul 2>&1
if %errorlevel%==0 (
  python tools\build_skills.py
  python tools\build_system_prompt.py
) else (
  where python3 >nul 2>&1
  if !errorlevel!==0 (
    python3 tools\build_skills.py
    python3 tools\build_system_prompt.py
  ) else (
    echo note: python not found - installing the Skills\ folder as committed
  )
)

set "AGENT=%~1"
if "%AGENT%"=="" set "AGENT=all"

set "DIRS="
if /i "%AGENT%"=="hermes" set "DIRS=%USERPROFILE%\.hermes\skills"
if /i "%AGENT%"=="claude-code" set "DIRS=%USERPROFILE%\.claude\skills"
if /i "%AGENT%"=="claude" set "DIRS=%USERPROFILE%\.claude\skills"
if /i "%AGENT%"=="codex" set "DIRS=%USERPROFILE%\.codex\skills"
if /i "%AGENT%"=="all" (
  if exist "%USERPROFILE%\.hermes" set "DIRS=!DIRS! %USERPROFILE%\.hermes\skills"
  if exist "%USERPROFILE%\.claude" set "DIRS=!DIRS! %USERPROFILE%\.claude\skills"
  if exist "%USERPROFILE%\.codex"  set "DIRS=!DIRS! %USERPROFILE%\.codex\skills"
)
if not "%AGENT%"=="all" if not "%AGENT%"=="hermes" if not "%AGENT%"=="claude-code" if not "%AGENT%"=="claude" if not "%AGENT%"=="codex" (
  echo unknown agent: %AGENT% ^(use: hermes ^| claude-code ^| codex ^| all^)
  exit /b 1
)

if "%DIRS%"=="" (
  echo No supported agent directory found ^(%USERPROFILE%\.hermes, .claude, .codex^).
  echo Install manually: copy Skills\reap-* into your agent's skills folder.
  exit /b 1
)

set /a COUNT=0
for %%D in (%DIRS%) do (
  if not exist "%%D" mkdir "%%D"
  for /d %%S in ("Skills\reap-*") do (
    if exist "%%D\%%~nxS" rmdir /s /q "%%D\%%~nxS"
    xcopy /e /i /q "%%S" "%%D\%%~nxS" >nul
    set /a COUNT+=1
  )
  echo installed !COUNT! skill pack(s^) -^> %%D
)

echo.
echo REAP installed. Reload your agent session to pick up the skills.
echo Full-library system prompt ^(optional paste^): %CD%\system_prompt.md
endlocal
