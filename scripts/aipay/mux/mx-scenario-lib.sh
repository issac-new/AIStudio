#!/bin/bash
# mx-scenario-lib.sh — 20 步推演场景共享原语（P1 场景迁移：合一收敛）
#
# 由 aipay-scenario.sh / aipay-scenario2.sh 共同引用。V1 两脚本各自持有一份重复
# 原语，此处收敛为单一事实源。拓扑口径（方案 V2.0 §3.3）：
#   - 单 studio 多账号：studio() 无端口参数，一律走 $STUDIO_PORT
#   - kanban 板寻址：一切读写钉"本账号的板"（account_boards <user>），不跨扫
#   - verify_done_evidence 断言"账号板"
#   - UNTIL_STEP 上界闸门：UNTIL_STEP=smoke 即只实跑步骤 1-5
# 依赖：先 source mx-lib.sh。

# ── state 缓存（跨轮存活防重复建卡/建房；换轮次给 RUN_ID 另起一份）──
SCEN_LOG="$EVID_DIR/scenario.log"
mkdir -p "$EVID_DIR"
[[ -f "$STATE" ]] || : > "$STATE"
sget() { grep -s "^$1=" "$STATE" 2>/dev/null | head -1 | cut -d= -f2-; return 0; }
sset() { grep -v "^$1=" "$STATE" 2>/dev/null > "$STATE.tmp" || true; echo "$1=$2" >> "$STATE.tmp"; mv "$STATE.tmp" "$STATE"; }
note() { log "$*" | tee -a "$SCEN_LOG"; }

# ── 步骤机 ─────────────────────────────────────────────
STEPS="smoke ba room dispatch register analysis triage anexec review close plan devimpl defect testpass release templates ide"
START_STEP="${START_STEP:-smoke}"
UNTIL_STEP="${UNTIL_STEP:-}"
step_pos() { echo $STEPS | tr ' ' '\n' | grep -n "^$1$" | cut -d: -f1; }
step_reached() { # 步骤 $1 是否在 [START_STEP, UNTIL_STEP] 执行区间内
  local a b u
  a=$(step_pos "$1")
  b=$(step_pos "$START_STEP")
  [[ -n "$b" ]] || fail "未知 START_STEP: $START_STEP（合法值：$STEPS）"
  if [[ -n "$UNTIL_STEP" ]]; then
    u=$(step_pos "$UNTIL_STEP")
    [[ -n "$u" ]] || fail "未知 UNTIL_STEP: $UNTIL_STEP（合法值：$STEPS）"
    (( a >= b && a <= u )) && return 0
    return 1
  fi
  (( a >= b ))
}

# ── 登录（单 studio 多账号：matrix-login 优先，等价步骤 3 自动登录链路）──
jwt_of() { # <user> → studio JWT
  local u="$1" cached; cached=$(sget "jwt_$u")
  [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  local t
  t=$(studio POST /api/auth/matrix-login "" "$(jq -n \
    --arg tok "$(load_token "$u")" --arg uid "$(human_mxid "$u")" --arg hs "$HS" \
    '{matrixAccessToken:$tok, matrixUserId:$uid, homeserverUrl:$hs}')" \
    | jq -r '.token // empty') || true
  if [[ -z "$t" ]]; then
    note "[$u] matrix-login 未取到 JWT，回落 admin/123456（记问题单）"
    echo "ISSUE|matrix-login-fail|$u|/api/auth/matrix-login 未返回 token" >> "$EVID_DIR/issues.log"
    t=$(studio_login)
  fi
  sset "jwt_$u" "$t"
  echo "$t"
}

# ── kanban 原语（V2 板寻址：一切操作钉"本账号的板"）────────────
account_boards() { # <user> → 该账号全部板 slug（空白分隔）
  boards_of "$1" | tr ' ' '\n' | cut -d: -f1 | sed '/^$/d'
}

board_of_task() { # <user> <id> → 卡所在账号板 slug（找不到非零）
  local u="$1" id="$2" jwt slug
  jwt=$(jwt_of "$u")
  for slug in $(account_boards "$u"); do
    if studio GET "/api/hermes/kanban?board=$slug" "$jwt" 2>/dev/null \
        | jq -e --arg id "$id" '[.. | objects | select(.id? == $id)] | length > 0' >/dev/null 2>&1; then
      echo "$slug"; return 0
    fi
  done
  return 1
}

kanban_list() { # <user> → 合并该账号全部账号板的任务 {"tasks":[...]}
  local u="$1" jwt slug out='{"tasks":[]}'
  jwt=$(jwt_of "$u")
  for slug in $(account_boards "$u"); do
    out=$(jq -s '.[0].tasks + (.[1].tasks // []) | {tasks: .}' <(echo "$out") \
      <(studio GET "/api/hermes/kanban?board=$slug" "$jwt" 2>/dev/null || echo '{"tasks":[]}'))
  done
  echo "$out"
}

kanban_has() { # <user> <needle> → 0/1（标题或 body 含 needle）
  kanban_list "$1" | jq -e --arg n "$2" \
    '[.. | objects | select(has("title")) | select(((.title // "") + (.body // "")) | contains($n))] | length > 0' \
    >/dev/null 2>&1
}

kanban_status_of() { # <user> <needle> → 首个匹配卡的 status
  kanban_list "$1" | jq -r --arg n "$2" \
    '[.. | objects | select(has("title")) | select(((.title // "") + (.body // "")) | contains($n)) | .status][0] // empty'
}

kanban_done() { # <user> <needle> → 0/1（存在 done 的匹配卡）
  kanban_list "$1" | jq -e --arg n "$2" \
    '[.. | objects | select(has("title")) | select(((.title // "") + (.body // "")) | contains($n)) | .status] | map(select(. == "done")) | length >= 1' \
    >/dev/null 2>&1
}

kanban_create_as() { # <user> <state-key> <title> <body> [board] → id（state 缓存防重；缺省落该账号默认板）
  local u="$1" key="card_$2" title="$3" body="$4" board="${5:-$(first_board_of "$u")}" cached id
  cached=$(sget "$key"); [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  id=$(studio POST "/api/hermes/kanban?board=$board" "$(jwt_of "$u")" \
    "{\"title\":$(jq -Rn --arg t "$title" '$t'),\"body\":$(jq -Rn --arg b "$body" '$b'),\"project\":\"aipaydev\"}" \
    | jq -r '.task.id // .id')
  [[ -n "$id" && "$id" != "null" ]] || fail "[$u] kanban 建卡失败: $title（板 ${board}）"
  sset "$key" "$id"; echo "$id"
}

kanban_status_as() { # <user> <id> <status>（自动定位卡所在账号板）
  local b; b=$(board_of_task "$1" "$2") || return 1
  studio PATCH "/api/hermes/kanban/$2?board=$b" "$(jwt_of "$1")" "{\"status\":\"$3\"}" >/dev/null
}

kanban_link_as() { # <user> <parentId> <childId>（挂父卡所在板）
  local b; b=$(board_of_task "$1" "$2") || return 0
  studio POST "/api/hermes/kanban/links?board=$b" "$(jwt_of "$1")" \
    "{\"parentId\":\"$2\",\"childId\":\"$3\"}" >/dev/null || true
}

kanban_walk_done() { # <user> <id>：按合法路径走到 done（静默容错）
  local u="$1" id="$2" st
  for st in todo running review done; do
    kanban_status_as "$u" "$id" "$st" 2>/dev/null || true
  done
}

# ── Matrix 私信/审批/真值等待 ───────────────────────────
dm_room() { # <fromUser> <toUser> → room_id（缓存）
  local a="$1" b="$2"
  local key="dm_${a}_${b}" cached
  cached=$(sget "$key"); [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  local rid
  rid=$(mx "$(load_token "$a")" POST createRoom "$(jq -n --arg t "$(human_mxid "$b")" \
    '{is_direct:true, preset:"trusted_private_chat", invite:[$t]}')" | jq -r '.room_id')
  [[ "$rid" == '!'* ]] || fail "DM 建房失败 ${a}→$b: $rid"
  mx_join "$(load_token "$b")" "$rid"
  sset "$key" "$rid"; echo "$rid"
}

APPROVED_LOG="$EVID_DIR/approved.events"; touch "$APPROVED_LOG"
auto_approve() { # 扫描房间 agent 审批请求，以对应人类身份线程内回 !approve
  local room="$1"
  for u in "${INSTANCED_USERS[@]}"; do
    local pend
    pend=$(mx_messages "$(load_token "$u")" "$room" 20 2>/dev/null | jq -r --arg agent "$(agent_mxid "$u")" \
      '.[] | select(.sender == $agent and ((.content.body // "") | test("needs your OK|approval"))) | .event_id' 2>/dev/null \
      | while read -r eid; do grep -q "^$eid$" "$APPROVED_LOG" || echo "$eid"; done) || true
    for eid in $pend; do
      mx "$(load_token "$u")" POST "rooms/$room/send/m.room.message" \
        "{\"msgtype\":\"m.text\",\"body\":\"!approve\",\"m.relates_to\":{\"rel_type\":\"m.thread\",\"event_id\":\"$eid\"}}" >/dev/null || true
      echo "$eid" >> "$APPROVED_LOG"
      note "[$u] 线程内回复 !approve（事件 ${eid}）"
    done
  done
}

wait_truth() { # <desc> <timeout-sec> <predicate-cmd...>
  local desc="$1" timeout="$2"; shift 2
  local deadline=$(( $(date +%s) + timeout ))
  while (( $(date +%s) < deadline )); do
    [[ -n "${SCAN_ROOM:-}" ]] && auto_approve "$SCAN_ROOM" || true
    if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓"; return 0; fi
    sleep 15
  done
  note "[真值] $desc ✗（${timeout}s 超时）"
  return 1
}

# ── 完成凭证反向核验（账号板断言）────────────────────────
verify_done_evidence() { # <rfd> → 0 DONE 凭证全部为真 / 1 缺失或造假
  # 只认"可反向核验"的完成：结论行里的 commit 必须真在 aipaydev origin 上、
  # 且该 commit 确实含分析稿；card 必须能在 fanfan 账号的板（账号板）查到。
  # 空喊"完成"不计入。
  local rfd="$1" body sha card
  body=$(mx_messages "$(load_token fanfan)" "$(sget room_analysis)" 200 2>/dev/null \
    # /messages?dir=b 返回顺序是"新→旧"，必须取 first；取 last 会拿到最旧那条
    # 无凭证裸 DONE，把已重报的合格凭证误判为不合格（09-23 实锤 false negative）。
    | jq -r --arg p "ANALYSIS-DONE-$rfd" \
      '[.[] | select((.content.body//"") | contains($p))] | first | .content.body // ""')
  [[ -n "$body" ]] || { note "[凭证] 未见 $rfd 的 DONE 行"; return 1; }
  sha=$(printf '%s' "$body" | grep -oE 'commit=[0-9a-fA-F]{7,40}' | head -1 | cut -d= -f2)
  card=$(printf '%s' "$body" | grep -oE 'card=[^ ,；;]+' | head -1 | cut -d= -f2)
  [[ -n "$sha" && -n "$card" ]] || { note "[凭证] DONE 行缺 commit/card 凭证：$body"; return 1; }
  git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" cat-file -e "$sha^{commit}" 2>/dev/null \
    || { note "[凭证] commit $sha 不存在于 aipaydev —— 虚报"; return 1; }
  git -C "$DIRECTOR_CLONE" ls-tree -r --name-only "$sha" 2>/dev/null | grep -q "${rfd}-tasklist.md" \
    || { note "[凭证] commit $sha 里没有 ${rfd}-tasklist.md —— 虚报"; return 1; }
  kanban_list fanfan | grep -q "$card" \
    || { note "[凭证] fanfan 账号板查无卡片 $card —— 虚报"; return 1; }
  note "[凭证] $rfd 完成证据成立（card 在 fanfan 账号板可查）：commit=$sha card=$card"
  return 0
}

# ── 仓库/房间真值 ───────────────────────────────────────
repo_has() { # <path-in-repo>（导演 clone 拉最新后核验）
  git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" show "origin/main:$1" >/dev/null 2>&1
}
repo_pull() { git -C "$DIRECTOR_CLONE" pull -q origin main >/dev/null 2>&1 || true; }

room_has_from() { # <room> <sender-mxid> <pattern>
  mx_messages "$(load_token fanfan)" "$1" 120 | jq -e --arg s "$2" --arg p "$3" \
    'map(select(.sender == $s and ((.content.body // "") | test($p)))) | any' >/dev/null 2>&1
}

dispatch_in_room() { # <humanUser> <text> <mention-csv> → event_id
  local m
  m=$(mx_send "$(load_token "$1")" "$(sget room_analysis)" "$2" "$3")
  note "[$1] 派发 ($m): $(echo "$2" | head -1)"
  echo "$m"
}

# 场景脚本沿用 V1 快失败语义：mx-lib 的 set -uo 在 source 时会降级掉 -e，在此恢复
set -euo pipefail
