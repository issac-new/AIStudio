#!/usr/bin/env bash
# Re-apply TUI cc-switch status bar customizations after `hermes update`.
#
# This script:
#   1. Applies the saved patch (tui-ccswitch-statusbar.patch) onto the freshly
#      updated hermes-agent source tree.
#   2. Rebuilds dist/entry.js (TUI loads from dist, not src).
#   3. Verifies the build succeeded.
#
# Usage:  bash ~/.hermes/patches/apply-tui-patches.sh
#
# Safe to re-run: if the patch is already applied, it skips cleanly.
set -euo pipefail

REPO_DIR="$HOME/.hermes/hermes-agent"
UI_DIR="$REPO_DIR/ui-tui"
PATCH_FILE="$HOME/.hermes/patches/tui-ccswitch-statusbar.patch"

echo "=== Applying TUI cc-switch status bar patch ==="

# Check repo exists
if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "ERROR: $REPO_DIR is not a git repo"
  exit 1
fi

# Check patch file exists
if [[ ! -f "$PATCH_FILE" ]]; then
  echo "ERROR: Patch file not found: $PATCH_FILE"
  exit 1
fi

cd "$REPO_DIR"

# Check if patch is already applied (dry-run)
if git apply --check "$PATCH_FILE" 2>/dev/null; then
  echo "→ Applying patch..."
  git apply "$PATCH_FILE"
  echo "  ✓ Patch applied"
else
  # Patch doesn't apply — either already applied or upstream changed.
  # Check if the target files already have our modifications.
  _has_ccextra=$(grep -c "ccExtraTruncated" ui-tui/src/components/appChrome.tsx 2>/dev/null || echo 0)
  _has_ipweather=$(grep -c "fetchIpWeather" ui-tui/src/components/appLayout.tsx 2>/dev/null || echo 0)
  if [[ $_has_ccextra -gt 0 && $_has_ipweather -gt 0 ]]; then
    echo "→ Patch already applied (customizations present in source)"
  else
    # Patch doesn't apply cleanly AND customizations are missing — try 3-way
    echo "⚠ Patch doesn't apply cleanly, trying 3-way merge..."
    if git apply --3way "$PATCH_FILE" 2>/dev/null; then
      echo "  ✓ Patch applied with 3-way merge (check for conflict markers)"
    else
      echo "  ✗ Patch failed — upstream code may have changed significantly"
      echo "  Manual recovery needed. Patch file: $PATCH_FILE"
      exit 1
    fi
  fi
fi

# Rebuild TUI
echo ""
echo "=== Rebuilding TUI dist/entry.js ==="
cd "$UI_DIR"

if [[ ! -d node_modules ]]; then
  echo "→ Installing dependencies..."
  npm install 2>&1 | tail -3
fi

if npm run build 2>&1 | tail -5; then
  echo "  ✓ dist/entry.js rebuilt"
else
  echo "  ✗ Build failed"
  exit 1
fi

# Verify
echo ""
echo "=== Verification ==="
if grep -q "ccExtraTruncated" "$UI_DIR/dist/entry.js" 2>/dev/null; then
  echo "  ✓ ccExtra truncation logic in dist"
else
  echo "  ⚠ ccExtraTruncated not found in dist — patch may not have applied correctly"
fi

if grep -q "fetchIpWeather\|myip.ipip.net" "$UI_DIR/dist/entry.js" 2>/dev/null; then
  echo "  ✓ IP+weather fetch in dist"
else
  echo "  ⚠ IP+weather not found in dist"
fi

if grep -q "fetchVolcengineUsage\|volcengineapi" "$UI_DIR/dist/entry.js" 2>/dev/null; then
  echo "  ✓ Volcengine usage in dist"
else
  echo "  ⚠ Volcengine usage not found in dist"
fi

echo ""
echo "=== Done ==="
echo "Restart TUI to load the new dist/entry.js."
echo ""
echo "Note: ~/.hermes/config.yaml and profile config.yaml files are NOT in the git"
echo "repo, so they survive hermes update without needing this script."
