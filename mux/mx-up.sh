#!/bin/bash
# mx-up.sh — 拉起单 gateway（多路复用）+ 单 studio（多 matrix 账号）
#
# host-ownership 合规（overlay/docs/superpowers/specs/2026-09-23-gateway-host-ownership.md）：
#   不使用 --force / --replace；与真机 orchestrator(:8650) 共存靠 HERMES_GATEWAY_LOCK_DIR 隔离锁目录。
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/mx-lib.sh"

# ── host 共存检查（G5 证据面）────────────────────────────
host_health=$(curl -sf "$HOST_ORCH_HEALTH" -m 3 || true)
if [[ -n "$host_health" ]]; then
  log "真机 orchestrator 在线（${HOST_ORCH_HEALTH}）——按隔离锁目录共存，不动它"
else
  log "真机 orchestrator 未探测到（${HOST_ORCH_HEALTH}）——继续"
fi

# ── 单 gateway（multiplex 全部 profile）────────────────
if curl -sf "http://127.0.0.1:$GW_PORT/health" -m 2 >/dev/null 2>&1; then
  log "gateway 已在跑（:${GW_PORT}），跳过"
else
  [[ -d "$HERMES_ROOT" ]] || fail "先跑 mx-setup.sh"
  HERMES_HOME="$HERMES_ROOT" HERMES_GATEWAY_LOCK_DIR="$LOCK_DIR" \
    nohup "$HERMES_BIN" gateway run > "$LOGS_DIR/gateway.log" 2>&1 &
  echo $! > "$PIDS_DIR/gateway.pid"
  log "gateway 启动中（pid $(cat "$PIDS_DIR/gateway.pid")，日志 $LOGS_DIR/gateway.log）"
fi

# ── 单 studio（matrix-login 多账号 + ACL）───────────────
if curl -sf "http://127.0.0.1:$STUDIO_PORT/health/ready" -m 2 >/dev/null 2>&1; then
  log "studio 已在跑（:${STUDIO_PORT}），跳过"
else
  api_key=$(api_server_key)
  PORT="$STUDIO_PORT" \
  HERMES_HOME="$HERMES_ROOT" \
  HERMES_WEB_UI_HOME="$WEBUI_HOME" \
  HERMES_WEBUI_STATE_DIR="$WEBUI_HOME" \
  HERMES_AGENT_HEALTH_URL="http://127.0.0.1:$GW_PORT" \
  GATEWAY_PORT="$GW_PORT" \
  HERMES_BIN="$HERMES_BIN" \
  API_SERVER_KEY="$api_key" \
    nohup node "$STUDIO_DIST/server/index.js" > "$LOGS_DIR/studio.log" 2>&1 &
  echo $! > "$PIDS_DIR/studio.pid"
  log "studio 启动中（pid $(cat "$PIDS_DIR/studio.pid")，日志 $LOGS_DIR/studio.log）"
fi

# ── 就绪等待 ────────────────────────────────────────────
deadline=$(( $(date +%s) + 300 ))
while (( $(date +%s) < deadline )); do
  g_ok=$(curl -sf "http://127.0.0.1:$GW_PORT/health" -m 2 >/dev/null 2>&1 && echo 1 || echo 0)
  s_ok=$(curl -sf "http://127.0.0.1:$STUDIO_PORT/health/ready" -m 2 >/dev/null 2>&1 && echo 1 || echo 0)
  [[ "$g_ok" == 1 && "$s_ok" == 1 ]] && break
  sleep 3
done
[[ "${g_ok:-0}" == 1 ]] || fail "gateway 300s 内未就绪（$LOGS_DIR/gateway.log）"
[[ "${s_ok:-0}" == 1 ]] || fail "studio 300s 内未就绪（$LOGS_DIR/studio.log）"
log "=== 就绪：gateway :${GW_PORT}（多路复用）+ studio :$STUDIO_PORT ==="
