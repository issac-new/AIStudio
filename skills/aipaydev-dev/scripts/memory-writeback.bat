@echo off
REM memory-writeback.bat - Windows 包装器，自动查找 bash 并运行 memory-writeback.sh
REM 用法:
REM   memory-writeback.bat [--skill-dir <目录>] [--project-dir <目录>]    Step 12 记忆写回（三路 best-effort）
REM 注：本 .bat 供已生成的目标 skill 使用（其 scripts/memory-writeback.sh 存在）；
REM     swarm-yuan 源仓库内 memory-writeback.sh 位于 assets/，源仓库开发请直接 bash assets/memory-writeback.sh。

setlocal enabledelayedexpansion

set "BASH_CMD="
set "BASH_KIND="

if exist "C:\Program Files\Git\bin\bash.exe" ( set "BASH_CMD=C:\Program Files\Git\bin\bash.exe" & set "BASH_KIND=gitbash" & goto :found )
if exist "C:\Program Files (x86)\Git\bin\bash.exe" ( set "BASH_CMD=C:\Program Files (x86)\Git\bin\bash.exe" & set "BASH_KIND=gitbash" & goto :found )

for /f "delims=" %%i in ('where bash 2^>nul') do (
    echo %%i | findstr /i "\\Git\\" >nul 2>&1 && ( set "BASH_CMD=%%i" & set "BASH_KIND=gitbash" & goto :found )
)

where wsl >nul 2>&1 && ( set "BASH_CMD=wsl bash" & set "BASH_KIND=wsl" & goto :found )

if exist "C:\msys64\usr\bin\bash.exe" ( set "BASH_CMD=C:\msys64\usr\bin\bash.exe" & set "BASH_KIND=msys2" & goto :found )

echo ERROR: 未找到 bash。请安装 Git for Windows 或 WSL。
exit /b 1

:found
echo 检测到 bash: !BASH_CMD! (!BASH_KIND!)

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "BASH_DIR=%SCRIPT_DIR%"
set "BASH_DIR=!BASH_DIR:\=/!"
for %%d in (A B C D E F G H I J K L M N O P Q R S T U V W X Y Z) do (
    if "!BASH_KIND!"=="wsl" (
        set "BASH_DIR=!BASH_DIR:%%d:=/mnt/%%d!"
    ) else (
        set "BASH_DIR=!BASH_DIR:%%d:=/%%d!"
    )
)

if "!BASH_KIND!"=="wsl" (
    wsl bash "!BASH_DIR!/memory-writeback.sh" %*
) else (
    "!BASH_CMD!" "!BASH_DIR!/memory-writeback.sh" %*
)
