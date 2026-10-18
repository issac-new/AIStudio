#!/bin/bash
# mx-smoke.sh — 单 gateway 多路复用拓扑验收门禁（方案 V2.0 §3.4 G1-G5）
#
# G1 路由：24 账号 whoami + 双用户 DM 往返（仅本账号 profile 响应，异 profile 零触碰）
# G2 板隔离：钉板（不带 --board 落本账号板）+ default 板零任务哨兵 + studio ACL 只见本账号
# G3 team 围栏：板外 assignee 拒认领（skipped_nonspawnable，任务滞留 ready）
# G4 派发执行：板内 agent 实派生 → 完成落板（task_runs.profile 为本 team agent）
# G5 共存：真机 orchestrator(:8650) 起止健康；gateway 无 --force 启动
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/mx-lib.sh"

TS=$(date +%Y%m%d-%H%M%S)
RUN_EVID="$EVID_DIR/$TS"; mkdir -p "$RUN_EVID"
PASS=0; FAIL=0; SKIPPED=0; FAILED_GATES=()
gate() { # <name> <ok:0|1> <detail>
  local name="$1" ok="$2" detail="$3"
  if [[ "$ok" == 1 ]]; then
    PASS=$((PASS+1)); log "✓ [$name] $detail"
  else
    FAIL=$((FAIL+1)); FAILED_GATES+=("$name"); log "✗ [$name] $detail"
  fi
}
gate_skip() { # <name> <reason>——节点切片下本机无该档案面：如实记跳过，不计 FAIL
  SKIPPED=$((SKIPPED+1)); log "○ [$1] SKIP——$2"
}

board_db() { # default 板的 DB 在 <root>/kanban.db（上游约定），其余在 boards/<slug>/
  if [[ "$1" == "default" ]]; then echo "$HERMES_ROOT/kanban.db"; else echo "$HERMES_ROOT/kanban/boards/$1/kanban.db"; fi
}
board_count() { # <board> <where-sql>
  mxp_sqlite "$(board_db "$1")" "select count(*) from tasks where $2" || echo -1
}

log "=== mx-smoke 开始（取证目录 ${RUN_EVID}；节点=$(node_mode_desc)）==="

# ═══ G5（起）：共存与启动形态 ════════════════════════════
host_before=$(curl -sf "$HOST_ORCH_HEALTH" -m 3 || true)
[[ -n "$host_before" ]] && gate G5 1 "真机 orchestrator 起始健康" || gate G5 1 "真机 orchestrator 未在线（非本方管辖，记录）"
gw_pid=$(cat "$PIDS_DIR/gateway.pid" 2>/dev/null || true)
if [[ -n "$gw_pid" ]] && mxp_ps_command "$gw_pid" | grep -q 'gateway run' \
   && ! mxp_ps_command "$gw_pid" | grep -q -- '--force'; then
  gate G5 1 "gateway 以无 --force 形态运行（pid ${gw_pid}）"
else
  # pid 文件缺失误差：按端口反查（平台层：mac lsof / Git Bash netstat）
  gw_pid=$(mxp_port_pids "$GW_PORT" | head -1 || true)
  if [[ -n "$gw_pid" ]] && ! mxp_ps_command "$gw_pid" | grep -q -- '--force'; then
    gate G5 1 "gateway 以无 --force 形态运行（pid $gw_pid 按端口反查）"
  else
    gate G5 0 "未能证实 gateway 启动形态（pid=${gw_pid}）"
  fi
fi

# ═══ G1：矩阵账号路由 ═══════════════════════════════════
# 节点切片：whoami 走远端 HS 天然跨机，但 creds 只保证本节点档案+admin 在位——
# 非本节点档案的 token 不在本机时不硬查（导演机 solo 态=全量，行为不变）。
# 场景锚（2026-10-12 新场景轮）：aipay 默认值与历史逐字节一致；新场景经 roster.env 覆写
_A="${MX_ANCHOR_USER:-fanfan}"; _B="${MX_ANCHOR_USER_B:-chen}"
_A_BOARD="$(first_board_of "$_A")"
_FENCE_ASSIGNEE="${MX_FENCE_ASSIGNEE:-chen-csw-pay-core}"
_DISPATCH_ASSIGNEE="${MX_DISPATCH_ASSIGNEE:-fanfan-sys-analyst}"
whoami_ok=1
for n in admin $(node_users) $(for u in $(node_users); do echo "$u-agent"; done); do
  wid=$(mx "$(load_token "$n")" GET account/whoami | jq -r '.user_id' 2>/dev/null || true)
  [[ "$wid" == "@$n:$SERVER_NAME" ]] || { whoami_ok=0; log "whoami 不符：$n → $wid"; }
done
_wn=$(node_users | wc -l | tr -d ' ')
[[ $whoami_ok == 1 ]] && gate G1 1 "$(( _wn + 1 ))+ 账号 whoami 全对" || gate G1 0 "whoami 存在不匹配（见上）"

f_state_sha=$(shasum "$HERMES_ROOT/profiles/$_A/state.db" 2>/dev/null | cut -d' ' -f1 || echo none)
c_state_sha=$(shasum "$HERMES_ROOT/profiles/$_B/state.db" 2>/dev/null | cut -d' ' -f1 || echo none)

route_ok=1; route_detail=""
for u in "$_A" "$_B"; do
  other="$_B"; other_sha="$c_state_sha"; [[ "$u" == "$_B" ]] && { other="$_A"; other_sha="$f_state_sha"; }
  tok=$(load_token "$u")
  room=$(mx_create_room "$tok" "mux-smoke-$u-$TS" "$(agent_mxid "$u")")
  [[ -n "$room" && "$room" != "null" ]] || { route_ok=0; route_detail="$u 建房失败"; break; }
  mx_join "$(load_token "$u-agent")" "$room"
  marker=$(mx_send "$tok" "$room" "SMOKE-ROUTING-$TS 请用一句话回复并结束，不要调用任何工具。")
  body=$(mx_wait_sender "$tok" "$room" "$(agent_mxid "$u")" "$marker" 420 ".") || body=""
  if [[ -z "$body" ]]; then
    route_ok=0; route_detail="$u 的 agent 未在窗口内回复（房间 ${room}）"; break
  fi
  route_detail+="$u 往返✓；"
  # 异账号 profile 零触碰：对方 state.db 不变
  sha_now=$(shasum "$HERMES_ROOT/profiles/$other/state.db" 2>/dev/null | cut -d' ' -f1 || echo none)
  if [[ "$other_sha" != "none" && "$sha_now" != "$other_sha" ]]; then
    route_ok=0; route_detail+="$other 的 state.db 被触碰（串扰）；"; break
  fi
done
[[ $route_ok == 1 ]] && gate G1 1 "双用户 DM 往返 + 异 profile 零触碰：$route_detail" \
                     || gate G1 0 "$route_detail"

# ═══ G2：板隔离 + 钉板 + ACL ════════════════════════════
# 节点切片：G2-G4 全部依赖 fanfan/chen 板在本地——非本节点档案整体跳段（gate_skip
# 如实记档，不虚绿）；solo 态 node_has 恒真，行为与历史版逐字节一致。
_G234=1
if ! node_has "$_A" || ! node_has "$_B"; then
  _G234=0
  gate_skip G2 "锚档案 $_A/$_B 不在本节点（$(node_mode_desc)）——本门禁需板在本地，请在对应节点自跑 mx-smoke"
fi
if [[ $_G234 == 1 ]]; then
pin_ok=1; pin_detail=""
# 2a 钉板：以 fanfan profile 身份、不带 --board 建卡 → 必须落 fanfan-pm-plan
HERMES_HOME="$HERMES_ROOT/profiles/$_A" env -u HERMES_KANBAN_BOARD -u HERMES_KANBAN_DB \
  "$HERMES_BIN" kanban create "pin-test-$TS" --created-by smoke > "$RUN_EVID/pin-create.log" 2>&1 || pin_ok=0
pin_count=$(board_count "$_A_BOARD" "title='pin-test-$TS'")
if [[ "$pin_count" == "1" ]]; then pin_detail="钉板✓(落 "$_A_BOARD")"; else pin_ok=0; pin_detail="钉板✗("$_A_BOARD" 命中=$pin_count)"; fi
# 2b default 板串板哨兵：全程零任务
sentinel=$(board_count default "1=1")
if [[ "$sentinel" == "0" ]]; then pin_detail+="/default 哨兵✓"; else pin_ok=0; pin_detail+="/default 板有 $sentinel 任务（串板！）"; fi
# 2c studio ACL：matrix-login 收敛（patch 392）+ 档案可见性
fjwt=$(studio_matrix_login "$_A"); cjwt=$(studio_matrix_login "$_B")
login_body=$(studio POST /api/auth/matrix-login "" "$(jq -n --arg t "$(load_token "$_A")" --arg m "$(human_mxid "$_A")" --arg h "$HS" '{matrixAccessToken:$t, matrixUserId:$m, homeserverUrl:$h}')")
role=$(echo "$login_body" | jq -r '.user.role' 2>/dev/null || true)
if [[ "$role" == "admin" ]]; then pin_detail+="/登录 role=admin✓"; else pin_ok=0; pin_detail+="/登录 role=${role}（期望 admin，392 未生效？）"; fi
fprofs=$(studio GET /api/hermes/profiles "$fjwt" | jq -c '[.[].name // .[]?.profile_name // empty] | map(select(.!=null)) | .' 2>/dev/null || true)
# 可见性双向断言：fanfan jwt 不含 chen，chen jwt 不含 fanfan
if echo "${fprofs:-}" | grep -q "\"$_B\""; then pin_ok=0; pin_detail+="/${_A} 可见 ${_B}（ACL 泄漏）"; else pin_detail+="/ACL 单向✓"; fi
if echo "${fprofs:-}" | grep -q "\"$_A\"" && echo "${fprofs:-}" | grep -qv "\"$_B\""; then pin_detail+=""; fi
cprofs=$(studio GET /api/hermes/profiles "$cjwt" | jq -c '.' 2>/dev/null || true)
if echo "${cprofs:-}" | grep -q "\"$_A\""; then pin_ok=0; pin_detail+="/${_B} 可见 ${_A}（ACL 泄漏）"; fi
# 2d kanban 任务可见性：chen jwt 查 fanfan 板不得见 fanfan-sys-analyst 的卡
chen_view=$(studio GET "/api/hermes/kanban?board=$_A_BOARD" "$cjwt" | jq -c '.' 2>/dev/null || true)
if echo "${chen_view:-}" | grep -q "pin-test-$TS"; then pin_ok=0; pin_detail+="/${_B} 可见 ${_A} 板任务（过滤失效）"; else pin_detail+="/任务过滤✓"; fi
[[ $pin_ok == 1 ]] && gate G2 1 "$pin_detail" || gate G2 0 "$pin_detail"

# ═══ G3：team 围栏（板外 assignee 拒认领）════════════════
fence_title="fence-test-$TS"
mx_kanban fanfan-pm-plan create "$fence_title" --assignee "$_FENCE_ASSIGNEE" --created-by smoke \
  --body "SHOULD-NOT-RUN" > "$RUN_EVID/fence-create.log" 2>&1 || true
sleep 60   # ≥2 个 dispatch tick
fence_status=$(mxp_sqlite "$(board_db "$_A_BOARD")" "select status from tasks where title='$fence_title'" || echo missing)
fence_runs=$(board_count "$_A_BOARD" "id=(select id from tasks where title='$fence_title')" 2>/dev/null || echo -1)
fence_runcount=$(mxp_sqlite "$(board_db "$_A_BOARD")" \
  "select count(*) from task_runs where task_id=(select id from tasks where title='$fence_title')" || echo -1)
if [[ "$fence_status" == "ready" && "$fence_runcount" == "0" ]]; then
  gate G3 1 "板外 assignee（$_FENCE_ASSIGNEE@${_A_BOARD}）未被认领（status=$fence_status, runs=${fence_runcount}）"
else
  gate G3 0 "围栏失效或异常：status=$fence_status runs=$fence_runcount"
fi

# ═══ G4：agent team 实派生执行 ═══════════════════════════
run_title="dispatch-test-$TS"
marker="SMOKE-DONE-$TS"
mx_kanban fanfan-pm-plan create "$run_title" --assignee "$_DISPATCH_ASSIGNEE" --created-by smoke \
  --max-runtime 300 \
  --body "这是多路复用拓扑冒烟任务。请立刻调用 kanban_complete 把本任务标记完成，summary 里必须包含 ${marker}。不要做任何其他工作，不要读写文件。" \
  > "$RUN_EVID/dispatch-create.log" 2>&1 || true
g4_ok=0; g4_detail=""
deadline=$(( $(date +%s) + 420 ))
while (( $(date +%s) < deadline )); do
  st=$(mxp_sqlite "$(board_db "$_A_BOARD")" "select status from tasks where title='$run_title'" || echo missing)
  if [[ "$st" == "done" ]]; then g4_ok=1; break; fi
  if [[ "$st" == "blocked" ]]; then break; fi
  sleep 15
done
g4_runs=$(mxp_sqlite "$(board_db "$_A_BOARD")" \
  "select ifnull(group_concat(profile,'+'),'') from task_runs where task_id=(select id from tasks where title='$run_title')" || echo "")
g4_result=$(mxp_sqlite "$(board_db "$_A_BOARD")" \
  "select ifnull(result,'') from tasks where title='$run_title'" || echo "")
if [[ $g4_ok == 1 && "$g4_runs" == *"$_DISPATCH_ASSIGNEE"* ]]; then
  g4_detail="team agent 实派生执行到 done（runs=${g4_runs}，marker 命中=$(echo "$g4_result" | grep -c "$marker")）"
  gate G4 1 "$g4_detail"
else
  gate G4 0 "未在窗口内完成：status=${st:-?} runs=${g4_runs}（模型通道或派生异常，见 $LOGS_DIR/gateway.log）"
fi
fi   # _G234 本地档案段结束

# ═══ G5（收）：真机共存 ═════════════════════════════════
host_after=$(curl -sf "$HOST_ORCH_HEALTH" -m 3 || true)
if [[ -n "$host_before" && -n "$host_after" ]]; then
  gate G5 1 "真机 orchestrator 起止均健康（共存无损）"
elif [[ -z "$host_before" && -z "$host_after" ]]; then
  gate G5 1 "真机 orchestrator 全程未在线（记录）"
else
  gate G5 0 "真机 orchestrator 健康状态翻转（before=$host_before after=${host_after}）"
fi

# ═══ G6：hindsight 家族共享记忆（用户裁决 2026-09-25）════
# 同 matrix 用户家族（orchestrator+agents）必须同 bank（用户名+MAC 区分），异家族异 bank；
# hindsight 服务健康；全部 profile 的 provider 已激活。
g6_ok=1; g6_detail=""
curl -sf -m 3 "$HINDSIGHT_API_URL/health" >/dev/null \
  || { g6_ok=0; g6_detail="hindsight 服务($HINDSIGHT_API_URL)不健康；"; }
family_banks=""
for u in $(node_users); do
  fam_bank=$(jq -r .bank_id "$HERMES_ROOT/profiles/$u/hindsight/config.json" 2>/dev/null || echo missing)
  [[ "$fam_bank" == "hermes-"*"-${u}" ]] || { g6_ok=0; g6_detail+="${u} 主 profile bank 异常(${fam_bank})；"; }
  for a in $(agents_of "$u"); do
    pb=$(jq -r .bank_id "$HERMES_ROOT/profiles/$(agent_profile "$u" "$a")/hindsight/config.json" 2>/dev/null || echo missing)
    [[ "$pb" == "$fam_bank" ]] || { g6_ok=0; g6_detail+="$(agent_profile "$u" "$a") bank=${pb} ≠ 家族 ${fam_bank}；"; }
  done
  grep -q "provider: hindsight" "$HERMES_ROOT/profiles/$u/config.yaml" 2>/dev/null \
    || { g6_ok=0; g6_detail+="${u} 未激活 provider；"; }
  family_banks="$family_banks $fam_bank"
done
distinct_banks=$(echo "$family_banks" | tr ' ' '\n' | sed '/^$/d' | sort -u | wc -l | tr -d ' ')
_nu=$(node_users | wc -l | tr -d ' ')
if [[ $g6_ok == 1 && "$distinct_banks" == "$_nu" ]]; then
  gate G6 1 "${_nu} 家族各一 bank（用户名+MAC 区分）、成员共享、provider 全激活、服务健康 ✓"
else
  [[ "$distinct_banks" == "$_nu" ]] || g6_detail+="家族 bank 去重数 ${distinct_banks}≠${_nu}；"
  gate G6 0 "${g6_detail:-异常}"
fi

# ═══ 汇总取证 ═══════════════════════════════════════════
{
  echo "mx-smoke $TS  PASS=$PASS FAIL=$FAIL SKIPPED=$SKIPPED"
  echo "failed gates: ${FAILED_GATES[*]:-none}"
  echo "node: $(node_mode_desc)"
  echo "boards:"; HERMES_HOME="$HERMES_ROOT" "$HERMES_BIN" kanban boards list 2>/dev/null || true
  echo "default board tasks: $(board_count default '1=1')"
} > "$RUN_EVID/summary.txt"
log "=== mx-smoke 结束：PASS=$PASS FAIL=${FAIL} SKIPPED=${SKIPPED}（证据 ${RUN_EVID}）==="
[[ $FAIL == 0 ]] || { log "失败门禁：${FAILED_GATES[*]}"; exit 1; }
