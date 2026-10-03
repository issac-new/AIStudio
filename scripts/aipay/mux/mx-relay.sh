#!/bin/bash
# mx-relay.sh — 推演驱动通用接力器（run8 起取代逐轮手写 runN-relay.sh）
#
# 用法: RUN_ID=<轮次> nohup bash scripts/aipay/mux/mx-relay.sh >> $SIM_ROOT/logs/<RUN_ID>-relay-outer.log 2>&1 &
# 参数: RUN_ID 必填
#
# 设计要点（run6/7 实录沉淀）：
#   1. 运行面自愈（533/534 长效化第二通道）：每次接力前 deploy-agent-runtime --apply
#      + mx_apply_agent_patches——自更新擦除补丁后，下一棒自动恢复，不再依赖人工 git apply。
#   2. 终局判据双信号：scenario.log "全部 gates 执行完毕" 或 state.env report_done=。
#   3. 接力节奏：驱动死亡后 90s 探测周期+拉起后 120s 宽限（run7 实录：杀驱动后 2-4 分钟
#      才接力属正常，勿急判卡死）。
#   4. 幂等护栏：段重入由驱动 step_reached/_done 键保证；本脚本只管拉起。
#   5. 单实例守卫：同机已有其它 mx-relay 实例即退出（防双接力重复拉驱动）。
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/mx-lib.sh"

: "${RUN_ID:?RUN_ID 必填（如 RUN_ID=20261003-v5-run8 nohup bash mx-relay.sh …）}"
STATE="$SIM_ROOT/runs/$RUN_ID/state.env"
LOG="$SIM_ROOT/runs/$RUN_ID/evidence/scenario.log"
RELAY_LOG="$LOGS_DIR/${RUN_ID}-relay.log"
ORDER=(smoke appinit people ba reqgate room dispatch register analysis triage anexec review archgate close plan devimpl defect testpass ready release uat workmgr audit retro ide report)

# 单实例守卫：除自身（$$）外已有 mx-relay 在跑即退出
_others=$(pgrep -f "mx-relay.sh" | /usr/bin/grep -v "^$$\$" || true)
if [[ -n "$_others" ]]; then
  echo "[relay] 已有 mx-relay 实例在跑（pid $_others），本实例退出（防双接力）"
  exit 0
fi

heal_runtime() {
  if [[ -f "$OVERLAY_ROOT/scripts/deploy-agent-runtime.mjs" ]]; then
    ( cd "$OVERLAY_ROOT" && node scripts/deploy-agent-runtime.mjs --apply ) >>"$RELAY_LOG" 2>&1 \
      || echo "[relay $(date +%H:%M:%S)] runtime manifest 自愈告警"
  fi
  mx_apply_agent_patches >>"$RELAY_LOG" 2>&1 \
    || echo "[relay $(date +%H:%M:%S)] 运行时 patch 自愈告警（533/534 可能缺位）"
}

RELAY_N=0
echo "[relay $(date '+%F %H:%M:%S')] 接力器启动（RUN=${RUN_ID}，终局=report_done 或 gates 执行完毕）"
while true; do
  if /usr/bin/grep -q "全部 gates 执行完毕" "$LOG" 2>/dev/null || /usr/bin/grep -q "^report_done=" "$STATE" 2>/dev/null; then
    echo "[relay $(date '+%F %H:%M:%S')] RELAY-FINISHED"
    exit 0
  fi
  if ! pgrep -f "aipay-scenario" >/dev/null 2>&1; then
    # 运行面自愈：自更新擦补丁是驱动夜间死亡主因之一（run7 gate_review jq 崩溃之外的另一类）
    heal_runtime
    LAST=-1
    for i in "${!ORDER[@]}"; do
      /usr/bin/grep -q "^${ORDER[$i]}_done=" "$STATE" 2>/dev/null && LAST=$i
    done
    NEXT="${ORDER[$((LAST+1))]:-report}"
    RELAY_N=$((RELAY_N+1))
    echo "[$(date '+%F %H:%M:%S')] 接力 #${RELAY_N}：START_STEP=$NEXT"
    RUN_ID="$RUN_ID" START_STEP="$NEXT" nohup bash "$OVERLAY_ROOT/scripts/aipay/aipay-scenario.sh" >> "$RELAY_LOG" 2>&1 &
    sleep 120
  fi
  sleep 90
done
