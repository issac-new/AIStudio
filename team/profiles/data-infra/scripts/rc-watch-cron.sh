#!/bin/bash
# rc-watch-cron.sh — rc-watch.sh 每日定时包装（data-infra profile hermes cronjob 驱动，no_agent 零 LLM）
# 职责：执行三信源巡检 → 日志留痕 → 事件面输出 → stdout 摘要存 cron 执行记录
# 事件契约（冻结，与 rc-watch.sh 头注释一致）：
#   RC_EVENT component=<paimon|fluss> version=<x.y.z[-rcN]> kind=<ga|prerelease> sources=<n>
# 产物：
#   $LOGDIR/rc-watch.log              每轮一段（时间戳+退出码+事件行+摘要+stderr），封顶 4000 行
#   $LOGDIR/rc-watch-last-events.txt  最近一轮 RC_EVENT 行（无事件=空文件）
#   本脚本 stdout                      事件行+摘要行（由 cron 存入 executions 记录）
# 消费：晨检 grep 'kind=ga' rc-watch-last-events.txt → 按 upgrade-eval-checklist.md §3 阶段 0 建评估卡
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
SCRIPT="/Volumes/YOURVOLUME/lab/data-stack/scripts/rc-watch.sh"
LOGDIR="/Volumes/YOURVOLUME/lab/data-stack/logs"
LOG="$LOGDIR/rc-watch.log"
LAST="$LOGDIR/rc-watch-last-events.txt"
TS="$(date '+%F %T')"
mkdir -p "$LOGDIR"
OUT="$(mktemp)"; ERR="$OUT.err"
RC=0
/bin/bash "$SCRIPT" >"$OUT" 2>"$ERR" || RC=$?
EVENTS="$(grep '^RC_EVENT ' "$OUT" || true)"
SUMMARY="$(grep '^rc-watch: ' "$OUT" || true)"
{
  echo "[$TS] run rc=$RC"
  [ -n "$EVENTS" ] && printf '%s\n' "$EVENTS"
  [ -n "$SUMMARY" ] && printf '%s\n' "$SUMMARY"
  [ -s "$ERR" ] && sed 's/^/  stderr: /' "$ERR"
} >>"$LOG"
: > "$LAST"
[ -n "$EVENTS" ] && printf '%s\n' "$EVENTS" > "$LAST"
# stdout 给 cron 执行记录（executions.db 存档）
if [ -n "$EVENTS" ]; then printf '%s\n' "$EVENTS"; fi
if [ -n "$SUMMARY" ]; then printf '%s\n' "$SUMMARY"; else echo "[$TS] rc-watch: 无摘要输出 rc=$RC"; fi
rm -f "$OUT" "$ERR"
# 日志封顶：超 4000 行裁到最近 2000 行
LINES="$(wc -l < "$LOG" | tr -d ' ')"
if [ "$LINES" -gt 4000 ]; then tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
# 透传 rc-watch.sh 退出码：1=基线损坏/用法错、2=三信源全挂 → cron 状态可见（last_status=error）
exit "$RC"
