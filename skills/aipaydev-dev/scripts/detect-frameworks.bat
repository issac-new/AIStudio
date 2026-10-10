@echo off
REM detect-frameworks.bat - Windows 包装器，自动查找 bash 并运行 detect-frameworks.sh
REM 用法:
REM   detect-frameworks.bat <项目目录>    探测项目使用的框架清单
REM 注：本 .bat 供已生成的目标 skill 使用（其 scripts/detect-frameworks.sh 存在）；
REM     swarm-yuan 源仓库内 detect-frameworks.sh 位于 scripts/，源仓库开发请直接 bash scripts/detect-frameworks.sh。

setlocal enabledelayedexpansion

REM 查找 bash（优先级：Git Bash > WSL > MSYS2；与文档声明一致）
set "BASH_CMD="
set "BASH_KIND="

if exist "C:\Program Files\Git\bin\bash.exe" ( set "BASH_CMD=C:\Program Files\Git\bin\bash.exe" & set "BASH_KIND=gitbash" & goto :found )
if exist "C:\Program Files (x86)\Git\bin\bash.exe" ( set "BASH_CMD=C:\Program Files (x86)\Git\bin\bash.exe" & set "BASH_KIND=gitbash" & goto :found )

for /f "delims=" %%i in ('where bash 2^>nul') do (
    echo %%i | findstr /i "\\Git\\" >nul 2>&1 && ( set "BASH_CMD=%%i" & set "BASH_KIND=gitbash" & goto :found )
)

where wsl >nul 2>&1 && ( set "BASH_CMD=wsl bash" & set "BASH_KIND=wsl" & goto :found )

if exist "C:\msys64\usr\bin\bash.exe" ( set "BASH_CMD=C:\msys64\usr\bin\bash.exe" & set "BASH_KIND=msys2" & goto :found )

echo ERROR: 未找到 bash。
echo swarm-yuan 需要 bash 才能运行（Windows 原生 cmd/PowerShell 不支持），请安装 Git for Windows 或 WSL。
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
    wsl bash "!BASH_DIR!/detect-frameworks.sh" %*
) else (
    "!BASH_CMD!" "!BASH_DIR!/detect-frameworks.sh" %*
)
