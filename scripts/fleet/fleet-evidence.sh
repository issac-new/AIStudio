#!/bin/bash
# fleet-evidence.sh — 取证 + 验收门断言（独立应用形态专项 + 交付真值）
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/fleet-lib.sh"

ROOM_ID=$(load_room)
ALICE=$(load_token alice)
PASS=0; FAIL=0
declare -a FAILNOTES=()

check() { # <name> <ok:0/1> [detail]
  if [[ "$2" == "0" ]]; then
    echo "  ✅ $1"; PASS=$((PASS+1))
  else
    echo "  ❌ $1 ${3:-}"; FAIL=$((FAIL+1)); FAILNOTES+=("$1")
  fi
}

mkdir -p "$EVID_DIR"

echo "== 1. 独立应用实例（fleet 形态专项）=="
for u in "${USERS[@]}"; do
  code=$(curl -s -o "$EVID_DIR/$u-health.json" -w '%{http_code}' "http://127.0.0.1:$(studio_port "$u")/health/ready" || echo 000)
  check "$u 实例 /health/ready :$(studio_port "$u")" $([[ "$code" == "200" ]]; echo $?) "http=$code"

  # 进程独立性：本实例 .app 副本路径的 Electron 进程在跑
  NPROC=$(pgrep -f "$(app_copy "$u")/Contents/MacOS/SwarmStudio" | wc -l | tr -d ' ')
  check "$u 独立应用进程存活（pgrep=${NPROC}）" $(( NPROC >= 1 ? 0 : 1 )) "pgrep=$NPROC"

  # server 子进程跑在自身副本的 Resources 下（自持服务，不寄生 dev 树/其他副本）
  pgrep -f "$(app_copy "$u")/Contents/Resources/webui/dist/server/index.js" >/dev/null
  check "$u server 由自身 .app 副本承载" $?

  # userData 落在沙箱 HOME 内（HOME 隔离生效）
  AS_DIR="$(home_dir "$u")/Library/Application Support"
  NENTRY=$(ls -1 "$AS_DIR" 2>/dev/null | wc -l | tr -d ' ')
  check "$u electron userData 落沙箱（${NENTRY} 项）" $(( NENTRY >= 1 ? 0 : 1 ))

  # webui 状态库独立存在
  DB="$(webui_home "$u")/hermes-web-ui.db"
  check "$u webui DB 独立存在" $([[ -f "$DB" ]]; echo $?) "$DB"
done
# 三份 DB 互为不同文件（inode 级）
INODES=$(for u in "${USERS[@]}"; do stat -f '%i' "$(webui_home "$u")/hermes-web-ui.db" 2>/dev/null; done | sort -u | wc -l | tr -d ' ')
check "三实例 webui DB inode 全不同" $([[ "$INODES" == "3" ]]; echo $?) "distinct=$INODES"

echo "== 2. 网关集群 =="
for u in "${USERS[@]}"; do
  gw=$(curl -sf "http://127.0.0.1:$(gateway_port "$u")/health" || true)
  check "$u gateway :$(gateway_port "$u")/health" $([[ -n "$gw" ]]; echo $?)
done
mx "$ALICE" GET "rooms/$ROOM_ID/joined_members" > "$EVID_DIR/members.json"
N=$(jq '.joined | length' "$EVID_DIR/members.json")
check "房间成员 = 6（实际 ${N}）" $([[ "$N" == "6" ]]; echo $?)
for u in alice bob carol; do
  grep -q "$(agent_mxid "$u")" "$EVID_DIR/members.json"
  check "agent $(agent_mxid "$u") 在房间" $?
done
for u in alice bob carol; do
  pres=$(curl -sf -H "Authorization: Bearer $ALICE" "$HS/_matrix/client/v3/presence/$(agent_mxid "$u")/status" | jq -r '.presence' || echo unavailable)
  check "$(agent_mxid "$u") presence" $([[ "$pres" == "online" ]]; echo $?) "presence=$pres"
done

echo "== 3. 房间协作轨迹 =="
mx_messages "$ALICE" "$ROOM_ID" 500 | jq '[.[] | {sender, body: .content.body, origin_server_ts}]' > "$EVID_DIR/messages.json"
for kw in "RFD-001" "T1" "IMPL-DONE-T1" "IMPL-DONE-T2" "VERIFY-PASS" "APPROVED" "SHIP-DONE"; do
  jq -e --arg k "$kw" 'map(.body // "" | contains($k)) | any' "$EVID_DIR/messages.json" >/dev/null
  check "房间含关键消息 $kw" $?
done
NMSG=$(jq 'length' "$EVID_DIR/messages.json")
AGENT_MSGS=$(jq '[.[] | select(.sender | endswith("-agent:matrix.test"))] | length' "$EVID_DIR/messages.json")
HUMAN_MSGS=$(jq '[.[] | select(.sender | test("@(alice|bob|carol):matrix.test$"))] | length' "$EVID_DIR/messages.json")
echo "  消息总数 ${NMSG}（agent $AGENT_MSGS / 人类 ${HUMAN_MSGS}）"

echo "== 4. 代码交付（地面真值）=="
git -C "$CENTRAL_REPO" log --graph --oneline --all --decorate > "$EVID_DIR/git-log.txt" 2>&1
git -C "$CENTRAL_REPO" tag > "$EVID_DIR/git-tags.txt"
grep -q "v0.1" "$EVID_DIR/git-tags.txt"; check "central 有 tag v0.1" $?
for b in feat/slugify feat/truncate; do
  git -C "$CENTRAL_REPO" rev-parse -verify -q "refs/heads/$b" >/dev/null; check "central 分支 $b" $?
done
# alice 工作区用其实例自带 venv 复跑（独立于 agent 自报）
PYT=1
if (cd "$(workspace alice)" && git pull -q central main 2>/dev/null; "$(instance_python alice)" -m pytest -q > "$EVID_DIR/pytest.txt" 2>&1); then
  PYT=0
fi
check "alice workspace pytest 复跑通过（实例 venv）" "$PYT" "$(tail -1 "$EVID_DIR/pytest.txt" 2>/dev/null | head -c 80)"
git -C "$(workspace alice)" show main:RELEASE.md > "$EVID_DIR/RELEASE.md" 2>/dev/null
grep -q "stringops" "$EVID_DIR/RELEASE.md" 2>/dev/null; check "main 含 RELEASE.md" $?

echo "== 5. Kanban =="
ALICE_JWT=$(studio_login alice 2>/dev/null || true)
studio "$(studio_port alice)" GET "/api/hermes/kanban?project=stringops" "$ALICE_JWT" > "$EVID_DIR/kanban.json" 2>/dev/null || true
for t in "T1" "T2" "T3"; do
  jq -e --arg t "$t" '(if type == "array" then . else (.tasks // .items // []) end) | map(select((.title // "") | contains($t)) and (.status == "done")) | any' "$EVID_DIR/kanban.json" >/dev/null 2>&1
  check "kanban 卡 $t 终态 done" $? "见 kanban.json"
done

echo "== 6. 证据文件 =="
for f in messages.json git-log.txt kanban.json scenario.log; do
  [[ -s "$EVID_DIR/$f" ]]; check "$f 非空" $?
done

{
  echo "# ncwk-fleet 运行报告"
  echo "- 时间: $(date '+%F %T')"
  echo "- 房间: $ROOM_ID  消息 $NMSG 条（agent $AGENT_MSGS / 人类 ${HUMAN_MSGS}）"
  echo "- 验收: $PASS 过 / $FAIL 失败"
  [[ ${#FAILNOTES[@]} -gt 0 ]] && printf -- '- 失败项: %s\n' "${FAILNOTES[*]}"
} > "$EVID_DIR/run-report.md"

echo
echo "验收门: $PASS 过 / $FAIL 失败；证据目录: $EVID_DIR"
[[ $FAIL == 0 ]]
