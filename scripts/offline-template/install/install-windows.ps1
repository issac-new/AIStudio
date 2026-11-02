# ============================================================
# AIStudio 离线安装脚本（Windows amd64 / web 模式）
# spec: docs/superpowers/specs/2026-11-02-offline-windows-package.md
# 前置: Node>=23 / Python 3.14 / git 已装; npm/pip 镜像已由目标机
#       环境变量配好(本脚本不写不覆盖 registry——D3)。
# 用法:
#   powershell -ExecutionPolicy Bypass -File install-windows.ps1
#   可选: -SkipTeams / -SkipZcode / -SkipSmoke / -Python <path>
# 幂等: 每步先探测已完成则 SKIP, 失败即停并给恢复提示。
# 兼容: PowerShell 5.1(Win10/11 内置)。npm/pnpm 是 .cmd, 外部命令统一经
#       cmd.exe(/d /s /c) 通道执行并显式引号——审查 P0-1/P1-6 根治。
# ============================================================
param(
  [switch]$SkipTeams,
  [switch]$SkipZcode,
  [switch]$SkipSmoke,
  [string]$Python = ""            # 显式指定 python.exe(缺省自动找 3.14)
)
$ErrorActionPreference = "Stop"
$pkgRoot  = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)  # install/ 的上一级=包根
$aiRoot   = Join-Path $pkgRoot "aistudio"
$srcAgent = Join-Path $pkgRoot "hermes-agent-src"
$hermesHome = Join-Path $env:USERPROFILE ".hermes"
$agentDir   = Join-Path $hermesHome "hermes-agent"
$Results = New-Object System.Collections.ArrayList
function Step($name, $status) { $script:Results.Add(@{ step=$name; status=$status }) | Out-Null
  Write-Host ("  [{0}] {1}" -f $status, $name) -ForegroundColor $(if ($status -eq "FAIL") {"Red"} elseif ($status -eq "SKIP") {"DarkYellow"} else {"Green"}) }
function Die($msg) { Write-Host "  ERROR: $msg" -ForegroundColor Red; Write-Host "  修复后重跑本脚本(已完成步骤会自动跳过)。" -ForegroundColor Yellow; exit 1 }
function Run([string]$cmd, [string[]]$argv, [string]$cwd) {
  # PS 5.1: Start-Process 直启非 .exe(如 npm.cmd)会找不到文件; 数组元素也不自动加引号。
  # 统一 cmd.exe 通道 + 含空格参数显式引号。
  $parts = @($cmd) + @($argv)
  $line = ($parts | ForEach-Object { if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ } }) -join ' '
  $p = Start-Process -FilePath $env:ComSpec -ArgumentList '/d','/s','/c', $line -WorkingDirectory $cwd -NoNewWindow -Wait -PassThru
  return $p.ExitCode
}

# ---------- S0 doctor 体检 ----------
Write-Host "`n== S0 doctor 体检 ==" -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Die "node 未安装(需 >=23)" }
$nodeVer = (& node --version) 2>$null
$nodeMajor = [int]($nodeVer -replace '[^0-9].*','')
if ($nodeMajor -lt 23) { Die "node $nodeVer < 23" }
$nodeNote = if ($nodeMajor -lt 24) { "低于 zcode 声明的 >=24, 仅警告放行" } else { "达标" }
Write-Host "  OK: node $nodeVer ($nodeNote)"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Die "npm 未安装" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host "  WARN: git 未装(inject 的 git apply 需要)" -ForegroundColor DarkYellow }
# Python 3.14 定位: 显式参数 > py 启动器 > PATH
$pyCmd = $Python
if (-not $pyCmd) {
  if (Get-Command py -ErrorAction SilentlyContinue) {
    $hit = (& py -0p) 2>$null | Where-Object { $_ -match '3\.14' } | Select-Object -First 1
    if ($hit -and $hit -match '([A-Za-z]:\\.*python\.exe)\s*$') { $pyCmd = $Matches[1].Trim() }
  }
  if (-not $pyCmd) {
    $pv = (& python --version) 2>$null
    if ($pv -match '3\.14') { $pyCmd = "python" }
  }
}
if (-not $pyCmd) { Die "未找到 Python 3.14(用 -Python <python.exe 路径> 显式指定)" }
Write-Host "  OK: python = $pyCmd"
# pnpm(zcode 需要, 缺则经 npm 装──走目标机已配镜像)
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "  pnpm 缺失, 经 npm 安装..."
  if ((Run "npm" @("install","-g","pnpm") (Get-Location).Path) -ne 0) { Die "pnpm 安装失败" }
}
# 镜像连通性(只探测, 不改配置)
if ((Run "npm" @("ping") (Get-Location).Path) -ne 0) { Die "npm ping 失败──检查目标机 registry 环境变量" }
if ((Run $pyCmd @("-m","pip","index","versions","pip") (Get-Location).Path) -ne 0) { Die "pip 源探测失败──检查 PIP_INDEX_URL 等环境变量" }
Step "S0 doctor" "OK"

# ---------- S1 布源(快照一致则整步 SKIP, 幂等) ----------
Write-Host "`n== S1 布源(hermes-agent-src -> ~\.hermes\hermes-agent) ==" -ForegroundColor Cyan
if (-not (Test-Path $srcAgent)) { Die "包内缺 hermes-agent-src/(包不完整)" }
$snapSrc = Join-Path $srcAgent "HERMES-AGENT-SNAPSHOT.md"
$snapDst = Join-Path $agentDir "HERMES-AGENT-SNAPSHOT.md"
if ((Test-Path $snapDst) -and ((Get-FileHash $snapSrc).Hash -eq (Get-FileHash $snapDst).Hash)) {
  Step "S1 布源" "SKIP(快照一致)"
} else {
  if (Test-Path $agentDir) {
    $bak = "$agentDir.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Write-Host "  已存在, 备份为 $bak(装成后确认无误可删)"
    Rename-Item $agentDir $bak
  }
  New-Item -ItemType Directory -Path $hermesHome -Force | Out-Null
  robocopy $srcAgent $agentDir /E /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { Die "robocopy 失败(exit $LASTEXITCODE)" }
  Step "S1 布源" "OK"
}

# ---------- S2 agent(venv + uv + editable [all]) ----------
Write-Host "`n== S2 agent 安装(venv.py314 + uv 通道) ==" -ForegroundColor Cyan
$venvDir = Join-Path $agentDir "venv.py314"
$venvPy  = Join-Path $venvDir "Scripts\python.exe"
$hermesExe = Join-Path $venvDir "Scripts\hermes.exe"
if (-not (Test-Path $venvPy)) {
  if ((Run $pyCmd @("-m","venv","venv.py314") $agentDir) -ne 0) { Die "venv 创建失败" }
}
$uvExe = Join-Path $venvDir "Scripts\uv.exe"
if (-not (Test-Path $uvExe)) {
  # uv 钉版=上游 pm/lock.json(__UV_VERSION__ 由打包器注入; 裸 pip 撞 pyproject uv override 不可解)
  if ((Run $venvPy @("-m","pip","install","uv==__UV_VERSION__") $agentDir) -ne 0) { Die "pip install uv 失败(依赖 pip 镜像)" }
}
if ((Run $uvExe @("pip","install","--python",$venvPy,"-e",".[all]") $agentDir) -ne 0) {
  Die "uv pip install -e .[all] 失败(镜像缺 win32 wheel 时砍 extras 重试──见 README 排障)"
}
if (-not (Test-Path $hermesExe)) { Die "hermes.exe 未生成(安装异常)" }
Step "S2 agent" "OK"
# hermes setup(幂等)
if (-not (Test-Path (Join-Path $hermesHome "config.yaml"))) {
  if ((Run $hermesExe @("setup","--skip-model") $hermesHome) -ne 0) { Die "hermes setup 失败" }
  Step "S2 hermes setup" "OK"
} else { Step "S2 hermes setup" "SKIP(已初始化)" }

# ---------- S2b Teams(默认全装; -SkipTeams 跳过) ----------
if ($SkipTeams) { Step "S2b Teams" "SKIP(-SkipTeams)" }
else {
  Write-Host "`n== S2b SwarmTeam(profiles/skills/_shared/plugins/patches/workspace) ==" -ForegroundColor Cyan
  $teamDir = Join-Path $aiRoot "team"
  if (-not (Test-Path $teamDir)) { Step "S2b Teams" "SKIP(aistudio 快照缺 team/)" }
  else {
    $installed = 0; $failed = 0
    Get-ChildItem (Join-Path $teamDir "profiles") -Directory | Where-Object { $_.Name -notlike "_*" } | ForEach-Object {
      if (-not (Test-Path (Join-Path $_.FullName "distribution.yaml"))) { return }
      if ((Run $hermesExe @("profile","install",$_.FullName,"--alias","-y") $teamDir) -eq 0) { $installed++ } else { $failed++; Write-Host "    profile 失败: $($_.Name)" -ForegroundColor DarkRed }
    }
    Write-Host "  profiles: $installed 装 / $failed 败"
    # skills
    $skSrc = Join-Path $teamDir "skills"; $skDst = Join-Path $hermesHome "skills"
    if (Test-Path $skSrc) { New-Item -ItemType Directory -Path $skDst -Force | Out-Null; Copy-Item "$skSrc\*" $skDst -Recurse -Force }
    # _shared 六层结构 + 顶层文件 + hack-kb(清 intel 运行态)——对齐 team/install-windows.ps1 口径
    $shSrc = Join-Path $teamDir "profiles\_shared"; $shDst = Join-Path $hermesHome "profiles\_shared"
    if (Test-Path $shSrc) {
      New-Item -ItemType Directory -Path $shDst -Force | Out-Null
      foreach ($d in @("01-scheduling-bus","02-org-orchestration","03-evolution-memory","04-pro-capability","05-eng-execution","06-observability","decisions","knowledge","skill-proposals","skills","templates","workflows")) {
        $s = Join-Path $shSrc $d; if (Test-Path $s) { Copy-Item $s $shDst -Recurse -Force } }
      foreach ($f in @("action-contracts.yaml","config.yaml","constraint-policy.md","hack-knowledge-index.md","hack-tool-registry.md")) {
        $s = Join-Path $shSrc $f; if (Test-Path $s) { Copy-Item $s $shDst -Force } }
      $hackKb = Join-Path $shSrc "hack-kb"
      if (Test-Path $hackKb) {
        Copy-Item $hackKb $shDst -Recurse -Force
        $intel = Join-Path $shDst "hack-kb\intel"
        if (Test-Path $intel) { Get-ChildItem $intel -Include *.json,*.log -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue }
      }
    }
    # plugins + patches
    $plSrc = Join-Path $teamDir "profiles\orchestrator\plugins"
    if (Test-Path $plSrc) { New-Item -ItemType Directory -Path (Join-Path $hermesHome "profiles\orchestrator\plugins") -Force | Out-Null; Copy-Item "$plSrc\*" (Join-Path $hermesHome "profiles\orchestrator\plugins") -Recurse -Force }
    $paSrc = Join-Path $teamDir "patches"
    $paDst = Join-Path $hermesHome "patches"
    if (Test-Path $paSrc) { New-Item -ItemType Directory -Path $paDst -Force | Out-Null; Copy-Item "$paSrc\*" $paDst -Recurse -Force }
    # 第三方工具: 仅钉版区(requirements-tools.txt 中带 == 的行); 参考区按需自装(README)
    $reqTools = Join-Path $teamDir "requirements-tools.txt"
    if (Test-Path $reqTools) {
      $pinned = Get-Content $reqTools | Where-Object { $_ -match '^[A-Za-z0-9_.\-]+==[0-9]' }
      if ($pinned) { if ((Run $venvPy @("-m","pip","install",$pinned) $teamDir) -ne 0) { Write-Host "  WARN: 工具钉版区安装失败(非阻断)" -ForegroundColor DarkYellow } }
    }
    # workspace git 仓 + 基础补丁(对齐 team 先例第 7 步; 补丁 best-effort──装的是已含本机改动的树, 重复应用不视为失败)
    $wsDir = Join-Path $env:USERPROFILE "hermes-docker-sandbox\workspace"
    if (-not (Test-Path $wsDir)) { New-Item -ItemType Directory -Path $wsDir -Force | Out-Null }
    if (-not (Test-Path (Join-Path $wsDir ".git"))) {
      if (Get-Command git -ErrorAction SilentlyContinue) {
        "*.pyc`n__pycache__/`n.DS_Store" | Out-File -FilePath (Join-Path $wsDir ".gitignore") -Encoding ascii
        $null = Run "git" @("init") $wsDir
        $null = Run "git" @("add","-A") $wsDir
        $null = Run "git" @("-c","user.name=offline-installer","-c","user.email=offline@local","commit","-m","init: base repo for kanban worktree workspaces") $wsDir
        Write-Host "  workspace git 仓初始化"
      } else { Write-Host "  SKIP: git 未装, workspace 仓未建" -ForegroundColor DarkYellow }
    }
    foreach ($s in @("apply-kanban-worktree-default.ps1","apply-acp-client-codex-fix.ps1")) {
      $f = Join-Path $paDst $s
      if (Test-Path $f) { $null = Run "powershell" @("-ExecutionPolicy","Bypass","-File",$f) $hermesHome }
    }
    Step "S2b Teams" $(if ($failed -eq 0) {"OK"} else {"OK(部分 profile 失败, 见上)"})
  }
}

# ---------- S3 模板落位 ----------
Write-Host "`n== S3 模板落位(只在不覆盖已有文件的前提下) ==" -ForegroundColor Cyan
$envTpl = Join-Path $pkgRoot "env"
$envDst = Join-Path $hermesHome ".env"
if (-not (Test-Path $envDst)) { Copy-Item (Join-Path $envTpl "dot-env.example") $envDst; Write-Host "  已落 ~/.hermes/.env(记得填 API key)"; Step "S3 .env" "OK" }
else { Write-Host "  .env 已存在, 参照 env/dot-env.example 人工合并"; Step "S3 .env" "SKIP(已存在)" }
$cfgDst = Join-Path $hermesHome "config.yaml"
$cfgEx  = Join-Path $envTpl "config.example.yaml"
if (-not (Test-Path $cfgDst)) { Copy-Item $cfgEx $cfgDst; Step "S3 config.yaml" "OK" }
else { Copy-Item $cfgEx (Join-Path $hermesHome "config.example.yaml") -Force; Write-Host "  config.yaml 已存在(setup 生成), 团队口径模板另存 config.example.yaml 供比对"; Step "S3 config.yaml" "SKIP(已存在)" }
$zcDstDir = Join-Path $env:USERPROFILE ".zcode"
$zcSrc = Join-Path $pkgRoot "zcode"
if (Test-Path $zcSrc) {
  # zcode 配置面整树落位(D14: 脱敏规则正本+skills/scripts/workflows/vendor 解引用快照);
  # 合并式覆盖(全新装机幂等, 不删目标机已有内容)
  New-Item -ItemType Directory -Path $zcDstDir -Force | Out-Null
  Copy-Item "$zcSrc\*" $zcDstDir -Recurse -Force
  Step "S3 zcode 环境(规则+技能+脚本)" "OK"
} else { Step "S3 zcode 环境" "SKIP(包内无 zcode/)" }

# ---------- S4 studio(inject + npm install + 冒烟) ----------
Write-Host "`n== S4 studio(inject -> npm install -> serve 冒烟) ==" -ForegroundColor Cyan
if ((Run "npm" @("run","inject") $aiRoot) -ne 0) { Die "npm run inject 失败(git apply 需 git; 看 S0 警告)" }
$studioDir = Join-Path $aiRoot "vendor\hermes-studio"
if ((Run "npm" @("install","--ignore-scripts") $studioDir) -ne 0) { Die "studio npm install 失败(镜像逐包核对见 README 排障)" }
if (-not (Test-Path (Join-Path $studioDir "dist"))) { New-Item -ItemType Directory (Join-Path $studioDir "dist") | Out-Null }
Step "S4 studio 依赖" "OK"
if ($SkipSmoke) { Step "S4 冒烟" "SKIP(-SkipSmoke)" }
else {
  # 预检: 8647 已被占用则无法把探活归因给新实例
  $pre = New-Object Net.Sockets.TcpClient
  $portBusy = $false
  try { if ($pre.ConnectAsync("127.0.0.1", 8647).Wait(500) -and $pre.Connected) { $portBusy = $true } } catch {} finally { $pre.Close() }
  if ($portBusy) { Step "S4 冒烟" "SKIP(8647 已被占用, 先停旧实例再验)" }
  else {
    $smoke = Start-Process -FilePath $env:ComSpec -ArgumentList '/d','/s','/c','npm run serve' -WorkingDirectory $aiRoot -WindowStyle Hidden -PassThru
    $ok = $false
    foreach ($i in 1..60) { Start-Sleep -Seconds 2
      $c = New-Object Net.Sockets.TcpClient
      try { if ($c.ConnectAsync("127.0.0.1", 8647).Wait(1500) -and $c.Connected) { $ok = $true; break } } catch {} finally { $c.Close() } }
    $null = Run "taskkill" @("/PID",$smoke.Id,"/T","/F") $aiRoot
    if ($ok) { Step "S4 冒烟(:8647 探活)" "OK" } else { Step "S4 冒烟" "FAIL"; Die "8647 两分钟内未探活——手动跑 npm run serve 看日志" }
  }
}

# ---------- S5 zcode(仓内幂等通道, 不裸跑 pnpm) ----------
if ($SkipZcode) { Step "S5 zcode" "SKIP(-SkipZcode)" }
else {
  Write-Host "`n== S5 zcode(zcode:ensure + install-cli) ==" -ForegroundColor Cyan
  if ((Run "npm" @("run","zcode:ensure") $aiRoot) -ne 0) { Die "zcode:ensure 失败" }
  if ((Run "node" @("scripts\zcode-engine.mjs","install-cli") $aiRoot) -ne 0) { Die "zcode install-cli 失败" }
  Step "S5 zcode" "OK"
}

# ---------- S6 汇总 ----------
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  安装汇总" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
$Results | ForEach-Object { Write-Host ("  {0,-24} {1}" -f $_.step, $_.status) }
$hasFail = $Results | Where-Object { $_.status -eq "FAIL" }
Write-Host "`n  下一步:" -ForegroundColor Yellow
Write-Host "    1. notepad %USERPROFILE%\.hermes\.env   # 填 API key(参照 env/env-vars.md)"
Write-Host "    2. setx HERMES_BIN %USERPROFILE%\.hermes\hermes-agent\venv.py314\Scripts\hermes.exe   # studio 子进程调 agent CLI 用(设完重开终端)"
Write-Host "    3. 生产服务: cd $aiRoot && npm run serve   # http://localhost:8647"
Write-Host "    4. 开发前端(可选): npm run dev             # http://localhost:8649"
Write-Host "    5. zcode 引擎桥: ZCODE_BIN=%USERPROFILE%\.hermes\ycode\zcode.cjs"
if ($hasFail) { Write-Host "  存在 FAIL 步骤, 按上方提示修复后重跑。" -ForegroundColor Red; exit 1 }
exit 0
