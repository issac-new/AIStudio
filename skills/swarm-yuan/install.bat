@echo off
REM install.bat - Windows 包装器，自动查找 bash 并运行 install.sh
REM 用法:
REM   install.bat                  自动检测环境 + 安装（未检测到宿主时默认 ~/.agents/skills/）
REM   install.bat --agents         强制安装到 ~/.agents/skills/
REM   install.bat --claude         强制安装到 ~/.claude/skills/
REM   install.bat --list           仅列出检测到的环境
REM   install.bat --all            安装到所有已检测到的环境
REM   install.bat --uninstall --claude  卸载（其余目标/--all 同 install.sh；目录存档为 *.uninstalled.<UTC时间戳>）

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
REM WSL 调用形态：wsl --exec env "HOME=..." bash "..."（经 wslpath 修正 HOME，见下方 WSL 分支；BASH_CMD 含两词，不能整体加引号）
REM Git Bash/MSYS2 调用形态："!BASH_CMD!" "..."（含空格路径须加引号）

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
    REM R118 ⑭：WSL 里 bash 的 HOME 默认是 Linux 用户目录，install.sh 会把技能装进
    REM WSL 的 ~/.claude/skills（Windows 侧工具看不到）。用 wslpath 把 Windows 用户目录
    REM 转成 WSL 路径并显式作为 HOME；转换失败则明确报错要求改用 Git Bash。
    REM 注意：本分支未在 Windows 实机验证（见测试报告“未验证项”）。
    set "WSL_HOME="
    for /f "usebackq delims=" %%h in (`wsl wslpath -u "%USERPROFILE%" 2^>nul`) do set "WSL_HOME=%%h"
    if "!WSL_HOME!"=="" (
        echo ERROR: WSL 模式下无法把 Windows 用户目录转换为 WSL 路径（wslpath 不可用）。
        echo   WSL 直接运行会把技能装进 WSL 自己的 HOME，Windows 侧工具看不到。
        echo   请改用 Git for Windows 自带的 Git Bash 运行 install.bat（推荐），或手动设置 HOME。
        exit /b 1
    )
    echo WSL 模式：HOME 指向 Windows 用户目录 "!WSL_HOME!"（避免误装进 WSL 的 Linux HOME）
    wsl --exec env "HOME=!WSL_HOME!" bash "!BASH_DIR!/install.sh" !SW_ARGV!
) else (
    "!BASH_CMD!" "!BASH_DIR!/install.sh" !SW_ARGV!
)
