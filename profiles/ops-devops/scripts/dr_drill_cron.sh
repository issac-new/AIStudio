#!/bin/bash
# dr_drill_cron.sh — 季度 DR 恢复演练包装（t_81a275df，gap-20260925-025 后续卡）
# 挂 hermes cron no_agent 模式：stdout 直接投递；3/3 全过 = 静默（空 stdout 不投递，watchdog 惯例）
# 告警三路（<3/3 时全触发）：
#   1. 本脚本 stdout → cron deliver 投递（deliver=all，解析失败亦有下两路兜底）
#   2. ~/.hermes/logs/dr-drill-cron.log 标记行（DR_DRILL ALERT + STALE_BACKUP token，
#      与 tupang-auto-push.sh 重写版约定对齐，供现有/future watchdog grep）
#   3. 非 0 退出码 → jobs.json last_status=error（hermes cron list 可见）
# 预检：演练器本体缺失也告警——workspace 全损时演练器自身必须还能叫（exit 9）

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

DRILL="/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench/gap_workspaces/gap-20260925-025/scripts/run_dr_drill.sh"
LOG="$HOME/.hermes/logs/dr-drill-cron.log"
TS="$(date '+%F %T')"

mkdir -p "$(dirname "$LOG")"

# ── 预检：演练器可达性（DR 最高级事件：被保护对象全损）────────────
if [ ! -f "$DRILL" ]; then
    echo "🚨 DR_DRILL ALERT [STALE_BACKUP]: 演练器本体不可达: $DRILL"
    echo "workspace 可能全损——请立即人工核查备份与远端仓库状态"
    echo "$TS DR_DRILL ALERT [STALE_BACKUP] drill script MISSING: $DRILL (workspace compromised?)" >> "$LOG"
    exit 9
fi

# ── 执行演练（timeout 硬顶 900s：首基线 S1 62s+S3 clone 99s，总<3min，5 倍余量）──
OUT="$(timeout 900 bash "$DRILL" all 2>&1)"
RC=$?

# 演练脚本退出码语义: 0 = 3/3 全过；1..3 = 未通过场景数；124 = 超时
if [ "$RC" -eq 0 ]; then
    # 健康即静默：无 stdout（cron 不投递），仅日志留痕
    REPORT_PATH=$(echo "$OUT" | grep -oE 'results/dr-drill-report-[0-9-]+\.md' | head -1)
    echo "$TS DR_DRILL PASS 3/3 report=${REPORT_PATH:-unknown} — 健康静默" >> "$LOG"
    exit 0
fi

# ── 未全过（<3/3）或超时：三路告警 ──────────────────────────────
if [ "$RC" -eq 124 ]; then
    REASON="演练超时(>900s)被硬顶终止"
else
    REASON="演练通过率不足（exit=${RC}，未通过场景数，全过应=0）"
fi

# 路径2: 标记行落日志（供 watchdog grep）
echo "$TS DR_DRILL ALERT [STALE_BACKUP]: $REASON" >> "$LOG"
echo "$OUT" | grep -E '通过:|DEGRADED|FAIL|🚨|领先|远端不可达' >> "$LOG" 2>/dev/null || true

# 路径1: stdout → cron deliver 投递（人读的摘要）
echo "🚨 DR_DRILL ALERT [STALE_BACKUP]: 季度恢复演练未全过 — $REASON"
echo "---"
echo "$OUT" | grep -E '场景|通过:|PASS|FAIL|DEGRADED|🚨|领先|远端|报告:|证据:' || true
echo "---"
echo "完整报告见 workspace life-workbench/gap_workspaces/gap-20260925-025/results/ 最新时间戳文件"

exit "$RC"   # 路径3: 非 0 退出码 → jobs.json last_status=error
