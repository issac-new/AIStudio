#!/usr/bin/env bash
# apply-source-patches.sh — idempotent re-application of all hermes-agent
# source patches after `hermes update`. Called by .git/hooks/post-merge and
# safe to run manually any time.
#
# Each patch: check signature → skip if present, else git apply (fallback --3way).
set -uo pipefail

REPO=$HOME/.hermes/hermes-agent
PATCHES=$HOME/.hermes/patches
LOG=$HOME/.hermes/logs/apply-source-patches.log
mkdir -p "$(dirname "$LOG")"
cd "$REPO" || { log "FATAL: cannot cd $REPO"; exit 1; }

log() { echo "$(date '+%F %T') $*" | tee -a "$LOG"; }

# patch filenames — presence detection is done via `git apply --reverse --check`
# (byte-level), so no per-patch signature strings are needed.
SPECS=(
  "hermes-bigmodel-401-fix.patch"
  "hermes-weixin-local.patch"
  "hermes-main-local.patch"
  "hermes-tui-widgets-doc.patch"
  "hermes-skills-symlink-install.patch"
  "hermes-provider-identity-rewrite.patch"
  "hermes-tui-file-link-allowlist.patch"
)

for patch in "${SPECS[@]}"; do
  [ -f "$PATCHES/$patch" ] || { log "SKIP $patch (missing patch file)"; continue; }
  if git apply --check "$PATCHES/$patch" >/dev/null 2>&1; then
    git apply "$PATCHES/$patch" && log "APPLIED $patch"
  elif git apply --3way "$PATCHES/$patch" >/dev/null 2>&1; then
    log "APPLIED(3way) $patch"
  else
    # Already applied or genuine conflict
    if git apply --reverse --check "$PATCHES/$patch" >/dev/null 2>&1; then
      log "PRESENT $patch (already applied, skipped)"
    else
      log "CONFLICT $patch — manual resolution needed"
    fi
  fi
done

# TUI patches have their own apply scripts (with build step) — delegate
for script in apply-tui-patches.sh apply-kanban-worktree-default.sh apply-acp-client-codex-fix.sh; do
  [ -f "$PATCHES/$script" ] && bash "$PATCHES/$script" >> "$LOG" 2>&1 && log "RAN $script"
done

# Rebuild TUI dist if any .tsx patch was (re)applied
if git diff --name-only HEAD 2>/dev/null | grep -q '\.tsx$'; then
  log "rebuilding TUI dist..."
  (cd ui-tui && npm run build) >> "$LOG" 2>&1 && log "TUI dist rebuilt"
fi

log "done"
