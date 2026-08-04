# ============================================================
# ACP Client Codex Fix (PowerShell)
# ============================================================
# Copies the fixed acp-client/__init__.py to all profiles that
# have the acp-client plugin. Idempotent.
# ============================================================

$ErrorActionPreference = "Stop"
$FixFile = Join-Path $env:USERPROFILE ".hermes\patches\acp-client-codex-fix__init__.py"
$ProfilesDir = Join-Path $env:USERPROFILE ".hermes\profiles"

Write-Host "=== ACP Client Codex Fix ===" -ForegroundColor Cyan

if (-not (Test-Path $FixFile)) {
    Write-Host "  ERROR: Fix file not found: $FixFile" -ForegroundColor Red
    exit 1
}

# Check if already applied via signature
$refFile = Join-Path $ProfilesDir "worker-coder\plugins\acp-client\__init__.py"
$signature = 'sandbox_mode="danger-full-access"'

if ((Test-Path $refFile) -and ((Get-Content $refFile -Raw) -match [regex]::Escape($signature))) {
    # Verify hash matches
    $refHash = (Get-FileHash $refFile -Algorithm MD5).Hash
    $fixHash = (Get-FileHash $FixFile -Algorithm MD5).Hash
    if ($refHash -eq $fixHash) {
        Write-Host "  Fix already applied (signature + hash match)" -ForegroundColor DarkGray
        exit 0
    }
}

Write-Host "  Copying fixed __init__.py to all profiles..." -ForegroundColor Yellow
$count = 0
Get-ChildItem $ProfilesDir -Directory | Where-Object {
    $_.Name -notlike "*archived*" -and $_.Name -ne "_shared"
} | ForEach-Object {
    $target = Join-Path $_.FullName "plugins\acp-client\__init__.py"
    if (Test-Path $target) {
        Copy-Item $FixFile $target -Force
        $count++
        Write-Host "    $($_.Name)" -ForegroundColor Green
    }
}
Write-Host "  Copied to $count profiles" -ForegroundColor Green
