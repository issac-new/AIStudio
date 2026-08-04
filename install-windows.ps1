# ============================================================
# SwarmTeam Offline Installer for Windows (PowerShell)
# ============================================================
# Prerequisites: Python 3.11+, pip, (optional: Node.js + npm)
# Network: pip + npm access ONLY (no GitHub, no curl installer)
#
# Usage:
#   1. Download SwarmTeam ZIP (or copy from USB)
#   2. Extract to a temp folder
#   3. Run: powershell -ExecutionPolicy Bypass -File install-windows.ps1
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SwarmTeam Offline Installer for Windows" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Check prerequisites ---
Write-Host "[1/7] Checking prerequisites..." -ForegroundColor Yellow

# Python
$pythonOk = $false
try { $null = & python --version 2>&1; $pythonOk = $true } catch {}
if (-not $pythonOk) {
    Write-Host "  ERROR: Python not found. Install Python 3.11+ from python.org" -ForegroundColor Red
    Write-Host "  pip install python (or download from https://www.python.org/downloads/)" -ForegroundColor Red
    exit 1
}
$pyVer = & python --version 2>&1
Write-Host "  OK: Python = $pyVer" -ForegroundColor Green

# pip
try { $null = & pip --version 2>&1 } catch {
    Write-Host "  ERROR: pip not found. Ensure Python installer included pip." -ForegroundColor Red
    exit 1
}
Write-Host "  OK: pip available" -ForegroundColor Green

# Node.js (optional — for TUI)
$nodeOk = $false
try { $null = & node --version 2>&1; $nodeOk = $true } catch {}
if ($nodeOk) {
    Write-Host "  OK: Node.js = $(& node --version)" -ForegroundColor Green
} else {
    Write-Host "  WARN: Node.js not found (TUI will be unavailable, CLI chat still works)" -ForegroundColor DarkYellow
}

Write-Host ""

# --- 2. Install Hermes Agent via pip ---
Write-Host "[2/7] Installing Hermes Agent framework via pip..." -ForegroundColor Yellow

& pip install "hermes-agent[all]>=0.20.0" 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: pip install hermes-agent failed" -ForegroundColor Red
    exit 1
}

# Verify
$hermesPath = & python -c "import shutil; print(shutil.which('hermes'))" 2>&1
if (-not $hermesPath -or $hermesPath -eq "None") {
    Write-Host "  ERROR: hermes command not found after install" -ForegroundColor Red
    Write-Host "  Try: pip install --user hermes-agent[all]" -ForegroundColor Yellow
    exit 1
}
Write-Host "  OK: hermes installed at $hermesPath" -ForegroundColor Green
Write-Host ""

# --- 3. Initialize Hermes ---
Write-Host "[3/7] Initializing Hermes Agent..." -ForegroundColor Yellow

$hermesHome = Join-Path $env:USERPROFILE ".hermes"
if (-not (Test-Path $hermesHome)) {
    & hermes setup --skip-model 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
}
Write-Host "  OK: Hermes home = $hermesHome" -ForegroundColor Green
Write-Host ""

# --- 4. Install SwarmTeam profiles ---
Write-Host "[4/7] Installing SwarmTeam profiles..." -ForegroundColor Yellow

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$profilesDir = Join-Path $scriptDir "profiles"
$installed = 0
$failed = 0

Get-ChildItem -Path $profilesDir -Directory | Where-Object { $_.Name -notlike "_*" } | ForEach-Object {
    $profileName = $_.Name
    $profileDir = $_.FullName
    $distYaml = Join-Path $profileDir "distribution.yaml"

    if (-not (Test-Path $distYaml)) {
        Write-Host "  SKIP: $profileName (no distribution.yaml)" -ForegroundColor DarkYellow
        return
    }

    Write-Host "  Installing: $profileName ..." -NoNewline
    $result = & hermes profile install $profileDir --alias -y 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
        $installed++
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "    $result" -ForegroundColor DarkGray
        $failed++
    }
}

Write-Host ""
Write-Host "  Profiles: $installed installed, $failed failed" -ForegroundColor $(if ($failed -eq 0) {'Green'} else {'Yellow'})
Write-Host ""

# --- 5. Install skills ---
Write-Host "[5/7] Installing custom skills..." -ForegroundColor Yellow

$skillsSrc = Join-Path $scriptDir "skills"
$skillsDst = Join-Path $hermesHome "skills"
if (Test-Path $skillsSrc) {
    if (-not (Test-Path $skillsDst)) {
        New-Item -ItemType Directory -Path $skillsDst -Force | Out-Null
    }
    Copy-Item -Path "$skillsSrc\*" -Destination $skillsDst -Recurse -Force
    $skillCount = (Get-ChildItem -Path $skillsDst -Recurse -Filter "SKILL.md").Count
    Write-Host "  OK: $skillCount skills copied to $skillsDst" -ForegroundColor Green
}
Write-Host ""

# --- 6. Install shared protocols + plugins ---
Write-Host "[6/7] Installing shared protocols + plugins..." -ForegroundColor Yellow

# _shared protocols
$sharedSrc = Join-Path $scriptDir "profiles\_shared"
$sharedDst = Join-Path $hermesHome "profiles\_shared"
if (Test-Path $sharedSrc) {
    if (-not (Test-Path $sharedDst)) {
        New-Item -ItemType Directory -Path $sharedDst -Force | Out-Null
    }
    Copy-Item -Path "$sharedSrc\*" -Destination $sharedDst -Recurse -Force
    Write-Host "  OK: _shared/ protocols copied" -ForegroundColor Green
}

# Plugins (to orchestrator)
$pluginsSrc = Join-Path $scriptDir "profiles\orchestrator\plugins"
$pluginsDst = Join-Path $hermesHome "profiles\orchestrator\plugins"
if (Test-Path $pluginsSrc) {
    if (-not (Test-Path $pluginsDst)) {
        New-Item -ItemType Directory -Path $pluginsDst -Force | Out-Null
    }
    Copy-Item -Path "$pluginsSrc\*" -Destination $pluginsDst -Recurse -Force
    Write-Host "  OK: plugins copied" -ForegroundColor Green
}

# Patches
$patchesSrc = Join-Path $scriptDir "patches"
$patchesDst = Join-Path $hermesHome "patches"
if (Test-Path $patchesSrc) {
    if (-not (Test-Path $patchesDst)) {
        New-Item -ItemType Directory -Path $patchesDst -Force | Out-Null
    }
    Copy-Item -Path "$patchesSrc\*" -Destination $patchesDst -Recurse -Force
    Write-Host "  OK: patches copied" -ForegroundColor Green
}
Write-Host ""

# --- 7. Setup workspace git repo ---
Write-Host "[7/7] Setting up workspace git repo..." -ForegroundColor Yellow

$wsDir = Join-Path $env:USERPROFILE "hermes-docker-sandbox\workspace"
if (-not (Test-Path $wsDir)) {
    New-Item -ItemType Directory -Path $wsDir -Force | Out-Null
}
Set-Location $wsDir
if (-not (Test-Path (Join-Path $wsDir ".git"))) {
    & git init 2>&1 | Out-Null
    "*.pyc`n__pycache__/`n.DS_Store" | Out-File -FilePath ".gitignore" -Encoding utf8
    & git add -A 2>&1 | Out-Null
    & git commit -m "init: base repo for kanban worktree workspaces" 2>&1 | Out-Null
    Write-Host "  OK: workspace git repo initialized" -ForegroundColor Green
} else {
    Write-Host "  OK: workspace git repo already exists" -ForegroundColor Green
}
Write-Host ""

# --- Summary ---
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Profiles installed: $installed"
Write-Host "  Skills: $(if (Test-Path $skillsDst) { (Get-ChildItem $skillsDst -Recurse -Filter 'SKILL.md').Count } else {0})"
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "    1. Edit API keys:" -ForegroundColor White
Write-Host "       notepad %USERPROFILE%\.hermes\.env" -ForegroundColor Gray
Write-Host ""
Write-Host "    2. Apply patches (optional, needs Git Bash):" -ForegroundColor White
Write-Host "       bash %USERPROFILE%\.hermes\patches\apply-kanban-worktree-default.sh" -ForegroundColor Gray
Write-Host "       bash %USERPROFILE%\.hermes\patches\apply-acp-client-codex-fix.sh" -ForegroundColor Gray
Write-Host ""
Write-Host "    3. Start using:" -ForegroundColor White
Write-Host "       hermes -p orchestrator chat" -ForegroundColor Gray
Write-Host "       hermes profile list" -ForegroundColor Gray
Write-Host ""
Write-Host "    4. (Optional) Install TUI:" -ForegroundColor White
Write-Host "       cd %USERPROFILE%\.hermes\hermes-agent\ui-tui" -ForegroundColor Gray
Write-Host "       copy ui-tui-package.json package.json" -ForegroundColor Gray
Write-Host "       npm install" -ForegroundColor Gray
Write-Host ""
