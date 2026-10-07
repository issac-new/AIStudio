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
# 进度 JSON（产品面契约）：完成步按 MX_STEP_ORDER 计数；写失败绝不影响推演（|| true 全兜底）
mx_write_progress() {
  [[ -n "${HERMES_ROOT:-}" && -n "${STATE:-}" ]] || return 0
  mkdir -p "$HERMES_ROOT" 2>/dev/null || true
  local _n=0 _list="" _s
  for _s in ${MX_STEP_ORDER:-}; do
    if grep -q "^${_s}_done=" "$STATE" 2>/dev/null; then _n=$((_n+1)); _list="${_list}\"$_s\","; fi
  done
  printf '{"run_id":"%s","done":%d,"total":%d,"done_steps":[%s],"updated_ts":%d}\n' \
    "${RUN_ID:-}" "$_n" "$(echo ${MX_STEP_ORDER:-} | wc -w | tr -d ' ')" "${_list%,}" "$(date +%s)" \
    > "$HERMES_ROOT/run-progress.json.tmp" 2>/dev/null && mv "$HERMES_ROOT/run-progress.json.tmp" "$HERMES_ROOT/run-progress.json" 2>/dev/null || true
}
sset() { grep -v "^$1=" "$STATE" 2>/dev/null > "$STATE.tmp" || true; echo "$1=$2" >> "$STATE.tmp"; mv "$STATE.tmp" "$STATE"; mx_write_progress; }
# 临时物清理（Z6）：$STATE.tmp 是 sset 的中转文件，mv 前被中断会残留。重定义 mx_cleanup
# 即扩展清理面——EXIT trap 只在 mx-lib 挂一次，退出时按最新定义执行（bash 单 EXIT trap）。
mx_cleanup() { rm -f "/tmp/mx-api.$$" "$STATE.tmp" "$STATE.rfd.tmp"; }
note() { log "$*" | tee -a "$SCEN_LOG"; }

# ── 步骤机（V3 生命周期 21 步：六阶段 L0-L5 × G1-G6 门禁，方案见
#    2026-09-25-mux-v3-lifecycle-plan.md；templates 并入 ready）────────
STEPS="smoke appinit people ba reqgate room dispatch register analysis triage anexec review archgate close plan devimpl defect testpass ready release uat workmgr audit retro ide report"
START_STEP="${START_STEP:-smoke}"
UNTIL_STEP="${UNTIL_STEP:-}"
step_pos() { echo $STEPS | tr ' ' '\n' | grep -n "^$1$" | cut -d: -f1; }

# ── 快模式节拍（run11 §4.2/纪律 27⑤：MX_FAST=1 缺省开——轮询 15s→5s）──────
# run10 报告曾叙事「快模式 MX_FAST=1 已开」而驱动/原语零实现（叙事超前于实现的
# 实锤病根）——本块即实现体。MX_FAST=0 显式回退 15s 慢档（保真对照轮用）。
# 审批扫描降频独立节拍（§4.2：auto 批量扫描 30s，防轮询加密后 Matrix 扫描风暴）。
MX_FAST="${MX_FAST:-1}"
if [[ "$MX_FAST" == "1" ]]; then
  MX_POLL_IVAL=5
else
  MX_POLL_IVAL=15
fi
MX_APPROVE_SCAN_IVAL="${MX_APPROVE_SCAN_IVAL:-30}"
export MX_FAST MX_POLL_IVAL MX_APPROVE_SCAN_IVAL
step_reached() { # 步骤 $1 是否在 [START_STEP, UNTIL_STEP] 执行区间内
  local a b u
  a=$(step_pos "$1")
  b=$(step_pos "$START_STEP")
  # 报错文案里 $var 紧邻全角括号必须写 ${var}（Z4）：bash 3.2 会把多字节字符首字节
  # 吞进变量名，"$START_STEP（" 的值直接变空（已实测）。
  [[ -n "$b" ]] || fail "未知 START_STEP: ${START_STEP}（合法值：${STEPS}）"
  if [[ -n "$UNTIL_STEP" ]]; then
    u=$(step_pos "$UNTIL_STEP")
    [[ -n "$u" ]] || fail "未知 UNTIL_STEP: ${UNTIL_STEP}（合法值：${STEPS}）"
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
  # 09-26 run6/7 实锤：studio /api/hermes/kanban?board=* 整板返空（tenant 面未明），
  # 板上真卡在却两窗误杀（kanban_has/kanban_status_of 全线失明）。改 CLI 直查：
  # hermes kanban --board <slug> list --json 输出裸数组 → {tasks:.} 归一兼容旧消费面。
  local u="$1" slug out='{"tasks":[]}'
  for slug in $(account_boards "$u"); do
    out=$(jq -c -s '{tasks: (.[0].tasks + (.[1] // []))}' \
      <(echo "$out") \
      <(HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$slug" list --json 2>/dev/null || echo '[]'))
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

# assignee 归一化：agent 可能写 matrix mxid(@xxx-agent) 而 profile 系统用短名(xxx)——
# 建卡/改卡时统一为短名（V3 全流程轮实测 bug：visibleProfiles 过滤全部漏掉）
normalize_assignee() { # <assignee> → 短名
  local a="${1:-}"
  a="${a#@}"                    # 去 @
  a="${a%:matrix.test}"        # 去 :matrix.test
  a="${a%-agent}"              # 去 -agent 后缀（@fanfan-agent → fanfan）
  printf '%s' "$a"
}

kanban_create_as() { # <user> <state-key> <title> <body> [board] [assignee] → id（state 缓存防重；缺省落该账号默认板）
  # 09-26 run8 实锤：studio POST /api/hermes/kanban 写路径与读路径同病（tenant 面），
  # 导演兜底建卡直接 fail。改 CLI 直查（--json 返回卡对象，.id 即卡号，实测 t_8b84e215）。
  # assignee（第 6 参，可选）：未指派卡虽经 547 已对板内可见，但指派到板团队档案
  # （board.json profiles 之一）可同时过 477 围栏与 391 认领白名单——评审/准出类
  # 导演建卡一律带（run7 ui-g5-carddrawer 教训：NULL assignee 曾被滤光致抽屉打不开）。
  # 拆两条 local（2026-10-04 run8 uat 崩溃环实锤）：bash 的 local 参数展开先于赋值——
  # 同语句内 board 默认值引用 $(first_board_of "$u") 时 u 尚未赋值，set -u 下命令替换
  # 子 shell 即死（卡已建但 ID 丢失、驱动被 set -e 连坐），每棒复发。
  local u="$1" key="card_$2" title="$3" body="$4" cached id
  local board="${5:-$(first_board_of "$u")}" asg="${6:-}"
  cached=$(sget "$key"); [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  local asg_args=()
  [[ -n "$asg" ]] && asg_args=(--assignee "$asg")
  id=$(HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$board" create "$title" \
    --body "$body" --project aipaydev --json ${asg_args[@]+"${asg_args[@]}"} 2>/dev/null | jq -r '.id // empty')
  [[ -n "$id" && "$id" != "null" ]] || fail "[$u] kanban 建卡失败: ${title}（板 ${board}）"
  # 板归属校验（run2 REL-* 三卡实测落错板 audit-compliance，现行 CLI 路由已不可复现
  # ——补创建后归属核验：错板记单留证，不再静默）
  _landed="$(board_of_task "$u" "$id" 2>/dev/null || true)"
  if [[ -n "$_landed" && "$_landed" != "$board" ]]; then
    echo "ISSUE|kanban-board-misroute|$u|$id 创建要求板 $board 实落 ${_landed}（P-18 归属核验）" >> "$EVID_DIR/issues.log"
  fi
  sset "$key" "$id"; echo "$id"
}

kanban_status_as() { # <user> <id> <status>（studio PATCH 主路 + CLI 合法路径兜底）
  # 隔夜 26 步实证 PATCH 有效；GET/POST-create 才有 tenant 病。兜底按状态机动词：
  # running=claim / review=request-review / done=complete（walk_done 全程静默容错）。
  local u="$1" tid="$2" st="$3" b
  b=$(board_of_task "$u" "$tid") || return 1
  studio PATCH "/api/hermes/kanban/$tid?board=$b" "$(jwt_of "$u")" "{\"status\":\"$st\"}" >/dev/null 2>&1 && return 0
  case "$st" in
    running) HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$b" claim "$tid" >/dev/null 2>&1 || true ;;
    review)  HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$b" request-review "$tid" >/dev/null 2>&1 || true ;;
    done)    HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$b" complete "$tid" >/dev/null 2>&1 || true ;;
  esac
  return 0
}

kanban_link_as() { # <user> <parentId> <childId>（挂父卡所在板）
  local u="$1" pid="$2" cid="$3" b
  b=$(board_of_task "$u" "$pid") || return 0
  HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$b" link "$pid" "$cid" >/dev/null 2>&1 || true
}

kanban_walk_done() { # <user> <id>：按合法路径走到 done（静默容错）
  local u="$1" id="$2" st
  for st in todo running review done; do
    kanban_status_as "$u" "$id" "$st" 2>/dev/null || true
  done
}

kanban_raci_of() { # <user> <needle> → 首个匹配卡的结构化 raci JSON（空串=未填；B1 列）
  local u="$1" n="$2" slug out
  for slug in $(account_boards "$u"); do
    out=$(sqlite3 "$HERMES_ROOT/kanban/boards/$slug/kanban.db" \
      "select ifnull(raci,'') from tasks where (title like '%'||'$n'||'%' or body like '%'||'$n'||'%') and ifnull(raci,'')!='' limit 1" 2>/dev/null) || continue
    [[ -n "$out" ]] && { echo "$out"; return 0; }
  done
  echo ""
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

# approved.events 台账（边界设计 §2/§6-T4，eid 锚点约定）：每行
#   <请求event_id> <回执event_id|NO_REPLY> <人类账号> <unix时间戳>
# 事件 id 即 Matrix $event_id（跨机 eid 全局锚点）；去重按行首请求 id 前缀匹配。
APPROVED_LOG="$EVID_DIR/approved.events"; touch "$APPROVED_LOG"
# ── 审批复核人工介入（2026-10-02 用户裁决 C 混合模式）──────────────
# MX_APPROVE_MODE=auto（默认）脚本扫到即批——历史行为
#                 =manual 全部挂起等真人（element 以人类账号回复 !approve / !deny）
#                 =hybrid  关键操作挂起真人复核 + 过程性操作由代审 agent 先审后批
# 关键=主干写入与破坏性（git push origin main/master、rm -rf、--force、drop table、
# unlink(）；MX_APPROVE_CRITICAL_EXTRA 可追加扩展正则（对小写正文匹配）。
# 代审者=MX_REVIEW_AGENT（默认 fanfan，其 orchestrator agent 收审阅 DM；语义=审批
# 复核人代过程性审批，非请求主人本人——保真偏差如实记档）。agent 复核回复
# APPROVE→执行原批准双通道；REJECT <理由>→线程内 !deny（hermes 会把理由回传请求
# agent 使其调整）；代审超时 MX_REVIEW_TIMEOUT（默认 1800s）→转人工挂起兜底。
REVIEW_STATE="$EVID_DIR/review.pending"; touch "$REVIEW_STATE"
review_state_get() { grep -F "$1|" "$REVIEW_STATE" 2>/dev/null | head -1; }
review_state_del() { # <eid>（sed 免疫点号通配：用 awk 精确首列）
  local _f; _f=$(mktemp) || return 0
  awk -F'|' -v e="$1" '$1 != e' "$REVIEW_STATE" > "$_f" 2>/dev/null || true
  cat "$_f" > "$REVIEW_STATE"; rm -f "$_f"
}
review_state_set() { echo "$1|$2|$3|$4|$(date +%s)" >> "$REVIEW_STATE"; } # <eid> <state> <ask_eid> <u>

# ── ③b 审批面统一·harness 侧（backlog ③，2026-10-06）──────────────────────
# 镜像入队：审批请求在 Matrix 房间出现即同步写入产品收件箱通道
# （$HERMES_ROOT/approvals/mx-requests.jsonl，产品 pending-controller 第四源读取，
# id=mx:<eid>）；消费收敛：轮询 mx-responses/<safe-eid>.json（产品裁决产物），
# 命中即回 Matrix 执行反应+线程批准/拒绝（与 auto 通道同语义），双通道台账一致。
# 幂等边界：本侧以 APPROVED_LOG 为已决真值；产品侧以 approved.events+响应文件为
# 已决真值（其 decide 分支对反应通道已批 409，本侧消费后亦落 approved.events）。
# MX_INBOX_MIRROR=0 可显式关闭（保真偏离须记单，与 delivery 旗标同纪律）。
MXQ_DIR="$HERMES_ROOT/approvals"
MXQ_QUEUE="$MXQ_DIR/mx-requests.jsonl"
MXQ_RESP_DIR="$MXQ_DIR/mx-responses"

mxq_safe_eid() { printf '%s' "$1" | tr -c 'A-Za-z0-9_-' '_'; }  # 与产品 mxSafeEid 同约定

mxq_enqueue() { # <user> <room> <eid>：镜像入队（幂等；显式关闭或已在队/已决即跳过）
  [[ "${MX_INBOX_MIRROR:-1}" == "1" ]] || return 0
  local u="$1" room="$2" eid="$3" body title
  mkdir -p "$MXQ_DIR" 2>/dev/null || return 0
  touch "$MXQ_QUEUE"
  grep -qF '"eid":"'"$eid"'"' "$MXQ_QUEUE" 2>/dev/null && return 0
  grep -qF "$eid " "$APPROVED_LOG" 2>/dev/null && return 0
  body=$(mx_messages "$(load_token "$u")" "$room" 20 2>/dev/null | jq -r --arg e "$eid"     '[.[] | select(.event_id == $e)][0].content.body // ""' 2>/dev/null | head -c 200 | jq -Rs .) || body='"（正文拉取失败）"'
  title="[${u}] Matrix 审批请求（房间 ${room}）"
  jq -nc --arg e "$eid" --arg t "$title" --argjson d "${body:-""}" --arg sid "$room" --arg p "$u"     '{eid:$e, title:$t, detail:$d, sessionId:$sid, profile:$p, createdAt:(now*1000|floor)}' >> "$MXQ_QUEUE" 2>/dev/null || true
}

mxq_consume() { # 消费收件箱裁决：响应文件命中且未决 → 回 Matrix 执行批准/拒绝
  [[ "${MX_INBOX_MIRROR:-1}" == "1" ]] || return 0
  [[ -d "$MXQ_RESP_DIR" ]] || return 0
  local f eid decision u room
  for f in "$MXQ_RESP_DIR"/*.json; do
    [[ -f "$f" ]] || continue
    eid=$(jq -r '.request_id // empty' "$f" 2>/dev/null) || continue
    [[ -n "$eid" ]] || continue
    grep -qF "$eid " "$APPROVED_LOG" 2>/dev/null && continue   # 已决（任一通道）跳过
    decision=$(jq -r '.decision // "once"' "$f" 2>/dev/null)
    # 请求房间与账号：自 mx-requests 行回取（入队时落了 sessionId/profile）
    room=$(jq -r --arg e "$eid" 'select(.eid == $e) | .sessionId // empty' "$MXQ_QUEUE" 2>/dev/null | head -1)
    u=$(jq -r --arg e "$eid" 'select(.eid == $e) | .profile // empty' "$MXQ_QUEUE" 2>/dev/null | head -1)
    [[ -n "$room" && -n "$u" ]] || continue
    local react_eid="" reply_eid="" root verb
    if [[ "$decision" == "deny" ]]; then verb="!deny"; else verb="!approve"; fi
    [[ "$decision" != "deny" ]] && react_eid=$(mx "$(load_token "$u")" POST "rooms/$room/send/m.reaction"       "{"m.relates_to":{"rel_type":"m.annotation","event_id":"$eid","key":"✅"}}"       | jq -r '.event_id // empty' 2>/dev/null) || true
    root=$(mx_messages "$(load_token "$u")" "$room" 20 2>/dev/null | jq -r --arg e "$eid"       '[.[] | select(.event_id == $e)][0] | (.content."m.relates_to" | if . and .rel_type == "m.thread" then .event_id else empty end) // $e' 2>/dev/null) || root="$eid"
    reply_eid=$(mx "$(load_token "$u")" POST "rooms/$room/send/m.room.message"       "{"msgtype":"m.text","body":"$verb","m.relates_to":{"rel_type":"m.thread","event_id":"$root","is_falling_back":true,"m.in_reply_to":{"event_id":"$eid"}}}"       | jq -r '.event_id // empty' 2>/dev/null) || true
    if [[ -z "$reply_eid" ]]; then
      reply_eid=$(mx "$(load_token "$u")" POST "rooms/$room/send/m.room.message"         "{"msgtype":"m.text","body":"$verb"}" | jq -r '.event_id // empty' 2>/dev/null) || true
    fi
    echo "$eid ${reply_eid:-NO_REPLY} $u $(date +%s)" >> "$APPROVED_LOG"
    note "[③b] 收件箱裁决已收敛回 Matrix（请求 ${eid} 决策 ${decision} → ${verb} ${reply_eid:-NO_REPLY}${react_eid:+ 反应=${react_eid}}）"
  done
}

approve_is_critical() { # <body> → 0=关键(挂真人) 1=过程性
  local low; low=$(printf '%s' "$1" | tr 'A-Z' 'a-z')
  if printf '%s' "$low" | grep -qE \
      -e 'git .*push.*origin.* main( |$)' \
      -e 'git .*push.*origin.*:main( |$)' \
      -e 'git .*push.*origin.* master( |$)' \
      -e 'git .*push.*origin.*:master( |$)' \
      -e 'git .*push.*origin/(main|master)' \
      -e 'rm -[rf][rf]? ' -e 'push .*--force' -e '--force-push' \
      -e 'drop table' -e 'unlink\('; then
    return 0
  fi
  if [[ -n "${MX_APPROVE_CRITICAL_EXTRA:-}" ]] && printf '%s' "$low" | grep -qE "${MX_APPROVE_CRITICAL_EXTRA}"; then
    return 0
  fi
  return 1
}

dm_room_agent() { # <fromUser> <agentOwner> → room_id（人类 from 邀 agentOwner 的 agent；agent 侧 _on_invite 自动加入）
  local a="$1" b="$2" key="dma_${a}_${b}" cached rid
  cached=$(sget "$key"); [[ -n "$cached" ]] && { echo "$cached"; return 0; }
  rid=$(mx "$(load_token "$a")" POST createRoom "$(jq -n --arg t "$(agent_mxid "$b")" \
    '{is_direct:true, preset:"trusted_private_chat", invite:[$t]}')" | jq -r '.room_id')
  [[ "$rid" == '!'* ]] || return 1
  sset "$key" "$rid"; echo "$rid"
}

approve_deny() { # <u> <room> <eid> <reason> —— 线程内 !deny（理由回传请求 agent）
  local u="$1" room="$2" eid="$3" reason="$4" reply_eid root tok payload
  tok=$(load_token "$u")
  root=$(mx_messages "$tok" "$room" 20 2>/dev/null | jq -r --arg e "$eid" \
    '[.[] | select(.event_id == $e)][0] | (.content."m.relates_to" | if . and .rel_type == "m.thread" then .event_id else empty end) // $e' 2>/dev/null) || root="$eid"
  payload=$(jq -n --arg r "$root" --arg e "$eid" --arg d "!deny ${reason}" \
    '{msgtype:"m.text", body:$d, m.relates_to:{rel_type:"m.thread", event_id:$r, is_falling_back:true, m.in_reply_to:{event_id:$e}}}')
  reply_eid=$(mx "$tok" POST "rooms/$room/send/m.room.message" "$payload" | jq -r '.event_id // empty' 2>/dev/null) || true
  echo "$eid DENIED:${reply_eid:-NO_REPLY} $u $(date +%s)" >> "$APPROVED_LOG"
  note "[$u][代审拒绝] !deny 已发（请求 ${eid} → ${reply_eid:-NO_REPLY}）理由：${reason:-未给}"
}

approve_review_ask() { # <u> <eid> <body> —— 发审阅 DM 给代审 agent，记 ASKED 态
  local u="$1" eid="$2" body="$3" reviewer rv_dm ask_eid
  reviewer="${MX_REVIEW_AGENT:-fanfan}"
  rv_dm=$(dm_room_agent "$u" "$reviewer") || {
    note "[${u}][代审 DM 建房失败→转人工挂起] ${eid}"; echo "$eid HUMAN_PENDING $u $(date +%s)" >> "$APPROVED_LOG"; return 0; }
  ask_eid=$(mx_send "$(load_token "$u")" "$rv_dm" "[审批复核] 请以审批复核人身份代 ${u} 复核其 agent 请求执行的操作：

${body}

审阅口径：建卡/查询/本地构建等过程性操作符合任务口径即批；越权、破坏性、明显偏离任务目标应拒。
请仅回复一行：APPROVE 或 REJECT <一句理由>。")
  if [[ -z "$ask_eid" ]]; then
    note "[${u}][代审 DM 发送失败→转人工挂起] ${eid}"; echo "$eid HUMAN_PENDING $u $(date +%s)" >> "$APPROVED_LOG"; return 0
  fi
  review_state_set "$eid" "ASKED" "$ask_eid" "$u"
  note "[${u}→${reviewer}-agent] 代审请求已发（${eid}），等复核回复"
}

approve_review_poll() { # <u> <room> <eid> <state-line> → 0=流转中/已处理 2=代审通过(走原批准动作)
  local u="$1" room="$2" eid="$3" line="$4" ask_eid ts reviewer rv_dm verdict
  ask_eid=$(printf '%s' "$line" | cut -d'|' -f3); ts=$(printf '%s' "$line" | cut -d'|' -f5)
  reviewer="${MX_REVIEW_AGENT:-fanfan}"
  if (( $(date +%s) - ${ts:-0} > ${MX_REVIEW_TIMEOUT:-1800} )); then
    review_state_del "$eid"
    echo "$eid HUMAN_PENDING $u $(date +%s)" >> "$APPROVED_LOG"
    note "[${u}][代审超时转人工] ${reviewer}-agent 未在 ${MX_REVIEW_TIMEOUT:-1800}s 内复核 ${eid}，请真人接手"
    return 0
  fi
  rv_dm=$(sget "dma_${u}_${reviewer}")
  [[ -n "$rv_dm" ]] || { dm_room_agent "$u" "$reviewer" >/dev/null 2>&1 || true; return 0; }
  verdict=$(mx_messages "$(load_token "$u")" "$rv_dm" 30 2>/dev/null | jq -r --arg m "$ask_eid" --arg s "$(agent_mxid "$reviewer")" '
    (map(.event_id) | index($m) // -1) as $i
    | (if $i < 0 then . else .[0:$i] end)
    | map(select(.sender == $s)) | map(.content.body // "")
    | map(select(test("^(APPROVE|REJECT)\\b")))[0] // empty' 2>/dev/null) || true
  if [[ "$verdict" == APPROVE* ]]; then
    review_state_del "$eid"
    note "[${reviewer}-agent 代审通过] ${eid}"
    return 2
  elif [[ "$verdict" == REJECT* ]]; then
    local reason; reason=$(printf '%s' "$verdict" | sed 's/^REJECT[[:space:]]*//' | cut -c1-200)
    review_state_del "$eid"
    approve_deny "$u" "$room" "$eid" "$reason"
    return 0
  fi
  return 0
}

auto_approve() { # 扫描房间 agent 审批请求，按 MX_APPROVE_MODE 分发（auto/manual/hybrid）
  # manual：全部挂起等真人；hybrid：关键挂真人+过程性 agent 代审（见上块注释）；
  # auto：历史行为——扫到即批（反应+线程内 !approve 双通道）。
  # 快模式节流（run11 §4.2）：轮询加密到 5s 后，全账号扫描若逢轮必跑会放大成
  # Matrix 请求风暴（15 账号×消息窗）；按 MX_APPROVE_SCAN_IVAL（缺省 30s）节流，
  # 两次扫描间的调用直接返回（审批延迟上界=节拍值，run10 实测 15s 节奏下无积压）。
  local _aa_now=$(( $(date +%s) ))
  if [[ -n "${_AA_LAST_TS:-}" ]] && (( _aa_now - _AA_LAST_TS < MX_APPROVE_SCAN_IVAL )); then
    return 0
  fi
  _AA_LAST_TS=$_aa_now
  local MODE="${MX_APPROVE_MODE:-auto}" room="$1"
  # 大小写归一+非法值 fail-closed（2026-10-02 审查批）：配置漂移（Manual/HYBRID 等）
  # 不得静默落 auto"扫到即批"——未知的值按 manual 全挂起处理并记单。
  MODE="$(printf '%s' "$MODE" | tr 'A-Z' 'a-z')"
  mxq_consume   # ③b：先消费收件箱裁决（manual 模式同样收敛——裁决已发生须回 Matrix）
  case "$MODE" in
    manual) return 0 ;;
    auto|hybrid) ;;
    *) note "[审批开关] MX_APPROVE_MODE='${MX_APPROVE_MODE}' 非法（合法值 auto/manual/hybrid）——按 manual 全挂起处理"; return 0 ;;
  esac
  for u in "${INSTANCED_USERS[@]}"; do
    local pend
    # 去重改固定串（H5）：eid 形如 $abc…:matrix.test，当正则用时 `.` 是通配、^eid 还前缀
    # 命中——两个仅 `.` 位不同的 eid 互误判"已批"，!approve 永不发。两式并联：本台账
    # （裸 eid 整行）由 -Fx 全行命中；eid+空格分隔的多字段行（主干格式）由 -F "$eid "
    # 命中（分隔符收边界防前缀），旧版台账行不漏、重跑不重复批。
    # 只匹配原始请求（"needs your OK" 提示头）：超时后 hermes 会把请求 m.replace 编辑成
    # "Approval timed out…"，旧模式 `needs your OK|approval` 会把编辑事件也当请求，对
    # 带 relation 的编辑事件开线程必被 Synapse 拒（run4/run5 实锤 18/19 NO_REPLY）。
    pend=$(mx_messages "$(load_token "$u")" "$room" 20 2>/dev/null | jq -r --arg agent "$(agent_mxid "$u")" \
      '.[] | select(.sender == $agent and ((.content.body // "") | test("needs your OK"))) | .event_id' 2>/dev/null \
      | while read -r eid; do grep -qFx "$eid" "$APPROVED_LOG" || grep -qF "$eid " "$APPROVED_LOG" || echo "$eid"; done) || true
    for eid in $pend; do
      mxq_enqueue "$u" "$room" "$eid"   # ③b：镜像入产品收件箱（auto/manual/hybrid 双可见）
      if [[ "$MODE" == "hybrid" ]]; then
        local body line rc
        body=$(mx_messages "$(load_token "$u")" "$room" 20 2>/dev/null | jq -r --arg e "$eid" \
          '[.[] | select(.event_id == $e)][0].content.body // ""' 2>/dev/null) || body=""
        if approve_is_critical "$body"; then
          echo "$eid HUMAN_PENDING $u $(date +%s)" >> "$APPROVED_LOG"
          note "[${u}][人工审批挂起] 关键操作待真人复核：element 以 ${u} 回复 !approve / !deny —— $(printf '%s' "$body" | head -c 100 | tr '\n' ' ')"
          continue
        fi
        line=$(review_state_get "$eid")
        if [[ -z "$line" ]]; then
          approve_review_ask "$u" "$eid" "$body"
          continue
        fi
        approve_review_poll "$u" "$room" "$eid" "$line"
        rc=$?
        (( rc == 2 )) || continue
        note "[hybrid] 代审通过→执行批准 ${eid}"
      fi
      local reply_eid="" react_eid="" root
      # 反应通道（✅=once）：按 prompt.session_key 直解，不受线程/会话路由影响，是双兜底之一
      react_eid=$(mx "$(load_token "$u")" POST "rooms/$room/send/m.reaction" \
        "{\"m.relates_to\":{\"rel_type\":\"m.annotation\",\"event_id\":\"$eid\",\"key\":\"✅\"}}" \
        | jq -r '.event_id // empty' 2>/dev/null) || true
      # 线程通道：请求事件本身就是线程子事件，从它开新线程会被 Synapse 拒
      # （M_UNKNOWN: Cannot start threads from an event with a relation）——必须把
      # 回复发进请求所在线程（root=其 m.relates_to.event_id），并 m.in_reply_to 指回请求，
      # 才与被阻塞的 agent 回合同会话键，!approve 命令路由才命中等待中的审批。
      root=$(mx_messages "$(load_token "$u")" "$room" 20 2>/dev/null | jq -r --arg e "$eid" \
        '[.[] | select(.event_id == $e)][0] | (.content."m.relates_to" | if . and .rel_type == "m.thread" then .event_id else empty end) // $e' 2>/dev/null) || root="$eid"
      reply_eid=$(mx "$(load_token "$u")" POST "rooms/$room/send/m.room.message" \
        "{\"msgtype\":\"m.text\",\"body\":\"!approve\",\"m.relates_to\":{\"rel_type\":\"m.thread\",\"event_id\":\"$root\",\"is_falling_back\":true,\"m.in_reply_to\":{\"event_id\":\"$eid\"}}}" \
        | jq -r '.event_id // empty' 2>/dev/null) || true
      # 兜底：线程发送仍失败则退化为房间级 !approve（session_scope=room 时同样命中）
      if [[ -z "$reply_eid" ]]; then
        reply_eid=$(mx "$(load_token "$u")" POST "rooms/$room/send/m.room.message" \
          "{\"msgtype\":\"m.text\",\"body\":\"!approve\"}" \
          | jq -r '.event_id // empty' 2>/dev/null) || true
      fi
      echo "$eid ${reply_eid:-NO_REPLY} $u $(date +%s)" >> "$APPROVED_LOG"
      note "[$u] 线程内回复 !approve（请求 ${eid} → 回执 ${reply_eid:-NO_REPLY}${react_eid:+ 反应=${react_eid}}）"
    done
  done
}

# ── 闸点经验沉淀（2026-10-02 用户终局：有意义卡点自动 review，减空转、token 花在刀刃）──
# 每 turn 自动 review fork 已由 auxiliary.background_review.enabled=false 关闭；
# 沉淀发生在有意义卡点：治理闸/大协作阶段完成时，对该阶段**实质干活**的 agent
# 各触发一次。触发方式：在 agent 最近的工作线程内发 "!refine <闸点名>"——
# 群会话键是 thread 级（build_session_key thread 优先），线程内消息按 thread
# 归属路由到该 agent（approve 线程回复实证），refine 因此对准**真实工作历史**
# 而非空会话（v1 的 DM 垫话方案 refine 的是空 DM 会话，已废）。body 必须以
# "!refine" 开头——matrix 命令归一化（adapter _normalize_matrix_bang_command）
# 只认 ! 开头的 body，前置 @mention 会使命令沦为聊天文本（v2 前缀缺陷已修，
# 与 !approve 纯命令形态同构）。/refine 走 background_review 同一代码路径且
# 不查 enabled。MX_GATE_REVIEW=0 可整体停用。
gate_review() { # <human-user> <gate-name> —— best-effort，不阻塞流程
  local u="$1" gate="$2" room tok last_eid thread_root payload re
  [[ "${MX_GATE_REVIEW:-1}" == "1" ]] || return 0
  room="${SCAN_ROOM:-$(sget room_analysis)}"
  [[ -n "$room" ]] || return 0
  tok=$(load_token "$u")
  # 该 agent 群内最近一条消息 = 当前工作线程最新活动
  last_eid=$(mx_messages "$tok" "$room" 50 2>/dev/null | jq -r --arg s "$(agent_mxid "$u")" \
    '[.[] | select(.sender == $s)][0].event_id // empty' 2>/dev/null)
  if [[ -z "$last_eid" ]]; then
    note "[观察] 闸点沉淀：${u}@${gate} 未找到 ${u}-agent 近期群消息（跳过）"
    return 0
  fi
  thread_root=$(mx_messages "$tok" "$room" 50 2>/dev/null | jq -r --arg e "$last_eid" \
    '[.[] | select(.event_id == $e)][0] | (.content."m.relates_to" | if . and .rel_type == "m.thread" then .event_id else empty end) // $e' 2>/dev/null) || thread_root="$last_eid"
  # jq 键名含点必须引号（m.relates_to/m.in_reply_to 裸键=语法错误，set -e 下击杀驱动
  # ——run7 实锤：testpass 步 gate_review 死循环重启三连的根因）
  payload=$(jq -n --arg r "$thread_root" --arg e "$last_eid" \
    --arg m "!refine ${gate}" \
    '{"msgtype":"m.text", body:$m, "m.relates_to":{"rel_type":"m.thread", event_id:$r, is_falling_back:true, "m.in_reply_to":{event_id:$e}}}')
  re=$(mx "$tok" POST "rooms/$room/send/m.room.message" "$payload" | jq -r '.event_id // empty' 2>/dev/null) || true
  if [[ -n "$re" ]]; then
    note "[闸点沉淀] ${u}@${gate}：!refine 已发进工作线程（${re}）——background_review 对真实工作历史触发"
  else
    note "[观察] ${u}@${gate} !refine 发送失败（跳过，不影响流程）"
  fi
}

wait_truth() { # <desc> <timeout-sec> <predicate-cmd...>
  local desc="$1" timeout="$2"; shift 2
  local deadline=$(( $(date +%s) + timeout ))
  while (( $(date +%s) < deadline )); do
    [[ -n "${SCAN_ROOM:-}" ]] && auto_approve "$SCAN_ROOM" || true
    if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓"; return 0; fi
    sleep "$MX_POLL_IVAL"
  done
  note "[真值] $desc ✗（${timeout}s 超时）"
  return 1
}



# ── 分支新鲜度（2026-10-02 run6 实锤：run5 旧 feat/DEV-* 分支留存，devimpl 存在性
# 检查秒过=假真值，驱动用旧代码跑完后续步。与 repo_has 文件新鲜度同口径：分支 tip
# 提交时间必须 ≥ run_started_at；缺键退化为存在性旧语义并告警。──
branch_fresh() { # <branch>（导演 clone fetch 后核验：存在且 tip 提交时间在本轮起跑后）
  local br="$1" ct rs
  git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" rev-parse -q --verify "refs/remotes/origin/$br" >/dev/null 2>&1 || return 1
  rs="$(sget run_started_at)"
  if [ -z "$rs" ]; then
    log "[观察] branch_fresh 无 run_started_at 键（旧 state 兼容），退化为存在性：$br"
    return 0
  fi
  ct="$(git -C "$DIRECTOR_CLONE" log -1 --format=%ct "origin/$br" 2>/dev/null)"
  [ -n "$ct" ] && [ "$ct" -ge "$rs" ] 2>/dev/null
}

# ── 活性等待（2026-10-01 用户裁决：重载任务不设绝对时长上限）─────────────
# 只要责任 agent 还在产出（profiles/<a>/logs/agent.log 持续增长）就一直等；
# 连续 <idle-sec> 无日志增长才判空转/死循环退出。长生成/长测试的单次静默
# 远小于阈值（run6 实测大生成 6 分钟级），1800s 足够宽容；真死循环（429 退避
# 风暴、工具卡死）会在阈值内暴露。无可观测日志面时退化为 86400s 硬窗并告警。

# ── 帧采集焊死进驱动（2026-10-07 run10 教训：13h 推演零实时帧=报告空壳）──
# 每步末尾自动调用 r18-frames.mjs 拍当轮实时帧；不设任何跳过开关。
# 采集失败不阻断流程（记单），但报告生成器有硬闸：帧数=0 拒出报告。
capture_step() { # <step> <url> [action] [user]
  local step="$1" url="$2" action="${3:-}" user="${4:-fanfan}"
  local rc=0
  if [[ -n "$action" ]]; then
    node "$SCRIPT_DIR/mux/r18-frames.mjs" --run "$RUN_ID" --step "$step" --k 1 --url "$url" --action "$action" --user "$user" >/dev/null 2>&1 || rc=$?
  else
    node "$SCRIPT_DIR/mux/r18-frames.mjs" --run "$RUN_ID" --step "$step" --k 1 --url "$url" --user "$user" >/dev/null 2>&1 || rc=$?
  fi
  if (( rc != 0 )); then
    note "[帧采集] 步 $step 采集失败（rc=$rc，记单不阻断）"
    echo "ISSUE|frame-capture-failed|step-$step|r18-frames 采集失败 rc=$rc（url=$url）" >> "$EVID_DIR/issues.log"
  fi
}

wait_alive_truth() { # <desc> <idle-sec> <agents-csv> <predicate-cmd...>
  local desc="$1" idle="$2" agents="$3"; shift 3
  local -a logs=()
  local a
  for a in ${agents//,/ }; do
    [[ -f "$HERMES_ROOT/profiles/$a/logs/agent.log" ]] && logs+=("$HERMES_ROOT/profiles/$a/logs/agent.log")
  done
  if (( ${#logs[@]} == 0 )); then
    note "[观察] wait_alive_truth 无日志面可观测（agents=$agents HERMES_ROOT=${HERMES_ROOT:-未设}），退化为 86400s 硬窗"
    wait_truth "$desc" 86400 "$@"
    return
  fi
  local last_sig=0 last_size=-1 cur_size sz
  # idle-nudge（2026-10-04 run8 plan 步实录：agent 审批后提前收工、静坐 1800s 才被判死重派，
  # 损失=30 分钟死窗+agent 重做上下文。中途轻推一次：空转过半时 @agent 催办，多数"提前收工"
  # 会被一条提醒拉回；催后仍静默才走原判死路径。agent 恢复活动则重新武装（新一轮静默可再催）。
  local nudged=0 idle_half=$(( idle / 2 ))
  local _nroom="${SCAN_ROOM:-$(sget room_analysis 2>/dev/null || true)}"
  local _nmentions=""
  for a in ${agents//,/ }; do _nmentions="${_nmentions:+$_nmentions,}$(agent_mxid "$a")"; done
  while true; do
    [[ -n "${SCAN_ROOM:-}" ]] && auto_approve "$SCAN_ROOM" || true
    if "$@" >/dev/null 2>&1; then note "[真值] $desc ✓"; return 0; fi
    cur_size=0
    for a in ${logs[@]+"${logs[@]}"}; do
      sz=$(stat -f%z "$a" 2>/dev/null || stat -c%s "$a" 2>/dev/null || echo 0)
      cur_size=$(( cur_size + sz ))
    done
    if (( last_size < 0 )); then last_size=$cur_size; last_sig=$(date +%s); fi
    if (( cur_size > last_size )); then last_sig=$(date +%s); last_size=$cur_size; nudged=0; fi
    # 注意：字符串判空不能进算术上下文（run8 实锤：(( ... && -n "$x" )) 把 -n 解析成
    # "减变量 n"，set -u 下 n: unbound variable 击杀驱动）——[[ ]] 移出 (( ))。
    if (( idle_half >= 300 && nudged == 0 && $(date +%s) - last_sig > idle_half )) && [[ -n "${_nroom:-}" ]]; then
      mx_send "$(load_token fanfan)" "$_nroom" "⏰ 催办：仍在等待「${desc}」。若你已完成派发词的部分条目，请继续完成剩余条目（交付物入库并 push、结论行收口）；确有阻塞请在群里说明。" "${_nmentions}" >/dev/null 2>&1 || true
      note "[观察] 空转过半（${idle_half}s），已向 $agents 催办一次"
      nudged=1
    fi
    if (( $(date +%s) - last_sig > idle )); then
      note "[真值] $desc ✗（${idle}s 空转：$agents 日志零增长，判死循环/空转，非时长超限；中途已催办未响应）"
      return 1
    fi
    sleep "$MX_POLL_IVAL"
  done
}

# ── 完成凭证反向核验（账号板断言）────────────────────────
mx_messages_deep() { # <token> <room> <since-epoch-sec> <max-pages> — dir=b 翻页直抵 since 时刻
  # 消息洪后固定窗口失效（run4 实锤：500 条只回溯到当天上午，昨日派发被挤出）。
  # 用 end token 连续翻页，直到某页最老消息早于 since 或页数耗尽；输出与 mx_messages 同构数组。
  local tok="$1" room="$2" since_ms=$(( $3 * 1000 )) pages="${4:-10}" out='[]' page_url chunk oldest end_tok
  page_url="$HS/_matrix/client/v3/rooms/$room/messages?access_token=$tok&dir=b&limit=500"
  for _ in $(seq 1 "$pages"); do
    chunk=$(curl -sf -m 20 "$page_url" 2>/dev/null) || break
    chunk=$(printf '%s' "$chunk" | jq -c '{chunk: (.chunk // []), end: .end}' 2>/dev/null) || break
    out=$(jq -c --slurp 'add' <(printf '%s' "$out") <(printf '%s' "$chunk" | jq '.chunk') 2>/dev/null) || break
    oldest=$(printf '%s' "$chunk" | jq -r '[.chunk[].origin_server_ts] | min // 0')
    [ "${oldest:-0}" -lt "$since_ms" ] && break
    end_tok=$(printf '%s' "$chunk" | jq -r '.end // empty')
    [ -n "$end_tok" ] || break
    page_url="$HS/_matrix/client/v3/rooms/$room/messages?access_token=$tok&dir=b&limit=500&from=$end_tok"
  done
  printf '%s' "$out"
}

kanban_raci_nonempty() { # <needle> → 0=任一 fanfan 板匹配卡带非空 raci（回灌重查谓词）
  [[ -n "$(kanban_raci_of fanfan "$1")" ]]
}

raci_dispatch_seen() { # <user1> <user2> <room> → 0=窗口内出现双向派发消息（供 wait_truth 当前 shell 直调）
  # 勿经 bash -c 包装本函数：shell 函数不跨子进程继承（未 export -f），子进程必 127 恒假。
  # 提及判定=正文 OR m.mentions 字段（run7 实锤：派发消息正文只含被派人 mxid，
  # 团队负责人经 content."m.mentions".user_ids 附带——任务书明确要求"用 m.mentions 提及"，
  # 只查正文对合规消息恒假阴性；深翻页另证 17:20-18:10 无 fanfan 双 @ 正文消息，
  # 观察 4 条的真因是消息未发而非窗口外）。
  mx_messages_deep "$(load_token fanfan)" "$3" $(( $(date +%s) - 3600 )) 3 \
    | jq -e --arg u1 "@$1-agent" --arg u2 "@$2-agent" \
      '[.[] | select(.type=="m.room.message")
        | (.content.body//"") as $b
        | ((.content["m.mentions"] // {}) | (.user_ids // [])) as $m
        | select((($b | contains($u1)) or ($m | any(.; startswith($u1))))
             and (($b | contains($u2)) or ($m | any(.; startswith($u2)))))] | length > 0'
}

verify_done_evidence() { # <rfd> → 0 DONE 凭证全部为真 / 1 缺失或造假
  # 只认"可反向核验"的完成：结论行里的 commit 必须真在 aipaydev origin 上、
  # 且该 commit 确实含分析稿；card 必须能在 fanfan 账号的板（账号板）查到。
  # 空喊"完成"不计入。
  local rfd="$1" body sha card
  # 注释必须写在命令替换之外：续行 \` 之后的注释行会吞掉续行，| jq 成为行首管道，
  # 整个替换体解析失败、jq 过滤器不执行，body 变成全量消息 JSON（P1，防造假失效）。
  # /messages?dir=b 返回顺序是"新→旧"，必须取 first；取 last 会拿到最旧那条
  # 无凭证裸 DONE，把已重报的合格凭证误判为不合格（09-23 实锤 false negative）。
  # 双重过滤防回声自毒（09-26 实锤 false negative）：派发指令与打回消息本身都含
  # "ANALYSIS-DONE-<rfd>" 模板串，只按内容 contains 匹配时最新命中永远是验证器
  # 自己的回声。故 ①发信人钉 agent 账号（agent_mxid）②内容须带完整凭证形态
  # （commit=<hex> card=<非空白>），模板行 commit=<已推送commitId> 不满足。
  # 深翻页取样（run5 实锤 false negative）：房间消息洪（⏳ Working 心跳/多 agent 回合）下
  # 固定 200 条只回溯几分钟，17:20 的真结论行 17:25 就被挤出窗口，凭证核验永远差一拍。
  # 改 mx_messages_deep 回溯 48h 翻页取样；判别逻辑不变（发信人+凭证形态双过滤）。
  body=$(mx_messages_deep "$(load_token fanfan)" "$(sget room_analysis)" $(( $(date +%s) - 172800 )) 12 2>/dev/null \
    | jq -r --arg p "ANALYSIS-DONE-$rfd" --arg s "$(agent_mxid fanfan)" \
      '[.[] | select((.sender//"") == $s)
            | select((.content.body//"") | contains($p))
            | select((.content.body//"") | test("commit=[0-9a-fA-F]{7,40} card=[^ ,；;]+"))
       ] | first | .content.body // ""')
  [[ -n "$body" ]] || { note "[凭证] 未见 $rfd 的 DONE 行"; return 1; }
  sha=$(printf '%s' "$body" | grep -oE 'commit=[0-9a-fA-F]{7,40}' | head -1 | cut -d= -f2)
  # card 提取钉字符集（run4 实锤）：agent 结论行常带 Markdown 加粗（**card=t_xxx**），
  # [^ ,；;]+ 会把 ** 一起吃进卡号致反核 grep 失配、真凭证误判虚报。卡 ID 只含
  # [A-Za-z0-9_-]，钉死字符集对加粗/代码块包裹免疫。
  card=$(printf '%s' "$body" | grep -oE 'card=[A-Za-z0-9_-]+' | head -1 | cut -d= -f2)
  [[ -n "$sha" && -n "$card" ]] || { note "[凭证] DONE 行缺 commit/card 凭证：$body"; return 1; }
  git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" cat-file -e "$sha^{commit}" 2>/dev/null \
    || { note "[凭证] commit $sha 不存在于 aipaydev —— 虚报"; return 1; }
  git -C "$DIRECTOR_CLONE" ls-tree -r --name-only "$sha" 2>/dev/null | grep -q "${rfd}-tasklist.md" \
    || { note "[凭证] commit $sha 里没有 ${rfd}-tasklist.md —— 虚报"; return 1; }
  # 卡号反核含 archived（09-26 实锤 false negative）：agent 完成后归档卡属正常工作流，
  # kanban_list（默认活跃态 + studio API 面）都看不到 archived 真卡，曾把合格凭证
  # 误判"虚报"。改 CLI 直查全状态（活跃 + archived）；studio API 整板返空问题另记。
  local slug card_found=1
  for slug in $(account_boards fanfan); do
    if HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$slug" list 2>/dev/null | grep -q "$card" \
      || HERMES_HOME="$HERMES_ROOT" hermes kanban --board "$slug" list --status archived 2>/dev/null | grep -q "$card"; then
      card_found=0; break
    fi
  done
  [[ $card_found -eq 0 ]] \
    || { note "[凭证] fanfan 账号板查无卡片 ${card}（含 archived）—— 虚报"; return 1; }
  note "[凭证] $rfd 完成证据成立（card 在 fanfan 账号板可查）：commit=$sha card=$card"
  return 0
}

# ── 仓库/房间真值 ───────────────────────────────────────
repo_has() { # <path-in-repo>（导演 clone 拉最新后核验）
  git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" show "origin/main:$1" >/dev/null 2>&1 || return 1
  # 工件新鲜度（run5 教训：旧轮 AN-*/T-* 稿未被 mx-clean 清掉，"文件存在"被旧稿
  # 满足=假真值）。文件在 origin/main 的最后提交时间必须 ≥ 本轮首次起跑时刻；
  # run_started_at 缺键（旧轮 state）时保持旧语义并告警，不静默放行新代码路径。
  local _rs
  _rs="$(sget run_started_at)"
  if [ -z "$_rs" ]; then
    log "[观察] repo_has 无 run_started_at 键（旧 state 兼容），跳过新鲜度窗口：$1"
    return 0
  fi
  local _ct
  _ct="$(git -C "$DIRECTOR_CLONE" log -1 --format=%ct "origin/main" -- "$1" 2>/dev/null)"
  [ -n "$_ct" ] || return 1
  (( _ct >= _rs ))
}
test_report_on_integration() { # <rfd>：测试报告在 origin/integration/<rfd>（发布基线分支口径，
  # 与 testpass 派发词 push 目标一致）。run7 实锤：testpass/uat 用 repo_has（origin/main
  # 口径）查一份只进 integration 的报告=永假——testpass 六代重启代代白派、UAT 九连死循环
  # 3h45m 的共同根因位。冻结件仍走 repo_has（main 口径）。
  git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" show "origin/integration/$1:docs/test/$1-test-report.md" >/dev/null 2>&1
}

uat_evidence_body() { # 本轮（run_started_at 起）fanfan 发的最新一条 UAT-EVIDENCE 结论行 body；
  # 无则输出空串。证据复用（run8 优化 A）与等待后取样共用同一取法，保证"复用判定"与
  # "正式核验"看到同一行。按 origin_server_ts 排序取最新（结论行以最终一条为准），
  # 与 mx_messages 返回序解耦。
  mx_messages "$(load_token bella)" "$(sget room_analysis)" 200 2>/dev/null \
    | jq -r --arg s "$(agent_mxid fanfan)" --argjson since "${1}000" \
      '[.[] | select(.origin_server_ts > $since and .sender == $s and ((.content.body // "") | test("^\\s*UAT-EVIDENCE")))] | sort_by(.origin_server_ts) | .[-1] | .content.body // ""' 2>/dev/null
}

# repo_pull（Z3）：只刷引用、不动当前分支/工作树。旧写法 `git pull origin main` 会把
# origin/main merge 进当前分支——defect 步后 HEAD 停在 integration/${RFD_ID}，pull 即把
# main 混进集成分支污染其历史。现改为：全量 fetch 刷远端引用（repo_has/步骤内 merge 用的
# origin/*），再把本地 main 快进到 origin/main（供以本地 main 为基的路径用；main 在别处
# 检出或非快进时 git 自行拒绝，静默跳过，与 repo_commit_main 的收尾口径一致）。
repo_pull() {
  git -C "$DIRECTOR_CLONE" fetch -q origin >/dev/null 2>&1 || true
  git -C "$DIRECTOR_CLONE" fetch -q origin main:main >/dev/null 2>&1 || true
}

# ── 分支状态机约定（P4）──────────────────────────────────────
# DIRECTOR_CLONE 的 HEAD 归属：defect 步 `checkout -B integration/${RFD_ID}` 后停在
# integration 分支，后续步骤都用显式 ref（origin/integration/...）或临时 worktree 访问
# 仓库，不看 HEAD。凡**要进 origin/main 的提交**（uat 验收书/audit 意见书/retro 复盘）
# 一律走本函数：不切分支、不动 HEAD/local main、全程无 rebase——在临时 detached 工作区
# 基于 origin/main 把该文件提交进去再 push HEAD:main。为什么不能沿用旧写法
# "integration 上 commit 后 `git push origin main`"：推的是落后的 local main，非快进被拒
# 或空推，提交永远进不了 main，被拒即 set -e 暴毙、*_done 键落不了；rebase 被打断还会留
# rebase-merge 中间态。为什么不在原地 `checkout main` 再提交：目标文件已在 main 树里时
# （重跑轮）checkout 会被未跟踪/本地改动挡住，且脏工作树让 pull --rebase 直接拒绝。
repo_commit_main() { # <repo 相对路径> <author-name> <author-email> <commit-msg>
                     # → 0 已入 origin/main（或内容无变化幂等跳过）/ 1 失败（已收尾，无中间态）
  local path="$1" name="$2" email="$3" msg="$4"
  local wt="$SIM_ROOT/var/main-doc-wt"
  [[ -f "$DIRECTOR_CLONE/$path" ]] || return 1
  ( # 子 shell 作业：任何一步失败即退出非零，EXIT trap 统一拆工作区，不留注册残留
    trap 'rm -rf "$wt"; git -C "$DIRECTOR_CLONE" worktree prune >/dev/null 2>&1 || true' EXIT
    git -C "$DIRECTOR_CLONE" fetch -q origin || exit 1
    mkdir -p "$SIM_ROOT/var" || exit 1
    rm -rf "$wt"; git -C "$DIRECTOR_CLONE" worktree prune >/dev/null 2>&1 || true
    git -C "$DIRECTOR_CLONE" worktree add -q --detach "$wt" origin/main || exit 1
    mkdir -p "$wt/$(dirname "$path")" || exit 1
    cp "$DIRECTOR_CLONE/$path" "$wt/$path" || exit 1
    if [[ -n "$(git -C "$wt" status --porcelain -- "$path")" ]]; then
      git -C "$wt" add -- "$path" || exit 1
      git -C "$wt" -c user.name="$name" -c user.email="$email" \
        commit -qm "$msg" -- "$path" || exit 1
      git -C "$wt" push -q origin HEAD:main || exit 1
    fi
    # local main 快进到同一提交：它是 `git push origin main` 的推送源，落后即空推/被拒
    git -C "$DIRECTOR_CLONE" fetch -q origin main:main 2>/dev/null || true )
}

room_has_from() { # <room> <sender-mxid> <pattern> [since-ms]
  # since-ms（可选，默认 0）：只认该时刻之后的消息。门禁必须传派发时刻——
  # 只按 sender+pattern 匹配历史消息会让上一轮残留结论行"秒过"门禁（假完成）：
  # V4-run1 02:26:34 G5 结论行 4 秒即 ✓ 实为 01:04 的旧 READY-GATE 行，
  # 02:26:50 的 PASS 判定也可能是 01:44 超时后迟到的旧回执（TEST 侧早已用
  # SINCE_TS 过滤根治同类问题，门禁侧漏了同款修复）。
  mx_messages "$(load_token fanfan)" "$1" 120 | jq -e --arg s "$2" --arg p "$3" --argjson since "${4:-0}" \
    'map(select((.origin_server_ts // 0) > $since and .sender == $s and ((.content.body // "") | test($p)))) | any' >/dev/null 2>&1
}

# ── 闸门判词语义（run2 2026-09-29 04:49 实锤，独立审计意见 R-A2）────────
# 判词子串匹配会被「引用/讨论」消息命中：fanfan-agent 转述 stub 原文
# 「结论行 READY-GATE-PASS 或 READY-GATE-FAIL」，G5 即把该条当结论行误过
# （04:49:04 判 ✓，真实评审 04:51:27 才完成且卡面结论实为 READY-GATE-FAIL）。
# 语义：**最后一个判词赢**——结论行居末是派单既定约定（"结论行 … 开头"、卡面
# conclusion 节在 body 末尾）；同一行判词成对出现（PASS…FAIL / FAIL…PASS）视为
# 协议转述，整行不作判词（f1979781 G2 卡面自毒根治：卡面引用判词契约原文时，
# 协议文本自身不得把门禁判成 FAIL）。多条结论行取时间最新一条（打回后复审 PASS 盖过前次 FAIL）。FAIL
# 是显式判词：调用方必须熔断，不得置卡 done、不得落键（R-A2）。
mx_text_gate_verdict() { # <gate 前缀> <text> → stdout: PASS|FAIL|空（空=无判词）
  local out
  # errexit 自守（本库 773 行 set -euo pipefail 是运行态）：grep -vE 全滤空/grep -oE
  # 零匹配都退 1，裸赋值管道会炸掉整个调用方脚本——无判词是常态输入不是错误。
  out=$(printf '%s' "$2" | { grep -vE "$1-PASS.*$1-FAIL|$1-FAIL.*$1-PASS" || true; } | { grep -oE "$1-(PASS|FAIL)" || true; } | tail -1)
  case "$out" in
    *-PASS) echo PASS ;;
    *-FAIL) echo FAIL ;;
    *) echo "" ;;
  esac
}

mx_room_gate_verdict() { # <room> <sender-mxid> <gate 前缀> [since-ms] → stdout: PASS|FAIL|空
  local room="$1" sender="$2" gate="$3" since="${4:-0}"
  mx_messages "$(load_token fanfan)" "$room" 200 2>/dev/null | jq -r --arg s "$sender" --arg g "$gate" --argjson since "$since" '
    [ .[] | select((.origin_server_ts // 0) > $since and .sender == $s)
      | {ts: (.origin_server_ts // 0),
         v: ((.content.body // "") | [match($g + "-(PASS|FAIL)"; "g") | .captures[0].string] | last // empty)}
      | select(.v != "") ]
    | sort_by(.ts) | last | .v // empty'
}

kanban_card_gate_verdict() { # <user> <卡 needle> <gate 前缀> → stdout: PASS|FAIL|空
  # 评审记录落卡 body 是准出的权威载体（派单即要求 review-record 落卡），房间行
  # 只是广播；卡判词与房间行判词由调用方合并（FAIL 优先，保守不放行）。
  local body
  body=$(kanban_list "$1" | jq -r --arg n "$2" \
    '[.. | objects | select(has("title")) | select(((.title // "") + (.body // "")) | contains($n)) | .body][0] // ""')
  mx_text_gate_verdict "$3" "$body"
}

mx_gate_verdict_seen() { # <room> <sender> <gate> [since-ms] → 0 当出现任一判词结论行
  [[ -n "$(mx_room_gate_verdict "$@")" ]]
}

mx_gate_verdict_dual_seen() { # <room> <sender> <gate> <since-ms> <card-user> <card-needle> → 0 房间行或卡面任一出现判词
  # 双源到达判定（run4）：arch 评审可经 kanban worker 执行（写卡不发房）——只盯房间行
  # 会让真实结论永远等不到。到达=任一源出现；判 PASS/FAIL 仍由 combined 保守合并。
  [[ -n "$(mx_gate_verdict_combined "$@")" ]]
}

mx_gate_verdict_pass() { # <room> <sender> <gate> [since-ms] → 0 仅当最新结论判词为 PASS
  [[ "$(mx_room_gate_verdict "$@")" == "PASS" ]]
}

mx_gate_verdict_combined() { # <room> <sender> <gate> <since-ms> <card-user> <card-needle> → stdout: PASS|FAIL|空
  # 房间行 + 评审卡 body 双源合并（R-A2）：FAIL 任一出现即 FAIL（保守不放行），
  # 仅当无 FAIL 且任一 PASS 才 PASS。卡 body 是权威载体（review-record 在卡）；
  # 复审轮必须同步更新卡结论行，否则旧 FAIL 判词持续拦门（安全方向）。
  local rv cv
  rv="$(mx_room_gate_verdict "$1" "$2" "$3" "$4")"
  cv="$(kanban_card_gate_verdict "$5" "$6" "$3")"
  if [[ "$rv" == "FAIL" || "$cv" == "FAIL" ]]; then echo FAIL; return 0; fi
  if [[ "$rv" == "PASS" || "$cv" == "PASS" ]]; then echo PASS; return 0; fi
  echo ""
}

mx_gate_combined_pass() { # 同 mx_gate_verdict_combined，供 wait_truth 断言用
  [[ "$(mx_gate_verdict_combined "$@")" == "PASS" ]]
}

dispatch_in_room() { # <humanUser> <text> <mention-mxid-csv> → event_id
  local m uid rid u lp members
  local uids=()
  uid="$(human_mxid "$1")"; rid="$(sget room_analysis)"
  # 成员保障 v2（09-26 v1 只保派发者；09-29 重构轮扩展到全部被 @ 责任人）：
  # 指令必达前置——被 @ 者不在群则 mention 不可达、其 agent 无从接单
  # （V4-run1 room-invite-gap ×8 复发实锤：接收方而非派发方缺位）。
  # 不在群则 fanfan 补邀 + 该账号自入（join 按 mxid localpart 取 token）。
  uids=("$uid")
  if [[ -n "${3:-}" ]]; then
    local IFS=','
    read -r -a uids_m <<< "$3"
    uids+=("${uids_m[@]}")
  fi
  members="$(mx_room_members "$(load_token fanfan)" "$rid" 2>/dev/null || true)"
  for u in "${uids[@]}"; do
    [[ -n "$u" ]] || continue
    if ! printf '%s\n' "$members" | grep -qxF "$u"; then
      mx "$(load_token fanfan)" POST "rooms/$rid/invite" "{\"user_id\":\"$u\"}" >/dev/null 2>&1 || true
      lp="${u%%:*}"; lp="${lp#@}"
      mx_join "$(load_token "$lp")" "$rid" >/dev/null 2>&1 || true
    fi
  done
  m=$(mx_send "$(load_token "$1")" "$(sget room_analysis)" "$2
[派发标识 RUN=${RUN_ID:-default}] 去重键=任务 ID+RUN：同任务 ID 的历史轮（不同 RUN）不构成重复派单，须重新执行或核验并回执结论行；判定重复也必须回执合并回执，禁止静默。
[RACI 解析] 本任务唯一执行人=任务书正文被指名执行的主责 agent（首个 @）；其余 @ 为 RACI 会签/评审角色（lead 等），不执行本任务、仅知情与确认。结论行只由执行人发。" "$3")
  note "[$1] 派发 ($m): $(echo "$2" | head -1)"
  echo "$m"
}

# ── 推演单驱动锁（单一事实源，可单测）────────────────────────
# 双会话双开推演是实测最高频互踩源（共享 state.env/板库/房间双写）。mkdir 原子锁
# （macOS 无 flock；mkdir 在各文件系统均原子）：锁不可得即大声拒绝，不静默并发。
# 陈锁判定根治（2026-09-29 V4-run1 02:26 实锤）：旧版 `sed -n 's/^pid=//p'` 把
# "pid=84431 start=… host=…" 整段取出，`kill -0 "84431 start=…"` 报 illegal pid
# 恒失败 → **活锁被误判陈锁、被接管**——run1 ready 续跑误抢 run2 活锁，双驱动同栈
# 互写 12 分钟。判活只取 pid 数字段；解析不出一律按活锁拒绝（宁停勿抢）。
mx_lock_holder_pid() { # <info-file> → 持锁 pid（仅数字段；解析不出=空串）
  sed -n 's/^pid=\([0-9][0-9]*\).*/\1/p' "$1" 2>/dev/null | head -1
}

mx_driver_lock_acquire() { # <lock-dir> <pid> → 0 取得 / 1 活锁被占 / 2 接管竞争失败
  local d="$1" pid="$2" held
  _mx_lock_info() { printf 'pid=%s start=%s host=%s\n' "$2" "$(date '+%F %T')" "$(hostname -s)" > "$1/info"; }
  if mkdir "$d" 2>/dev/null; then _mx_lock_info "$d" "$pid"; return 0; fi
  held=$(mx_lock_holder_pid "$d/info")
  if [[ -n "$held" ]] && ! kill -0 "$held" 2>/dev/null; then
    # 接管原子化：mv 摘走陈锁再 mkdir，绝不原地 rm——kill -0 判死与 rm 之间第三方
    # 可新建活锁被误删（双驱动同栈互写）。竞争失败时陈锁归档 ${d}.stale.$$ 可回查。
    local stale="${d}.stale.$$"
    mv "$d" "$stale" 2>/dev/null || return 2
    if mkdir "$d" 2>/dev/null; then _mx_lock_info "$d" "$pid"; rm -rf "$stale"; return 0; fi
    return 2
  fi
  return 1
}

# ── 硬闸打回熔断（跨调用持久，人工放行留痕）──────────────────
# 语义定性（2026-09-29 g5-ready-fail 记档）：V3 "两轮未过，不得发布/不得开始"是
# 防 agent 无限重做回路的硬闸；断点续跑曾静默重置轮次绕过熔断（run1 01:44 G5
# 两轮熔断 → 02:26 续跑直接放行）。根治：轮次计数按 RUN 落 state 持久化，达阈值
# 后新调用直接拒绝；人工确认可重试须 GATE_BREAKER_OVERRIDE=1 显式放行并记 issue
# （不可逆决策留痕，符合 V3 总则"人只守意图对齐与不可逆决策"）。
mx_gate_breaker_trip() { # <gate-key> <label> <unpassed-rounds>：记 N 轮未过
  local key="$1" label="$2" n="${3:-1}" cur
  cur=$(sget "${key}_fail_rounds"); cur=${cur:-0}
  sset "${key}_fail_rounds" $(( cur + n ))
  note "[熔断] ${label} 累计 $(( cur + n )) 轮未过（阈值 2）"
}

mx_gate_breaker_check() { # <gate-key> <label>：≥2 轮未过则拒绝，除非 GATE_BREAKER_OVERRIDE=1
  local key="$1" label="$2" cur
  cur=$(sget "${key}_fail_rounds"); cur=${cur:-0}
  (( cur < 2 )) && return 0
  if [[ "${GATE_BREAKER_OVERRIDE:-0}" == "1" ]]; then
    echo "ISSUE|gate-breaker-override|director|${label} 熔断已触发（${cur} 轮未过），人工 GATE_BREAKER_OVERRIDE=1 显式放行重试" >> "$EVID_DIR/issues.log"
    return 0
  fi
  echo "ISSUE|gate-breaker-tripped|director|${label} 熔断（${cur} 轮未过），本轮拒绝执行；重试须人工 GATE_BREAKER_OVERRIDE=1（断点续跑不得静默绕过）" >> "$EVID_DIR/issues.log"
  fail "${label} 打回熔断（${cur} 轮未过，V3 硬闸）：不得继续。人工确认可重试时以 GATE_BREAKER_OVERRIDE=1 重启。"
}

# ── V3 生命周期治理助手 ─────────────────────────────────
gate_blocked() { # <gate-key> <step-name>：硬闸检查——闸门 state 键未落即拒入后续步骤
  local key="$1" step="$2"
  [[ -n "$(sget "$key")" ]] && return 0
  echo "ISSUE|gate-bypass-blocked|${step}|硬闸 $(basename "$key") 未过，${step} 不得执行（V3 §3 治理总纲）" >> "$EVID_DIR/issues.log"
  fail "硬闸未过：${step} 前置闸门（${key}）未冻结，中止（见方案 V3 闭环治理）"
}

freeze_doc() { echo "docs/requirements/${RFD_ID}.freeze.md"; }

repo_branch_has() { # <branch> <path-in-repo>：远端分支上文件存在性（证据反查）
  git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" cat-file -e "refs/remotes/origin/$1:$2" 2>/dev/null
}

uat_ac_covered() { # <ac-list> <body> → 缺失 AC 编号清单（空串=逐条覆盖）
  local missing="" ac
  for ac in $1; do
    case "$2" in *"$ac"*) ;; *) missing="$missing$ac " ;; esac
  done
  printf '%s' "$missing"
}

uat_ac_verdict() { # <body> <AC-id> → 通过|有条件通过|不通过|未见
  # 逐条判词语义见 uat_verdict.py 模块头（单一事实源）：AC 组+判词共享切段、
  # 括号注耐受、冻结AC-M 映射归属包容、整词匹配、后段更具体者胜。
  # 后端独立成 py：BSD sed 括号表达式按字节啃多字节字符（剥注即毁正文，
  # 2026-10-02 守门 2 红实锤），正则语义放 python re 才稳；stdin 传正文，
  # 脚本走文件不占 stdin（heredoc 当脚本时 stdin 已被解释器吃掉的坑）。
  printf '%s' "$1" | python3 "$MX_SCRIPT_DIR/uat_verdict.py" "$2"
}

issue_disp_stat() { # → "<ISS_N> <DISP_N>" 问题单/处置记账条数（DISP|type|subject|disposition|note）
  local iss=0 disp=0
  [[ -f "$EVID_DIR/issues.log" ]] || { echo "0 0"; return 0; }
  iss=$(grep -c '^ISSUE|' "$EVID_DIR/issues.log" 2>/dev/null || echo 0)
  disp=$(grep -c '^DISP|' "$EVID_DIR/issues.log" 2>/dev/null || echo 0)
  echo "$iss $disp"
}

# ── M1 应用初始化：资产登记表（docs/admin/app-registry.md 生成）────
app_registry_gen() { # → stdout：registry 内容
  echo "# 应用资产登记表（app-registry，$(date '+%F %T')）"
  echo
  echo "| 应用 | 负责人 | 专属看板 | 技术栈 | SLA 级 | 状态 | 门禁骨架 |"
  echo "|---|---|---|---|---|---|---|"
  apps_of | while IFS='|' read -r app owner board stack sla; do
    skel="缺"
    ls "$DIRECTOR_CLONE/apps/$app/"vitest.config.* >/dev/null 2>&1 && skel="✓"
    echo "| $app | $owner | $board | $stack | $sla | 在役 | vitest ${skel} |"
  done
  echo
  echo "- 初始化约定：新应用必须建 apps/<app>/ 脚手架（package.json+vitest 配置+README）、登记本表、挂负责人专属看板（board.json default_workdir 指向工作区）；退役应用置「退役」并归档看板。"
}

# ── M2 人员管理：组织与权限矩阵（docs/admin/org.md 生成 + 对账）────
org_gen() { # → stdout：org.md 内容（编制×角色×汇报线×板×team×权限）
  echo "# 研发组织与权限矩阵（org，$(date '+%F %T')）"
  echo
  echo "## 编制（角色×汇报线×板×team）"
  echo "| 账号 | 角色 | 汇报线(lead) | 板（team） | matrix 账号 |"
  echo "|---|---|---|---|---|"
  echo "| admin | 主管（治理裁决） | — | — | @admin |"
  for u in "${INSTANCED_USERS[@]}"; do
    case "$u" in
      bella) role="需求分析师（BA）"; lead="admin" ;;
      fanfan) role="项目管理（PM）+ 系统分析主持" ; lead="admin" ;;
      wei) role="支付后端 lead（系统分析师）"; lead="fanfan" ;;
      mei) role="前端 lead"; lead="fanfan" ;;
      chen|hu|lin|xiao) role="研发（系统分析执行+编码）"; lead="wei/mei" ;;
      qi|fei) role="测试（独立验证）"; lead="fanfan" ;;
      arch) role="系统架构（G2 架构治理）"; lead="admin" ;;
      secops) role="安全管理（ISO27001/涉敏评估/发布安全）"; lead="admin" ;;
      ops) role="运维管理（ITIL/服务目录/发布执行/回滚）"; lead="admin" ;;
      audit) role="合规及审计管理（门禁留痕/凭证抽检/合规意见）"; lead="admin" ;;
    esac
    boards_fmt=$(boards_of "$u" | tr ' ' '\n' | sed 's/^\(.*\):\(.*\)$/\1(\2)/' | tr '\n' ' ')
    echo "| $u | $role | $lead | ${boards_fmt} | @${u} / @${u}-agent |"
  done
  echo
  echo "## 权限矩阵"
  echo "- 看板可见性：studio ACL 按 matrix 账号收敛——每人只见本账号 profile 与账号板（patch 392）。"
  echo "- 认领围栏：板 board.json profiles 白名单，板外 assignee 拒认领（patch 391）。"
  echo "- 审批权：lead（wei/mei）分诊确认；G5 对外发布 HumanGate=导演批准；安全管理复核（secops）与审计意见（audit）为独立签名线。"
  echo
  echo "## 入职/转岗/离职流程"
  echo "- 入职：mx-setup 幂等供给（matrix 账号+profile+技能+板授权+ACL+家族记忆 bank），入职卡登记本表。"
  echo "- 转岗：改编制表（boards_of）后重跑 mx-setup + 本对账步。"
  echo "- 离职：卡片 reassign 给接手人、板 owner 变更、账号禁用（synapse deactivate）、本表移除并在 audit 步留痕。"
  echo
  echo "## 能力矩阵"
  echo "- capability-report 技能按 machine-manifest 上报；系分=requirements-analyst/aipaydev-dev、测试=defect-loop、安全=iso27001 检查单、运维=release-plan/ITIL。"
}
people_reconcile() { # 对账：org 生成源（编制表）↔ fleet-manifest ↔ profile/board 实况 → 0 一致
  local bad=0 u
  for u in "${INSTANCED_USERS[@]}"; do
    [[ -d "$HERMES_ROOT/profiles/$u" ]] || { echo "profile 缺失: $u"; bad=1; }
    for b in $(boards_of "$u" | tr ' ' '\n' | cut -d: -f1); do
      [[ -f "$HERMES_ROOT/kanban/boards/$b/board.json" ]] || { echo "板缺失: $b"; bad=1; }
    done
  done
  jq -e --argjson n "${#INSTANCED_USERS[@]}" '[.users[].user] | length == $n' "$SIM_ROOT/fleet-manifest.json" >/dev/null 2>&1 \
    || { echo "fleet-manifest 用户数与编制不一致"; bad=1; }
  return $bad
}

# ── M3 工作管理：跨板台账 + WIP/stale 治理（work-report 生成）────
work_report_gen() { # → evidence/work-report.md（导演侧全量扫描 14 账号板）
  local out="$EVID_DIR/work-report.md" u slug st total wip_warn=""
  {
    echo "# 工作管理台账（work-report，$(date '+%F %T')）"
    echo
    echo "## 按人 × 状态分布（跨全部账号板）"
    echo "| 账号 | todo | running | review | done | 其他 | WIP(running) | 卡壳72h |"
    echo "|---|---|---|---|---|---|---|---|"
    for u in "${INSTANCED_USERS[@]}"; do
      local todo=0 run=0 rev=0 done=0 other=0 stale=0
      for slug in $(account_boards "$u"); do
        local db="$HERMES_ROOT/kanban/boards/$slug/kanban.db"
        [[ -f "$db" ]] || continue
        stale=$((stale + $(sqlite3 "$db" "select count(*) from tasks where status not in ('done','archived') and ifnull(created_at,0) < strftime('%s','now') - 259200" 2>/dev/null || echo 0)))
        while IFS='|' read -r st n; do
          case "$st" in
            todo) todo=$((todo+n)) ;; running) run=$((run+n)) ;;
            review) rev=$((rev+n)) ;; done) done=$((done+n)) ;;
            *) other=$((other+n)) ;;
          esac
        done < <(sqlite3 "$db" "select status, count(*) from tasks where status != 'archived' group by status" 2>/dev/null)
      done
      local flag=""
      if (( run > 2 )); then flag="⚠ 超 WIP 上限"; wip_warn=1; fi
      if (( stale > 0 )); then flag="$flag ⏳卡壳"; fi
      echo "| $u | $todo | $run | $rev | $done | $other | $run ${flag} | $stale |"
    done
    echo
    echo "## 治理口径"
    echo "- WIP 上限：每人 running 并行 ≤2，超限记问题单（容量过载信号）。"
    echo "- stale 卡：非 done 且 updated_at 超 72h 的卡清点（本轮 $(date +%s) 为基准）。"
    echo "- 跨轮衔接：retro 后未完结卡由 PM（fanfan）决定挂起/移交下轮。"
  } > "$out"
  [[ -n "$wip_warn" ]] && echo "WIP_OVERLOAD"
  echo "$out"
}

# ── 合规及审计（audit）：门禁留痕完整性 + 凭证抽检 + 合规意见书 ──
audit_check() { # → 0 合规 / 1 有缺陷（输出审计发现）
  local bad=0
  # 门禁留痕：state 硬闸键已落的必须有对应仓内凭证
  if [[ -n "$(sget g1_frozen)" ]] && ! repo_has "$(freeze_doc)"; then
    echo "G1 已落键但 freeze 文件不在 origin/main"; bad=1
  fi
  # 问题单台账格式完整（ISSUE|类型|主体|描述 四段）；无台账≠缺陷（修假阳性）
  if [[ -f "$EVID_DIR/issues.log" ]]; then
    awk -F'|' '/^ISSUE\|/ && NF < 4 {exit 1}' "$EVID_DIR/issues.log" 2>/dev/null \
      || { echo "issues.log 存在字段缺失条目"; bad=1; }
  fi
  # 取证目录在位
  [[ -d "$EVID_DIR" ]] || { echo "取证目录缺失"; bad=1; }
  # 交付物对账（run8 复盘根治：商户接入文档全程缺席但零记单，直到 8.6 矩阵才暴露
  # ——REL-DELIVER 在册交付物缺件必须进台账；版本号与报告侧 ARTIFACT_VIEWS 同源硬编
  # v1.0.0-cashier，改版处两处同步）。release 已在册才查，防部分轮误报。
  if [[ -n "$(sget release_done)" && -n "${RFD_ID:-}" ]]; then
    repo_has "docs/delivery/merchant-onboarding-v1.0.0-cashier.md" \
      || { echo "REL-DELIVER 交付物缺件：docs/delivery/merchant-onboarding-v1.0.0-cashier.md 不在 origin/main"; bad=1; }
    repo_has "docs/delivery/${RFD_ID}-completeness-check.md" \
      || { echo "完备性检查缺件：docs/delivery/${RFD_ID}-completeness-check.md 不在 origin/main"; bad=1; }
  fi
  return $bad
}

rfd_doc_snapshot() { # 需求书判读/提取用快照路径：origin/main 优先，工作树兜底 → 打印路径
  # repo_pull 是 fetch-only（Z3）：远端独占更新不物化进工作树，重判轮读工作树副本会读到
  # 旧稿（2026-09-25 实证边角）。判读口径统一取 origin/main 最新；远端暂无该文件（ba cp
  # 未推的本地稿）回落工作树副本。快照落 "$STATE.rfd.tmp"，随 mx_cleanup 清理。
  local snap="$STATE.rfd.tmp"
  if git -C "$DIRECTOR_CLONE" show "origin/main:${RFD_DOC}" >"$snap" 2>/dev/null; then
    echo "$snap"; return 0
  fi
  echo "$DIRECTOR_CLONE/${RFD_DOC}"
}

reqgate_judge() { # 导演侧机械化判读 G1 四要素（不依赖 LLM）→ 0 全过 / 其他=缺失项清单
  local doc="$1" miss=""
  grep -q "^## .*验收标准" "$doc" && grep -qE "AC-[0-9]" "$doc" \
    || miss="${miss}验收标准段缺失或无 AC 编号；"
  # AC 模糊词检查：仅扫 AC 条目行（行首 "- **AC-N"），不扫段落说明行——
  # 规则说明行本身会引用模糊词示例，扫全段必然自指误报（2026-09-25 v3 实测 bug）。
  if sed -n '/^## .*验收标准/,/^## /p' "$doc" | grep -E "^\- \*\*AC-[0-9]" | grep -qE "性能良好|体验优秀|快速|稳定"; then
    miss="${miss}AC 含模糊词（不可机械化判定）；"
  fi
  grep -q "^## .*Scope-Out" "$doc" || miss="${miss}Scope-Out 缺失；"
  grep -q "^## .*影响面" "$doc" || miss="${miss}影响面缺失；"
  grep -qE "涉敏|ISO27001|iso27001" "$doc" || miss="${miss}涉敏判定缺失；"
  [[ -z "$miss" ]] && return 0
  echo "$miss"; return 1
}

gov_report() { # 生成治理报告 evidence/governance-report.md（对齐 metrics-log 口径）
  local out="$EVID_DIR/governance-report.md" total fixed observed deferred
  total=$({ grep -c "^ISSUE|" "$EVID_DIR/issues.log" 2>/dev/null || true; })
  # 首过率实算（09-26）：组外预计算，set -euo pipefail 安全（grep -q && v=1 || true）
  # 口径=六闸全计（2026-10-06 差距审计 P5→R26：G3/G6 为落键型闸、无对应记单即首过；
  # 原 metrics 行按评审型四闸 4 分母，与 PART1「六闸全首过」口径分裂——run10 起统一六分母）
  local _g1f=0 _g2f=0 _g3f=0 _g4f=0 _g5f=0 _g6f=0
  grep -qE '^ISSUE\|g1-(review|freeze|gate)' "$EVID_DIR/issues.log" 2>/dev/null && _g1f=1 || true
  grep -qE '^ISSUE\|g2-' "$EVID_DIR/issues.log" 2>/dev/null && _g2f=1 || true
  grep -qE '^ISSUE\|g3-' "$EVID_DIR/issues.log" 2>/dev/null && _g3f=1 || true
  grep -qE '^ISSUE\|g4-' "$EVID_DIR/issues.log" 2>/dev/null && _g4f=1 || true
  grep -qE '^ISSUE\|g5-' "$EVID_DIR/issues.log" 2>/dev/null && _g5f=1 || true
  grep -qE '^ISSUE\|g6-' "$EVID_DIR/issues.log" 2>/dev/null && _g6f=1 || true
  local _fp=$((6-_g1f-_g2f-_g3f-_g4f-_g5f-_g6f))
  local _gate_detail="G1$([ $_g1f = 0 ] && echo 首过 || echo 打回) G2$([ $_g2f = 0 ] && echo 首过 || echo 打回) G3$([ $_g3f = 0 ] && echo 首过 || echo 打回) G4$([ $_g4f = 0 ] && echo 首过 || echo 打回) G5$([ $_g5f = 0 ] && echo 首过 || echo 打回) G6$([ $_g6f = 0 ] && echo 首过 || echo 打回)"
  # 证据一次通过率：凭证族记单（回执/派发/系分文档/凭证缺件）与完成任务环节键对账
  local _done_keys _evmiss _evrate
  _done_keys=$({ grep -cE '^[a-z0-9_]+_done=' "$STATE" 2>/dev/null || true; })
  _evmiss=$({ grep -cE '^ISSUE\|(receipt-missing|raci-dispatch-missing|anexec-missing|evidence-missing|credential)' "$EVID_DIR/issues.log" 2>/dev/null || true; })
  if [ "$_done_keys" -gt 0 ] 2>/dev/null; then
    _evrate="$((_done_keys-_evmiss))/${_done_keys}（凭证族记单 ${_evmiss} 起）"
  else
    _evrate="⬜（state.env 完成环节键=0，分母缺席如实留空）"
  fi
  # 打回次数：ISSUE 行含打回/拒收/熔断实算（闸门打回与凭证打回合并口径）
  local _reject
  _reject=$({ grep -cE '^ISSUE\|.*(打回|拒收|熔断)' "$EVID_DIR/issues.log" 2>/dev/null || true; })
  # 人工介入：DISP 行注明导演（补账/代投/补推）实算；AI 主理回合占比=⬜（回合级留痕未结构化）
  local _human
  _human=$({ grep -cE '^DISP\|.*导演' "$EVID_DIR/issues.log" 2>/dev/null || true; })
  local METRICS_CSV="$(date +%F),${RFD_ID},G1-G6,首过率,${_fp}/6（${_gate_detail}）,$(date +%F)..$(date +%F),issues.log 实算,口径=六闸全计（G3/G6 落键型无记单即首过）
$(date +%F),${RFD_ID},全程,证据一次通过率,${_evrate},$(date +%F)..$(date +%F),issues.log+state.env 实算,口径=1-凭证缺件记单/完成环节键
$(date +%F),${RFD_ID},全程,缺陷密度,⬜,$(date +%F)..$(date +%F),取不到显式 ⬜,缺陷/用例真值在中央仓测试报告——harness 侧无结构化副本，挂接后实算
$(date +%F),${RFD_ID},全程,打回次数,${_reject},$(date +%F)..$(date +%F),issues.log 实算,打回/拒收/熔断行计数
$(date +%F),${RFD_ID},全程,人工介入,${_human} 次（AI 主理回合占比 ⬜）,$(date +%F)..$(date +%F),issues.log 实算,DISP 注明导演计数；占比待 MX_DELIVERY=1 协议事件结构化"
  # 基线对比行（R26：读上轮治理报告首过率行——「下次推演目标即上次基线+1」机制化，§2.6.5）
  local _runs_dir _prev _baseline
  _runs_dir="$(dirname "$(dirname "$EVID_DIR")")"
  _prev=""
  _baseline=""
  if [ -n "${RUN_ID:-}" ]; then
    _prev=$(ls -1d "$_runs_dir"/*/ 2>/dev/null | grep -v "/${RUN_ID}/" | sort | tail -1 || true)
  fi
  if [ -n "$_prev" ] && [ -f "${_prev}evidence/governance-report.md" ]; then
    _baseline=$({ grep -E '首过率' "${_prev}evidence/governance-report.md" 2>/dev/null || true; } | tail -1)
  fi
  {
    echo "# ${RFD_ID} 治理报告（RUN=${RUN_ID:-default}，$(date '+%F %T')）"
    echo
    echo "## 硬闸状态"
    # G1-G6 全闸落键（独立审计意见 R-A4：G3 曾只有 devimpl_done 无 g3_ 硬闸键，
    # 治理报告"门禁链"跳过 G3/G6 无说明）；retro_done 即 G6 复盘闸。
    for k in g1_frozen g2_arch_pass g3_code_pass g4_pass g5_ready uat_done retro_done; do
      echo "- $k: $(sget "$k" || echo 未落)"
    done
    echo
    echo "## 问题单台账（共 ${total} 条；处置记账 $({ grep -c '^DISP|' "$EVID_DIR/issues.log" 2>/dev/null || true; }) 条 DISP——键=类型·主体，缺行=待处置）"
    awk -F'|' '/^ISSUE\|/{print "- ["$2"] "$3"："$4}' "$EVID_DIR/issues.log" 2>/dev/null | sort | uniq -c | sort -rn
    echo
    echo "## 凭证与回灌"
    echo "- state 闸门键：$({ grep -cE "^(jwt_|room_|card_|.*_done|g1_|g2_|g4_|g5_|uat_|retro_)" "$STATE" 2>/dev/null || true; }) 条"
    echo
    echo "## metrics 回写（metrics-log 口径：date,change,gate,score,ratio,window,source,note）"
    echo "\`\`\`csv"
    echo "$METRICS_CSV"
    echo "\`\`\`"
    echo
    echo "## 基线对比（§2.6.5 上次基线+1 机制）"
    if [ -n "$_baseline" ]; then
      echo "- 上轮（$(basename "$_prev")）：${_baseline}"
      echo "- 本轮（${RUN_ID}）：首过率 ${_fp}/6（${_gate_detail}）"
    else
      echo "- 无上轮基线（首轮或上轮治理报告缺席）——如实留空"
    fi
  } > "$out"
  echo "$out"
}

gov_archive_commit() { # 治理归档落账原子化（P14→R26：metrics-log+ISSUES-LOG 同提交推送+回读验证）
  # 「产出了没落账」根治：治理报告的 metrics 行与 issues 唯一键在此一并写入中央仓
  # origin/main（docs/governance/metrics-log.csv + docs/issues/ISSUES-LOG.md 单提交），
  # 推送后回读 origin/main 验证——写、提、推、验四环一体，失败记单返回 1 不击杀驱动。
  # 幂等：metrics 行按内容去重；ISSUES-LOG 的 ## <RUN>（ 段存在则替换不追加。
  local run="${RUN_ID:-default}" rfd="${RFD_ID:-RFD-001}"
  local _ilog="$EVID_DIR/issues.log"
  [ -f "$_ilog" ] || { echo "[gov_archive] issues.log 缺席，跳过落账" >&2; return 0; }
  gov_report >/dev/null || true   # 先刷新治理报告，metrics 取终态
  # metrics 实算（与 gov_report 同口径；score 须数值——R-A5 metrics-log schema 先例）
  local _g1f=0 _g2f=0 _g3f=0 _g4f=0 _g5f=0 _g6f=0
  grep -qE '^ISSUE\|g1-(review|freeze|gate)' "$_ilog" 2>/dev/null && _g1f=1 || true
  grep -qE '^ISSUE\|g2-' "$_ilog" 2>/dev/null && _g2f=1 || true
  grep -qE '^ISSUE\|g3-' "$_ilog" 2>/dev/null && _g3f=1 || true
  grep -qE '^ISSUE\|g4-' "$_ilog" 2>/dev/null && _g4f=1 || true
  grep -qE '^ISSUE\|g5-' "$_ilog" 2>/dev/null && _g5f=1 || true
  grep -qE '^ISSUE\|g6-' "$_ilog" 2>/dev/null && _g6f=1 || true
  local _fp=$((6-_g1f-_g2f-_g3f-_g4f-_g5f-_g6f))
  local _done_keys _evmiss _reject _human _today
  _done_keys=$({ grep -cE '^[a-z0-9_]+_done=' "$STATE" 2>/dev/null || true; })
  _evmiss=$({ grep -cE '^ISSUE\|(receipt-missing|raci-dispatch-missing|anexec-missing|evidence-missing|credential)' "$_ilog" 2>/dev/null || true; })
  _reject=$({ grep -cE '^ISSUE\|.*(打回|拒收|熔断)' "$_ilog" 2>/dev/null || true; })
  _human=$({ grep -cE '^DISP\|.*导演' "$_ilog" 2>/dev/null || true; })
  _today=$(date +%F)
  local _m1 _m3 _m4 _m5
  _m1="${_today},${rfd},M1,$(awk "BEGIN{printf \"%.3f\", ${_fp}/6}"),${_fp}/6,${_today}..${_today},state.env 落键实算,六闸全计（G3/G6 落键型无记单即首过；gov_archive_commit 机制化落账）"
  _m3=""
  if [ "$_done_keys" -gt 0 ] 2>/dev/null; then
    _m3="${_today},${rfd},M3,$(awk "BEGIN{printf \"%.3f\", (${_done_keys}-${_evmiss})/${_done_keys}}"),$((_done_keys-_evmiss))/${_done_keys},${_today}..${_today},issues.log+state.env 实算,证据一次通过率=1-凭证缺件记单/完成环节键"
  fi
  _m4="${_today},${rfd},M4,${_reject},${_reject},${_today}..${_today},issues.log 实算,打回次数=打回/拒收/熔断行计数"
  _m5="${_today},${rfd},M5,${_human},${_human},${_today}..${_today},issues.log 实算,人工介入=DISP 注明导演计数（AI 主理占比 ⬜ 待协议事件结构化）"
  # ── 临时 worktree（origin/main detached）内落账，不碰 DIRECTOR_CLONE 工作区 ──
  # 作业形态与 repo_commit_main 同构：固定 wt 路径+EXIT trap 拆区，不留注册残留
  local _wt="$SIM_ROOT/var/main-archive-wt" _rc=0
  mkdir -p "$SIM_ROOT/var" 2>/dev/null || true
  git -C "$DIRECTOR_CLONE" fetch -q origin 2>/dev/null || {
    echo "ISSUE|archive-commit-failed|director|治理归档落账：中央仓 fetch 失败（${run}）" >> "$_ilog"
    return 1
  }
  rm -rf "$_wt"; git -C "$DIRECTOR_CLONE" worktree prune >/dev/null 2>&1 || true
  if ! git -C "$DIRECTOR_CLONE" worktree add -q --detach "$_wt" origin/main 2>/dev/null; then
    echo "ISSUE|archive-commit-failed|director|治理归档落账：临时 worktree 建立失败（${run}）" >> "$_ilog"
    return 1
  fi
  # metrics-log 追加（内容级去重幂等）
  local _mlog="$_wt/docs/governance/metrics-log.csv" _row
  mkdir -p "$(dirname "$_mlog")"
  [ -f "$_mlog" ] || printf 'date,change,gate,score,ratio,window,source,note\n' > "$_mlog"
  for _row in "$_m1" "$_m3" "$_m4" "$_m5"; do
    [ -z "$_row" ] && continue
    grep -qF "$_row" "$_mlog" 2>/dev/null || printf '%s\n' "$_row" >> "$_mlog"
  done
  # ISSUES-LOG run 段 upsert（段在=替换，段缺=追加；台账计数实算）
  python3 - "$_wt/docs/issues/ISSUES-LOG.md" "$run" "$_ilog" <<'PYEOF'
import re, sys, collections
path, run, ilog = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(ilog, encoding='utf-8').read().splitlines()
iss = [l.split('|', 3) for l in lines if l.startswith('ISSUE|')]
disp = [l.split('|', 3) for l in lines if l.startswith('DISP|')]
keys, order = set(), []
for p in iss:
    k = f'{p[1]}·{p[2]}'
    if k not in keys:
        keys.add(k); order.append(k)
buckets = collections.Counter()
for p in disp:
    d = p[3] if len(p) > 3 else ''
    tag = '其他'
    for t in ('已修', '已闭环', '观察', '延后'):
        if d.startswith(t):
            tag = t; break
    buckets[tag] += 1
disp_str = ' / '.join(f'{t} {buckets[t]}' for t in ('已修', '已闭环', '观察', '延后', '其他') if buckets[t])
section = [f'## {run}（机制化落账；gov_archive_commit 原子化回灌）', '',
           f'- 台账：{len(iss)} 行 ISSUE（唯一键 {len(keys)}）/ DISP {len(disp)} 条（{disp_str or "无"}）——台账本体=runs/{run}/evidence/issues.log',
           '- 唯一键清单：'] + [f'  - {k}' for k in order]
body = open(path, encoding='utf-8').read() if __import__('os').path.exists(path) else '# 推演问题台账（issues.log 归档）\n'
pat = re.compile(rf'\n## {re.escape(run)}（.*?(?=\n## |\Z)', re.S)
body = pat.sub('\n', body).rstrip() + '\n\n' + '\n'.join(section) + '\n'
open(path, 'w', encoding='utf-8').write(body)
PYEOF
  # 单提交推送 + 回读验证（四环一体）
  git -C "$_wt" add docs/governance/metrics-log.csv docs/issues/ISSUES-LOG.md 2>/dev/null
  if git -C "$_wt" diff --cached --quiet 2>/dev/null; then
    echo "[gov_archive] 归档已是最新（幂等命中，无新提交）"
  else
    git -C "$_wt" -c user.name="director (G6 archive)" -c user.email="director@aipaydev.local" \
      commit -qm "docs(governance): ${run} 治理归档落账——metrics-log+ISSUES-LOG 机制化回灌（P14/R26 原子化）" || _rc=1
    if [ "$_rc" = 0 ] && ! git -C "$_wt" push -q origin HEAD:main 2>/dev/null; then
      # 非快进=main 已前移：fetch+rebase 重试一次，再败记单
      git -C "$_wt" fetch -q origin 2>/dev/null || true
      git -C "$_wt" rebase -q origin/main 2>/dev/null || true
      git -C "$_wt" push -q origin HEAD:main 2>/dev/null || _rc=1
    fi
  fi
  # local main 快进到同一提交（与 repo_commit_main 同口径：它是后续推送源，落后即空推/被拒）
  git -C "$DIRECTOR_CLONE" fetch -q origin main:main 2>/dev/null || true
  if [ "$_rc" = 0 ]; then
    git -C "$DIRECTOR_CLONE" show origin/main:docs/issues/ISSUES-LOG.md 2>/dev/null | grep -qF "## ${run}（" || _rc=1
    git -C "$DIRECTOR_CLONE" show origin/main:docs/governance/metrics-log.csv 2>/dev/null | grep -qF ",${rfd},M1," || _rc=1
  fi
  rm -rf "$_wt"; git -C "$DIRECTOR_CLONE" worktree prune >/dev/null 2>&1 || true
  if [ "$_rc" != 0 ]; then
    echo "ISSUE|archive-commit-failed|director|治理归档落账原子化失败（${run}：提交/推送/回读三环其一未过，台账与 metrics 未上 origin/main）" >> "$_ilog"
    echo "[gov_archive] 落账失败已记单（archive-commit-failed）" >&2
    return 1
  fi
  echo "[gov_archive] 归档落账完成：metrics-log+ISSUES-LOG 已上 origin/main 并回读验证（${run}）"
  return 0
}

# 场景脚本沿用 V1 快失败语义：mx-lib 的 set -uo 在 source 时会降级掉 -e，在此恢复
set -euo pipefail
