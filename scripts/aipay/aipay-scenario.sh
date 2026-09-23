#!/bin/bash
# aipay-scenario.sh — RFD-001 收银台全流程推演（设计文档 §7，20 步）
# 导演只扮演"人类打字/点击"与"核验地面真值"；agent 动作全为真实 gateway+LLM 回合。
# 断点续跑: START_STEP=<step> bash aipay-scenario.sh
# 步骤序: smoke → ba → room → dispatch → register → analysis → triage → anexec
#        → review → close → plan → devimpl → defect → testpass → release → templates → ide
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/aipay-lib.sh"

# STATE 由 aipay-lib.sh 按 RUN_ID 提供（跨轮存活靠 state 缓存防重复建卡/建房；换轮次给 RUN_ID 即另起一份）
SCEN_LOG="$EVID_DIR/scenario.log"
mkdir -p "$EVID_DIR"
[[ -f "$STATE" ]] || : > "$STATE"
sget() { grep -s "^$1=" "$STATE" 2>/dev/null | head -1 | cut -d= -f2-; return 0; }
sset() { grep -v "^$1=" "$STATE" 2>/dev/null > "$STATE.tmp" || true; echo "$1=$2" >> "$STATE.tmp"; mv "$STATE.tmp" "$STATE"; }
note() { log "$*" | tee -a "$SCEN_LOG"; }

STEPS="smoke ba room dispatch register analysis triage anexec review close plan devimpl defect testpass release templates ide"
START_STEP="${START_STEP:-smoke}"
step_reached() {
  local a b
  a=$(echo $STEPS | tr ' ' '\n' | grep -n "^$1$" | cut -d: -f1)
  b=$(echo $STEPS | tr ' ' '\n' | grep -n "^$START_STEP$" | cut -d: -f1)
  [[ -n "$b" ]] || fail "未知 START_STEP: $START_STEP"
  (( a >= b ))
}

# ── 通用原语 ──────────────────────────────────────────
jwt_of() { # <user> → studio JWT（优先 matrix-login，等价步骤 3 的自动登录链路）
  local u="$1" cached; cached=$(sget "jwt_$u")
  [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  local t
  t=$(studio "$(studio_port "$u")" POST /api/auth/matrix-login "" "$(jq -n \
    --arg tok "$(load_token "$u")" --arg uid "$(human_mxid "$u")" --arg hs "$HS" \
    '{matrixAccessToken:$tok, matrixUserId:$uid, homeserverUrl:$hs}')" | jq -r '.token // empty') || true
  if [[ -z "$t" ]]; then
    note "[$u] matrix-login 未取到 JWT，回落 admin/123456（记问题单）"
    echo "ISSUE|matrix-login-fail|$u|/api/auth/matrix-login 未返回 token" >> "$EVID_DIR/issues.log"
    t=$(studio_login "$u")
  fi
  sset "jwt_$u" "$t"
  echo "$t"
}

kanban_list() { # 跨板合并：agent 可能建专用板（如 aipay-rfd），默认板可能为空
  local jwt; jwt=$(jwt_of "$1")
  local boards; boards=$(studio "$(studio_port "$1")" GET "/api/hermes/kanban/boards" "$jwt" | jq -r '.boards[]?.slug' 2>/dev/null)
  [[ -z "$boards" ]] && boards="default"
  local slug out='{"tasks":[]}'
  for slug in $boards; do
    out=$(jq -s '.[0].tasks + (.[1].tasks // []) | {tasks: .}' <(echo "$out")       <(studio "$(studio_port "$1")" GET "/api/hermes/kanban?board=$slug" "$jwt" 2>/dev/null || echo '{"tasks":[]}'))
  done
  echo "$out"
}

kanban_has() { # <user> <needle> → 0/1（标题或 body 含 needle）
  kanban_list "$1" | jq -e --arg n "$2" \
    '[.. | objects | select(has("title")) | select(((.title // "") + (.body // "")) | contains($n))] | length > 0' \
    >/dev/null 2>&1
}

kanban_create_as() { # <user> <state-key> <title> <body> → id（state 缓存防重）
  local u="$1" key="card_$2" title="$3" body="$4" cached id
  cached=$(sget "$key"); [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  id=$(studio "$(studio_port "$u")" POST /api/hermes/kanban "$(jwt_of "$u")" \
    "{\"title\":$(jq -Rn --arg t "$title" '$t'),\"body\":$(jq -Rn --arg b "$body" '$b'),\"project\":\"aipaydev\"}" \
    | jq -r '.task.id // .id')
  [[ -n "$id" && "$id" != "null" ]] || fail "[$u] kanban 建卡失败: $title"
  sset "$key" "$id"; echo "$id"
}

kanban_status_as() { # <user> <id> <status>
  studio "$(studio_port "$1")" PATCH "/api/hermes/kanban/$2" "$(jwt_of "$1")" "{\"status\":\"$3\"}" >/dev/null
}

kanban_link_as() { # <user> <parentId> <childId>
  studio "$(studio_port "$1")" POST /api/hermes/kanban/links "$(jwt_of "$1")" \
    "{\"parentId\":\"$2\",\"childId\":\"$3\"}" >/dev/null || true
}

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
auto_approve() { # 扫描各房间 agent 审批请求，以对应人类身份线程内回 !approve
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

repo_has() { # <path-in-repo>（导演 clone 拉最新后核验）
  git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" show "origin/main:$1" >/dev/null 2>&1
}

room_has_from() { # <room> <sender-mxid> <pattern>
  mx_messages "$(load_token fanfan)" "$1" 120 | jq -e --arg s "$2" --arg p "$3" \
    'map(select(.sender == $s and ((.content.body // "") | test($p)))) | any' >/dev/null 2>&1
}

note "===== aipaydev 推演开始（START_STEP=${START_STEP}）====="
model_preflight_report   # 模型通道不可用就别开局：否则每步只报「超时」，会把额度耗尽记成产品缺陷

# ══ 步骤 1-5：账号/配置/登录/功能就绪冒烟 ═════════════
if step_reached smoke; then
  note "── smoke：账号×24、实例×11、登录×2 模式、kanban 就绪"
  for u in "${USERS[@]}"; do
    mx "$(load_token "$u")" GET account/whoami >/dev/null || fail "账号 $u token 失效"
    mx "$(load_token "$u-agent")" GET account/whoami >/dev/null || fail "账号 $u-agent token 失效"
  done
  note "[真值] 24 账号 token 有效 ✓"
  for u in "${INSTANCED_USERS[@]}"; do
    curl -sf "http://127.0.0.1:$(studio_port "$u")/health/ready" >/dev/null || fail "$u studio 未就绪"
    curl -sf "http://127.0.0.1:$(gateway_port "$u")/health" >/dev/null || fail "$u gateway 未就绪"
    jwt_of "$u" >/dev/null   # matrix-login 全量验证（步骤 3 自动登录链路）
    kanban_list "$u" >/dev/null
  done
  note "[真值] 11 实例 studio+gateway+matrix-login+kanban 全就绪 ✓（步骤 1-5 完成）"
fi

# ══ 步骤 6：BA 需求分发 ═══════════════════════════════
if step_reached ba; then
  if ! repo_has ${RFD_DOC}; then
    cp "$RFD_MATERIAL" "$DIRECTOR_CLONE/docs/requirements/"
    ( cd "$DIRECTOR_CLONE"
      git add -A
      git -c user.name="bella (BA)" -c user.email="bella@aipaydev.local" \
        commit -qm "docs(requirements): ${RFD_ID} 多端小程序支付收银台需求说明书（BA 初稿）"
      git pull -q --rebase origin main; git push -q origin main )
    note "[bella] ${RFD_ID} 已提交 aipaydev（email 通道禁用，以 matrix 私信替代送达）"
  fi
  DM=$(dm_room bella fanfan)
  if [[ -z "$(sget ba_dm_marker)" ]]; then
    M=$(mx_send "$(load_token bella)" "$DM" "fanfan 你好，客户需求文档已出：${RFD_ID} 收单商户多端小程序支付收银台（依据财付通/支付宝公开技术手册）。
仓库: github.com/issac-new/aipaydev → ${RFD_DOC}
请产品团队接手做需求分析与分工。")
    sset ba_dm_marker "$M"
    note "[bella→fanfan] 需求私信已送达 ($M)"
  fi
fi

# ══ 步骤 7-8：建群 + 发需求给 Orchestrator ═══════════
if step_reached room; then
  if [[ -z "$(sget room_analysis)" ]]; then
    RID=$(mx_create_room "$(load_token fanfan)" "支付收银台需求分析讨论群" "$(agent_mxid fanfan)")
    [[ "$RID" == '!'* ]] || fail "建群失败: $RID"
    sset room_analysis "$RID"
    mx_join "$(load_token fanfan-agent)" "$RID"
    note "[fanfan] 已建「支付收银台需求分析讨论群」 $RID 并邀请 fanfan-agent"
  fi
fi

if step_reached dispatch; then
  RID=$(sget room_analysis)
  if [[ -z "$(sget dispatch_marker)" ]]; then
    WSF=$(workspace fanfan)
    M=$(mx_send "$(load_token fanfan)" "$RID" "@fanfan-agent:matrix.test 请处理需求 ${RFD_ID}（收单商户多端小程序支付收银台）。
需求基本信息：为收单商户开发兼容微信/支付宝双端的小程序支付收银台，含统一下单、渠道适配（财付通/支付宝）、支付结果通知与对账字段支撑。
需求文档：aipaydev 仓库 ${RFD_DOC}（你本机克隆在 ${WSF}，先 git pull）
请加载 requirements-analyst 技能执行系统分析：先登记协作 kanban 任务，再做文档要素评估、三清单匹配、SMART 拆分与 RACI 派发。
结论行以 ANALYSIS-DONE-${RFD_ID} 或 ANALYSIS-BLOCKED-${RFD_ID} 开头。不许谎报。" "$(agent_mxid fanfan)")
    sset dispatch_marker "$M"
    note "[fanfan] 需求派发已发 ($M)"
  fi
fi

# ══ 步骤 9：kanban 登记 ═══════════════════════════════
SCAN_ROOM="$(sget room_analysis)"
if step_reached register; then
  jwt_of fanfan >/dev/null
  wait_truth "fanfan 本机 kanban 出现 ${RFD_ID} 任务卡" 900 kanban_has fanfan "${RFD_ID}" \
    || fail "fanfan kanban 登记超时"
fi

# ══ 步骤 10：系统分析（要素评估/三清单/SMART 拆分/RACI 派发）══
if step_reached analysis; then
  RID=$(sget room_analysis)
  wait_truth "仓库出现 docs/analysis/${RFD_ID}-tasklist.md" 2400 repo_has docs/analysis/${RFD_ID}-tasklist.md \
    || note "[降级] tasklist 未到仓，检查房间 agent 进度消息"
  for pair in "chen wei" "hu wei" "lin wei" "xiao mei"; do
    set -- $pair
    wait_truth "房间出现 @${1}-agent 与 @${2}-agent 的 RACI 派发" 1200 bash -c \
      "curl -sf '$HS/_matrix/client/v3/rooms/$RID/messages?access_token=$(load_token fanfan)&dir=b&limit=200' | \
       jq -e '[.chunk[] | select(.type==\"m.room.message\") | select((.content.body//\"\") | contains(\"@${1}-agent\") and contains(\"@${2}-agent\"))] | length > 0'" \
      || note "[观察] @$1/@$2 派发消息未见（记问题单，继续）"
  done
  # 关联人进群核验（step 10 要求 agent 自动邀请）
  EXPECTED_MEMBERS="chen hu lin xiao wei mei qi fei"
  for m in $EXPECTED_MEMBERS; do
    if ! mx_room_members "$(load_token fanfan)" "$RID" | grep -qx "$(human_mxid "$m")"; then
      note "[问题] @$m 未被邀入需求群——agent 自动邀请能力缺口，导演补邀并记问题单"
      echo "ISSUE|room-invite-gap|fanfan-agent|Orchestrator 未自动邀请 @$m 进群，导演兜底" >> "$EVID_DIR/issues.log"
      mx "$(load_token fanfan)" POST "rooms/$RID/invite" "{\"user_id\":\"$(human_mxid "$m")\"}" >/dev/null 2>&1 || true
      mx_join "$(load_token "$m")" "$RID"
      mx "$(load_token fanfan)" POST "rooms/$RID/invite" "{\"user_id\":\"$(agent_mxid "$m")\"}" >/dev/null 2>&1 || true
      mx_join "$(load_token "$m-agent")" "$RID"
    fi
  done
  note "[步骤10] 系统分析派发阶段完成"
fi

# ══ 步骤 11：分诊登记 + lead 确认 + 双兜底 ═══════════
if step_reached triage; then
  RID=$(sget room_analysis)
  for u in chen hu lin xiao; do
    jwt_of "$u" >/dev/null
    wait_truth "$u kanban 出现 ${RFD_ID} 任务卡（分诊台登记）" 1800 kanban_has "$u" "${RFD_ID}" \
      || { note "[观察] $u kanban 未见 ${RFD_ID} 卡（记问题单）"; \
           echo "ISSUE|triage-missing|$u|分诊台未见 ${RFD_ID} 任务卡" >> "$EVID_DIR/issues.log"; }
  done
  # lead 人工确认（导演代 wei/mei 在各自看板把任务从 triage 推进 todo）
  for lead in wei mei; do
    kanban_list "$lead" | jq -r --arg rfd "$RFD_ID" '.. | objects | select(has("title") and has("id")) | select(((.title//"")+(.body//"")) | contains($rfd)) | .id' \
      | while read -r id; do kanban_status_as "$lead" "$id" todo || true; done
    note "[$lead] lead 分诊确认完成（triage→todo）"
  done
fi

note "===== scenario 本批执行到 START_STEP=$START_STEP 之后的 gates；后续步骤由后续批次驱动 ====="

# 后续步骤（anexec/review/close/plan/devimpl/defect/testpass/release/templates/ide）
# 在独立脚本 aipay-scenario2.sh 中，避免单文件过长。
# 修复：START_STEP 落在 anexec..ide 区间（如 review）经本脚本续跑时，
# step_reached anexec 为假会秒退假完成（18:59 事故），须按位置比较放行进入下半场。
step_pos() { echo $STEPS | tr ' ' '\n' | grep -n "^$1$" | cut -d: -f1; }
if [[ "$(step_pos "$START_STEP")" -ge "$(step_pos anexec)" ]]; then
  exec bash "$SCRIPT_DIR/aipay-scenario2.sh"
fi
note "阶段一完成 ✅"
