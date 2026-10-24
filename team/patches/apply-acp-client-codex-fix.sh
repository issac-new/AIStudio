#!/usr/bin/env bash
# Re-apply ACP client Codex compatibility fixes after potential overwrite.
#
# This script:
#   1. Copies the backed-up fixed __init__.py to all 13 active profiles.
#   2. Kills any running codex-acp processes (so new client uses new code).
#   3. Verifies all profiles are in sync.
#
# Risks this protects against:
#   - acp-bulk-deployment skill re-run copying old __init__.py
#   - Manual plugin reinstall / profile sync operations
#   - Future hermes versions that might auto-sync profile plugins
#
# Usage:  bash ~/.hermes/patches/apply-acp-client-codex-fix.sh
#
# Safe to re-run: checks if fix is already present before copying.
set -euo pipefail

FIX_FILE="$HOME/.hermes/patches/acp-client-codex-fix__init__.py"
PROFILES_DIR="$HOME/.hermes/profiles"

echo "=== Applying ACP client Codex compatibility fix ==="

if [[ ! -f "$FIX_FILE" ]]; then
  echo "ERROR: Fix file not found: $FIX_FILE"
  exit 1
fi

# Check if the fix is already applied by looking for the signature code
SIGNATURE='sandbox_mode="danger-full-access"'
FIX_ALREADY=0

# Use worker-coder as reference (first profile with acp-client)
REF_FILE="$PROFILES_DIR/worker-coder/plugins/acp-client/__init__.py"
if [[ -f "$REF_FILE" ]] && grep -q "$SIGNATURE" "$REF_FILE"; then
  # Verify it matches the fix file
  REF_HASH=$(md5 -q "$REF_FILE" 2>/dev/null || md5sum "$REF_FILE" | cut -d' ' -f1)
  FIX_HASH=$(md5 -q "$FIX_FILE" 2>/dev/null || md5sum "$FIX_FILE" | cut -d' ' -f1)
  if [[ "$REF_HASH" == "$FIX_HASH" ]]; then
    FIX_ALREADY=1
  fi
fi

if [[ $FIX_ALREADY -eq 1 ]]; then
  echo "→ Fix already applied (signature + hash match)"
else
  echo "→ Copying fixed __init__.py to all active profiles..."

  COUNT=0
  for d in "$PROFILES_DIR"/*/; do
    name=$(basename "$d")
    # Skip archived and _shared
    [[ "$name" == *archived* ]] && continue
    [[ "$name" == "_shared" ]] && continue

    TARGET="${d}plugins/acp-client/__init__.py"
    if [[ -f "$TARGET" ]]; then
      cp "$FIX_FILE" "$TARGET"
      COUNT=$((COUNT + 1))
      echo "  ✓ $name"
    fi
  done
  echo "  Copied to $COUNT profiles"
fi

# Kill running codex-acp processes so new sessions pick up the fix
echo ""
echo "=== Restarting codex-acp processes ==="
if pgrep -f "codex-acp" >/dev/null 2>&1; then
  pkill -f "codex-acp" 2>/dev/null || true
  echo "  ✓ Killed running codex-acp (will recreate on next acp_send)"
else
  echo "  → No codex-acp processes running"
fi

# Verify all profiles are in sync
echo ""
echo "=== Verification ==="
REF_HASH=$(md5 -q "$FIX_FILE" 2>/dev/null || md5sum "$FIX_FILE" | cut -d' ' -f1)
SYNCED=0
STALE=""
for d in "$PROFILES_DIR"/*/; do
  name=$(basename "$d")
  [[ "$name" == *archived* ]] && continue
  [[ "$name" == "_shared" ]] && continue
  TARGET="${d}plugins/acp-client/__init__.py"
  [[ ! -f "$TARGET" ]] && continue
  H=$(md5 -q "$TARGET" 2>/dev/null || md5sum "$TARGET" | cut -d' ' -f1)
  if [[ "$H" == "$REF_HASH" ]]; then
    SYNCED=$((SYNCED + 1))
  else
    STALE="$STALE $name"
  fi
done

if [[ -z "$STALE" ]]; then
  echo "  ✓ All $SYNCED profiles in sync"
else
  echo "  ⚠ Stale profiles:$STALE"
  echo "  Re-run this script to fix"
fi

# Check ~/.codex/config.toml has the required settings
echo ""
echo "=== Checking ~/.codex/config.toml ==="
CODEX_CFG="$HOME/.codex/config.toml"
if [[ -f "$CODEX_CFG" ]]; then
  if grep -q 'sandbox_mode = "danger-full-access"' "$CODEX_CFG" && \
     grep -q 'approval_policy = "never"' "$CODEX_CFG"; then
    echo "  ✓ config.toml has sandbox_mode + approval_policy"
  else
    echo "  ⚠ config.toml missing sandbox_mode/approval_policy — codex may fail"
    echo "    Add these lines to ~/.codex/config.toml:"
    echo '    approval_policy = "never"'
    echo '    sandbox_mode = "danger-full-access"'
  fi
else
  echo "  ⚠ ~/.codex/config.toml not found"
fi

echo ""
echo "=== Done ==="
echo "ACP Codex fix is active. Use acp_send(provider='codex') to verify."
