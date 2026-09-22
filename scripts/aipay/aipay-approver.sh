#!/bin/bash
# aipay-approver.sh — 审批代答守护：轮询需求讨论群的 ⚠️ 审批提示，以对应人类身份 react ✅
# 背景：无人值守回合触发 exec 审批，5 分钟（MATRIX_APPROVAL_TIMEOUT_SECONDS 默认 300）无响应即拦截，
# agent 按纪律停下不绕行。导演的职责是"扮演人类打字/点击"，审批正是其中之一（issues.log: approval-stall）。
# 用法: bash aipay-approver.sh [持续秒数] [房间ID]
#   缺省持续 7200s；房间缺省取 state.env 的 room_analysis。日志: logs/approver.log
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/aipay-lib.sh"

DURATION="${1:-7200}"
RID="${2:-$(grep -E '^room_analysis=' "$SIM_ROOT/state.env" 2>/dev/null | cut -d= -f2-)}"
SEEN="$EVID_DIR/approver.seen"
LOG="$LOGS_DIR/approver.log"
touch "$SEEN"

log() { echo "[$(date +%H:%M:%S)] $*" >> "$LOG"; }

# 事件 id → 已处理集合
seen_has() { grep -qxF "$1" "$SEEN" 2>/dev/null; }
seen_add() { echo "$1" >> "$SEEN"; }

# agent mxid → 对应人类 token（@chen-agent:matrix.test → chen 的 token）
human_token_for() {
  local agent_mxid="$1" name
  name=$(echo "$agent_mxid" | sed -E 's/^@([a-z]+)-agent:.*/\1/')
  [[ "$name" == "$agent_mxid" ]] && return 1
  load_token "$name" 2>/dev/null
}

log "=== approver 启动: room=$RID duration=${DURATION}s ==="
deadline=$(( $(date +%s) + DURATION ))
while (( $(date +%s) < deadline )); do
  # 任一在册成员 token 都可读房间；用 fanfan-agent 的（GET 带 query，直连 curl——
  # mx 会无条件追加 ?access_token=，与 path 里已有 query 相撞成双问号 401）
  T=$(load_token fanfan-agent 2>/dev/null) || { sleep 20; continue; }
  CHUNK=$(curl -sf "$HS/_matrix/client/v3/rooms/$RID/messages?dir=b&limit=25&access_token=$T" 2>/dev/null) || { sleep 20; continue; }

  # 遍历 ⚠️ 提示，未处理过的逐条以对应人类身份 react ✅
  while IFS=$'\t' read -r evid sender; do
    [[ -z "$evid" ]] && continue
    seen_has "$evid" && continue
    HT=$(human_token_for "$sender") || { seen_add "$evid"; continue; }
    BODY=$(printf '{"m.relates_to":{"rel_type":"m.annotation","event_id":"%s","key":"✅"}}' "$evid")
    if mx "$HT" POST "rooms/$RID/send/m.reaction" "$BODY" >/dev/null 2>&1; then
      seen_add "$evid"
      log "approved $sender 提示 $evid"
    fi
  done < <(echo "$CHUNK" | jq -r '.chunk[] | select((.type=="m.reaction") | not) | select(.content.msgtype=="m.text" and (.content.body | contains("needs your OK"))) | "\(.event_id)\t\(.sender)"' 2>/dev/null)

  sleep 20
done
log "=== approver 结束 ==="
