# ============================================================
# SwarmTeam Offline Installer for Windows (PowerShell)
# ============================================================
# Pure PowerShell + .bat — no bash/WSL needed.
# Prerequisites: Python 3.11+, pip, (optional: Node.js + npm for TUI)
# Network: pip + npm access ONLY
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install-windows.ps1
#   OR double-click: install-windows.bat
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SwarmTeam Offline Installer for Windows" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HermesHome = Join-Path $env:USERPROFILE ".hermes"

# --- 1. Check prerequisites ---
Write-Host "[1/7] Checking prerequisites..." -ForegroundColor Yellow

# Python
try { $null = & python --version 2>&1 } catch {
    Write-Host "  ERROR: Python not found. Install Python 3.11+ first." -ForegroundColor Red
    exit 1
}
Write-Host "  OK: Python = $(& python --version 2>&1)" -ForegroundColor Green

# pip
try { $null = & pip --version 2>&1 } catch {
    Write-Host "  ERROR: pip not found." -ForegroundColor Red
    exit 1
}
Write-Host "  OK: pip available" -ForegroundColor Green

# git (needed for workspace repo + patches)
try { $null = & git --version 2>&1 } catch {
    Write-Host "  WARN: git not found (workspace repo + TUI patches will be skipped)" -ForegroundColor DarkYellow
}
if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Host "  OK: git = $(& git --version 2>&1)" -ForegroundColor Green
}

Write-Host ""

# --- 2. Install Hermes Agent via pip ---
Write-Host "[2/7] Installing Hermes Agent framework via pip..." -ForegroundColor Yellow

& pip install "hermes-agent[all]>=0.20.0" 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: pip install failed" -ForegroundColor Red
    exit 1
}

$hermesExe = Get-Command hermes -ErrorAction SilentlyContinue
if (-not $hermesExe) {
    # Try user site
    $userBase = & python -m site --user-base 2>&1
    $userScripts = Join-Path $userBase "Scripts"
    $env:PATH += ";$userScripts"
    $hermesExe = Get-Command hermes -ErrorAction SilentlyContinue
}
if ($hermesExe) {
    Write-Host "  OK: hermes = $($hermesExe.Source)" -ForegroundColor Green
} else {
    Write-Host "  ERROR: hermes command not found after install" -ForegroundColor Red
    Write-Host "  Try: pip install --user hermes-agent[all]" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# --- 3. Initialize Hermes ---
Write-Host "[3/7] Initializing Hermes Agent..." -ForegroundColor Yellow

if (-not (Test-Path $HermesHome)) {
    & hermes setup --skip-model 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
}
Write-Host "  OK: Hermes home = $HermesHome" -ForegroundColor Green
Write-Host ""

# --- 4. Install SwarmTeam profiles ---
Write-Host "[4/7] Installing SwarmTeam profiles..." -ForegroundColor Yellow

$profilesDir = Join-Path $ScriptDir "profiles"
$installed = 0
$failed = 0

Get-ChildItem -Path $profilesDir -Directory | Where-Object { $_.Name -notlike "_*" } | ForEach-Object {
    $distYaml = Join-Path $_.FullName "distribution.yaml"
    if (-not (Test-Path $distYaml)) {
        Write-Host "  SKIP: $($_.Name) (no distribution.yaml)" -ForegroundColor DarkYellow
        return
    }
    Write-Host -NoNewline "  Installing: $($_.Name) ... "
    $result = & hermes profile install $_.FullName --alias -y 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK" -ForegroundColor Green
        $installed++
    } else {
        Write-Host "FAILED" -ForegroundColor Red
        Write-Host "    $result" -ForegroundColor DarkGray
        $failed++
    }
}

Write-Host ""
Write-Host "  Profiles: $installed installed, $failed failed" -ForegroundColor $(if ($failed -eq 0) {'Green'} else {'Yellow'})
Write-Host ""

# --- 5. Install skills ---
Write-Host "[5/7] Installing custom skills..." -ForegroundColor Yellow

$skillsSrc = Join-Path $ScriptDir "skills"
$skillsDst = Join-Path $HermesHome "skills"
if (Test-Path $skillsSrc) {
    if (-not (Test-Path $skillsDst)) { New-Item -ItemType Directory -Path $skillsDst -Force | Out-Null }
    Copy-Item -Path "$skillsSrc\*" -Destination $skillsDst -Recurse -Force
    $skillCount = (Get-ChildItem -Path $skillsDst -Recurse -Filter "SKILL.md").Count
    Write-Host "  OK: $skillCount skills installed" -ForegroundColor Green
}
Write-Host ""


# --- 5b. Install third-party Python tools ---
Write-Host "[5b] Installing third-party Python tools..." -ForegroundColor Yellow
$toolsReq = Join-Path $ScriptDir "requirements-tools.txt"
if (Test-Path $toolsReq) {
    & pip install -r $toolsReq 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Host "  OK: Python tools installed" -ForegroundColor Green
} else {
    Write-Host "  SKIP: requirements-tools.txt not found" -ForegroundColor DarkYellow
}

# --- 5c. Install third-party npm tools ---
Write-Host "[5c] Installing third-party npm tools..." -ForegroundColor Yellow
$npmAll = Join-Path $ScriptDir "package-all.json"
if ((Test-Path $npmAll) -and (Get-Command npm -ErrorAction SilentlyContinue)) {
    $npmDir = Join-Path $env:USERPROFILE ".hermes
pm-global"
    if (-not (Test-Path $npmDir)) { New-Item -ItemType Directory -Path $npmDir -Force | Out-Null }
    Copy-Item $npmAll (Join-Path $npmDir "package.json") -Force
    Set-Location $npmDir
    & npm install 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Host "  OK: npm tools installed" -ForegroundColor Green
} elseif (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "  SKIP: npm not found (Node.js tools will be unavailable)" -ForegroundColor DarkYellow
} else {
    Write-Host "  SKIP: package-all.json not found" -ForegroundColor DarkYellow
}
Write-Host ""
# --- 6. Install shared protocols + plugins + patches ---
Write-Host "[6/7] Installing protocols, plugins, patches..." -ForegroundColor Yellow

# _shared
$sharedSrc = Join-Path $ScriptDir "profiles\_shared"
$sharedDst = Join-Path $HermesHome "profiles\_shared"
if (Test-Path $sharedSrc) {
    if (-not (Test-Path $sharedDst)) { New-Item -ItemType Directory -Path $sharedDst -Force | Out-Null }
    Copy-Item -Path "$sharedSrc\*" -Destination $sharedDst -Recurse -Force
    Write-Host "  OK: _shared/ protocols" -ForegroundColor Green
}

# Plugins
$pluginsSrc = Join-Path $ScriptDir "profiles\orchestrator\plugins"
$pluginsDst = Join-Path $HermesHome "profiles\orchestrator\plugins"
if (Test-Path $pluginsSrc) {
    if (-not (Test-Path $pluginsDst)) { New-Item -ItemType Directory -Path $pluginsDst -Force | Out-Null }
    Copy-Item -Path "$pluginsSrc\*" -Destination $pluginsDst -Recurse -Force
    Write-Host "  OK: plugins" -ForegroundColor Green
}

# Patches (both .sh for reference + .ps1 for Windows)
$patchesSrc = Join-Path $ScriptDir "patches"
$patchesDst = Join-Path $HermesHome "patches"
if (Test-Path $patchesSrc) {
    if (-not (Test-Path $patchesDst)) { New-Item -ItemType Directory -Path $patchesDst -Force | Out-Null }
    Copy-Item -Path "$patchesSrc\*" -Destination $patchesDst -Recurse -Force
    Write-Host "  OK: patches" -ForegroundColor Green
}
Write-Host ""

# --- 7. Workspace git repo + apply patches ---
Write-Host "[7/7] Finalizing..." -ForegroundColor Yellow

# Workspace repo
$wsDir = Join-Path $env:USERPROFILE "hermes-docker-sandbox\workspace"
if (-not (Test-Path $wsDir)) { New-Item -ItemType Directory -Path $wsDir -Force | Out-Null }
Set-Location $wsDir
if (-not (Test-Path (Join-Path $wsDir ".git"))) {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        & git init 2>&1 | Out-Null
        "*.pyc`n__pycache__/`n.DS_Store" | Out-File -FilePath ".gitignore" -Encoding utf8
        & git add -A 2>&1 | Out-Null
        & git commit -m "init: base repo for kanban worktree workspaces" 2>&1 | Out-Null
        Write-Host "  OK: workspace git repo initialized" -ForegroundColor Green
    } else {
        Write-Host "  SKIP: git not found, workspace repo not created" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "  OK: workspace repo exists" -ForegroundColor Green
}

# Apply patches
Write-Host ""
Write-Host "  Applying infrastructure patches..." -ForegroundColor Yellow

$wtPatch = Join-Path $patchesDst "apply-kanban-worktree-default.ps1"
if (Test-Path $wtPatch) {
    & powershell -ExecutionPolicy Bypass -File $wtPatch
}

$acpPatch = Join-Path $patchesDst "apply-acp-client-codex-fix.ps1"
if (Test-Path $acpPatch) {
    & powershell -ExecutionPolicy Bypass -File $acpPatch
}

Write-Host ""

# --- Summary ---
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Profiles: $installed"
Write-Host "  Skills:   $(if (Test-Path $skillsDst) { (Get-ChildItem $skillsDst -Recurse -Filter 'SKILL.md').Count } else {0})"
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "    1. Edit API keys:" -ForegroundColor White
Write-Host "       notepad %USERPROFILE%\.hermes\.env" -ForegroundColor Gray
Write-Host ""
Write-Host "    2. Verify:" -ForegroundColor White
Write-Host "       hermes profile list" -ForegroundColor Gray
Write-Host "       hermes -p orchestrator chat -q 'Hello'" -ForegroundColor Gray
Write-Host ""
Write-Host "    3. (Optional) TUI:" -ForegroundColor White
Write-Host "       powershell -File %USERPROFILE%\.hermes\patches\apply-tui-patches.ps1" -ForegroundColor Gray
Write-Host ""
