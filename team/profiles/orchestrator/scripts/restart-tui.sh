#!/usr/bin/env bash
# Restart the orchestrator TUI only. Does NOT touch gateway, daemon,
# cc-switch, or any patches. Safe to run any time.
#
# Usage: bash scripts/restart-tui.sh
set -euo pipefail

PROFILE="orchestrator"
LOG="/Users/YOURNAME/.hermes/profiles/${PROFILE}/logs/tui-restart.log"
mkdir -p "$(dirname "$LOG")"
ts() { date "+%Y-%m-%d %H:%M:%S"; }

echo "[$(ts)] killing current TUI (dist-only reload)" | tee -a "$LOG"
# Kill the node bundle and the python wrapper together; gateway is on a
# different PID family and stays up.
pkill -f "ui-tui/dist/entry.js" 2>/dev/null || true
pkill -f "tui_gateway.entry"    2>/dev/null || true
sleep 1

echo "[$(ts)] launching fresh TUI under external supervisor" | tee -a "$LOG"
nohup hermes --profile "$PROFILE" tui     --external-supervisor     >>"$LOG" 2>&1 &
disown

echo "[$(ts)] done; check status line in ~3s" | tee -a "$LOG"
