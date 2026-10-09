#!/bin/bash
# run-driver-supervisor.sh —— 推演驱动自愈监督器（2026-10-09 静默死亡事故根治）
#
# 事故形态（run12 实录）：驱动 bash 遭单 pid SIGTERM 静默死亡（EXIT trap 清锁、无 FAIL 行，
# 28 分钟空窗）；信号来源 macOS 不可考（双监管者抢驱动为最强嫌疑）。修复哲学：不追凶，
# 让击杀失效——驱动死亡后 30s 内自动按断点续跑（START_STEP 各段 done 键幂等跳过，
# 天然防重派），直到 report_done 落键才退出。
#
# 用法: nohup bash mux/run-driver-supervisor.sh --run <RUN_ID> [--start-step devimpl] \
#         [--sim-root /Volumes/nvme2230/lab/ncwk-sim-mux] > <sim-root>/logs/<RUN>-supervisor.log 2>&1 &
# 停止: touch <sim-root>/var/<RUN>-supervisor.stop（优雅退）或 kill 监督器（勿 kill 驱动——
#       会被拉起；真要停驱动先 touch stop 文件让监督器退场）
set -uo pipefail
export LC_ALL=C

RUN_ID="" START_STEP="devimpl" SIM_ROOT="${AIPAY_SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --run) RUN_ID="${2:-}"; shift 2 ;;
    --start-step) START_STEP="${2:-}"; shift 2 ;;
    --sim-root) SIM_ROOT="${2:-}"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done
[[ -n "$RUN_ID" ]] || { echo "need --run"; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE="$SIM_ROOT/runs/$RUN_ID/state.env"
LOGS="$SIM_ROOT/logs"
STOPFLAG="$SIM_ROOT/var/$RUN_ID-supervisor.stop"
LOCKDIR="$SIM_ROOT/.driver.lock.d"

note() { echo "[supervisor $(date '+%F %H:%M:%S')] $*"; }

note "启动：RUN_ID=$RUN_ID START_STEP=$START_STEP（report_done 落键即退；stop 文件=$STOPFLAG）"
while true; do
  [[ -f "$STOPFLAG" ]] && { note "stop 文件在位，监督器退出"; rm -f "$STOPFLAG"; exit 0; }
  if grep -q '^report_done=' "$STATE" 2>/dev/null; then
    note "report_done 已落键，监督器功成身退"
    exit 0
  fi
  if pgrep -f "bash aipay-scenario.sh" >/dev/null 2>&1; then
    sleep 30
    continue
  fi
  # 陈锁兜底（持锁者已死才清——活锁不动，防误清在跑驱动的锁）
  if [[ -f "$LOCKDIR/info" ]]; then
    LPID=$(sed -n 's/^pid=\([0-9]*\).*/\1/p' "$LOCKDIR/info" 2>/dev/null)
    if [[ -z "$LPID" ]] || ! kill -0 "$LPID" 2>/dev/null; then
      note "清陈锁（持锁者 ${LPID:-空} 已死）"
      rm -rf "$LOCKDIR"
    else
      note "锁持有者 $LPID 活着但无驱动进程匹配——等待其退出，不抢锁"
      sleep 30
      continue
    fi
  fi
  note "驱动缺席，断点续跑（START_STEP=$START_STEP）"
  ( cd "$SCRIPT_DIR/.." && RUN_ID="$RUN_ID" START_STEP="$START_STEP" bash aipay-scenario.sh >> "$LOGS/$RUN_ID-driver.log" 2>&1 )
  RC=$?
  note "驱动退出 rc=$RC（${STATE} 无 report_done 键——30s 后按断点续跑）"
  sleep 30
done
