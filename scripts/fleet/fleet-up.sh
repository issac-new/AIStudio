#!/bin/bash
# fleet-up.sh — 拉起独立桌面应用实例（网关由 studio autostart 按拉起）
# 用法: bash fleet-up.sh [user ...]   # 缺省全部；冒烟可只传 alice
#
# 隔离机制（设计文档 §3）：每实例注入独立 HOME + HERMES_HOME + HERMES_WEB_UI_HOME
# + 独立 studio/gateway 端口。Electron 单实例锁按 userData 区分，HOME 不同即互不冲突。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/fleet-lib.sh"

if (( $# == 0 )); then START=("${USERS[@]}"); else START=("$@"); fi

up_one() {
  local u="$1" port gw_port app home
  port=$(studio_port "$u"); gw_port=$(gateway_port "$u")
  app=$(app_copy "$u"); home=$(home_dir "$u")
  local pidfile="$PIDS_DIR/$u-app.pid"

  [[ -x "$app/Contents/MacOS/SwarmStudio" ]] || fail "$u 缺应用副本 ${app}（先跑 fleet-setup.sh）"
  [[ -f "$(profile_dir "$u")/.env" ]] || fail "$u 缺 profile 配置（先跑 fleet-setup.sh）"

  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    log "$u 已在运行 (pid $(cat "$pidfile"))"
    return 0
  fi

  log "$u 启动独立应用 :${port}（gateway api_server :${gw_port}）"
  # exec 确保 $! 就是 Electron 主进程。userData 必须显式 --user-data-dir 指进沙箱：
  # macOS 上 HOME 覆盖不影响 Electron userData 解析（不读 $HOME），单实例锁随 userData
  # 分键，与真实实例/其他副本隔离。HOME 仍注入以隔离其余家目录态。
  (
    cd "$home"
    exec env \
      HOME="$home" \
      HERMES_HOME="$home/.hermes" \
      HERMES_WEB_UI_HOME="$home/.hermes-web-ui" \
      HERMES_WEBUI_STATE_DIR="$home/.hermes-web-ui" \
      HERMES_DESKTOP_PORT="$port" \
      GATEWAY_PORT="$gw_port" \
      HERMES_AGENT_HEALTH_URL="http://127.0.0.1:$gw_port" \
      BIND_HOST=127.0.0.1 \
      "$app/Contents/MacOS/SwarmStudio" \
      --user-data-dir="$home/Library/Application Support/SwarmStudio" \
      >> "$LOGS_DIR/$u-app.log" 2>&1
  ) &
  echo $! > "$pidfile"
}

for u in "${START[@]}"; do up_one "$u"; done

# 等 studio /health/ready（桌面首启含窗口 + server 拉起，360s 兜底）
for u in "${START[@]}"; do
  wait_http "http://127.0.0.1:$(studio_port "$u")/health/ready" "$u studio" 360
done
# 等各自网关 /health（首启 bootstrap 较慢，360s 兜底）
for u in "${START[@]}"; do
  wait_http "http://127.0.0.1:$(gateway_port "$u")/health" "$u gateway" 360
done

log "全部就绪。各用户独立应用入口:"
for u in "${START[@]}"; do
  log "  $u → 应用窗口自动打开；后端 http://127.0.0.1:$(studio_port "$u")（admin/123456, matrix $(human_mxid "$u")）"
done
