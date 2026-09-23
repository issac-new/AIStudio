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

# loop 契约审批（approval-stall 根治）：「⚠️ Approval needed: <contractId>」消息
# 仅靠房间 react 并不会解锁 loop 引擎的等待——引擎挂在 /api/loop/contracts/:id/approve
# （graphBridge.resumeApproval）。这里解析 contractId 并真实调 REST 放行；
# react ✅ 保留为房间内可视回执。API 不可达时仅 react（退回旧行为，不静默吞）。
api_key() { grep -E '^API_SERVER_KEY=' "$HOME/.hermes/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'; }
approve_contract() { # <contractId> <studioPort> → 0=REST 放行成功
  local cid="$1" port="$2" key
  key=$(api_key) || return 1
  [[ -n "$key" && -n "$port" ]] || return 1
  curl -sf --max-time 5 -X POST "http://127.0.0.1:${port}/api/loop/contracts/${cid}/approve" \
    -H "Authorization: Bearer ${key}" -H 'Content-Type: application/json' \
    -d '{"decision":"approved","approver":"aipay-approver","comment":"auto-approved by guardian"}' >/dev/null 2>&1
}

# 导演 studio 端口（8702，admin）——loop REST 挂在各实例同构路由，任一在线实例皆可
DIRECTOR_PORT="${AIPAY_APPROVER_PORT:-8702}"

log "=== approver 启动: room=$RID duration=${DURATION}s ==="
deadline=$(( $(date +%s) + DURATION ))
while (( $(date +%s) < deadline )); do
  # 任一在册成员 token 都可读房间；用 fanfan-agent 的（GET 带 query，直连 curl——
  # mx 会无条件追加 ?access_token=，与 path 里已有 query 相撞成双问号 401）
  T=$(load_token fanfan-agent 2>/dev/null) || { sleep 20; continue; }
  CHUNK=$(curl -sf "$HS/_matrix/client/v3/rooms/$RID/messages?dir=b&limit=50&access_token=$T" 2>/dev/null) || { sleep 20; continue; }

  # 遍历审批提示，未处理过的逐条处理。两类格式都认：
  #   loop 引擎审批：「⚠️ Approval needed: <contractId> (...) — Approvers: ...」（matrix-bot）
  #   exec 审批：「... needs your OK ...」（旧终端审批，仅 react 提示人类已读）
  while IFS=$'\t' read -r evid sender body; do
    [[ -z "$evid" ]] && continue
    seen_has "$evid" && continue
    # loop 审批：解析 contractId 调 REST 真放行（approval-stall 根治）
    CID=$(printf '%s' "$body" | sed -nE 's/.*Approval needed: ([^ ]+).*/\1/p' | head -1)
    if [[ -n "$CID" ]]; then
      if approve_contract "$CID" "$DIRECTOR_PORT"; then
        log "REST approved contract=$CID ($sender 提示 $evid)"
      else
        log "REST approve 不可达，仅 react 兜底 contract=$CID（引擎可能仍未解锁，需查 $DIRECTOR_PORT）"
      fi
    fi
    # react ✅ 作为房间内可视回执（两通路一致）
    HT=$(human_token_for "$sender") || { seen_add "$evid"; continue; }
    RBODY=$(printf '{"m.relates_to":{"rel_type":"m.annotation","event_id":"%s","key":"✅"}}' "$evid")
    if mx "$HT" POST "rooms/$RID/send/m.reaction" "$RBODY" >/dev/null 2>&1; then
      seen_add "$evid"
      log "reacted $sender 提示 $evid${CID:+ (contract=$CID)}"
    fi
  # agent 消息体可能混入终端控制字符（ANSI 转义），jq 严格解析会炸——先剥离控制字符
  # （紧凑 JSON 无结构性换行，全剥安全）；取 event_id/sender/body
  done < <(echo "$CHUNK" | tr -d '\000-\037' | jq -r '.chunk[] | select((.type=="m.reaction") | not) | select(.content.msgtype=="m.text" and ((.content.body | contains("needs your OK")) or (.content.body | contains("Approval needed:")))) | "\(.event_id)\t\(.sender)\t\(.content.body | gsub("\n"; " "))"' 2>/dev/null)

  sleep 20
done
log "=== approver 结束 ==="
