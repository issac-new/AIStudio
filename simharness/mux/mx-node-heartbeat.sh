#!/bin/bash
# mx-node-heartbeat.sh — 节点心跳采样守护（三机补强层；agent 机与导演机各自常驻）
#
# 把本机各档案的判活采样（最近工作行时间戳/尾部错误态/日志字节）发进 MX_HB_ROOM
# 心跳房，供导演机 wait_alive_truth 远程判活（mx-hb.sh 导演侧消费）。
# 用法：
#   bash mux/mx-node-heartbeat.sh             # 常驻循环（MX_HB_INTERVAL 默认 30s）
#   bash mux/mx-node-heartbeat.sh --once      # 单拍（schtasks/看护环定频拉起；幂等）
#   bash mux/mx-node-heartbeat.sh --dry-run   # 只打印载荷不发帖（自检/守门测试）
# env：MX_HB_ROOM=房间id（常驻/单拍必配，缺=退出 1）；MX_HB_USER=发帖账号（缺省本节点
#      首个档案）；MX_HB_INTERVAL（默认 30）；停守护=touch <SIM_ROOT>/var/hb-stop。
# 失败面：单拍失败只记 $SIM_ROOT/logs/heartbeat.log 不重试不退出（下一拍覆盖）。
set -uo pipefail
export LC_ALL=C
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/mx-lib.sh"    # 自带 mx-platform/mx-node/SIM_ROOT 解析
source "$SCRIPT_DIR/mx-hb.sh"

HB_LOG="$LOGS_DIR/heartbeat.log"
hb_log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$HB_LOG" 2>/dev/null || true; }

send_once() { # [dry] → 0=已发/已打印
  local payload tok
  payload=$(hb_node_payload) || { hb_log "采样失败（hb_node_payload rc!=0）"; return 1; }
  if [[ "${1:-}" == dry ]]; then printf '%s\n' "$payload"; return 0; fi
  local poster="${MX_HB_USER:-$(node_users | head -1)}"
  tok="$(load_token "$poster" 2>/dev/null)" || { hb_log "token 缺失（$poster）"; return 1; }
  [[ -n "$tok" && "$tok" != "null" ]] || { hb_log "token 空（$poster）"; return 1; }
  mx "$tok" POST "rooms/${MX_HB_ROOM}/send/m.room.message" \
    "{\"msgtype\":\"m.text\",\"body\":$(printf '%s' "$payload" | jq -Rs .)}" >/dev/null 2>&1 \
    || { hb_log "发送失败（room=${MX_HB_ROOM:-未配}）"; return 1; }
  return 0
}

case "${1:-loop}" in
  --dry-run) send_once dry; exit $? ;;
  --once)
    [[ -n "${MX_HB_ROOM:-}" ]] || { echo "MX_HB_ROOM 未配置（--once 需心跳房 id）" >&2; exit 1; }
    send_once; exit $? ;;
esac

[[ -n "${MX_HB_ROOM:-}" ]] || { echo "常驻模式需 MX_HB_ROOM（心跳房 id）" >&2; exit 1; }
hb_log "心跳守护启动：$(node_mode_desc) interval=${MX_HB_INTERVAL:-30}s room=$MX_HB_ROOM"
while [[ ! -f "$SIM_ROOT/var/hb-stop" ]]; do
  send_once || true
  sleep "${MX_HB_INTERVAL:-30}"
done
hb_log "hb-stop 在位，心跳守护退出"
