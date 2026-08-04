# ============================================================
# Post-Update Hook (PowerShell)
# ============================================================
# Re-applies all patches after `hermes update` or `pip install`.
# Check each patch's signature; only re-apply if missing.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File patches\post-update-hook.ps1
#
# Or add to PowerShell profile for auto-run after hermes update:
#   Add-Content $PROFILE 'Set-Alias hermes "powershell -File ~/.hermes/patches/post-update-hook.ps1; hermes"'
# ============================================================

$ErrorActionPreference = "SilentlyContinue"
$RepoDir = Join-Path $env:USERPROFILE ".hermes\hermes-agent"
$PatchesDir = Join-Path $env:USERPROFILE ".hermes\patches"

Write-Host "=== Post-Update Patch Check ===" -ForegroundColor Cyan

# 1. Kanban worktree-default
$kt = Join-Path $RepoDir "tools\kanban_tools.py"
if ((Test-Path $kt) -and -not ((Get-Content $kt -Raw) -match 'workspace_kind = "worktree"')) {
    Write-Host "  Kanban worktree-default missing, re-applying..." -ForegroundColor Yellow
    & (Join-Path $PatchesDir "apply-kanban-worktree-default.ps1")
}

# 2. ACP Codex fix
$acpRef = Join-Path $env:USERPROFILE ".hermes\profiles\worker-coder\plugins\acp-client\__init__.py"
if ((Test-Path $acpRef) -and -not ((Get-Content $acpRef -Raw) -match 'sandbox_mode="danger-full-access"')) {
    Write-Host "  ACP Codex fix missing, re-applying..." -ForegroundColor Yellow
    & (Join-Path $PatchesDir "apply-acp-client-codex-fix.ps1")
}

# 3. TUI patches (optional — only if ui-tui source exists)
$tuiSrc = Join-Path $RepoDir "ui-tui\src\components\appChrome.tsx"
if (Test-Path $tuiSrc) {
    $hasCcExtra = (Get-Content $tuiSrc -Raw) -match "ccExtraTruncated"
    if (-not $hasCcExtra) {
        $tuiPatch = Join-Path $PatchesDir "apply-tui-patches.ps1"
        if (Test-Path $tuiPatch) {
            Write-Host "  TUI patches missing, re-applying..." -ForegroundColor Yellow
            & $tuiPatch
        }
    }
}

Write-Host "  Done." -ForegroundColor Green
