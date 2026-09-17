#!/bin/bash
# sim-up.sh — 拉起 3 个 SwarmStudio 实例（生产构建），gateway 由 Studio autostart 拉起
# 用法: bash sim-up.sh [user ...]   # 缺省全部；冒烟可只传 alice
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/sim-lib.sh"

[[ -f "$DIST_SERVER" ]] || fail "缺少构建产物 ${DIST_SERVER}（先 cd overlay && npm run build:full）"

if (( $# == 0 )); then START=("${USERS[@]}"); else START=("$@"); fi
API_KEY=$(api_server_key)

up_one() {
  local u="$1" port gw_port
  port=$(studio_port "$u"); gw_port=$(gateway_port "$u")
  local pidfile="$PIDS_DIR/$u-server.pid"

  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    log "$u studio 已在运行 (pid $(cat "$pidfile"))"
    return 0
  fi

  log "$u 启动 studio 后端 :$port (gateway api_server :$gw_port)"
  # exec 确保 $! 就是 node 进程本身（否则子壳退出后 node 变孤儿，pid 失效）
  (
    cd "$STUDIO_TREE"
    mkdir -p "$(webui_home "$u")"
    exec env \
      PORT="$port" \
      NODE_ENV=production \
      HERMES_BIN="$HERMES_BIN" \
      HERMES_HOME="$(hermes_root "$u")" \
      HERMES_WEB_UI_HOME="$(webui_home "$u")" \
      HERMES_WEBUI_STATE_DIR="$(webui_home "$u")" \
      HERMES_AGENT_HEALTH_URL="http://127.0.0.1:$gw_port" \
      GATEWAY_PORT="$gw_port" \
      API_SERVER_KEY="$API_KEY" \
      node "$DIST_SERVER" >> "$LOGS_DIR/$u-server.log" 2>&1
  ) &
  echo $! > "$pidfile"
}

wait_http() { # <url> <name> <timeout-sec>
  local deadline=$(( $(date +%s) + $3 ))
  while (( $(date +%s) < deadline )); do
    curl -sf -o /dev/null "$1" && { log "$2 就绪: $1"; return 0; }
    sleep 3
  done
  fail "$2 在 $3s 内未就绪: $1（查 ${LOGS_DIR}）"
}

for u in "${START[@]}"; do up_one "$u"; done

# 等 studio /health/ready（gateway 由 boot 时 ensureProfileGatewaysRunning 拉起）
for u in "${START[@]}"; do
  wait_http "http://127.0.0.1:$(studio_port "$u")/health/ready" "$u studio" 180
done

# 等 gateway /health（全新 hermes home 首启含 bootstrap，放宽到 300s）
for u in "${START[@]}"; do
  wait_http "http://127.0.0.1:$(gateway_port "$u")/health" "$u gateway" 300
done

log "全部就绪。浏览器入口:"
for u in "${START[@]}"; do
  log "  $u → http://127.0.0.1:$(studio_port "$u") （admin/123456, matrix 用户 $(human_mxid "$u")）"
done
