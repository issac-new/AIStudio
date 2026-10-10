@echo off
REM install.bat - Windows 包装器，自动查找 bash 并运行 install.sh
REM 用法:
REM   install.bat                  自动检测环境 + 安装
REM   install.bat --claude         强制安装到 ~/.claude/skills/
REM   install.bat --list           仅列出检测到的环境
REM   install.bat --all            安装到所有已检测到的环境

setlocal enabledelayedexpansion

REM 查找 bash（优先级：Git Bash > WSL > MSYS2；与文档声明一致）
REM BASH_KIND: gitbash / wsl / msys2 -- 决定调用形态与路径转换
set "BASH_CMD="
set "BASH_KIND="

REM 1. Git for Windows 默认路径（含空格，优先于 where bash，符合 Git Bash>WSL>MSYS2 优先级）
if exist "C:\Program Files\Git\bin\bash.exe" ( set "BASH_CMD=C:\Program Files\Git\bin\bash.exe" & set "BASH_KIND=gitbash" & goto :found )
if exist "C:\Program Files (x86)\Git\bin\bash.exe" ( set "BASH_CMD=C:\Program Files (x86)\Git\bin\bash.exe" & set "BASH_KIND=gitbash" & goto :found )

REM 2. where bash -- 仅当命中路径含 \Git\ 才认 Git Bash，避免误匹配 WSL 的 System32\bash.exe
for /f "delims=" %%i in ('where bash 2^>nul') do (
    echo %%i | findstr /i "\\Git\\" >nul 2>&1 && ( set "BASH_CMD=%%i" & set "BASH_KIND=gitbash" & goto :found )
)

REM 3. WSL（独立探查，不会被 where bash 短路）
where wsl >nul 2>&1 && ( set "BASH_CMD=wsl bash" & set "BASH_KIND=wsl" & goto :found )

REM 4. MSYS2
if exist "C:\msys64\usr\bin\bash.exe" ( set "BASH_CMD=C:\msys64\usr\bin\bash.exe" & set "BASH_KIND=msys2" & goto :found )

echo ERROR: 未找到 bash。
echo swarm-yuan 是 bash 工具，需要 bash 才能运行（Windows 原生 cmd/PowerShell 不支持）。
echo 请安装 Git for Windows（https://git-scm.com/download/win，自带 Git Bash）或 WSL（wsl --install）。
exit /b 1

:found
echo 检测到 bash: !BASH_CMD! (!BASH_KIND!)

REM 获取脚本所在目录（去掉末尾反斜杠）
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM 将 Windows 路径转换为 bash 路径（WSL 用 /mnt/c/，Git Bash/MSYS2 用 /c/）
set "BASH_DIR=%SCRIPT_DIR%"
set "BASH_DIR=!BASH_DIR:\=/!"
REM WP-Bootstrap: 盘符循环覆盖 A-Z，消除旧版只转 C/D/E 导致 F:/G:/网络盘静默失败的缺陷
for %%d in (A B C D E F G H I J K L M N O P Q R S T U V W X Y Z) do (
    if "!BASH_KIND!"=="wsl" (
        set "BASH_DIR=!BASH_DIR:%%d:=/mnt/%%d!"
    ) else (
        set "BASH_DIR=!BASH_DIR:%%d:=/%%d!"
    )
)

REM 运行 install.sh
REM WSL 调用形态：wsl bash "..."（BASH_CMD 含两词，不能整体加引号）
REM Git Bash/MSYS2 调用形态："!BASH_CMD!" "..."（含空格路径须加引号）
if "!BASH_KIND!"=="wsl" (
    wsl bash "!BASH_DIR!/install.sh" %*
) else (
    "!BASH_CMD!" "!BASH_DIR!/install.sh" %*
)
