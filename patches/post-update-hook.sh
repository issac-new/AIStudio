#!/usr/bin/env bash
# Post-hermes-update hook: re-apply all patches after upstream code update.
#
# This file is safe to source from .zshrc/.bashrc or run manually.
# It checks whether hermes update wiped customizations, and if so, re-applies them.
#
# To use automatically after every `hermes update`, add this to your shell rc:
#
#   alias hermes='hermes_post_update_hook hermes'
#
# Or just run it manually after update:
#   bash ~/.hermes/patches/apply-tui-patches.sh
#   bash ~/.hermes/patches/apply-acp-client-codex-fix.sh

set -euo pipefail

REPO_DIR="$HOME/.hermes/hermes-agent"

# ── 1. TUI cc-switch status bar patches ──────────────────────────
TUI_PATCH_SCRIPT="$HOME/.hermes/patches/apply-tui-patches.sh"
if [[ -f "$TUI_PATCH_SCRIPT" ]]; then
  _has_ccextra=$(grep -c "ccExtraTruncated" "$REPO_DIR/ui-tui/src/components/appChrome.tsx" 2>/dev/null || echo 0)
  _has_ipweather=$(grep -c "fetchIpWeather" "$REPO_DIR/ui-tui/src/components/appLayout.tsx" 2>/dev/null || echo 0)

  if [[ $_has_ccextra -eq 0 || $_has_ipweather -eq 0 ]]; then
    echo ""
    echo "⚠ TUI customizations missing after hermes update, re-applying..."
    bash "$TUI_PATCH_SCRIPT" || true
  fi
fi

# ── 2. ACP client Codex compatibility fix ────────────────────────
# Note: ~/.hermes/profiles/ is NOT inside the git repo, so hermes update
# won't overwrite it. But other operations (skill re-runs, plugin syncs,
# manual reinstalls) could. This check is fast and idempotent.
ACP_FIX_SCRIPT="$HOME/.hermes/patches/apply-acp-client-codex-fix.sh"
if [[ -f "$ACP_FIX_SCRIPT" ]]; then
  REF_FILE="$HOME/.hermes/profiles/worker-coder/plugins/acp-client/__init__.py"
  SIGNATURE='sandbox_mode="danger-full-access"'
  _has_codex_fix=$(grep -c "$SIGNATURE" "$REF_FILE" 2>/dev/null || echo 0)

  if [[ $_has_codex_fix -eq 0 ]]; then
    echo ""
    echo "⚠ ACP client Codex fix missing, re-applying..."
    bash "$ACP_FIX_SCRIPT" || true
  fi
fi

# ── 3. Kanban worktree-default patch ─────────────────────────────
# Ensures all kanban tasks default to workspace_kind="worktree" (persistent)
# instead of "scratch" (ephemeral, deleted on completion). Without this,
# gateway-channel tasks lose their output when the task completes.
KANBAN_WT_SCRIPT="$HOME/.hermes/patches/apply-kanban-worktree-default.sh"
if [[ -f "$KANBAN_WT_SCRIPT" ]]; then
  _needs_wt_patch=0
  # Check venv source
  _has_wt_venv=$(grep -c 'workspace_kind = "worktree"' "$REPO_DIR/tools/kanban_tools.py" 2>/dev/null || echo 0)
  [[ $_has_wt_venv -eq 0 ]] && _needs_wt_patch=1
  # Check desktop runtime bundled copy
  for b_kt in "$HOME"/.hermes-web-ui/desktop-runtime/hermes/*/mac-arm64/python/lib/python3.12/site-packages/tools/kanban_tools.py; do
    [[ -f "$b_kt" ]] || continue
    _has_wt_bundled=$(grep -c 'workspace_kind = "worktree"' "$b_kt" 2>/dev/null || echo 0)
    [[ $_has_wt_bundled -eq 0 ]] && _needs_wt_patch=1
  done
  if [[ $_needs_wt_patch -eq 1 ]]; then
    echo ""
    echo "⚠ Kanban worktree-default patch missing, re-applying..."
    bash "$KANBAN_WT_SCRIPT" || true
  fi
fi
