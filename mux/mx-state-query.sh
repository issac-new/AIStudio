#!/bin/bash
# mx-state-query.sh — 推演状态单一查询入口（2026-10-15 姿态治理轮，批次一）
#
# 定位：统筹层（zcode workflow 子智能体）与人共用的一只读查询面。此前查询散落
# 各处翻日志/state.env（world.run 无 shell 管道、files.* 读不到 workspace 外
# SIM_ROOT——三会话方案确立本脚本为唯一入口）。只读：不写任何文件、不改任何键。
#
# 用法：
#   bash mux/mx-state-query.sh --run <RUN_ID> [summary|gates|steps|state|posture|ledger]
#     summary  缺省。姿态+闸态+最近完成步+代偿台账摘要一屏
#     gates    关卡类键（g*/security*/humangate/report_done 等）
#     steps    步骤完成标记（*_done / *_pass 等）
#     state    state.env 全量（--key <pat> 过滤）
#     posture  当前姿态
#     ledger   代偿台账摘要（透传 mx-compensation-ledger.sh summary）
# 环境优先级：--run 参数 ＞ RUN_ID ＞ var/current-state.env 软链。SIM_ROOT 走
#   SIM_ROOT/AIPAY_SIM_ROOT 环境变量，缺省 nvme 卷正本。
set -u
LC_ALL=C

SIM_ROOT="${SIM_ROOT:-${AIPAY_SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}}"
RUN_ID_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --run) RUN_ID_ARG="${2:-}"; shift 2 ;;
    --sim-root) SIM_ROOT="${2:-}"; shift 2 ;;
    *) break ;;
  esac
done
if [ -n "$RUN_ID_ARG" ]; then RUN_ID="$RUN_ID_ARG"; fi
if [ -z "${RUN_ID:-}" ]; then
  _ln=$(readlink "$SIM_ROOT/var/current-state.env" 2>/dev/null || true)
  if [ -n "$_ln" ]; then RUN_ID=$(basename "$(dirname "$_ln")")
  else echo "need --run <RUN_ID>（或 SIM_ROOT/var/current-state.env 锚）" >&2; exit 2; fi
fi
STATE="$SIM_ROOT/runs/$RUN_ID/state.env"
HERE="$(cd "$(dirname "$0")" && pwd)"
CMD="${1:-summary}"; [ $# -gt 0 ] && shift || true

_q() { grep -s "^$1=" "$STATE" 2>/dev/null | head -1 | cut -d= -f2-; }

case "$CMD" in
  posture)
    P=$(_q posture); echo "posture=${P:-unset（缺省 standard）}"
    ;;
  gates)
    [ -f "$STATE" ] || { echo "(state.env 不存在)" >&2; exit 1; }
    grep -Es '^(g[1-6][a-z_]*|security_[a-z_]+|humangate[a-z_]*|approved_|report_done|close_done)' "$STATE" || echo "(无闸键在案)"
    ;;
  steps)
    [ -f "$STATE" ] || { echo "(state.env 不存在)" >&2; exit 1; }
    grep -Es '^([a-z0-9_]+_(done|pass|verified|marker))=' "$STATE" | grep -Ev '^(security|g[1-6])' || echo "(无完成标记)"
    ;;
  state)
    [ -f "$STATE" ] || { echo "(state.env 不存在)" >&2; exit 1; }
    if [ -n "${1:-}" ]; then grep -E "$1" "$STATE" || true; else cat "$STATE"; fi
    ;;
  ledger)
    RUN_ID="$RUN_ID" SIM_ROOT="$SIM_ROOT" bash "$HERE/mx-compensation-ledger.sh" --run "$RUN_ID" summary
    ;;
  summary)
    echo "== run $RUN_ID =="
    P=$(_q posture); echo "姿态: ${P:-unset（缺省 standard）}"
    echo "-- 闸态 --"
    grep -Es '^(g[1-6][a-z_]*|security_[a-z_]+|humangate[a-z_]*|report_done|close_done)' "$STATE" 2>/dev/null | sed 's/^/  /' || echo "  (无)"
    echo "-- 最近完成（按文件序末 8 行）--"
    grep -Es '^[a-z0-9_]+_done=' "$STATE" 2>/dev/null | tail -8 | sed 's/^/  /' || echo "  (无)"
    echo "-- 代偿台账 --"
    RUN_ID="$RUN_ID" SIM_ROOT="$SIM_ROOT" bash "$HERE/mx-compensation-ledger.sh" --run "$RUN_ID" summary | sed 's/^/  /'
    ;;
  *)
    echo "unknown cmd: $CMD（summary|gates|steps|state|posture|ledger）" >&2; exit 2
    ;;
esac
