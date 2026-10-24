# ============================================================
# Kanban Worktree-Default Patch (PowerShell)
# ============================================================
# Patches workspace_kind default from "scratch" to "worktree" in
# Hermes Agent source files. Idempotent — safe to re-run.
# ============================================================

$ErrorActionPreference = "Stop"
$RepoDir = Join-Path $env:USERPROFILE ".hermes\hermes-agent"
$patched = 0

function Patch-File {
    param([string]$Path, [string]$OldText, [string]$NewText)
    if (-not (Test-Path $Path)) { return $false }
    $content = Get-Content $Path -Raw -Encoding UTF8
    if ($content -notmatch [regex]::Escape($OldText)) { return $false }
    $content = $content.Replace($OldText, $NewText)
    Set-Content $Path -Value $content -Encoding UTF8 -NoNewline
    return $true
}

Write-Host "=== Kanban Worktree-Default Patch ===" -ForegroundColor Cyan

if (-not (Test-Path $RepoDir)) {
    Write-Host "  hermes-agent not found at $RepoDir — skipping" -ForegroundColor Yellow
    exit 0
}

# 1. tools/kanban_tools.py — API default
$kt = Join-Path $RepoDir "tools\kanban_tools.py"
$old1 = 'if workspace_kind is None:' + "`r`n" + '        workspace_kind = "scratch"'
$new1 = 'if workspace_kind is None:' + "`r`n" + '        workspace_kind = "worktree"'
# Also try Unix line endings
$old1b = 'if workspace_kind is None:' + "`n" + '        workspace_kind = "scratch"'
$new1b = 'if workspace_kind is None:' + "`n" + '        workspace_kind = "worktree"'

if (Patch-File $kt $old1 $new1) { $patched++; Write-Host "  kanban_tools.py: API default -> worktree" -ForegroundColor Green }
elseif (Patch-File $kt $old1b $new1b) { $patched++; Write-Host "  kanban_tools.py: API default -> worktree (Unix EOL)" -ForegroundColor Green }
elseif (Test-Path $kt) {
    $c = Get-Content $kt -Raw
    if ($c -match 'workspace_kind\s*=\s*"scratch"') {
        $c = $c -replace 'workspace_kind = "scratch"', 'workspace_kind = "worktree"'
        Set-Content $kt -Value $c -Encoding UTF8 -NoNewline
        $patched++; Write-Host "  kanban_tools.py: API default -> worktree (regex fallback)" -ForegroundColor Green
    }
}

# 2. hermes_cli/kanban_db.py — 3 patterns
$kdb = Join-Path $RepoDir "hermes_cli\kanban_db.py"
$dbChanged = $false
if (Patch-File $kdb 'workspace_kind: str = "scratch"' 'workspace_kind: str = "worktree"') { $dbChanged = $true }
if (Patch-File $kdb 'root_row["workspace_kind"] or "scratch"' 'root_row["workspace_kind"] or "worktree"') { $dbChanged = $true }
if (Patch-File $kdb 'kind = task.workspace_kind or "scratch"' 'kind = task.workspace_kind or "worktree"') { $dbChanged = $true }
if ($dbChanged) { $patched++; Write-Host "  kanban_db.py: create_task + resolve + child-inherit -> worktree" -ForegroundColor Green }

# 3. hermes_cli/kanban_swarm.py
$ks = Join-Path $RepoDir "hermes_cli\kanban_swarm.py"
if (Patch-File $ks 'workspace_kind: str = "scratch"' 'workspace_kind: str = "worktree"') {
    $patched++; Write-Host "  kanban_swarm.py: create_swarm default -> worktree" -ForegroundColor Green
}

# 4. Desktop runtime bundled copies (Windows: win-x64)
$desktopRt = Join-Path $env:USERPROFILE ".hermes-web-ui\desktop-runtime\hermes"
if (Test-Path $desktopRt) {
    Get-ChildItem $desktopRt -Directory | ForEach-Object {
        $sitePkg = Join-Path $_.FullName "win-x64\python\Lib\site-packages"
        if (-not (Test-Path $sitePkg)) { return }

        $vp = $false
        # kanban_tools.py
        $bkt = Join-Path $sitePkg "tools\kanban_tools.py"
        if ((Test-Path $bkt) -and ((Get-Content $bkt -Raw) -match 'workspace_kind = "scratch"')) {
            $c = Get-Content $bkt -Raw
            $c = $c -replace 'workspace_kind = "scratch"', 'workspace_kind = "worktree"'
            Set-Content $bkt -Value $c -Encoding UTF8 -NoNewline
            $vp = $true
        }
        # kanban_db.py
        $bkdb = Join-Path $sitePkg "hermes_cli\kanban_db.py"
        if (Test-Path $bkdb) {
            $c = Get-Content $bkdb -Raw
            $orig = $c
            $c = $c.Replace('workspace_kind: str = "scratch"', 'workspace_kind: str = "worktree"')
            $c = $c.Replace('root_row["workspace_kind"] or "scratch"', 'root_row["workspace_kind"] or "worktree"')
            $c = $c.Replace('kind = task.workspace_kind or "scratch"', 'kind = task.workspace_kind or "worktree"')
            if ($c -ne $orig) { Set-Content $bkdb -Value $c -Encoding UTF8 -NoNewline; $vp = $true }
        }
        # kanban_swarm.py
        $bks = Join-Path $sitePkg "hermes_cli\kanban_swarm.py"
        if ((Test-Path $bks) -and ((Get-Content $bks -Raw) -match 'workspace_kind: str = "scratch"')) {
            $c = Get-Content $bks -Raw
            $c = $c -replace 'workspace_kind: str = "scratch"', 'workspace_kind: str = "worktree"'
            Set-Content $bks -Value $c -Encoding UTF8 -NoNewline
            $vp = $true
        }
        if ($vp) { $patched++; Write-Host "  desktop-runtime $($_.Name): -> worktree" -ForegroundColor Green }
    }
}

if ($patched -eq 0) {
    Write-Host "  All files already patched (or not found)" -ForegroundColor DarkGray
} else {
    Write-Host "  Patched $patched file(s)" -ForegroundColor Green
}
