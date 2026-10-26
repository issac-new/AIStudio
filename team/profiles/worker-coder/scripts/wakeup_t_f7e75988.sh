#!/bin/bash
# t_f7e75988 轮3 晨检唤醒（一次性）：今晚用户 23:00 后首登 + 02:15 unified-nightly-loop 首采，
# 本脚本在 2026-10-23 09:05 重新放行 blocked/transient 的轮3 晨检卡（swarm 板），
# 让 dispatcher 重生 worker 执行晨检四步（首登前置 mtime 判定→items>0 四分支判性→单测→报告）。
# cron: 2026-10-23T09:05 一次性 no_agent（先例 wakeup_t_03a3d0a9.sh / wakeup_t_a6b4127b.sh 同构）
export HERMES_KANBAN_DB=/Users/YOURNAME/.hermes/kanban/boards/swarm/kanban.db
echo "[wakeup] $(date '+%F %T') firing"
/Users/YOURNAME/.local/bin/hermes kanban unblock t_f7e75988 \
  --reason "SCHEDULED_UNTIL=2026-10-23T09:05:00+08:00 已到：昨夜 02:15 loop 首采数据已落盘，放行轮3 晨检卡（验证 fs_xhs-search_2026-10-23.json，items>0 判定 + 四分支判性含第四态 not-collected + 首登前置 mtime 交叉判定）" 2>&1
rc=$?
echo "[wakeup] unblock rc=$rc"
exit 0
