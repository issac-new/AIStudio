#!/bin/bash
# mx-night-sentinel.sh — 夜间空转/僵死守望（run19 凌晨僵局根治件，2026-10-14）
#
# 实录病灶（run19 2026-10-13/14 夜）：
#   ①agent 收场休眠：Turn ended 后群消息只触发 reaction 假活跃（mtime 被刷、
#     零真做行），五发导演令全部失效——真做判据能识别但无自动唤醒通道；
#   ②网关 dispatcher 卡死：ready 卡在队 3h 零孵化，_log_spawn_results 失败静默
#     （根因未明，run20 深挖），CLI `kanban dispatch` 完好可绕；
#   ③监督器熔断证据等待=哑等（只看指纹不判活）。
#
# 本守护的对策（与既有件互补：驱动判活管等待真值的催办，本件管更深的
# 「会话级休眠+派发通道僵死」——直接孵化新工位=会话级重启，不杀不抢）：
#   A. 派发自愈：ready 非空且连续 MX_NS_STUCK_ROUNDS 轮（默认 3×300s=15min）
#      无人孵化 → 自动 `kanban dispatch`（CLI 直派绕网关循环；幂等，派过即 no-op）。
#   B. 休眠唤醒：running 卡的 assignee 真做静默超 MX_NS_SLEEP_SEC（默认 1800s）
#      → 群催办（带卡名+缺口，白天通道）；其名下另有 ready 卡则由 A 通道接力孵化。
#   C. 退出：report_done 落键或 stop 文件在位。
# 部署：随监督器同刻 nohup 起（mx-up/手动）；SIM_ROOT/RUN_ID 环境。
set -u
LC_ALL=C

SIM_ROOT="${AIPAY_SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}"
_link="$(readlink "$SIM_ROOT/var/current-state.env" 2>/dev/null || true)"
RUN_ID="${RUN_ID:-$(basename "${_link:-x}" 2>/dev/null || true)}"
RUN_ID="${RUN_ID:-20261013-v8-run19}"
STATE="$SIM_ROOT/runs/$RUN_ID/state.env"
STOPF="$SIM_ROOT/var/$RUN_ID-night-sentinel.stop"
HERMES="${HERMES:-/Users/cuishi/.hermes/hermes-agent/venv/bin/hermes}"
HERMES_HOME="${NS_HERMES_HOME:-$SIM_ROOT/hermes}"
export HERMES_HOME
IVAL="${MX_NS_INTERVAL:-300}"
STUCK_ROUNDS="${MX_NS_STUCK_ROUNDS:-3}"
SLEEP_SEC="${MX_NS_SLEEP_SEC:-1800}"
SCAN_ROOM="${MX_NS_ROOM:-}"
HERMES_ROOT="$SIM_ROOT/hermes"
LOG="$SIM_ROOT/logs/night-sentinel.log"

log() { printf '[ns %s] %s\n' "$(date '+%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

# 真做判据（与 mx-hb.sh 同源语义的独立内联——守护不 source 大库，防重初始化）
_realwork_ts() { # <agent> → epoch
  local lg="$HERMES_ROOT/profiles/$1/logs/agent.log" line ts
  [[ -f "$lg" ]] || { echo 0; return; }
  line=$(grep -E "tool [a-z_]+ completed|API call #[2-9][0-9]* " "$lg" 2>/dev/null | tail -1)
  [[ -n "$line" ]] || { echo 0; return; }
  ts=$(printf '%s' "$line" | cut -c1-19)
  date -j -f "%Y-%m-%d %H:%M:%S" "$ts" +%s 2>/dev/null || echo 0
}

_msend() { # <text> <mentions>（凭据链失败静默——催办是尽力而为通道）
  local tok room
  tok=$(cat "$SIM_ROOT/creds/fanfan.token" 2>/dev/null) || return 0
  room="${SCAN_ROOM:-$(grep '^room_analysis=' "$STATE" 2>/dev/null | cut -d= -f2)}"
  [[ -n "$room" ]] || return 0
  curl -sf -X POST "http://127.0.0.1:8008/_matrix/client/v3/rooms/$room/send/m.room.message?access_token=$tok" \
    -d "$(jq -nc --arg t "$1" --arg m "$2" '{msgtype:"m.text",body:$t,"m.mentions":{user_ids:($m|split(",")|map(select(length>0)))}}')" >/dev/null 2>&1 || true
}

_kanban_json() { # <status> → tasks json
  timeout 30 "$HERMES" kanban list --status "$1" --json 2>/dev/null || echo '[]'
}

log "启动：RUN_ID=$RUN_ID ival=${IVAL}s stuck_rounds=$STUCK_ROUNDS sleep=${SLEEP_SEC}s（report_done/stop 即退）"
_stuck=0
while :; do
  [[ -f "$STOPF" ]] && { log "stop 文件在位，退出"; rm -f "$STOPF"; exit 0; }
  grep -q '^report_done=' "$STATE" 2>/dev/null && { log "report_done 已落键，功成身退"; exit 0; }

  READY=$(_kanban_json ready)
  READY_N=$(printf '%s' "$READY" | jq 'length' 2>/dev/null || echo 0)
  if (( READY_N > 0 )); then
    _stuck=$((_stuck + 1))
    if (( _stuck >= STUCK_ROUNDS )); then
      log "派发自愈：ready=${READY_N} 卡滞留 ${_stuck} 轮（$(( _stuck * IVAL ))s）无人孵化 → CLI 直派"
      OUT=$(timeout 120 "$HERMES" kanban dispatch --json 2>/dev/null || echo '{}')
      SP=$(printf '%s' "$OUT" | jq -r '[.spawned[]? | .task_id] | join(",")' 2>/dev/null)
      log "直派结果：spawned=${SP:-none}"
      if [[ -n "${SP:-}" ]]; then
        _msend "🌅 夜间守望：派发通道自愈——为滞留卡孵化新工位（${SP}）。原工位会话休眠的请以新会话领卡执行。" ""
        _stuck=0
      else
        # 连续直派失败（卡不可派/凭证坏）→ 退避防刷
        _stuck=0; sleep $(( IVAL * 2 )); continue
      fi
    fi
  else
    _stuck=0
  fi

  # 休眠唤醒：running 卡 assignee 真做静默超阈 → 催办（每 assignee 每守护周期至多一次）
  RUNNING=$(_kanban_json running)
  now=$(date +%s)
  for a in $(printf '%s' "$RUNNING" | jq -r '.[].assignee // empty' 2>/dev/null | sort -u); do
    [[ -n "$a" ]] || continue
    rw=$(_realwork_ts "$a")
    (( rw > 0 )) || continue
    if (( now - rw > SLEEP_SEC )); then
      cards=$(printf '%s' "$RUNNING" | jq -r --arg a "$a" '[.[] | select(.assignee == $a) | .id] | join("、")' 2>/dev/null)
      log "休眠唤醒：$a 真做静默 $(( now - rw ))s（在办卡 ${cards:-?}）→ 催办"
      _msend "🌅 夜间守望催办：@${a} 真做静默超 ${SLEEP_SEC}s，在办卡 ${cards:-?}。请以新会话继续执行并收口（若原会话已收场，直接领卡重开）；仅回话不动手不计为工作。" "@${a}-agent:matrix.test"
    fi
  done

  sleep "$IVAL"
done
