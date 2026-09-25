#!/bin/bash
# mx-delivery-lib.sh — delivery 协议 v2 的 harness 面（M3，分布式设计 §5/§10）：
# 建案例房 / 发 case-state+stage/gate 消息事件 / 读回事件做断言。
# 事件 JSON 一律经 delivery-event.mjs 构造（合同由 vitest
# delivery-harness-contract.test.ts 钉死）；REST 直连限 sim harness（白名单
# raci-rest-guard.test.ts 的 HARNESS_REST_WHITELIST 收录本目录）。
# 事件类型字符串唯一源=客户端 delivery-protocol.ts；本 lib 只经 state/msg 类型
# 字面量拼 URL，字面量漂移由合同测试间接覆盖（构造器过解析器即含类型约定）。

DLV_CASE_TYPE="com.swarmstudio.delivery.case"
DLV_STAGE_TYPE="com.swarmstudio.delivery.stage"
DLV_GATE_TYPE="com.swarmstudio.delivery.gate"

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
