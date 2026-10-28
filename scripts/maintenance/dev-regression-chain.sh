#!/bin/bash
# 全功能回归隔离链启动器（2026-10-03 回归轮）：
#   后端 8687 + 前端 vite 8689，注入树 = .claude/worktrees/upstream-private。
#   与共享 8647/8649 链隔离，互不影响。env 写在文件里（rtk hook 会吞命令行 env 前缀）。
# 用法：bash scripts/dev-regression-chain.sh [backend|frontend|both]
set -e
WT=/Volumes/nvme2230/lab/ncwk/.claude/worktrees/full-regression-20261003
export OVERLAY_UPSTREAM_ROOT=/Volumes/nvme2230/lab/ncwk/.claude/worktrees/upstream-private
export HERMES_WEB_UI_BACKEND_PORT=8687
export PORT=8687
cd "$WT"

start_backend() {
  echo "[chain] backend on 8687"
  node scripts/serve-server.mjs --port 8687
}
start_frontend() {
  echo "[chain] frontend on 8689"
  ./node_modules/.bin/vite --config vite.config.overlay.ts --port 8689 --strictPort
}

case "${1:-both}" in
  backend) start_backend ;;
  frontend) start_frontend ;;
  both)
    start_backend > /tmp/reg-chain-backend.log 2>&1 &
    echo "[chain] backend pid $! (log /tmp/reg-chain-backend.log)"
    sleep 4
    start_frontend > /tmp/reg-chain-frontend.log 2>&1 &
    echo "[chain] frontend pid $! (log /tmp/reg-chain-frontend.log)"
    ;;
esac
