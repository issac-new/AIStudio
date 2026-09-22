#!/bin/bash
# aipay-down.sh — 停止全部实例（studio + 其拉起的 gateway）
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/aipay-lib.sh"

for u in "${INSTANCED_USERS[@]}"; do
  pidfile="$PIDS_DIR/$u-server.pid"
  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    kill "$(cat "$pidfile")" 2>/dev/null || true
    log "$u studio 已停止"
  fi
  rm -f "$pidfile"
done

# gateway 由 studio 拉起，studio 停止后兜底清残留（按端口找）
for u in "${INSTANCED_USERS[@]}"; do
  gw=$(gateway_port "$u")
  pid=$(lsof -tnP -iTCP:"$gw" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; log "$u gateway(:$gw) 残留已清"; fi
done
log "全部停止"
