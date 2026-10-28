#!/bin/bash
# t_f7e75988 轮3 晨检唤醒再武装（一次性）：用户已于 10-28 08:20 完成首登（实证 595 文件+Cookies 08:25），
# 今晚 02:15 unified-nightly-loop 按期采集（launchctl print 已复核 calendarinterval watching=1），
# 本脚本在 2026-10-29 09:05 重新放行 blocked/dependency 的轮3 晨检卡（swarm 板），
# 让 dispatcher 重生 worker 执行晨检四步（前提 loop full done 行→items>0 四分支判性→单测→报告）。
# cron: 2026-10-29T09:05 一次性 no_agent（先例：本脚本 2026-10-23T09:05 成功触发一次，run 719→723 链）
export HERMES_KANBAN_DB=/Users/YOURNAME/.hermes/kanban/boards/swarm/kanban.db
echo "[wakeup] $(date '+%F %T') firing"
/Users/YOURNAME/.local/bin/hermes kanban unblock t_f7e75988 \
  --reason "SCHEDULED_UNTIL=2026-10-29T09:05:00+08:00 已到：02:15 loop 采集已落盘（用户 10-28 08:20 已首登，web_session 实证），放行轮3 晨检复验卡（前提：unified_loop 日志查 10-29 full done 行，GATE-SKIP=设计内顺延；然后验证 fs_xhs-search_2026-10-29.json items>0 判定 + 四分支判性；预案见 t_f7e75988_verify_report.md Run 4 段）" 2>&1
rc=$?
echo "[wakeup] unblock rc=$rc"
exit 0
