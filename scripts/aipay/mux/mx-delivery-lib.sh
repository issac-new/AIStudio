#!/bin/bash
# mx-delivery-lib.sh — delivery 协议 v2 的 harness 面（M3，分布式设计 §5/§10）：
# 建案例房 / 发 case-state+stage/gate 消息事件 / 读回事件做断言。
# 事件 JSON 一律经 delivery-event.mjs 构造（合同由 vitest
# delivery-harness-contract.test.ts 钉死）；REST 直连限 sim harness（白名单
# raci-rest-guard.test.ts 的 HARNESS_REST_WHITELIST 收录本目录）。
# 事件类型字符串唯一源=客户端 delivery-protocol.ts；本 lib 只经 state/msg 类型
# 字面量拼 URL，字面量漂移由合同测试间接覆盖（构造器过解析器即含类型约定）。
# 依赖 sset/sget（mx-scenario-lib）：场景脚本已按序 source；独立使用（驱动/冒烟）
# 时自查补挂，勿依赖调用方顺序。

DLV_CASE_TYPE="com.swarmstudio.delivery.case"
DLV_STAGE_TYPE="com.swarmstudio.delivery.stage"
DLV_GATE_TYPE="com.swarmstudio.delivery.gate"

command -v sget >/dev/null 2>&1 || source "$MX_SCRIPT_DIR/mx-scenario-lib.sh"

dlv_event() { # <kind> [args...] → JSON（构造器出口，缺参大声失败）
  node "$(dirname "${BASH_SOURCE[0]}")/delivery-event.mjs" "$@"
}

dlv_room() { # <owner> <caseId> <title> → room_id（案例房；创建者即 owner 得 PL50）
  local tok rid
  tok=$(load_token "$1")
  rid=$(mx "$tok" POST createRoom "$(jq -n --arg n "delivery-$2-$3" \
    '{name:$n, preset:"private_chat", is_direct:false}')" | jq -r '.room_id')
  [[ "$rid" == '!'* ]] || fail "delivery 案例房创建失败: $rid"
  echo "$rid"
}

dlv_invite() { # <owner> <room> <mxid...>（首版漏 load_token 把用户名当 token 发，401 被吞——修复）
  local tok room m
  tok=$(load_token "$1"); room="$2"; shift 2
  for m in "$@"; do mx "$tok" POST "rooms/$room/invite" "{\"user_id\":\"$m\"}" >/dev/null; done
}

dlv_joined() { # <who> <room> → 已 join 的 mxid 列表（newline 分隔）
  mx "$(load_token "$1")" GET "rooms/$2/joined_members" | jq -r '.joined | keys[]'
}

dlv_case_state() { # <owner> <room> <caseId> <json>（state key=caseId，覆盖写=阶段推进）
  mx "$(load_token "$1")" PUT "rooms/$2/state/$DLV_CASE_TYPE/$3" "$4" >/dev/null
}

dlv_msg() { # <who> <room> <type> <json>
  local txn="dlv-$$-$(date +%s%N)"
  mx "$(load_token "$1")" PUT "rooms/$2/send/$3/$txn" "$4" >/dev/null
}

dlv_stage() { # <who> <room> <caseId> <stage> <worker-account> <outcome> <artifactRef|-> [extra...]
  local who="$1" room="$2" cid="$3" st="$4" acc="$5" out="$6" ref="$7"; shift 7
  local args=(stage --case-id "$cid" --stage "$st" --worker-account "$acc" --outcome "$out" --reported-by "$who")
  [[ "$ref" != "-" ]] && args+=(--artifact-ref "$ref")
  dlv_msg "$who" "$room" "$DLV_STAGE_TYPE" "$(dlv_event "${args[@]}" "$@")"
}

dlv_gate() { # <who> <room> <caseId> <gate> <verdict> <evid-kind> <evid-summary> [extra...]
  local who="$1" room="$2" cid="$3" g="$4" v="$5" k="$6" s="$7"; shift 7
  dlv_msg "$who" "$room" "$DLV_GATE_TYPE" "$(dlv_event gate --case-id "$cid" --gate "$g" --verdict "$v" \
    --evidence-kind "$k" --evidence-summary "$s" --decided-by "$who" "$@")"
}

dlv_events() { # <who> <room> <type> → 事件 content 列表（时间正序）
  # 带查询串的端点走 mx_messages 同款直连（mx() 无条件拼 ?access_token 会打断查询串）
  curl -sf "$HS/_matrix/client/v3/rooms/$2/messages?access_token=$(load_token "$1")&dir=b&limit=200" \
    | jq -c --arg t "$3" '.chunk | reverse | .[] | select(.type == $t) | .content'
}

dlv_case_state_read() { # <who> <room> <caseId> → 当前 state content
  mx "$(load_token "$1")" GET "rooms/$2/state/$DLV_CASE_TYPE/$3" | jq -c .
}

dlv_assert() { # <desc> <expr...>：断言失败即 fail（M3 验收门）
  local desc="$1"; shift
  if ! eval "$*" >/dev/null 2>&1; then fail "[M3 断言] $desc"; fi
  note "[M3 断言] $desc ✓"
}

# ── M3 场景事件化（aipay-scenario 接入面；MX_DELIVERY=1 启用，缺省零行为）──
dlv_enabled() { [[ "${MX_DELIVERY:-}" == "1" ]]; }

dlv_scenario_open() { # <caseTitle> <repoUrl>：开案例房+邀全员+join（幂等：sset dlv_room）
  local title="$1" repo="$2" u room case_id
  [[ -n "$(sget dlv_room)" ]] && { note "[M3] delivery 案例已开（$(sget dlv_room)），跳过"; return 0; }
  case_id="dlv-${RUN_ID:-run}-$(date +%H%M%S)"
  room=$(dlv_room fanfan "$case_id" "$title")
  for u in "${INSTANCED_USERS[@]}"; do
    # 幂等：先查在房名单（建房者已在房，重复邀会被 Synapse 400）
    if ! dlv_joined fanfan "$room" | grep -q "^$(human_mxid "$u")$"; then
      dlv_invite fanfan "$room" "$(human_mxid "$u")"
      mx_join "$(load_token "$u")" "$room"
    fi
  done
  sset dlv_room "$room"; sset dlv_case "$case_id"
  dlv_case_state fanfan "$room" "$case_id" "$(dlv_event case --case-id "$case_id" --title "$title" \
    --repo-url "$repo" --tier standard --stage P1 --owner fanfan --updated-by fanfan)"
  dlv_index_update fanfan "$room"
  note "[M3] delivery 案例已开：$case_id → ${room}（全员人类账号已邀+join+index 登记；agent bot 入房留 M4）"
}

dlv_scenario_phase() { # <stage> <stageWorker> <gate> <decider> <evidKind> <summary> <nextStage|->
  local st="$1" w="$2" g="$3" d="$4" k="$5" s="$6" next="$7"
  local room case_id; room=$(sget dlv_room); case_id=$(sget dlv_case)
  [[ -z "$room" ]] && { note "[M3] delivery 未启用（无案例房），跳过 $st/$g"; return 0; }
  dlv_stage "$d" "$room" "$case_id" "$st" "$w" done -
  dlv_gate  "$d" "$room" "$case_id" "$g" pass "$k" "$s"
  if [[ "$next" != "-" ]]; then
    dlv_case_state fanfan "$room" "$case_id" "$(dlv_event case --case-id "$case_id" \
      --title "aipaydev ${RFD_ID:-scenario}" --repo-url "https://github.com/issac-new/aipaydev" \
      --tier standard --stage "$next" --owner fanfan --updated-by fanfan \
      --frozen-acceptance "${RFD_ID:-na} G1 冻结清单")"
  fi
  note "[M3] delivery 事件：stage $st done + gate $g pass$( [[ "$next" != "-" ]] && echo " + case→$next")"
}

dlv_scenario_assert() { # 结尾断言（六 stage/六 gate/终态）+ 证据报告
  local room case_id st_n g rej final out
  room=$(sget dlv_room)
  [[ -z "$room" ]] && return 0
  case_id=$(sget dlv_case)
  st_n=$(dlv_events fanfan "$room" "$DLV_STAGE_TYPE" | jq -s --arg c "$case_id" \
    '[.[] | select(.caseId==$c and .outcome=="done")] | [.[].stage] | unique | length')
  local missing=""
  for G in G1 G2 G3 G4 G5 G6; do
    dlv_events fanfan "$room" "$DLV_GATE_TYPE" | jq -s --arg c "$case_id" --arg g "$G" \
      '[.[] | select(.caseId==$c and .gate==$g and .verdict=="pass")] | length' | grep -q '^0$' && missing="$missing $G"
  done
  final=$(dlv_case_state_read fanfan "$room" "$case_id" | jq -r '.stage')
  out="$EVID_DIR/delivery-events"; mkdir -p "$out"
  {
    echo "# M3 V3 事件化断言（$(date '+%F %T')）"
    echo "- case: $case_id  room: $room"
    echo "- 六 stage done 计数: ${st_n}（期望 6）"
    echo "- 缺 pass 的门:${missing:- 无}"
    echo "- case 终态: ${final}（期望 P6）"
  } > "$out/report.md"
  if [[ "$st_n" == 6 && -z "$missing" && "$final" == "P6" ]]; then
    note "[M3] V3 事件化断言全过（六 stage/六 gate/终态 P6）→ $out/report.md"
  else
    echo "ISSUE|m3-v3-events|director|delivery 事件化断言未全过（stage=$st_n missing=[${missing}] final=${final}）" >> "$EVID_DIR/issues.log"
    note "[M3] V3 事件化断言未全过（记问题单，详见 $out/report.md）"
  fi
}

dlv_scenario_advance() { # <stage> <worker> <nextStage> [artifactRef]：只发 stage done + case 推进（无门）
  local st="$1" w="$2" next="$3" ref="${4:--}"
  local room case_id; room=$(sget dlv_room); case_id=$(sget dlv_case)
  [[ -z "$room" ]] && return 0
  dlv_stage fanfan "$room" "$case_id" "$st" "$w" done "$ref"
  dlv_case_state fanfan "$room" "$case_id" "$(dlv_event case --case-id "$case_id" \
    --title "aipaydev ${RFD_ID:-scenario}" --repo-url "https://github.com/issac-new/aipaydev" \
    --tier standard --stage "$next" --owner fanfan --updated-by fanfan \
    --frozen-acceptance "${RFD_ID:-na} G1 冻结清单")"
  note "[M3] delivery 事件：stage $st done + case→$next"
}

dlv_index_update() { # <who> <roomId>：案例发现机制——account-data index 幂等并入 roomId
  local who="$1" rid="$2" cur rooms tok uid
  tok=$(load_token "$who"); uid=$(human_mxid "$who")
  cur=$(curl -sf "$HS/_matrix/client/v3/user/$uid/account_data/com.swarmstudio.delivery.index?access_token=$tok" 2>/dev/null || echo '{}')
  rooms=$(jq -c --arg r "$rid" '(.roomIds // []) + [$r] | unique' <<<"$cur")
  curl -sf -X PUT "$HS/_matrix/client/v3/user/$uid/account_data/com.swarmstudio.delivery.index?access_token=$tok" \
    -H 'Content-Type: application/json' -d "$(jq -nc --argjson rs "$rooms" --arg by "$who" \
      '{schemaVersion:2, roomIds:$rs, updatedBy:$by, updatedAt:(now*1000|floor)}')" >/dev/null
}
