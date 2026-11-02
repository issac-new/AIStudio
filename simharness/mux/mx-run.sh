#!/bin/bash
# mx-run.sh — 推演单入口：监督器＋驱动一体拉起（2026-11-02 run25 实锤立项）
#
# 事故形态：README 快速上手教「nohup bash aipay-scenario.sh」裸跑驱动——run25 该形态
# 实跑 21:07 熔断退出后 34 分钟无人拉起（run24 靠值守人肉挂监督器掩盖了缺口；监督器
# 是驱动生命周期的自愈层，没有它开跑=熔断即断摆）。本入口把「带监督器开跑」变成
# 缺省且唯一顺手的事：
#   bash mux/mx-run.sh --run <RUN_ID> [--start-step <step>] [--rfd RFD-00X]
# 幂等：同 RUN 监督器已在跑→只报在位不重复拉；stop 文件在位→明示先清。
# 裸跑（调试用）须显式 --no-supervisor，打印警告。
# 退役口径：README/运维文档不再教裸跑 aipay-scenario.sh。
set -uo pipefail
export LC_ALL=C
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SIM_ROOT="${SIM_ROOT:-/Users/cuishi/lab/ncwk-sim-mux}"

RUN_ID="" START_STEP="" RFD_ID="" NO_SUP=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --run) RUN_ID="${2:-}"; shift 2 ;;
    --start-step) START_STEP="${2:-}"; shift 2 ;;
    --rfd) RFD_ID="${2:-}"; shift 2 ;;
    --no-supervisor) NO_SUP=1; shift ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done
[[ -n "$RUN_ID" ]] || { echo "用法: bash mux/mx-run.sh --run <RUN_ID> [--start-step <step>] [--rfd RFD-00X] [--no-supervisor]"; exit 2; }

if [[ "$NO_SUP" = 1 ]]; then
  echo "[mx-run] ⚠ 裸跑模式（--no-supervisor）：熔断退出后无自动续跑——仅限调试。"
  cd "$SCRIPT_DIR/.." || exit 1
  exec bash aipay-scenario.sh
fi

# 幂等：同 RUN 监督器在位即收口
if pgrep -f "run-driver-supervisor.sh --run $RUN_ID" >/dev/null 2>&1; then
  echo "[mx-run] 监督器已在跑（RUN=$RUN_ID）——驱动生命周期由其接管，勿重复操作。"
  exit 0
fi
STOPF="$SIM_ROOT/var/$RUN_ID-supervisor.stop"
if [[ -f "$STOPF" ]]; then
  echo "[mx-run] stop 文件在位（$STOPF）——上一监督器已预约退出。确认后 rm 该文件再重跑本入口。"
  exit 3
fi

SUP_ARGS=(--run "$RUN_ID")
[[ -n "$START_STEP" ]] && SUP_ARGS+=(--start-step "$START_STEP")
SUP_LOG="$SIM_ROOT/logs/$RUN_ID-supervisor.log"
cd "$SCRIPT_DIR" || exit 1
echo "[mx-run] 拉起监督器（RUN=$RUN_ID START_STEP=${START_STEP:-devimpl}；监督器自拉驱动、report_done 自退）"
nohup bash "$SCRIPT_DIR/run-driver-supervisor.sh" "${SUP_ARGS[@]}" >> "$SUP_LOG" 2>&1 &
echo "[mx-run] supervisor pid=$! log=$SUP_LOG"
