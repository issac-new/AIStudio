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

REM swarm-yuan:argv-posix-convert v1 -- 参数 Win32 盘符路径转 POSIX（R128；标记行供 tests/test-bat-parity.sh 对账识别）
REM 背景：Git Bash 对 argv 不做 Win→POSIX 转换，%* 原样透传时 bash 侧 [ -f "C:\dir\..." ] 恒假，
REM       静默报「无数据」而非报错。此块逐参数检测「盘符:\」形态并转为 /盘符/...（WSL 为 /mnt/盘符/...），
REM       其余参数原样保留；各参数加引号重组进 SW_ARGV 后传 bash（含空格路径得以保真）。
REM 已知限制（Windows 实机未验证，静态审查口径）：参数含 ! 会被 delayedexpansion 改写；嵌套双引号
REM       不支持；UNC（\\server\share）与盘符相对路径（C:dir）不转换，原样透传；未加引号的含空格/特殊
REM       字符参数仍按 cmd 语义分词（与 %* 透传一致）。
set "SW_ARGV="
:sw_argv_loop
if [%1]==[] goto :sw_argv_done
set "SW_ARG=%~1"
if not defined SW_ARG (
    REM 空串参数（""）原样保留为一个空参数
    set "SW_ARGV=!SW_ARGV! """
    shift
    goto :sw_argv_loop
)
for %%d in (a b c d e f g h i j k l m n o p q r s t u v w x y z) do (
    if /i "!SW_ARG:~0,1!"=="%%d" if "!SW_ARG:~1,1!"==":" if "!SW_ARG:~2,1!"=="\" (
        set "SW_ARG=!SW_ARG:\=/!"
        if "!BASH_KIND!"=="wsl" ( set "SW_ARG=/mnt/%%d!SW_ARG:~2!" ) else ( set "SW_ARG=/%%d!SW_ARG:~2!" )
    )
)
set "SW_ARGV=!SW_ARGV! "!SW_ARG!""
shift
goto :sw_argv_loop
:sw_argv_done
if "!BASH_KIND!"=="wsl" (
    wsl bash "!BASH_DIR!/detect-frameworks.sh" !SW_ARGV!
) else (
    "!BASH_CMD!" "!BASH_DIR!/detect-frameworks.sh" !SW_ARGV!
)
