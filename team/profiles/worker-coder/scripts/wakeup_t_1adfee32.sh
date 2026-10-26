#!/bin/bash
# t_1adfee32 晨检唤醒（一次性）：夜间授权窗首采由 02:15 unified-nightly-loop 执行，
# 本脚本在次日 09:05 重新放行 scheduled 状态的晨检卡（swarm 板），让 dispatcher 重生 worker 验证。
# cron: 2026-10-20T09:05 一次性 no_agent
export HERMES_KANBAN_DB=/Users/YOURNAME/.hermes/kanban/boards/swarm/kanban.db
echo "[wakeup] $(date '+%F %T') firing"
/Users/YOURNAME/.local/bin/hermes kanban unblock t_1adfee32 \
  --reason "SCHEDULED_UNTIL=2026-10-20T09:05:00+08:00 已到：夜间 loop 首采窗口已过，放行晨检卡（验证 fs_xhs-search_2026-10-20.json）" 2>&1
rc=$?
echo "[wakeup] unblock rc=$rc"
exit 0
