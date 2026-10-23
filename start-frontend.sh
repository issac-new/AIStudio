#!/bin/bash
# serve-main 位前端起服配方（2026-10-20 迁服轮重写）：
# - vite 一律绝对路径调用：经 node_modules 相对符号链起 vite 会把进程 cwd
#   带偏到主树（实测），绝对路径才能钉住 serve-main（主树之后可自由变脏）
# - 后端代理口 HERMES_WEB_UI_BACKEND_PORT=8647（vite 把 /api 转发到 serve-main 位后端）
cd /Users/cuishi/lab/ncwk/overlay/.claude/worktrees/serve-main || exit 1
export HERMES_WEB_UI_BACKEND_PORT=8647
exec node /Users/cuishi/lab/ncwk/upstream/hermes-studio/node_modules/vite/bin/vite.js \
  --config /Users/cuishi/lab/ncwk/overlay/.claude/worktrees/serve-main/vite.config.overlay.ts \
  --port 8649 --strictPort
