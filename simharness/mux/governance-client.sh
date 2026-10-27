#!/bin/bash
# governance-client.sh — 推演侧治理服务客户端（融合批二）。
#
# 定位：导演与治理服务之间的唯一通道——HTTP 调用、payload 构造、退出码映射；
# 本文件不含任何判据（单一事实源=custom/server/governance/lifecycle，D1/D8）。
#
# 语义约定（对齐产品端点，执法面 fail-closed）：
# - 判词类：服务不可达/非 2xx → 空判词/未见（等待环自然超时，绝不假 PASS）。
# - G1 判读：服务不可达 → 按缺件处理并记问题单（fail-closed，不开跑）。
# - 熔断 check：block/override-refused → 非零（调用方 fail 中止）。
#
# token：缓存于 state.env 键 jwt__gov（与 jwt_<user> 同域；matrix 交换有成本）。
# 依赖：mx-lib.sh（studio/studio_login/sget/sset 经 mx-scenario-lib 环境）。

_gov_tok() { # → 治理面 JWT（缓存）
  local cached; cached=$(sget jwt__gov 2>/dev/null || true)
  [[ -n "$cached" ]] && { printf '%s' "$cached"; return 0; }
  local t; t=$(studio_login 2>/dev/null || true)
  [[ -n "$t" ]] || return 1
  sset jwt__gov "$t" 2>/dev/null || true
  printf '%s' "$t"
}

_gov_lc_post() { # <path> <jq-args…> → stdout: 响应 JSON（失败 rc=1）
  local path="$1"; shift
  local tok body resp
  tok=$(_gov_tok) || return 1
  body=$(jq -cn "$@") || return 1
  resp=$(studio POST "/api/governance$path" "$tok" "$body" 2>/dev/null) || return 1
  printf '%s' "$resp"
}

gov_lc_verdict() { # <gate> <roomText> <cardText> → stdout: "verdict|room|card"（失败=空）
  local resp
  resp=$(_gov_lc_post /lifecycle/gate-verdict \
    --arg gate "$1" --arg roomText "$2" --arg cardText "$3" \
    '{gate:$gate,roomText:$roomText,cardText:$cardText}') || { printf ''; return 0; }
  printf '%s' "$resp" | jq -r '[.verdict // "", .room // "", .card // ""] | join("|")' 2>/dev/null || printf ''
}

gov_lc_reqjudge() { # <doc> → 0 全过 / 1 缺件（stdout=缺失清单"）；"连接，与驱动回灌文案同源）
  local resp out
  resp=$(_gov_lc_post /lifecycle/requirement-judge --arg doc "$1" '{doc:$doc}')
  if [[ -z "$resp" ]]; then
    issue_once lifecycle-service-unreachable reqgate "G1 判读服务不可达（POST /api/governance/lifecycle/requirement-judge）——按缺件处理（fail-closed）"
    printf 'G1 判读服务不可达（fail-closed）'
    return 1
  fi
  out=$(printf '%s' "$resp" | jq -r 'if .ok then "" else ((.missing // []) | join("；")) end' 2>/dev/null)
  if printf '%s' "$resp" | jq -e '.ok == true' >/dev/null 2>&1; then
    return 0
  fi
  printf '%s' "$out"
  return 1
}

gov_lc_uat_verdict() { # <body> <ac> → 判词（失败=未见）
  local resp
  resp=$(_gov_lc_post /lifecycle/uat-verdict --arg body "$1" --arg ac "$2" '{body:$body,ac:$ac}') \
    && printf '%s' "$resp" | jq -r '.verdict // "未见"' 2>/dev/null \
    || printf '未见'
}

gov_lc_uat_coverage() { # <ac-csv> <body> → stdout: 缺号清单（空格分隔；失败=全缺）
  local acs="[$(printf '%s' "$1" | tr ', ' '\n\n' | sed '/^$/d' | sed 's/^/"/;s/$/"/' | paste -sd, -)]" resp
  resp=$(_gov_lc_post /lifecycle/uat-coverage --arg body "$2" --argjson acs "$acs" '{body:$body,acList:$acs}')
  if [[ -n "$resp" ]]; then
    printf '%s' "$resp" | jq -r '.missing // [] | join(" ")' 2>/dev/null
  else
    printf '%s ' $1   # 服务不可达=全部视为未覆盖（fail-closed，不假全过）
    printf '\n'
  fi
}

gov_lc_breaker_trip() { # <gate> <rounds> <sig> → 0 落账（失败 1 并记问题单——留痕面降级不阻断当次判读）
  _gov_lc_post /lifecycle/breaker/trip \
    --arg run "$RUN_ID" --arg gate "$1" --argjson rounds "$2" --arg sig "$3" \
    '{run:$run,gate:$gate,unpassedRounds:$rounds,sig:$sig}' >/dev/null \
    && return 0
  issue_once lifecycle-breaker-trip-failed "$1" "熔断 trip 写治理服务失败（gate=$1 rounds=$2）——跨调用持久化缺席，重启后轮次清零风险"
  return 1
}

gov_lc_breaker_check() { # <gate> <sig> [label] → 0 放行/复位/复议 / 1 block|refused（失败按 block 处理=1）
  local gate="$1" sig="$2" label="${3:-$1}" resp action
  resp=$(_gov_lc_post /lifecycle/breaker/check \
    --arg run "$RUN_ID" --arg gate "$gate" --arg sig "$sig" --arg label "$label" \
    --argjson ovf "${GATE_BREAKER_OVERRIDE:-0}" --arg ovr "${GATE_BREAKER_REASON:-}" \
    '{run:$run,gate:$gate,sig:$sig,label:$label,overrideFlag:($ovf==1),overrideReason:$ovr}')
  if [[ -z "$resp" ]]; then
    # 服务不可达：按 block 对待（fail-closed——放行须有治理判定在案，不得无判据续跑）
    note "[熔断] ${label} 治理服务不可达——按阻断处理（fail-closed）"
    return 1
  fi
  action=$(printf '%s' "$resp" | jq -r '.action // "block"' 2>/dev/null)
  case "$action" in
    allow|reset|override) return 0 ;;
    override-refused)
      printf '%s' "$resp" | jq -r '.reason // "熔断复议缺原因"' >&2
      return 1 ;;
    *)
      printf '%s' "$resp" | jq -r '.reason // "熔断阻断"' >&2
      return 1 ;;
  esac
}
