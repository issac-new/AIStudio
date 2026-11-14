#!/bin/bash
# run-driver-supervisor.sh —— 推演驱动自愈监督器（2026-10-09 静默死亡事故根治）
#
# 事故形态（run12 实录）：驱动 bash 遭单 pid SIGTERM 静默死亡（EXIT trap 清锁、无 FAIL 行，
# 28 分钟空窗）；信号来源 macOS 不可考（双监管者抢驱动为最强嫌疑）。修复哲学：不追凶，
# 让击杀失效——驱动死亡后 30s 内自动按断点续跑（START_STEP 各段 done 键幂等跳过，
# 天然防重派），直到 report_done 落键才退出。
#
# 用法: nohup bash mux/run-driver-supervisor.sh --run <RUN_ID> [--start-step devimpl] \
#         [--sim-root /Users/cuishi/lab/ncwk-sim-mux] > <sim-root>/logs/<RUN>-supervisor.log 2>&1 &
# 停止: touch <sim-root>/var/<RUN>-supervisor.stop（优雅退）或 kill 监督器（勿 kill 驱动——
#       会被拉起；真要停驱动先 touch stop 文件让监督器退场）
set -uo pipefail
export LC_ALL=C

RUN_ID="" START_STEP="devimpl" SIM_ROOT="${AIPAY_SIM_ROOT:-/Users/cuishi/lab/ncwk-sim-mux}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --run) RUN_ID="${2:-}"; shift 2 ;;
    --start-step) START_STEP="${2:-}"; shift 2 ;;
    --sim-root) SIM_ROOT="${2:-}"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done
[[ -n "$RUN_ID" ]] || { echo "need --run"; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/mx-platform.sh"   # 独立进程：不 source mx-lib，平台原语显式挂载
source "$SCRIPT_DIR/mx-gate-lib.sh"  # 闸门催办判定纯函数（2026-11-02 机制治理批：可行为测试）
source "$SCRIPT_DIR/mx-recovery-lib.sh"  # 恢复层让位判定纯函数（同上批：v1 让位=断打架环第一回环）
STATE="$SIM_ROOT/runs/$RUN_ID/state.env"
LOGS="$SIM_ROOT/logs"
STOPFLAG="$SIM_ROOT/var/$RUN_ID-supervisor.stop"

# 监控事件面（2026-10-09 任务层清杀 harness 后台任务实录后并入）：每周期把
# issues 新行/驱动错误行/服务健康落到 monitor-events.log——harness 任务全灭时，
# 监控证据仍在，任何一次唤起都能对账追平。
MEV="$LOGS/$RUN_ID-monitor-events.log"
_mev_prev_issues=0; _mev_prev_drv=0
[ -f "$MEV" ] && { _mev_prev_issues=$(sed -n 's/^PREV_ISSUES=//p' "$MEV" | tail -1); _mev_prev_drv=$(sed -n 's/^PREV_DRV=//p' "$MEV" | tail -1); }

monitor_events() {
  ISS="$SIM_ROOT/runs/$RUN_ID/evidence/issues.log"; DRVL="$LOGS/$RUN_ID-driver.log"
  ni=$(wc -l < "$ISS" 2>/dev/null | tr -d ' ' || echo 0); nd=$(wc -l < "$DRVL" 2>/dev/null | tr -d ' ' || echo 0)
  if [ "${ni:-0}" -gt "${_mev_prev_issues:-0}" ]; then
    tail -n $(( ni - _mev_prev_issues )) "$ISS" 2>/dev/null | while IFS= read -r l; do echo "[mev $(date '+%T')] ISSUE+ $l" >> "$MEV"; done
  fi
  if [ "${nd:-0}" -gt "${_mev_prev_drv:-0}" ]; then
    tail -n $(( nd - _mev_prev_drv )) "$DRVL" 2>/dev/null | grep -E "FAIL|✗|Traceback|硬窗|Terminated" | while IFS= read -r l; do echo "[mev $(date '+%T')] DRV! $l" >> "$MEV"; done
  fi
  _mev_prev_issues=$ni; _mev_prev_drv=$nd
  echo "PREV_ISSUES=$ni" >> "$MEV"; echo "PREV_DRV=$nd" >> "$MEV"
  gw=$(curl -s -o /dev/null -w "%{http_code}" -m 8 "http://127.0.0.1:${MX_GW_PORT:-8801}/health" 2>/dev/null)
  [ "$gw" != "200" ] && echo "[mev $(date '+%T')] SVC gateway=$gw" >> "$MEV"
  return 0
}

note() { echo "[supervisor $(date '+%F %H:%M:%S')] $*"; }

# 熔断证据指纹（纪律 8 复位判据的监督器侧投影）：integration tip + G5 评审卡 body 哈希
# + 分析群最新判词结论行哈希。任一变化=「新提交/新判词/卡 body 更新/房间结论行重发」成立，
# 熔断复位放行新尝试。
# run22 复盘根治③：房间判词行入指纹——run22 实锤评审员改判只动卡面、房间行后补的
# 中间态：卡冻结后指纹不变=驱动永不被拉起，房间行重发也没人消费（收敛循环 9h 的
# 放大器）。指纹补第三源（房间 READY-GATE 结论行·取最新一条原文哈希）后，评审员
# 任一载体更新都能触发复位——等待锚与判定锚对齐。
_g5_evidence_fp() {
  local fp="" repo rgid db
  repo="$SIM_ROOT/central/${MX_CENTRAL_NAME:-aipaydev}"
  git -C "$repo" fetch -q origin 2>/dev/null
  fp="itip:$(git -C "$repo" rev-parse --short "origin/integration/${RFD_ID:-RFD-001}" 2>/dev/null || echo -)"
  # 2026-11-02 run25 G2 实锤（与 _mx_gate_evidence_sig 同根）：integration 分支开发合并期才
  # 建，pre-integration 闸的修订证据落 origin/main——指纹无 main tip 即复位永不触发。
  fp="$fp mtip:$(git -C "$repo" rev-parse --short origin/main 2>/dev/null || echo -)"
  rgid=$(sed -n 's/^card_g5_ready=//p' "$STATE" 2>/dev/null | head -1)
  if [[ -n "$rgid" ]]; then
    db="$SIM_ROOT/hermes/kanban/boards/${MX_ANCHOR_USER:-fanfan}-review/kanban.db"
    # run20 02:2x 死锁根治：判词常写 result 列（G5 终判 PASS 实录）而 body 不动——
    # 单 body 哈希永不变化=复位永不触发。扩为 body||result 拼接哈希（判词落任一列即指纹变）。
    fp="$fp card:$(sqlite3 "$db" "SELECT body || char(10) || coalesce(result,'') FROM tasks WHERE id='$rgid';" 2>/dev/null | shasum | cut -c1-12)"
  fi
  # run22 根治③：房间判词行入指纹（第三源）——分析群最新 READY-GATE 结论行原文哈希。
  # 评审员任一载体（卡/房间行）更新都可触发复位；消息翻页 50 条覆盖催办-改判窗足够
  # （更深历史由卡面源兜底）。fail-soft：取不到房间/令牌/网络=该源缺席，指纹退化为双源。
  local _room _tok _vline
  _room=$(sed -n 's/^room_analysis=//p' "$STATE" 2>/dev/null | head -1)
  _tok=$(head -1 "$SIM_ROOT/creds/${MX_ANCHOR_USER:-fanfan}.token" 2>/dev/null)
  if [[ -n "$_room" && -n "${_tok:-}" ]]; then
    # 判词行形态过滤（非任意提及）：行首 token 或「结论（行）：X」锚定——催办/转述
    # 消息里的 READY-GATE 字样不计（run22 实测催办文本会命中朴素 contains）。
    _vline=$(curl -s -m 10 "http://${MX_HS_HOST:-127.0.0.1}:${MX_HS_PORT:-8008}/_matrix/client/v3/rooms/$_room/messages?access_token=$_tok&dir=b&limit=200" 2>/dev/null \
      | python3 -c 'import json,sys,re
try: chunk=json.load(sys.stdin).get("chunk",[])
except Exception: sys.exit(0)
pat=re.compile(r"^\s*READY-GATE-(PASS|FAIL)|结论(行)?[（(]?[^）)]*[）)]?[:：]\s*READY-GATE-(PASS|FAIL)")
last=""
for m in reversed(chunk):
    b=((m.get("content") or {}).get("body") or "")
    if pat.search(b): last=b
print(last)' 2>/dev/null)
    [[ -n "${_vline:-}" ]] && fp="$fp room:$(printf '%s' "$_vline" | shasum | cut -c1-12)"
  fi
  printf '%s' "$fp"
}

_br_nudge_g5() { # <waited-sec>——熔断死等催办：以导演账号（fanfan 人类号）在分析群点名
  # 评审卡 owner-agent 补齐缺项（证据变化即自动复位；run19 实锤死等 14400s+ 的根治件）。
  # 闸别分流（run25 实锤 22:45-22:55：G2 熔断死等被 G5 话术误催——run25 未到 G5，
  # fanfan 只能拒报，每 20min 一回合抢占修订关键路径）：按 breaker.json 实际熔断闸
  # 生成话术；非 G5 闸不催 READY-GATE-PASS（G2 催概设修订+复评链，其余催通用补证）。
  local waited="${1:-?}" tok room hs rgid body eid gate glabel
  tok=$(head -1 "$SIM_ROOT/creds/${MX_ANCHOR_USER:-fanfan}.token" 2>/dev/null) || return 0
  [ -n "$tok" ] || return 0
  room=$(sed -n 's/^room_analysis=//p' "$STATE" 2>/dev/null | head -1)
  rgid=$(sed -n 's/^card_g5_ready=//p' "$STATE" 2>/dev/null | head -1)
  [ -n "$room" ] || return 0
  hs="${MX_HOMESERVER:-http://127.0.0.1:8008}"
  # 判定与话术全部在 mx-gate-lib.sh（纯函数，行为测试直调）——本函数只管发消息。
  gate="$(mx_breaker_gates "$SIM_ROOT/runs/$RUN_ID/governance/breaker.json")"
  glabel="${gate:-G5}"
  body="$(mx_nudge_body_for_gate "$gate" "$waited" "$rgid" "${MX_ANCHOR_USER:-fanfan}")"
  eid=$(curl -s -m 10 -X PUT "$hs/_matrix/client/v3/rooms/$room/send/m.room.message/g5nudge-$(date +%s%3N)" \
    -H "Authorization: Bearer $tok" -d "$(python3 -c 'import json,sys; print(json.dumps({"msgtype":"m.text","body":sys.argv[1]}))' "$body")" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("event_id",""))' 2>/dev/null)
  [ -n "$eid" ] && note "催办令已发（${glabel}，${eid}）" || note "催办令发送失败（matrix 通道，下轮重试）"
}

note "启动：RUN_ID=$RUN_ID START_STEP=$START_STEP（report_done 落键即退；stop 文件=$STOPFLAG）"
# ── 推演单所有权（P2 Task 1；run15 双操作者拉锯 + run1 双驱动同栈互写的根治件）──
# owner 协议走 runtime guard CLI（四因子判活：pid+cmdMatcher+instance+规范化
# simRoot）。三启动顺序（product/bash/relay）全程恰一 owner：在位且活 → 本监督器
# 让位退出（不抢不杀，事件见 logs/guard-events.jsonl）；持有人死 → CLI 原子接管。
# 退出前按 pid+instance 释放（防 PID 复用误删他人锁）。
_mg_root=""
_d="$(cd "$(dirname "$0")/.." && pwd)"
while [ "$_d" != "/" ]; do
  [ -f "$_d/scripts/platform/runtime/guard-cli.mjs" ] && { _mg_root="$_d"; break; }
  _d="$(dirname "$_d")"
done
if [ -z "$_mg_root" ]; then
  echo "[supervisor FAIL] guard-cli.mjs 未找到（仓根解析失败）——单所有权协议不可用，拒绝无仲裁启动" >&2
  exit 5
fi
MX_GUARD="${MX_GUARD_NODE:-node}"
GUARD_CLI="$_mg_root/scripts/platform/runtime/guard-cli.mjs"
_mg() { "$MX_GUARD" "$GUARD_CLI" "$@"; }

OWN_JSON=""
OWN_JSON="$(_mg owner-acquire --sim-root "$SIM_ROOT" --kind bash-supervisor --run-id "$RUN_ID" --pid $$ --cmd-matcher 'run-driver-supervisor' 2>/dev/null)" || {
  _orc=$?
  _hk="$(printf '%s' "$OWN_JSON" | jq -r '.holder.kind // "?"' 2>/dev/null)"
  _hp="$(printf '%s' "$OWN_JSON" | jq -r '.holder.pid // "?"' 2>/dev/null)"
  note "owner 在位（kind=${_hk} pid=${_hp}）——本监督器让位退出（单所有权协议；若确认对方僵死，guard 四因子会自动判死接管，事件见 logs/guard-events.jsonl）"
  exit 4
}
MY_INSTANCE="$(printf '%s' "$OWN_JSON" | jq -r '.instance // empty' 2>/dev/null)"
trap '_mg owner-release --sim-root "$SIM_ROOT" --pid $$ --instance "$MY_INSTANCE" >/dev/null 2>&1' EXIT
note "owner 取得（instance=${MY_INSTANCE:0:8}…，bash-supervisor pid=$$）"
# 重启风暴护栏（run16 复盘，fix/run16-report-truth）：驱动非熔断 rc≠0 且无 report_done
# 时监督器每 30s 重启——run16 实锤 issues.log 混入坏字节致报告链连崩，20 轮循环 67 分钟
# 零告警单（监控侧无从得知）。护栏三档：连续 ≥3 次=记单 driver-restart-storm（幂等一次，
# 监控介入信号）；≥10 次=退避 120s 防刷单与负载；rc=0 即复位。不自停（保留自愈能力——
# run16 循环最终靠热修渡过），但把「跑完才知道坏」前移为「第 3 次失败就知道」。
_storm=0
_storm_same=0      # 连续同指纹失败次数（确定性失败判定，见下方注释）
_storm_fp=""       # 上轮驱动日志新增段的失败指纹
_det_stage=0       # 确定性失败二段式阶段（0=未重挂过；1=已自动重挂一次）——A2（run29 复盘）

# A2（run29 复盘）：确定性失败二段式判定（纯函数，行为测可提取）。
# run29 实测监督器判确定性失败后直接退出 5 次，每次都停在「等人工重挂」——无人值守时
# 即永久停滞。二段式：第 1 段自动重挂一次（60s 退避＋计数重置＋告警），第 2 段才停。
mx_storm_decision() { # <same_count> <same_max> <stage> → continue|rearm|exit
  local same="${1:-0}" max="${2:-0}" stage="${3:-0}"
  if [[ "$max" -le 0 || "$same" -lt "$max" ]]; then printf 'continue'; return 0; fi
  if [[ "$stage" -eq 1 ]]; then printf 'exit'; else printf 'rearm'; fi
}

# 幂等记单（监督器不 source mx-scenario-lib，issue_once 不可用——本地最小实现）
mx_issue_once() { # <type> <subject> <desc>
  local _f="$SIM_ROOT/runs/$RUN_ID/evidence/issues.log"
  grep -qF "ISSUE|$1|$2|" "$_f" 2>/dev/null && return 0
  echo "ISSUE|$1|$2|$3" >> "$_f" 2>/dev/null || true
}

# 告警落点（A2）：evidence/alerts.jsonl 供值守/巡检机械读取（issues.log 混业务记账）。
mx_alert() { # <level> <code> <message>
  local _ev="${SIM_ROOT}/runs/${RUN_ID}/evidence"
  [[ -d "$_ev" ]] || return 0
  printf '{"ts":"%s","level":"%s","code":"%s","message":"%s"}\n' \
    "$(date -u +%FT%TZ)" "${1:-warn}" "${2:-?}" "${3:-}" >> "$_ev/alerts.jsonl" 2>/dev/null || true
}
while true; do
  [[ -f "$STOPFLAG" ]] && { note "stop 文件在位，监督器退出"; rm -f "$STOPFLAG"; exit 0; }
  if grep -q '^report_done=' "$STATE" 2>/dev/null; then
    note "report_done 已落键，监督器功成身退"
    exit 0
  fi
  # 驱动在位判定（P2 Task 1 起「杀外国驱动」退役）：单所有权下不再击杀——
  # 驱动锁持有人活（guard 四因子：pid+cmdMatcher+instance+规范化 simRoot）=
  # 有驱动在跑（无论谁拉起，owner 协议保证拉起权唯一），让位等待；
  # 死/无锁 → 本 owner 负责断点续跑（陈锁接管由驱动自身的 driver-acquire 原子完成）。
  LSTAT="$(_mg lock-status --sim-root "$SIM_ROOT" 2>/dev/null || true)"
  if printf '%s' "$LSTAT" | jq -e '.driver.alive == true' >/dev/null 2>&1; then
    _dlpid="$(printf '%s' "$LSTAT" | jq -r '.driver.pid // "?"' 2>/dev/null)"
    note "驱动在跑（锁持有人 pid=$_dlpid 活，四因子判活）——让位等待"
    monitor_events
    sleep 15
    continue
  fi
  # 恢复层让位 v1（2026-11-02 机制治理批）：网关正在供应商恢复循环/回合恢复时先不重启——
  # 此刻重启只会再撞一次同样的失败，正是 run25 打架环的第一次回环（见 mechanism-map §3）。
  # 上限 MX_RESTART_DEFER_MAX（默认 300s）后照常重启：永不无限等待，任何异常一律放行。
  _deferred=0
  while mx_gateway_recovering "$LOGS/gateway.log" "$(date +%s)" "${MX_RECOVERING_WINDOW:-300}" \
        && mx_defer_restart_policy 0 "$_deferred" "${MX_RESTART_DEFER_MAX:-300}"; do
    [ "$_deferred" -eq 0 ] && note "网关恢复信号在位——重启让位（上限 ${MX_RESTART_DEFER_MAX:-300}s）"
    sleep 30
    _deferred=$((_deferred + 30))
  done
  [ "$_deferred" -gt 0 ] && note "让位结束（${_deferred}s）——继续重启"
  note "驱动缺席，断点续跑（START_STEP=$START_STEP）"
  _loff=$(mxp_file_size "$LOGS/$RUN_ID-driver.log")
  # 静默心跳 spawn（run27 实锤根治）：驱动楔死（日志零增长≥MX_SILENT_KILL_SEC，缺省
  # 900s）时精确 kill 断点接力，监督器不再同步 wait 干等。exec 使子进程即驱动真身。
  MX_ISSUES_LOG="$SIM_ROOT/runs/$RUN_ID/evidence/issues.log" \
  mx_run_with_heartbeat "$LOGS/$RUN_ID-driver.log" "${MX_SILENT_KILL_SEC:-900}" 120 \
    bash -c 'cd "$1" && RUN_ID="$2" START_STEP="$3" exec bash aipay-scenario.sh' _ "$SCRIPT_DIR/.." "$RUN_ID" "$START_STEP"
  RC=$?
  # 纪律 8 可执行化（run14 实锤：熔断退出被盲目重启 85 圈——每圈刷单+回灌轰炸 agent）：
  # 驱动因熔断退出=正常退出，不 sleep-30 重启；进入证据等待模式，指纹变化
  # （新提交/新判词/评审卡 body 更新=熔断复位条件）才作为新尝试重启驱动。
  if tail -c +$((_loff+1)) "$LOGS/$RUN_ID-driver.log" 2>/dev/null | grep -q "打回熔断"; then
    note "驱动 rc=$RC 因熔断退出——证据等待模式（复位=integration tip/评审卡面变化；stop 文件/report_done 仍即退）"
    _fp0=$(_g5_evidence_fp); _wd=0
    # run19 根治（熔断死等）→ 用户 2026-10-14 收紧：触发式准实时——指纹持续不变
    # 300s 即首催，此后每 300s 幂等再催（连续 10 次无响应升级记单人工介入信号，
    # 防无限轰炸）；指纹轮询 120s 不变（发现≤240s、动作≤300s 满足总时限）。
    _WM="${MX_BREAKER_WAIT_MAX:-300}"; _NG="${MX_BREAKER_NUDGE_EVERY:-300}"
    # 指数退避状态（run30 实录根治：固定 300s 对冷态/深睡 agent 是纯轰炸——G2 环
    # 14 次 70min 零响应）：间隔 _NG→2×→4× 封顶 1800s；首催准点，此后对无响应降频。
    _nudge_next=$_WM; _nudge_gap=$_NG; _nudges=0
    while true; do
      [[ -f "$STOPFLAG" ]] && { note "stop 文件在位（证据等待中），监督器退出"; rm -f "$STOPFLAG"; exit 0; }
      grep -q '^report_done=' "$STATE" 2>/dev/null && { note "report_done 已落键，监督器功成身退"; exit 0; }
      sleep 120; _wd=$((_wd+120))
      _fp1=$(_g5_evidence_fp)
      if [[ "$_fp1" != "$_fp0" ]]; then
        note "证据变化（${_fp0} → ${_fp1}）——熔断复位，重启驱动（新尝试）"
        break
      fi
      if [ $((_wd % 600)) -eq 0 ]; then note "证据等待 ${_wd}s（指纹不变：${_fp1}）"; fi
      # run24 复盘批（2026-11-02）：熔断等待期并行预备（early-start，纪律 93）＋跨域依赖
      # 看护（纪律 94）——驱动因熔断已退出，这些机械动作只能由监督器内环补位。run24 实录：
      # G5 等待 4.5h 全员空转（15 编制均活跃 3-4 人），UAT 矩阵/发布件/复盘度量全靠值守
      # 人肉前置 9+ 次。全部走 state 键幂等（prep_* / depwatch_*），重复调用零副作用。
      ( set +e
        cd "$SCRIPT_DIR/.." 2>/dev/null && RUN_ID="$RUN_ID" bash -c '
          source mux/mx-lib.sh 2>/dev/null || exit 0
          source mux/mx-scenario-lib.sh 2>/dev/null || exit 0
          declare -F mx_prep_early_start_tick >/dev/null 2>&1 && mx_prep_early_start_tick
          declare -F dependency_watch_once >/dev/null 2>&1 && dependency_watch_once
        ' >> "$LOGS/$RUN_ID-driver.log" 2>&1
      ) || true
      # 超时催办（指数退避，run30 实录根治）：首催仍准点（用户 300s 时限保留）；
      # 此后对无响应自动降频——冷态 agent 的无效轰炸减 75%+。连续 10 次无响应升级
      # 记单（人工介入信号）——语义不变（用户 2026-10-14：禁死等→催办永不放弃）。
      if (( _wd >= _nudge_next )); then
        _nudges=$(( _nudges + 1 ))
        _iss_path="$SIM_ROOT/runs/$RUN_ID/evidence/issues.log"
        _nud="ISSUE|breaker-wait-nudge|supervisor|G5 熔断证据等待 ${_wd}s 指纹不变——已自动催办评审卡 owner 第 ${_nudges} 次（run19 根治+退避间隔 ${_nudge_gap}s）"
        grep -qF "breaker-wait-nudge" "$_iss_path" 2>/dev/null || echo "$_nud" >> "$_iss_path"
        if (( _nudges == 10 )); then
          # run19 复盘根治（裁决请求通道空转）：升级时扫分析群近 30 分钟「请导演裁决/报导演」
          # 未应答形态计数附入记单（run19 实锤：chen 10:45 裁决请求在熔断等待期无人应答 32 分钟）
          _vr_cnt=$(grep -c '裁决' "$SIM_ROOT/runs/$RUN_ID/evidence/scenario.log" 2>/dev/null || echo 0)
          echo "ISSUE|breaker-wait-escalated|supervisor|催办 10 次（累计 ${_wd}s）仍无证据变化——agent 补齐链疑似停摆，请人工介入（GATE_BREAKER_OVERRIDE 复议或查 agent 会话）；附：本轮日志内裁决请求信号 ${_vr_cnt} 处（含向导演请求未应答形态，须人工复核）" >> "$_iss_path"
          note "⚠ 催办 10 次无响应——已升级记单（人工介入信号+裁决请求信号 ${_vr_cnt} 处），退避催办不弃守"
        fi
        _br_nudge_g5 "${_wd}"
        note "熔断等待 ${_wd}s 无证据变化——第 ${_nudges} 次催办评审卡 owner（退避 ${_nudge_gap}s，下次 +${_nudge_gap}s）"
        _nudge_gap=$(( _nudge_gap * 2 )); (( _nudge_gap > 1800 )) && _nudge_gap=1800
        _nudge_next=$(( _wd + _nudge_gap ))
      fi
    done
    continue
  fi
  if [[ $RC -ne 0 ]]; then
    _storm=$((_storm+1))
    # 确定性失败判定（run23 实锤）：报告步审计在「同一批缺口」上必然复现 FAIL——驱动
    # 每次退出都是 rc=1、每次重入的失败集一模一样，30s 重启只是把同一份 FAIL 再算一遍
    # （run23 实测连续 11 次、耗时 65 分钟零新增信息）。故除次数外并入「失败指纹」：
    # 驱动日志新增段末行哈希；连续 N 次同指纹=确定性失败，记单并停（人工可见），
    # 指纹变化（缺口被修）才继续自愈。
    # run25 实锤：驱动退出段若无 FAIL 行（崩溃型/审计器热修后空段），grep 空输出经
    # shasum 得空串哈希 da39a3ee5e6b——与「上轮同失败」无法区分，5 轮即误判确定性失败
    # 自退（03:07 现场停摆 7 分钟，人工才发现）。口径：指纹必须有实质失败行才算数，
    # 空指纹=未知失败，只计入 storm 次数、不累计 storm_same（永不触发确定性自退）。
    _tailtxt="$(tail -c +$((_loff+1)) "$LOGS/$RUN_ID-driver.log" 2>/dev/null | grep -E '^\[mux FAIL|^== FAIL ==|^\- ' || true)"
    _tailfp="$(mx_fail_fingerprint "$_tailtxt")"
    if [[ -n "$_tailfp" ]]; then
      if [[ "$_tailfp" == "$_storm_fp" ]]; then _storm_same=$((_storm_same+1)); else _storm_same=1; _storm_fp="$_tailfp"; fi
    else
      _tailfp=""; _storm_same=0; _storm_fp=""
      note "本轮失败段无 FAIL 行（指纹未知）——不累计确定性判定（run25 空指纹误判根治）"
    fi
    if [[ $_storm -eq 3 ]]; then
      _iss_path="$SIM_ROOT/runs/$RUN_ID/evidence/issues.log"
      if ! grep -q '^ISSUE|driver-restart-storm|' "$_iss_path" 2>/dev/null; then
        echo "ISSUE|driver-restart-storm|supervisor|驱动连续 3 次非熔断 rc≠0 退出（重启循环风险；run16 实锤=issues.log 坏字节致报告链崩 20 轮 67 分钟零告警）——监控侧应即刻介入查驱动尾部 Traceback" >> "$_iss_path"
      fi
      note "⚠ 重启风暴：连续 ${_storm} 次失败——已记单 driver-restart-storm（监控介入信号）"
    fi
    # 同指纹硬停（缺省 5 次；MX_STORM_SAME_MAX 可调，0=关闭）。
    # 依据：同一失败集重复执行不产生新证据，停下来才是可观测的终态；继续刷只会
    # 制造「以为在自愈」的假象（run23 65 分钟实证）。
    _same_max="${MX_STORM_SAME_MAX:-5}"
    _dec="$(mx_storm_decision "$_storm_same" "$_same_max" "$_det_stage")"
    if [[ "$_dec" = "rearm" ]]; then
      # 第 1 段：自动重挂一次（告警＋退避＋计数重置）；「重启不产生新信息」的前提是
      # 缺口未变，60s 退避下人工/自动处置恰好落盘的窗口被吃进这一轮。
      _det_stage=1
      _iss_path="$SIM_ROOT/runs/$RUN_ID/evidence/issues.log"
      mx_issue_once driver-deterministic-stage1 supervisor "驱动连续 ${_storm_same} 次同指纹失败（${_storm_fp}）——二段式第 1 段：自动重挂一次（60s 退避＋计数重置）；第 2 次判定即停并告警"
      mx_alert warn driver-deterministic-stage1 "同指纹连续 ${_storm_same} 次（${_storm_fp}）——自动重挂一次"
      note "⛔ 首次判定确定性失败（${_storm_fp}）——二段式第 1 段：60s 退避后自动重挂一次"
      _storm=0; _storm_same=0; _storm_fp=""
      monitor_events
      sleep 60
    elif [[ "$_dec" = "exit" ]]; then
      _iss_path="$SIM_ROOT/runs/$RUN_ID/evidence/issues.log"
      mx_issue_once driver-deterministic-fail supervisor "驱动连续 ${_storm_same} 次退出且失败指纹不变（${_storm_fp}）——二段式第 2 段：自动重挂已用尽，监督器停止自愈；复位=修复缺口后重挂监督器或指纹变化"
      mx_alert error driver-deterministic-fail "同指纹再次连续 ${_storm_same} 次（${_storm_fp}）——自动重挂已用尽，停止"
      note "⛔ 同指纹再次连续 ${_storm_same} 次（${_storm_fp}）——二段式第 2 段：监督器退出（人工可见）"
      exit 3
    fi
    if [[ $_storm -ge 10 ]]; then
      note "连续 ${_storm} 次失败——退避 120s 再续（防刷单与负载；自愈保留）"
      monitor_events
      sleep 120
    fi
  else
    _storm=0; _storm_same=0; _storm_fp=""
  fi
  note "驱动退出 rc=$RC（${STATE} 无 report_done 键——30s 后按断点续跑）"
  sleep 30
done
