#!/bin/bash
# t_a6b4127b 晨检唤醒（一次性）：夜间授权窗首采由 02:15 unified-nightly-loop 执行，
# 本脚本在次日 09:05 重新放行 blocked/transient 的晨检卡（swarm 板），让 dispatcher 重生 worker 验证。
# cron: 2026-10-21T09:05 一次性 no_agent（先例 t_1adfee32 的 wakeup_t_1adfee32.sh 同构）
export HERMES_KANBAN_DB=/Users/YOURNAME/.hermes/kanban/boards/swarm/kanban.db
echo "[wakeup] $(date '+%F %T') firing"
/Users/YOURNAME/.local/bin/hermes kanban unblock t_a6b4127b \
  --reason "SCHEDULED_UNTIL=2026-10-21T09:05:00+08:00 已到：夜间 loop 首采窗口已过，放行晨检卡（验证 fs_xhs-search_2026-10-21.json，items>0 判定 + 首登前置 mtime 交叉判定）" 2>&1
rc=$?
echo "[wakeup] unblock rc=$rc"
exit 0
