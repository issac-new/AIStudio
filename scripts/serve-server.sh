#!/bin/bash
# Hermes Studio 后端服务启动脚本
# 用途：包装 upstream 的 server 启动，设置正确的 tsconfig 路径避免 TS 编译错误
# 用法：bash scripts/serve-server.sh [--port PORT]
#
# 环境变量：
#   PORT - 监听端口（默认 8647）

PORT="${PORT:-8647}"

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UPSTREAM_DIR="$(cd "$SCRIPT_DIR/../../upstream/hermes-studio" && pwd)"

export TS_NODE_PROJECT=packages/server/tsconfig.json
export PORT="$PORT"

echo "[serve-server] PORT=$PORT"
echo "[serve-server] TS_NODE_PROJECT=$TS_NODE_PROJECT"
echo "[serve-server] starting: node -r ts-node/register $UPSTREAM_DIR/packages/server/src/index.ts"

cd "$UPSTREAM_DIR" && exec node -r ts-node/register packages/server/src/index.ts
