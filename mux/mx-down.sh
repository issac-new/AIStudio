#!/bin/bash
# mx-down.sh — 停 studio + 单 gateway（按 pid 文件 + 端口清残留）
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/mx-lib.sh"

kill_by_pidfile() { # <pidfile>
  local f="$1" pid
  [[ -f "$f" ]] || return 0
  pid=$(cat "$f" 2>/dev/null)
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 2
    kill -9 "$pid" 2>/dev/null || true
    log "已停止 pid ${pid}（${f}）"
  fi
  rm -f "$f"
}
kill_port() { # <port>
  local pids
  pids=$(lsof -ti ":$1" 2>/dev/null || true)
  [[ -n "$pids" ]] || return 0
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 2
  # shellcheck disable=SC2086
  kill -9 $pids 2>/dev/null || true
  log "端口 $1 残留已清"
}

kill_by_pidfile "$PIDS_DIR/studio.pid"
kill_by_pidfile "$PIDS_DIR/gateway.pid"
kill_port "$STUDIO_PORT"
kill_port "$GW_PORT"
log "=== mx-down 完成（真机 orchestrator :8650 不在管辖范围）==="
