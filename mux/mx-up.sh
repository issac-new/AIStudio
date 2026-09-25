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
  PYTHONPATH="$HERMES_PYTHONPATH" HERMES_SKIP_UPDATE=1 HERMES_HOME="$HERMES_ROOT" HERMES_GATEWAY_LOCK_DIR="$LOCK_DIR" \
    nohup "$HERMES_BIN" gateway run > "$LOGS_DIR/gateway.log" 2>&1 &
  echo $! > "$PIDS_DIR/gateway.pid"
  log "gateway 启动中（pid $(cat "$PIDS_DIR/gateway.pid")，日志 $LOGS_DIR/gateway.log）"
fi

# ── 单 studio（matrix-login 多账号 + ACL）───────────────
if curl -sf "http://127.0.0.1:$STUDIO_PORT/health/ready" -m 2 >/dev/null 2>&1; then
  log "studio 已在跑（:${STUDIO_PORT}），跳过"
else
  api_key=$(api_server_key)
  # NODE_ENV=production 必须显式给定：dist 是生产构建，缺省时 DB 走 isDev 的
  # cwd 相对路径（packages/server/data），cwd 若随 worktree 清理消失，node:sqlite
  # 会报 "attempt to write a readonly database"（2026-09-25 实锤）。生产态 DB
  # 落 config.appHome（HERMES_WEB_UI_HOME）。进程 cwd 同时钉到 SIM_ROOT。
  ( cd "$SIM_ROOT" && \
  NODE_ENV=production \
  PORT="$STUDIO_PORT" \
  HERMES_HOME="$HERMES_ROOT" \
  HERMES_WEB_UI_HOME="$WEBUI_HOME" \
  HERMES_WEBUI_STATE_DIR="$WEBUI_HOME" \
  HERMES_AGENT_HEALTH_URL="http://127.0.0.1:$GW_PORT" \
  GATEWAY_PORT="$GW_PORT" \
  HERMES_BIN="$HERMES_BIN" \
  API_SERVER_KEY="$api_key" \
    nohup node "$STUDIO_DIST/server/index.js" > "$LOGS_DIR/studio.log" 2>&1 & \
  echo $! > "$PIDS_DIR/studio.pid" )
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

# ── matrix 适配器自愈（pm 门控漂移/venv 缺依赖 → agent 全员哑火的根因面）──
if matrix_adapter_degraded "$LOGS_DIR/gateway.log"; then
  log "检测到 matrix 适配器降级（agent 将收不到 @mention）——执行自愈"
  if matrix_adapter_selfheal; then
    kill "$(cat "$PIDS_DIR/gateway.pid" 2>/dev/null)" 2>/dev/null; sleep 3
    ( cd "$SIM_ROOT" && nohup "$HERMES_BIN" gateway run > "$LOGS_DIR/gateway.log" 2>&1 & \
      echo $! > "$PIDS_DIR/gateway.pid" )
    deadline=$(( $(date +%s) + 120 ))
    while (( $(date +%s) < deadline )); do
      curl -sf "http://127.0.0.1:$GW_PORT/health" -m 2 >/dev/null 2>&1 && break; sleep 3
    done
    if matrix_adapter_degraded "$LOGS_DIR/gateway.log"; then
      log "自愈后 matrix 仍降级（查 $LOGS_DIR/gateway.log）——agent 轮将哑火"
    else
      log "matrix 自愈成功：适配器已恢复"
    fi
  else
    log "matrix 自愈失败——agent 轮将哑火，人工处置（hermes pm doctor）"
  fi
fi

log "=== 就绪：gateway :${GW_PORT}（多路复用）+ studio :$STUDIO_PORT ==="
