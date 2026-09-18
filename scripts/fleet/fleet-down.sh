#!/bin/bash
# fleet-down.sh — 停止 fleet 实例（网关优雅停止 + 应用进程收尾 + 端口兜底）
# 用法: bash fleet-down.sh [user ...]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/fleet-lib.sh"

if (( $# == 0 )); then STOP=("${USERS[@]}"); else STOP=("$@"); fi

for u in "${STOP[@]}"; do
  # 1. 网关：用该实例自带 venv 的 hermes + 其 profile HERMES_HOME 优雅停止
  PROF=$(profile_dir "$u")
  IHERMES=$(instance_hermes "$u")
  if [[ -d "$PROF" && -x "$IHERMES" ]]; then
    HERMES_HOME="$PROF" "$IHERMES" gateway stop >/dev/null 2>&1 \
      && log "$u gateway 已停止" \
      || log "$u gateway stop 返回非零（可能本就未运行）"
  fi

  # 2. 应用主进程（server 子进程随父进程退出；ELECTRON_RUN_AS_NODE 同路径子进程一并兜底）
  pidfile="$PIDS_DIR/$u-app.pid"
  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    pid=$(cat "$pidfile")
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    log "$u 应用 (pid $pid) 已停止"
  else
    log "$u 应用未在运行"
  fi
  rm -f "$pidfile"

  # 3. 端口兜底清扫：按本实例端口终结任何残留监听
  for port in "$(studio_port "$u")" "$(gateway_port "$u")"; do
    for pid in $(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
      kill "$pid" 2>/dev/null || true
    done
  done
done

# 4. 残留检查：876x/878x 段
sleep 2
LEFT=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -E ':(876[0-9]|878[0-9])' | awk '{print $1, $2, $9}' | sort -u || true)
[[ -z "$LEFT" ]] || { echo "[fleet] 警告: fleet 端口段仍有监听:"; echo "$LEFT"; }
exit 0
