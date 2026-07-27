#!/bin/bash
# ============================================================
# Gateway + Dashboard 统一启动脚本 (macOS launchd)
# ============================================================
# 默认将 gateway 和 dashboard 一起启动。
# 所有 worker profiles 通过 Kanban dispatcher 挂靠在同一个 gateway 上，
# 无需独立 gateway。
#
# 用法:
#   直接执行:  bash start-gateway-with-dashboard.sh [profile] [--replace]
#   launchd:   ProgramArguments 调用此脚本
#
# 环境变量:
#   HERMES_HOME           profile 数据目录
#   HERMES_DASHBOARD_HOST  dashboard 监听地址 (默认 127.0.0.1)
#   HERMES_DASHBOARD_PORT  dashboard 端口 (默认 9119)
#   HERMES_PROFILE         profile 名称 (从 HERMES_HOME 推断)
# ============================================================
set -e

# --- 解析参数 ---
PROFILE="${HERMES_PROFILE:-}"
REPLACE_FLAGS=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --profile)        PROFILE="$2"; shift 2 ;;
        --profile=*)      PROFILE="${1#--profile=}"; shift ;;
        --*)              REPLACE_FLAGS="$REPLACE_FLAGS $1"; shift ;;
        *)                [ -z "$PROFILE" ] && PROFILE="$1"; shift ;;
    esac
done

# 从 HERMES_HOME 推断 profile 名称
if [ -z "$PROFILE" ] && [ -n "$HERMES_HOME" ]; then
    PROFILE=$(basename "$HERMES_HOME")
fi
PROFILE="${PROFILE:-orchestrator}"

# --- 定位 hermes 二进制 ---
HERMES_BIN="${HERMES_BIN:-$(command -v hermes || echo "$HOME/.hermes/hermes-agent/venv/bin/hermes")}"

# --- 日志目录 ---
LOG_DIR="${HERMES_HOME:-$HOME/.hermes/profiles/$PROFILE}/logs"
mkdir -p "$LOG_DIR"

DASH_HOST="${HERMES_DASHBOARD_HOST:-127.0.0.1}"
DASH_PORT="${HERMES_DASHBOARD_PORT:-9119}"

# --- 检查 dashboard 是否已在运行 ---
dash_running=false
if command -v lsof >/dev/null 2>&1; then
    lsof -i ":${DASH_PORT}" -sTCP:LISTEN >/dev/null 2>&1 && dash_running=true
elif command -v curl >/dev/null 2>&1; then
    curl -s -o /dev/null --connect-timeout 1 "http://${DASH_HOST}:${DASH_PORT}/" 2>/dev/null && dash_running=true
fi

if [ "$dash_running" = false ]; then
    echo "📊 Starting dashboard on ${DASH_HOST}:${DASH_PORT}..."
    DASH_ARGS=(dashboard --host "$DASH_HOST" --port "$DASH_PORT" --no-open --skip-build)
    [ -n "$PROFILE" ] && DASH_ARGS=(--profile "$PROFILE" "${DASH_ARGS[@]}")
    nohup "$HERMES_BIN" "${DASH_ARGS[@]}" \
        > "$LOG_DIR/dashboard.log" 2>&1 &
    disown

    # 等待 dashboard 就绪
    for i in $(seq 1 30); do
        curl -s -o /dev/null "http://${DASH_HOST}:${DASH_PORT}/" 2>/dev/null && break
        [ $i -eq 5 ] && echo "⏳ Building dashboard..."
        sleep 1
    done
    echo "✅ Dashboard ready on http://${DASH_HOST}:${DASH_PORT}"
else
    echo "✅ Dashboard already running on :${DASH_PORT}"
fi

# --- 启动 gateway (前台, exec 替换当前进程) ---
echo "🚀 Starting gateway for profile: $PROFILE"
GW_ARGS=(--profile "$PROFILE" gateway run)
if [[ "$REPLACE_FLAGS" != *"--replace"* && "$REPLACE_FLAGS" != *"--force"* && "$REPLACE_FLAGS" != *"--no-supervise"* ]]; then
    GW_ARGS+=(--replace)
fi
[ -n "$REPLACE_FLAGS" ] && GW_ARGS+=($REPLACE_FLAGS)

exec "$HERMES_BIN" "${GW_ARGS[@]}"
