#!/bin/bash
# sim-down.sh — 停止模拟实例（gateway 优雅停止 + studio 进程收尾）
# 用法: bash sim-down.sh [user ...]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/sim-lib.sh"

if (( $# == 0 )); then STOP=("${USERS[@]}"); else STOP=("$@"); fi

for u in "${STOP[@]}"; do
  # 1. gateway：用其自己的 HERMES_HOME 调 CLI 停止（写 pid 文件的一方负责清理）
  PROF=$(profile_dir "$u")
  if [[ -d "$PROF" ]]; then
    HERMES_HOME="$PROF" "$HERMES_BIN" gateway stop >/dev/null 2>&1 \
      && log "$u gateway 已停止" \
      || log "$u gateway stop 返回非零（可能本就未运行）"
  fi

  # 2. studio 后端
  pidfile="$PIDS_DIR/$u-server.pid"
  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    pid=$(cat "$pidfile")
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    log "$u studio (pid $pid) 已停止"
  else
    log "$u studio 未在运行"
  fi
  rm -f "$pidfile"
done

# 3. 残留检查：仍有进程占用 870x/872x 段则提示
LEFT=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -E ':(87[0-9]{2})' | awk '{print $1, $2, $9}' | sort -u || true)
[[ -z "$LEFT" ]] || { echo "[sim] 警告: 87xx 端口段仍有监听:"; echo "$LEFT"; }
exit 0
