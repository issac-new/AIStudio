#!/usr/bin/env bash
# Re-apply the "worktree as default workspace_kind" patch after hermes update.
#
# Without this, kanban_create() defaults to workspace_kind="scratch", which means
# task outputs are deleted when the task completes. We want all gateway-channel
# tasks (weixin/matrix/mail/api_server) and all kanban tasks to use persistent
# worktree workspaces by default.
#
# This script is idempotent: it only patches lines that still say "scratch"
# where they should say "worktree". Run manually or via post-update-hook.sh.
#
# Created: 2026-08-04

set -euo pipefail

REPO_DIR="$HOME/.hermes/hermes-agent"

if [[ ! -d "$REPO_DIR" ]]; then
  echo "✗ hermes-agent repo not found at $REPO_DIR — skipping kanban worktree-default patch"
  exit 0
fi

patched=0

# ── 1. tools/kanban_tools.py — tool API default ──────────────────
#    Line: if workspace_kind is None: workspace_kind = "scratch"
KT="$REPO_DIR/tools/kanban_tools.py"
if [[ -f "$KT" ]]; then
  # The default-resolution line (only patch the one in the workspace_kind=None branch,
  # not the project-inheritance or scratch-tip lines).
  if grep -q 'workspace_kind = "scratch"' "$KT" 2>/dev/null; then
    # Use perl for precise single-line replacement in the None-default branch
    perl -i -0pe 's/(project_source_task_id = None\n\s*_inherit_project = workspace_kind is None and workspace_path is None\n\s*if workspace_kind is None:\n\s*)workspace_kind = "scratch"/$1workspace_kind = "worktree"/' "$KT"
    patched=$((patched + 1))
    echo "  ✓ kanban_tools.py: workspace_kind None-default → worktree"
  fi
fi

# ── 2. hermes_cli/kanban_db.py — create_task() + resolve_workspace() + child inheritance ──
KDB="$REPO_DIR/hermes_cli/kanban_db.py"
if [[ -f "$KDB" ]]; then
  changed=0
  # create_task signature default
  if grep -q 'workspace_kind: str = "scratch"' "$KDB" 2>/dev/null; then
    perl -i -pe 's/^(\s*)workspace_kind: str = "scratch"/$1workspace_kind: str = "worktree"/' "$KDB"
    changed=1
  fi
  # child-inheritance fallback: root_ws_kind = root_row["workspace_kind"] or "scratch"
  if grep -q 'root_row\["workspace_kind"\] or "scratch"' "$KDB" 2>/dev/null; then
    perl -i -pe 's/root_row\["workspace_kind"\] or "scratch"/root_row["workspace_kind"] or "worktree"/' "$KDB"
    changed=1
  fi
  # resolve_workspace fallback: kind = task.workspace_kind or "scratch"
  # (line 6633 — NOT the scratch-tip emitter at ~5533 which correctly defaults to scratch)
  if grep -q 'kind = task.workspace_kind or "scratch"' "$KDB" 2>/dev/null; then
    perl -i -pe 's/kind = task.workspace_kind or "scratch"/kind = task.workspace_kind or "worktree"/' "$KDB"
    changed=1
  fi
  if [[ $changed -eq 1 ]]; then
    patched=$((patched + 1))
    echo "  ✓ kanban_db.py: create_task + resolve + child-inherit defaults → worktree"
  fi
fi

# ── 3. hermes_cli/kanban_swarm.py — create_swarm() default ───────
KS="$REPO_DIR/hermes_cli/kanban_swarm.py"
if [[ -f "$KS" ]]; then
  if grep -q 'workspace_kind: str = "scratch"' "$KS" 2>/dev/null; then
    perl -i -pe 's/^(\s*)workspace_kind: str = "scratch"/$1workspace_kind: str = "worktree"/' "$KS"
    patched=$((patched + 1))
    echo "  ✓ kanban_swarm.py: create_swarm default → worktree"
  fi
fi

# ── 4. SwarmStudio desktop bundled runtime ──────────────────────
# The desktop app ships its OWN frozen copy of hermes_cli in
# ~/.hermes-web-ui/desktop-runtime/<version>/.../site-packages/.
# Patch every version found there so the SwarmStudio gateway also
# defaults to worktree.
DESKTOP_RUNTIME="$HOME/.hermes-web-ui/desktop-runtime/hermes"
if [[ -d "$DESKTOP_RUNTIME" ]]; then
  for site_pkg in "$DESKTOP_RUNTIME"/*/mac-arm64/python/lib/python3.12/site-packages; do
    [[ -d "$site_pkg" ]] || continue
    ver_patched=0

    # kanban_tools.py
    b_kt="$site_pkg/tools/kanban_tools.py"
    if [[ -f "$b_kt" ]] && grep -q 'workspace_kind = "scratch"' "$b_kt" 2>/dev/null; then
      perl -i -0pe 's/(if workspace_kind is None:
\s*)workspace_kind = "scratch"/$1workspace_kind = "worktree"/' "$b_kt"
      ver_patched=1
    fi

    # kanban_db.py (3 patterns)
    b_kdb="$site_pkg/hermes_cli/kanban_db.py"
    if [[ -f "$b_kdb" ]]; then
      db_changed=0
      grep -q 'workspace_kind: str = "scratch"' "$b_kdb" 2>/dev/null && {
        perl -i -pe 's/^(\s*)workspace_kind: str = "scratch"/$1workspace_kind: str = "worktree"/' "$b_kdb"; db_changed=1; }
      grep -q 'root_row\["workspace_kind"\] or "scratch"' "$b_kdb" 2>/dev/null && {
        perl -i -pe 's/root_row\["workspace_kind"\] or "scratch"/root_row["workspace_kind"] or "worktree"/' "$b_kdb"; db_changed=1; }
      grep -q 'kind = task.workspace_kind or "scratch"' "$b_kdb" 2>/dev/null && {
        perl -i -pe 's/kind = task.workspace_kind or "scratch"/kind = task.workspace_kind or "worktree"/' "$b_kdb"; db_changed=1; }
      [[ $db_changed -eq 1 ]] && ver_patched=1
    fi

    # kanban_swarm.py
    b_ks="$site_pkg/hermes_cli/kanban_swarm.py"
    if [[ -f "$b_ks" ]] && grep -q 'workspace_kind: str = "scratch"' "$b_ks" 2>/dev/null; then
      perl -i -pe 's/^(\s*)workspace_kind: str = "scratch"/$1workspace_kind: str = "worktree"/' "$b_ks"
      ver_patched=1
    fi

    if [[ $ver_patched -eq 1 ]]; then
      patched=$((patched + 1))
      echo "  ✓ desktop-runtime $(basename $(dirname $(dirname $(dirname $(dirname "$site_pkg"))))): defaults → worktree"
    fi
  done
fi

if [[ $patched -eq 0 ]]; then
  # All signatures already patched — nothing to do
  exit 0
fi

echo "✓ Kanban worktree-default patch applied ($patched file(s) changed)"
