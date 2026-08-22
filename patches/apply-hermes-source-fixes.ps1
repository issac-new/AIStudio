# ============================================================
# Hermes Source Fixes (PowerShell)
# ============================================================
# Applies 3 local source fixes that are NOT in upstream hermes-agent.
# These are local customizations made to ~/.hermes/hermes-agent source
# that would be lost on `hermes update` — this script re-applies them.
#
# Patches:
#   1. hermes-bigmodel-401-fix.patch   — BigModel (open.bigmodel.cn) 401 fix:
#      strip Authorization header on Anthropic SDK requests (x-api-key only)
#      + auxiliary_client URL handling for anthropic_messages mode.
#   2. hermes-weixin-cloud-stt.patch   — Weixin voice: prefer cloud STT text,
#      skip .silk download when cloud text present (local STT fallback only).
#   3. hermes-npm-loglevel.patch       — main.py: --silent → --loglevel=error
#      so npm engine-mismatch errors surface for auto-repair.
#
# Requires: git (for git apply)
# ============================================================

$ErrorActionPreference = "Stop"
$RepoDir = Join-Path $env:USERPROFILE ".hermes\hermes-agent"
$PatchesDir = Join-Path $env:USERPROFILE ".hermes\patches"

Write-Host "=== Hermes Source Fixes ===" -ForegroundColor Cyan

if (-not (Test-Path (Join-Path $RepoDir ".git"))) {
    Write-Host "  ERROR: $RepoDir is not a git repo" -ForegroundColor Red
    exit 1
}

Set-Location $RepoDir

# Helper: apply a patch if its signature is missing
function Apply-PatchIfMissing {
    param(
        [string]$PatchFile,
        [string]$TargetFile,
        [string]$Signature,
        [string]$Label
    )
    $target = Join-Path $RepoDir $TargetFile
    if (-not (Test-Path $target)) {
        Write-Host "  SKIP $Label — target missing: $TargetFile" -ForegroundColor DarkGray
        return
    }
    $hasSig = (Get-Content $target -Raw) -match $Signature
    if ($hasSig) {
        Write-Host "  OK $Label — already applied" -ForegroundColor DarkGray
        return
    }
    $patch = Join-Path $PatchesDir $PatchFile
    if (-not (Test-Path $patch)) {
        Write-Host "  ERROR $Label — patch file missing: $PatchFile" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Applying $Label..." -ForegroundColor Yellow
    $null = git apply $patch 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Applied $Label" -ForegroundColor Green
    } else {
        Write-Host "  $Label failed, trying 3-way merge..." -ForegroundColor Yellow
        $null = git apply --3way $patch 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR $Label — patch failed. Manual recovery needed: $PatchFile" -ForegroundColor Red
            exit 1
        }
        Write-Host "  Applied $Label (3-way)" -ForegroundColor Green
    }
}

# 1. BigModel 401 fix
Apply-PatchIfMissing `
    -PatchFile "hermes-bigmodel-401-fix.patch" `
    -TargetFile "agent\anthropic_adapter.py" `
    -Signature "_is_bigmodel" `
    -Label "BigModel 401 fix"

# 2. Weixin cloud STT preference
Apply-PatchIfMissing `
    -PatchFile "hermes-weixin-cloud-stt.patch" `
    -TargetFile "gateway\platforms\weixin.py" `
    -Signature "Voice transcription provided by Weixin" `
    -Label "Weixin cloud STT"

# 3. npm loglevel (main.py)
Apply-PatchIfMissing `
    -PatchFile "hermes-npm-loglevel.patch" `
    -TargetFile "hermes_cli\main.py" `
    -Signature "loglevel=error" `
    -Label "npm loglevel"

Write-Host "  Done." -ForegroundColor Green
