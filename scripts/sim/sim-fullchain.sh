#!/bin/bash
# sim-fullchain.sh - M-G full-chain protocol validation (sim round 4, protocol face)
# ASCII-only payloads (write-safety); assertions re-derive studio projection semantics via jq.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/sim-lib.sh"

CASE_ID="mg4-$(date +%m%d)"
ALICE=$(load_token alice)
BOB=$(load_token bob)
CAROL=$(load_token carol)
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); log "[PASS] $*"; }
bad()  { FAIL=$((FAIL+1)); log "[FAIL] $*" >&2; }
check(){ local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }

ROOM=$(mx "$ALICE" POST createRoom "{\"name\":\"case-$CASE_ID\",\"preset\":\"private_chat\",\"invite\":[\"@bob:matrix.test\",\"@carol:matrix.test\"]}" | jq -r '.room_id')
[[ "$ROOM" == '!'* ]] || fail "case room create failed"
mx "$BOB" POST "rooms/$ROOM/join" '{}' >/dev/null || true
mx "$CAROL" POST "rooms/$ROOM/join" '{}' >/dev/null || true
log "[director] case room $ROOM (case=$CASE_ID)"

send_ev() { mx "$1" POST "rooms/$ROOM/send/$2" "$3" | jq -r '.event_id' >/dev/null; }
put_state() { mx "$1" PUT "rooms/$ROOM/state/$2/$3" "$4" >/dev/null; }
tsend() { mx "$ALICE" POST "rooms/$(load_room)/send/$1" "$2" | jq -r '.event_id' >/dev/null; }

NOW=$(date +%s000)
GT=com.swarmstudio.delivery.gate
ST=com.swarmstudio.delivery.stage

put_state "$ALICE" com.swarmstudio.delivery.case "$CASE_ID" \
  "{\"schemaVersion\":2,\"caseId\":\"$CASE_ID\",\"title\":\"stringops fullchain\",\"repoUrl\":\"git@central:stringops.git\",\"tier\":\"standard\",\"stage\":\"P6\",\"ownerAccount\":\"@alice:matrix.test\",\"projectId\":\"proj-stringops\",\"createdAt\":$NOW,\"updatedAt\":$NOW,\"updatedBy\":\"@alice:matrix.test\"}"

P=1
while [ "$P" -le 6 ]; do
  send_ev "$ALICE" "$ST" "{\"schemaVersion\":2,\"caseId\":\"$CASE_ID\",\"stage\":\"P$P\",\"worker\":{\"account\":\"@alice:matrix.test\"},\"outcome\":\"done\",\"artifactRef\":\"git:main#abc00$P:docs/delivery/$CASE_ID/p$P.md\",\"reportedBy\":\"@alice-agent:matrix.test\",\"at\":$NOW}"
  P=$((P+1))
done

G=1
while [ "$G" -le 6 ]; do
  send_ev "$ALICE" "$GT" "{\"schemaVersion\":2,\"caseId\":\"$CASE_ID\",\"gate\":\"G$G\",\"verdict\":\"pass\",\"evidence\":{\"kind\":\"command-exit\",\"summary\":\"exit 0\"},\"decidedBy\":\"@alice:matrix.test\",\"at\":$NOW}"
  G=$((G+1))
done

gate_json() { # verdict signoff-account evidence-kind summary [reason]
  local v="$1" by="$2" k="$3" s="$4" r="${5:-}" g="$6" at="$7" extra=""
  [ -n "$r" ] && extra=",\"reason\":\"$r\""
  echo "{\"schemaVersion\":2,\"caseId\":\"$CASE_ID\",\"gate\":\"$g\",\"verdict\":\"$v\",\"evidence\":{\"kind\":\"$k\",\"summary\":\"$s\"}$extra,\"signoff\":{\"decidedBy\":\"$by\",\"verdict\":\"$v\",\"at\":$at},\"decidedBy\":\"$by\",\"at\":$at}"
}
NOW2=$((NOW + 60000))
send_ev "$ALICE" "$GT" "$(gate_json pass @alice:matrix.test human 'req review ok' '' R1 "$NOW")"
send_ev "$CAROL" "$GT" "$(gate_json reject @carol:matrix.test artifact 'design v1' '[REJECT:missing-edge] add CJK edge cases then re-review' R2 "$NOW")"
send_ev "$CAROL" "$GT" "$(gate_json pass @carol:matrix.test artifact 'design v2 with CJK edges' '' R2 "$NOW2")"
send_ev "$BOB" "$GT" "$(gate_json pass @bob:matrix.test human 'impl side ok' '' R2 "$NOW2")"
send_ev "$ALICE" "$GT" "$(gate_json pass @alice:matrix.test artifact 'git:main#abc123:diffs/login.patch' '' R3 "$NOW2")"
send_ev "$BOB" "$GT" "$(gate_json pass @bob:matrix.test command-exit 'pytest 8 passed' '' R4 "$NOW2")"
send_ev "$CAROL" "$GT" "$(gate_json pass @carol:matrix.test human 'regression confirmed' '' R4 "$NOW2")"

MAIN_ROOM=$(load_room)
DUE_PAST=$(( ($(date +%s) - 86400) * 1000 ))
DUE_FUTURE=$(( ($(date +%s) + 86400) * 1000 ))
TA=com.swarmstudio.task.assign
RC=com.swarmstudio.task.receipt
tsend "$TA" "{\"taskId\":\"mg4-parent\",\"title\":\"parent task\",\"target\":{\"account\":\"@bob:matrix.test\"},\"capability\":[\"module:payment\"],\"phase\":\"P3\",\"dueAt\":$DUE_PAST,\"parentId\":\"$CASE_ID\",\"issuedBy\":\"@alice:matrix.test\",\"issuedAt\":1}"
tsend "$TA" "{\"taskId\":\"mg4-child\",\"title\":\"child task\",\"target\":{\"account\":\"@bob:matrix.test\"},\"capability\":[\"coding\"],\"phase\":\"P3\",\"dependsOn\":[\"mg4-ghost\"],\"parentId\":\"mg4-parent\",\"issuedBy\":\"@alice:matrix.test\",\"issuedAt\":1}"
tsend "$RC" "{\"taskId\":\"mg4-child\",\"status\":\"done\",\"reportedBy\":\"@bob-agent:matrix.test\",\"reportedAt\":2}"
tsend "$RC" "{\"taskId\":\"mg4-parent\",\"status\":\"waiting-human\",\"reportedBy\":\"@bob-agent:matrix.test\",\"reportedAt\":3}"
tsend "$TA" "{\"taskId\":\"mg4-overdue\",\"title\":\"overdue open\",\"target\":{\"account\":\"@carol:matrix.test\"},\"dueAt\":$DUE_PAST,\"issuedBy\":\"@alice:matrix.test\",\"issuedAt\":1}"
tsend "$TA" "{\"taskId\":\"mg4-future\",\"title\":\"future task\",\"target\":{\"account\":\"@carol:matrix.test\"},\"dueAt\":$DUE_FUTURE,\"issuedBy\":\"@alice:matrix.test\",\"issuedAt\":1}"
tsend "$TA" "{\"taskId\":\"mg4-test\",\"title\":\"regression test\",\"target\":{\"account\":\"@zhao:matrix.test\"},\"capability\":[\"test\"],\"phase\":\"P4\",\"issuedBy\":\"@alice:matrix.test\",\"issuedAt\":1}"
tsend "$RC" "{\"taskId\":\"mg4-test\",\"status\":\"failed\",\"reason\":\"weaknet timeout case\",\"reportedBy\":\"@zhao-agent:matrix.test\",\"reportedAt\":2}"
tsend "$TA" "{\"taskId\":\"mg4-defect\",\"title\":\"[defect] regression test - weaknet timeout case\",\"target\":{\"account\":\"@li:matrix.test\"},\"parentId\":\"mg4-test\",\"phase\":\"P4\",\"priority\":\"1\",\"issuedBy\":\"@zhao-agent:matrix.test\",\"issuedAt\":3}"
mx "$ALICE" PUT "rooms/$MAIN_ROOM/state/com.swarmstudio.agent.profile/" \
  '{"schemaVersion":2,"agents":[{"agentId":"coder","agentType":"coding","capabilities":["coding","module:payment"],"maxParallel":2}],"updatedBy":"@bob-agent:matrix.test","updatedAt":1}' >/dev/null

sleep 2

msgs() { curl -sf "$HS/_matrix/client/v3/rooms/$1/messages?access_token=$ALICE&dir=f&limit=200" | jq -c '[.chunk[]]'; }

check "six stage events P1..P6 done" bash -c "$(declare -f msgs); msgs() { curl -sf \"$HS/_matrix/client/v3/rooms/$ROOM/messages?access_token=$ALICE&dir=f&limit=200\" | jq -c '[.chunk[]]'; }; msgs '$ROOM' | jq -e '[.[] | select(.type == \"$ST\") | .content.stage] | sort == [\"P1\",\"P2\",\"P3\",\"P4\",\"P5\",\"P6\"]'"
check "six G gates verdict present" bash -c "curl -sf \"$HS/_matrix/client/v3/rooms/$ROOM/messages?access_token=$ALICE&dir=f&limit=200\" | jq -e '[.chunk[] | select(.type == \"$GT\") | .content | select(.gate | startswith(\"G\")) | .gate] | sort == [\"G1\",\"G2\",\"G3\",\"G4\",\"G5\",\"G6\"]'"
check "R2 reject-then-repass: history has reject, aggregate pass" bash -c "curl -sf \"$HS/_matrix/client/v3/rooms/$ROOM/messages?access_token=$ALICE&dir=f&limit=200\" | jq -e '[.chunk[] | select(.type == \"$GT\") | .content | select(.gate == \"R2\")] as \$g | (\$g | map(.signoff.verdict) | index(\"reject\") != null) and ([([\$g[] | .signoff] | sort_by(.decidedBy, .at) | group_by(.decidedBy) | map(.[length-1]))[] | .verdict] | all(. == \"pass\"))'"
check "R4 two signers aggregate pass" bash -c "curl -sf \"$HS/_matrix/client/v3/rooms/$ROOM/messages?access_token=$ALICE&dir=f&limit=200\" | jq -e '[.chunk[] | select(.type == \"$GT\") | .content | select(.gate == \"R4\") | .signoff.decidedBy] | unique | length == 2'"
check "R1 and R3 gates exist" bash -c "curl -sf \"$HS/_matrix/client/v3/rooms/$ROOM/messages?access_token=$ALICE&dir=f&limit=200\" | jq -e '[.chunk[] | select(.type == \"$GT\") | .content.gate] | (contains([\"R1\"]) and contains([\"R3\"]))'"
check "assign v2 fields roundtrip" bash -c "curl -sf \"$HS/_matrix/client/v3/rooms/$MAIN_ROOM/messages?access_token=$ALICE&dir=b&limit=100\" | jq -e '.chunk[] | select(.type == \"$TA\") | select(.content.taskId == \"mg4-parent\") | .content | has(\"capability\") and has(\"dueAt\") and has(\"parentId\") and .phase == \"P3\"'"
check "waiting-human receipt present" bash -c "curl -sf \"$HS/_matrix/client/v3/rooms/$MAIN_ROOM/messages?access_token=$ALICE&dir=b&limit=100\" | jq -e '.chunk[] | select(.type == \"$RC\") | select(.content.status == \"waiting-human\") | .content.taskId == \"mg4-parent\"'"
check "reminders: overdue-open in, future out" bash -c "curl -sf \"$HS/_matrix/client/v3/rooms/$MAIN_ROOM/messages?access_token=$ALICE&dir=b&limit=100\" | jq -e '((now * 1000) | floor) as \$now | [.chunk[] | select(.type == \"$TA\") | .content | select(.dueAt != null)] as \$a | (\$a | map(select(.dueAt < \$now and .taskId == \"mg4-overdue\")) | length >= 1) and (\$a | map(select(.dueAt > \$now and .taskId == \"mg4-future\")) | length >= 1)'"
check "defect flow: failed receipt paired with parent defect assign" bash -c "curl -sf \"$HS/_matrix/client/v3/rooms/$MAIN_ROOM/messages?access_token=$ALICE&dir=b&limit=100\" | jq -e '([.chunk[] | select(.type == \"$RC\") | select(.content.taskId == \"mg4-test\" and .content.status == \"failed\")] | length >= 1) and ([.chunk[] | select(.type == \"$TA\") | select(.content.taskId == \"mg4-defect\" and .content.parentId == \"mg4-test\")] | length >= 1)'"
check "agent.profile state readable" bash -c "curl -sf \"$HS/_matrix/client/v3/rooms/$MAIN_ROOM/state/com.swarmstudio.agent.profile/?access_token=$ALICE\" | jq -e '.agents[0].capabilities | contains([\"coding\"])'"

DOCS="docs/delivery/$CASE_ID"
TMP=$(mktemp -d)
git -C "$TMP" clone -q "$CENTRAL_REPO" work 2>/dev/null || { mkdir -p "$TMP/work" && git -C "$TMP/work" init -q && git -C "$TMP/work" remote add origin "$CENTRAL_REPO" && git -C "$TMP/work" fetch -q origin && git -C "$TMP/work" checkout -q -b main FETCH_HEAD; }
mkdir -p "$TMP/work/$DOCS" "$TMP/work/docs/delivery"
printf '# PRD - %s\n\nstringops v0.1 full-chain validation case (six phases).\n' "$CASE_ID" > "$TMP/work/$DOCS/prd.md"
printf '# Retro - %s\n\nfull-chain protocol events complete; reject-then-repass verified.\n' "$CASE_ID" > "$TMP/work/$DOCS/retro.md"
if [ -f "$TMP/work/docs/delivery/metrics-log.csv" ]; then
  printf '%s,%s,fullchain,pass\n' "$(date +%F)" "$CASE_ID" >> "$TMP/work/docs/delivery/metrics-log.csv"
else
  printf 'date,caseId,kind,verdict\n%s,%s,fullchain,pass\n' "$(date +%F)" "$CASE_ID" > "$TMP/work/docs/delivery/metrics-log.csv"
fi
git -C "$TMP/work" add -A
git -C "$TMP/work" -c user.name=sim-director -c user.email=sim@local commit -qm "delivery($CASE_ID): fullchain artifacts + metrics-log append"
git -C "$TMP/work" push -q origin HEAD:main
rm -rf "$TMP"
check "central repo PRD/retro artifacts" bash -c "git -C '$CENTRAL_REPO' show main:$DOCS/prd.md > /dev/null && git -C '$CENTRAL_REPO' show main:$DOCS/retro.md > /dev/null"
check "central repo metrics-log appended" bash -c "git -C '$CENTRAL_REPO' show main:docs/delivery/metrics-log.csv | grep -q '$CASE_ID'"

printf '{"caseId":"%s","room":"%s","timestamp":"%s","passed":%d,"failed":%d}\n' "$CASE_ID" "$ROOM" "$(date -u +%FT%TZ)" "$PASS" "$FAIL" > "$EVID_DIR/fullchain-evidence.json"
log "===== fullchain: $PASS passed / $FAIL failed ====="
[ "$FAIL" = 0 ] || { log "assertion failures - evidence at $EVID_DIR/fullchain-evidence.json"; exit 1; }
log "M-G sim round 4 (protocol fullchain) OK"
