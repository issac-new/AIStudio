#!/bin/bash
# Drift watchdog: tui-usage-window-colors (status bar 5h/7d per-window coloring)
# Patches ui-tui/src/components/appLayout.tsx if the swarm: marker is gone
# (hermes update / git pull overwrite). Silent when healthy (exit 0).
# Exit codes: 0=healthy 1=re-applied (needs TUI restart) 2=needs human.
set -u
F="$HOME/.hermes/hermes-agent/ui-tui/src/components/appLayout.tsx"
P="$HOME/.hermes/profiles/_shared/decisions/tui-usage-window-colors.patch"
MARKER="swarm:usage-window-colors"
EXPECT=4   # marker count when intact

verbose=0
[ "${1:-}" = "--verbose" ] && verbose=1

count=$(grep -c "$MARKER" "$F" 2>/dev/null || echo 0)
if [ "$count" -ge "$EXPECT" ] 2>/dev/null; then
  [ "$verbose" = 1 ] && echo "✓ tui-usage-window-colors intact ($count markers)"
  exit 0
fi

# Drift detected — try to re-apply the patch.
if [ ! -f "$P" ]; then
  echo "✗ tui-usage-window-colors: marker gone ($count/$EXPECT) and patch missing: $P"
  exit 2
fi

cd "$HOME/.hermes/hermes-agent" || { echo "✗ cannot cd hermes-agent"; exit 2; }
if git apply --check "$P" 2>/dev/null; then
  git apply "$P" || { echo "✗ tui-usage-window-colors: git apply failed (check passed but apply errored)"; exit 2; }
  echo "⚠ tui-usage-window-colors drifted; patch re-applied ($count→$(grep -c "$MARKER" "$F") markers). REBUILD: cd ui-tui && npm run build, then restart TUI."
  exit 1
else
  echo "✗ tui-usage-window-colors: patch cannot apply cleanly (upstream changed the region). Manual rebase needed."
  exit 2
fi
