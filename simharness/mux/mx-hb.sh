#!/bin/bash
# mx-hb.sh — 三机心跳判活通道（2026-10-12 补强层；win-tri-node 手册 §7.1 记档未做项）
#
# 跨机形态下非本机档案的 agent.log 不在导演机本地，wait_alive_truth 系列退化为
# 硬窗盲等（失去空转催办与卡死早判——run15 慢账实证该盲区为 9 小时级风险）。
# 本层补齐判活面：agent 机常驻 mx-node-heartbeat.sh 采样守护（本层 hb_node_payload）
# 把本机各档案的「最近工作行时间戳/尾部错误态/日志字节」以 MXHB| 前缀 JSON 心跳发进
# 专用 matrix 房间——零新增服务，全走既有总线，与双模式轮哲学一致。导演机等待环在
# 本地日志缺位时查心跳缓存（hb_refresh_cache 系），判据与本地日志同一套。
# 失败面保守：心跳不可达（房间未配/无新鲜条目/采样守护停）一律回落硬窗，绝不假判死。
# solo 模式（MX_NODE 未设，node_has 恒真）本层不激活，行为与历史轮一致。
# 依赖：先 source mx-lib.sh（自带 mx-platform 与 mx-node）。

# ── 判活计算（单一定义点：驱动等待环与节点采样守护共用；自 mx-scenario-lib 移驻）──
_agent_log_last_work_ts() { # <agent.log> → epoch（最近真实工作行时间戳；无→0）
  local line ts
  line=$(grep -E "API call|tool [a-z_]+ completed|Turn (started|ended)" "$1" 2>/dev/null | tail -1)
  [[ -n "$line" ]] || { echo 0; return; }
  ts=$(printf '%s' "$line" | cut -c1-19)
  mxp_date_to_epoch "$ts"
}

_agent_log_last_realwork_ts() { # <agent.log> → epoch（最近「真做」行：工具轮或会话第 2+ 次调用；无→0）
  # 真做=tool completed（动手）或 API call #≥2（收到工具结果继续推进的实证）。
  # 单轮 API call #1 + Turn ended=嘴炮回合（回一句话收场）——run19 三例实锤
  # （xiao 17:22 被催后回 579 字符 0 工具轮继续躺平）。用途：催办资格复位的严格
  # 判据（嘴炮不清零 nudged，再静默即再催——防"回话顶回"蒙混过关）。
  local line ts
  # API call #N 后随冒号非空格（实测 agent.log「API call #44: model=…」，尾随空格
  # 形态零命中）；1[0-9]+ 段补 #10-19（≥2 的会话第二轮起）。
  line=$(grep -E "tool [a-z_]+ completed|API call #(1[0-9]+|[2-9][0-9]*)[^0-9]" "$1" 2>/dev/null | tail -1)
  [[ -n "$line" ]] || { echo 0; return; }
  ts=$(printf '%s' "$line" | cut -c1-19)
  mxp_date_to_epoch "$ts"
}

_agent_log_tail_stalled() { # <agent.log> → 0=尾部错误态（疑似卡死）
  local tail_line
  tail_line=$(tail -1 "$1" 2>/dev/null)
  [[ -n "$tail_line" ]] && printf '%s' "$tail_line" | grep -qE "ERROR |Traceback|TimeoutError|timed? ?out|gave_up"
}
_any_log_tail_stalled() { # <log...> → 0=任一日志尾为错误态
  local a
  for a in "$@"; do _agent_log_tail_stalled "$a" && return 0; done
  return 1
}

# ── 采样侧（mx-node-heartbeat.sh 调用；纯函数无副作用）──────────
hb_agent_sample() { # <agent> → "lw=<epoch> stall=<0|1> sz=<bytes>"（日志缺位全 0）
  local u="$1" lw=0 st=0 sz=0
  # bash 3.2 陷阱：同条 local 语句先整体展开后赋值，$u 不可在本条内引用——分两行
  local lg="$HERMES_ROOT/profiles/$u/logs/agent.log"
  if [[ -f "$lg" ]]; then
    lw=$(_agent_log_last_work_ts "$lg")
    _agent_log_tail_stalled "$lg" && st=1
    sz=$(mxp_file_size "$lg")
  fi
  echo "lw=$lw stall=$st sz=$sz"
}

hb_node_payload() { # → "MXHB|{...}"（本节点全部档案一拍心跳；档案集=node_users）
  local u kv agents="" now lw st sz
  now=$(date +%s)
  while IFS= read -r u; do
    [[ -n "$u" ]] || continue
    kv=$(hb_agent_sample "$u")
    lw=${kv%% *}; lw=${lw#lw=}
    st=${kv#*stall=}; st=${st%% *}
    sz=${kv##*sz=}
    agents+="${agents:+,}\"$u\":{\"lw\":$lw,\"stall\":$st,\"sz\":$sz}"
  done < <(node_users)
  printf 'MXHB|{"v":1,"node":"%s","hb_ts":%s,"agents":{%s}}' "${MX_NODE:-solo}" "$now" "$agents"
}

# ── 导演侧查询（等待环调用；缓存 TTL 防打爆 matrix）──────────────
_hb_cache_path() { echo "$SIM_ROOT/var/hb-cache.json"; }

hb_refresh_cache() { # → 0=缓存新（或已刷新）；1=不可用（调用方回落硬窗）
  local room="${MX_HB_ROOM:-}" ttl="${MX_HB_TTL:-20}" cache now ts tok out
  [[ -n "$room" ]] || return 1
  cache=$(_hb_cache_path); now=$(date +%s)
  if [[ -s "$cache" ]]; then
    ts=$(jq -r '.fetched_ts // 0' "$cache" 2>/dev/null || echo 0)
    (( now - ts < ttl )) && return 0
  fi
  tok="$(load_token "${MX_HB_READER:-fanfan}" 2>/dev/null)" || return 1
  [[ -n "$tok" && "$tok" != "null" ]] || return 1
  out=$(mx_messages "$tok" "$room" 200 2>/dev/null) || return 1
  [[ -n "$out" && "$out" != "[]" ]] || return 1
  mkdir -p "$(dirname "$cache")"
  # 心跳消息按档案合并取最新拍（多节点同房）：agents 值={lw,stall,sz,ts,node}
  if ! jq -e '
    [ .[] | (.content.body? // "") | select(startswith("MXHB|")) | .[5:]
      | try fromjson catch empty | select(.agents? and .hb_ts?) ] as $ms
    | reduce $ms[] as $m ({};
        reduce ($m.agents | keys[]) as $k (.;
          if ($m.hb_ts > (.[$k].ts // 0)) then
            .[$k] = ($m.agents[$k] + {ts: $m.hb_ts, node: $m.node})
          else . end))
    | {fetched_ts: '"$now"', agents: .}
  ' <<<"$out" > "${cache}.tmp" 2>/dev/null; then
    rm -f "${cache}.tmp"; return 1
  fi
  mv "${cache}.tmp" "$cache"
}

hb_agent_field() { # <agent> <field> → 值；缓存缺/档案缺 → 空（rc 1）
  local cache; cache=$(_hb_cache_path)
  [[ -s "$cache" ]] || return 1
  jq -r --arg u "$1" '.agents[$u] // {} | .[$field] // empty' --arg field "$2" "$cache" 2>/dev/null
}
hb_agent_lw()      { hb_agent_field "$1" lw || echo 0; }
hb_agent_stalled() { [[ "$(hb_agent_field "$1" stall)" == 1 ]]; }
hb_ok() { # <agent> → 0=心跳在效（有条目且新鲜）
  local ts; ts=$(hb_agent_field "$1" ts)
  [[ -n "$ts" ]] || return 1
  (( $(date +%s) - ts <= ${MX_HB_STALE:-120} ))
}
hb_all_ok()       { local a; for a in "$@"; do hb_ok "$a" || return 1; done; return 0; }
hb_any_stalled()  { local a; for a in "$@"; do hb_agent_stalled "$a" && return 0; done; return 1; }
hb_is_remote() { # <agent> → 0=非本节点档案（三机形态判定；solo 恒假）
  node_has "$1" && return 1
  return 0
}
