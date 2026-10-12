#!/bin/sh
# context_gate_daily.sh — agent context 版本化+回归门禁 cron wrapper (gap-20260925-027)
# 部署位置: ~/.hermes/profiles/platform-ontology-curator/scripts/（cron 脚本只能在
#           本 profile scripts 目录寻址——ontology-metadata-watchdog 报错实证）
# 调用链:   regression(对昨日基线跑 C1-C5) → 结果分支:
#             exit 0 → snapshot 重建基线（滚动今日事实）
#             exit 2 → 保留旧基线+报告落盘（门禁拦截，等人工对账；不自动重建掩盖）
#             exit 3 → 基线缺失 → 首跑 bootstrap：snapshot 建基线
# 日志:     ~/.hermes/logs/context-gate.log
set -u

LOG="$HOME/.hermes/logs/context-gate.log"
SNAP="$HOME/.hermes/bin/context_snapshot.py"
REG="$HOME/.hermes/bin/context_regression.py"

mkdir -p "$(dirname "$LOG")"
echo "---- $(date '+%F %T') context_gate_daily ----" >> "$LOG"

if [ ! -f "$SNAP" ] || [ ! -f "$REG" ]; then
  echo "FATAL: gate scripts missing ($SNAP / $REG)" >> "$LOG"
  exit 3
fi

# 先跑回归（若基线不存在 → exit 3 → bootstrap 建基线）
python3 "$REG" >> "$LOG" 2>&1
rc=$?
echo "regression rc=$rc" >> "$LOG"

case $rc in
  0)  # 通过 → 重建基线（今日事实成为新对照）
      python3 "$SNAP" >> "$LOG" 2>&1
      srcc=$?
      echo "snapshot rc=$srcc" >> "$LOG"
      exit $srcc
      ;;
  2)  # 门禁拦截 → 不重建基线，报告已由 regression 落盘；留人工对账
      echo "GATE BLOCKED: context 工件漂移被拦，基线未重建；详情 $LOG 与 context-baseline/reports/ 最新报告"
      exit 2
      ;;
  *)  # 基线缺失(3)或异常 → bootstrap
      python3 "$SNAP" >> "$LOG" 2>&1
      srcc=$?
      echo "bootstrap rc=$srcc" >> "$LOG"
      exit $srcc
      ;;
esac
