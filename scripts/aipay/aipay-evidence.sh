#!/bin/bash
# aipay-evidence.sh — 推演取证：房间消息、kanban 快照、git 真值、问题单汇总
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/aipay-lib.sh"

OUT="$EVID_DIR/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

# 1. 需求讨论群消息全量
RID=$(cat "$CREDS_DIR/../state.env" 2>/dev/null | grep -s '^room_analysis=' | cut -d= -f2- || true)
RID="${RID:-$(grep -s '^room_analysis=' "$SIM_ROOT/state.env" | cut -d= -f2- || true)}"
if [[ -n "$RID" ]]; then
  curl -sf "$HS/_matrix/client/v3/rooms/$RID/messages?access_token=$(load_token fanfan)&dir=f&limit=500" \
    | jq '[.chunk[] | select(.type == "m.room.message") | {sender, ts: .origin_server_ts, body: .content.body}]' \
    > "$OUT/room-analysis-messages.json" || true
  mx_room_members "$(load_token fanfan)" "$RID" > "$OUT/room-analysis-members.txt" || true
fi

# 2. 每实例 kanban 快照
for u in "${INSTANCED_USERS[@]}"; do
  JWT=$(grep -s "^jwt_$u=" "$SIM_ROOT/state.env" | head -1 | cut -d= -f2- || true)
  [[ -z "$JWT" ]] && continue
  curl -sf "http://127.0.0.1:$(studio_port "$u")/api/hermes/kanban" -H "Authorization: Bearer $JWT" \
    > "$OUT/kanban-$u.json" 2>/dev/null || true
done

# 3. git 真值
git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
git -C "$DIRECTOR_CLONE" ls-remote origin > "$OUT/git-refs.txt" 2>/dev/null || true
git -C "$DIRECTOR_CLONE" log --oneline origin/main -20 > "$OUT/git-main-log.txt" 2>/dev/null || true

# 4. 问题单
[[ -f "$EVID_DIR/issues.log" ]] && cp "$EVID_DIR/issues.log" "$OUT/issues.log"

# 5. 场景日志
[[ -f "$EVID_DIR/scenario.log" ]] && cp "$EVID_DIR/scenario.log" "$OUT/scenario.log"

log "取证完成: $OUT"
find "$OUT" -type f | sed "s|$OUT/||"
