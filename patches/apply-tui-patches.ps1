# ============================================================
# TUI cc-switch Status Bar Patch (PowerShell)
# ============================================================
# Applies the TUI customization patch and rebuilds dist/entry.js
# Requires: git (for git apply) + npm (for rebuild)
# ============================================================

$ErrorActionPreference = "Stop"
$RepoDir = Join-Path $env:USERPROFILE ".hermes\hermes-agent"
$UiDir = Join-Path $RepoDir "ui-tui"
$PatchFile = Join-Path $env:USERPROFILE ".hermes\patches\tui-ccswitch-statusbar.patch"

Write-Host "=== TUI Patches ===" -ForegroundColor Cyan

if (-not (Test-Path (Join-Path $RepoDir ".git"))) {
    Write-Host "  ERROR: $RepoDir is not a git repo" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $PatchFile)) {
    Write-Host "  ERROR: Patch file not found: $PatchFile" -ForegroundColor Red
    exit 1
}

# Check if already applied
$appChrome = Join-Path $UiDir "src\components\appChrome.tsx"
$appLayout = Join-Path $UiDir "src\components\appLayout.tsx"
$alreadyApplied = $false
if ((Test-Path $appChrome) -and (Test-Path $appLayout)) {
    $hasCcExtra = (Get-Content $appChrome -Raw) -match "ccExtraTruncated"
    $hasIpWeather = (Get-Content $appLayout -Raw) -match "fetchIpWeather"
    if ($hasCcExtra -and $hasIpWeather) { $alreadyApplied = $true }
}

if ($alreadyApplied) {
    Write-Host "  Patch already applied (customizations present)" -ForegroundColor DarkGray
    exit 0
}

# Apply via git
Set-Location $RepoDir
Write-Host "  Applying patch..." -ForegroundColor Yellow
$null = git apply $PatchFile 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Patch applied" -ForegroundColor Green
} else {
    Write-Host "  Patch failed, trying 3-way merge..." -ForegroundColor Yellow
    $null = git apply --3way $PatchFile 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Patch failed — upstream code may have changed" -ForegroundColor Red
        Write-Host "  Manual recovery needed: $PatchFile" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Patch applied with 3-way merge" -ForegroundColor Green
}

# Rebuild if npm is available
Set-Location $UiDir
$npmOk = $false
try { $null = npm --version 2>&1; $npmOk = $true } catch {}
if ($npmOk) {
    Write-Host "  Installing dependencies..." -ForegroundColor Yellow
    $null = npm install 2>&1
    Write-Host "  Building..." -ForegroundColor Yellow
    $null = npm run build 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  dist/entry.js rebuilt" -ForegroundColor Green
    } else {
        Write-Host "  Build failed — TUI may not show customizations" -ForegroundColor Red
    }
} else {
    Write-Host "  npm not found — skipping rebuild (patch applied to source only)" -ForegroundColor Yellow
}
