#!/bin/bash
# run-driver-supervisor.sh —— 推演驱动自愈监督器（2026-10-09 静默死亡事故根治）
#
# 事故形态（run12 实录）：驱动 bash 遭单 pid SIGTERM 静默死亡（EXIT trap 清锁、无 FAIL 行，
# 28 分钟空窗）；信号来源 macOS 不可考（双监管者抢驱动为最强嫌疑）。修复哲学：不追凶，
# 让击杀失效——驱动死亡后 30s 内自动按断点续跑（START_STEP 各段 done 键幂等跳过，
# 天然防重派），直到 report_done 落键才退出。
#
# 用法: nohup bash mux/run-driver-supervisor.sh --run <RUN_ID> [--start-step devimpl] \
#         [--sim-root /Volumes/nvme2230/lab/ncwk-sim-mux] > <sim-root>/logs/<RUN>-supervisor.log 2>&1 &
# 停止: touch <sim-root>/var/<RUN>-supervisor.stop（优雅退）或 kill 监督器（勿 kill 驱动——
#       会被拉起；真要停驱动先 touch stop 文件让监督器退场）
set -uo pipefail
export LC_ALL=C

RUN_ID="" START_STEP="devimpl" SIM_ROOT="${AIPAY_SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}"
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
STATE="$SIM_ROOT/runs/$RUN_ID/state.env"
LOGS="$SIM_ROOT/logs"
STOPFLAG="$SIM_ROOT/var/$RUN_ID-supervisor.stop"
LOCKDIR="$SIM_ROOT/.driver.lock.d"
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

# 熔断证据指纹（纪律 8 复位判据的监督器侧投影）：integration tip + G5 评审卡 body 哈希。
# 任一变化=「新提交/新判词/卡 body 更新」成立，熔断复位放行新尝试。
_g5_evidence_fp() {
  local fp="" repo rgid db
  repo="$SIM_ROOT/central/${MX_CENTRAL_NAME:-aipaydev}"
  git -C "$repo" fetch -q origin 2>/dev/null
  fp="itip:$(git -C "$repo" rev-parse --short "origin/integration/${RFD_ID:-RFD-001}" 2>/dev/null || echo -)"
  rgid=$(sed -n 's/^card_g5_ready=//p' "$STATE" 2>/dev/null | head -1)
  if [[ -n "$rgid" ]]; then
    db="$SIM_ROOT/hermes/kanban/boards/${MX_ANCHOR_USER:-fanfan}-review/kanban.db"
    fp="$fp card:$(sqlite3 "$db" "SELECT body FROM tasks WHERE id='$rgid';" 2>/dev/null | shasum | cut -c1-12)"
  fi
  printf '%s' "$fp"
}

note "启动：RUN_ID=$RUN_ID START_STEP=$START_STEP（report_done 落键即退；stop 文件=$STOPFLAG）"
# ── 双操作者协同（run15 复盘：三轮神秘杀组+一轮锁竞争互退实锤=两个会话各自起监督器
# 对同一 RUN 拉锯）。协议=注册表先到先得：启动时原子写 $SIM_ROOT/var/<RUN>-supervisor.owner；
# 在位且持有人 pid 活着 → 本监督器是后来者，退让退出（不抢不杀——对方在正常值守）；
# 持有人已死 → 接管覆写。退出前清自己的注册（防止陈尸注册挡后来者）。
OWNER="$SIM_ROOT/var/$RUN_ID-supervisor.owner"
_mso_take_or_yield() {
  local opid
  if [[ -f "$OWNER" ]]; then
    opid=$(sed -n 's/^pid=\([0-9]*\).*/\1/p' "$OWNER" 2>/dev/null | head -1)
    if [[ -n "$opid" ]] && kill -0 "$opid" 2>/dev/null; then
      note "注册表在位且持有人 pid=$opid 存活——本监督器退让（双操作者先到先得协议；若确认对方僵死：kill $opid 后重启本监督器）"
      exit 4
    fi
  fi
  { echo "pid=$$ pgid=$(ps -o pgid= -p $$ | tr -d ' ') started=$(date '+%F %T') cmdline=${0##*/}"; } > "$OWNER"
}
_mso_take_or_yield
trap '_myowner=$(sed -n "s/^pid=\\([0-9]*\\).*/\\1/p" "$OWNER" 2>/dev/null | head -1); [[ "$_myowner" == "$$" ]] && rm -f "$OWNER"' EXIT
# 进程组防御平台分叉（2026-10-12 双模式轮）：mac 用 pgid 精确区分本系/入侵
# （子 shell 继承本组）；Git Bash 无 POSIX 进程组语义——改「驱动同步执行 + 循环
# 仅在本系驱动退出后才运行」的事实不变式：循环里发现的任何 aipay-scenario 都不是
# 本系拉起的（本系在跑时会阻塞在同步 bash 调用里）；为防误杀接力器（mx-relay）
# 合法拉起的驱动，relay 在跑时让位等待而非击杀。
MYPGID=""
if mxp_is_mac; then
  MYPGID=$(ps -o pgid= -p $$ | tr -d ' ')
  note "本监督系进程组 pgid=$MYPGID（锁防御：非本组驱动=入侵者，清掉+记账）"
else
  note "非 mac 平台：pgid 防御不可用——改用「同步执行不变式 + relay 让位」防御（见循环内）"
fi
# 重启风暴护栏（run16 复盘，fix/run16-report-truth）：驱动非熔断 rc≠0 且无 report_done
# 时监督器每 30s 重启——run16 实锤 issues.log 混入坏字节致报告链连崩，20 轮循环 67 分钟
# 零告警单（监控侧无从得知）。护栏三档：连续 ≥3 次=记单 driver-restart-storm（幂等一次，
# 监控介入信号）；≥10 次=退避 120s 防刷单与负载；rc=0 即复位。不自停（保留自愈能力——
# run16 循环最终靠热修渡过），但把「跑完才知道坏」前移为「第 3 次失败就知道」。
_storm=0
while true; do
  [[ -f "$STOPFLAG" ]] && { note "stop 文件在位，监督器退出"; rm -f "$STOPFLAG"; exit 0; }
  if grep -q '^report_done=' "$STATE" 2>/dev/null; then
    note "report_done 已落键，监督器功成身退"
    exit 0
  fi
  # 锁防御（2026-10-09 双监管拉锯实录：抢驱方反复杀 incumbent+抢窗口启动）——
  # 只认本监督系的驱动；他系驱动=入侵者，一律 TERM+issues 记账（击杀失效化的
  # 另一半：不许他方长驻）。
  if [[ -n "$MYPGID" ]]; then
    DPIDS=$(ps -axo pid,pgid,command | awk -v g="$MYPGID" '$3=="bash" && /aipay-scenario\.sh/ && !/pgrep|grep|tail|awk|sed/ {print $1":"$2}')
  else
    if [[ -n "$(mxp_pgrep_f "mx-relay.sh")" ]]; then
      note "接力器（mx-relay）在跑——让位等待，不抢驱动（防误杀 relay 拉起的合法驱动）"
      monitor_events; sleep 30; continue
    fi
    DPIDS=$(mxp_pgrep_f "aipay-scenario\.sh" | awk '{print $1":foreign"}')
  fi
  for dp in $DPIDS; do
    dpid="${dp%%:*}"; dpgid="${dp##*:}"
    if [ "$dpgid" != "$MYPGID" ]; then
      note "锁防御：入侵驱动 pid=$dpid pgid=$dpgid（非本系 $MYPGID）——TERM"
      echo "ISSUE|driver-intruder|supervisor|入侵驱动 pid=$dpid pgid=$dpgid 被监督器清除（单驱动锁执行臂；本系 pgid=$MYPGID）" >> "$SIM_ROOT/runs/$RUN_ID/evidence/issues.log"
      kill -TERM "$dpid" 2>/dev/null
    fi
  done
  if [ -n "$DPIDS" ] && echo "$DPIDS" | grep -qE ":(${MYPGID}|foreign)$"; then
    monitor_events
    sleep 15
    continue
  fi
  # 陈锁兜底（持锁者已死才清——活锁不动，防误清在跑驱动的锁）
  if [[ -f "$LOCKDIR/info" ]]; then
    LPID=$(sed -n 's/^pid=\([0-9]*\).*/\1/p' "$LOCKDIR/info" 2>/dev/null)
    if [[ -z "$LPID" ]] || ! kill -0 "$LPID" 2>/dev/null; then
      note "清陈锁（持锁者 ${LPID:-空} 已死）"
      rm -rf "$LOCKDIR"
    else
      note "锁持有者 $LPID 活着但无驱动进程匹配——等待其退出，不抢锁"
      sleep 30
      continue
    fi
  fi
  note "驱动缺席，断点续跑（START_STEP=$START_STEP）"
  _loff=$(mxp_file_size "$LOGS/$RUN_ID-driver.log")
  ( cd "$SCRIPT_DIR/.." && RUN_ID="$RUN_ID" START_STEP="$START_STEP" bash aipay-scenario.sh >> "$LOGS/$RUN_ID-driver.log" 2>&1 )
  RC=$?
  # 纪律 8 可执行化（run14 实锤：熔断退出被盲目重启 85 圈——每圈刷单+回灌轰炸 agent）：
  # 驱动因熔断退出=正常退出，不 sleep-30 重启；进入证据等待模式，指纹变化
  # （新提交/新判词/评审卡 body 更新=熔断复位条件）才作为新尝试重启驱动。
  if tail -c +$((_loff+1)) "$LOGS/$RUN_ID-driver.log" 2>/dev/null | grep -q "打回熔断"; then
    note "驱动 rc=$RC 因熔断退出——证据等待模式（复位=integration tip/评审卡面变化；stop 文件/report_done 仍即退）"
    _fp0=$(_g5_evidence_fp); _wd=0
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
    done
    continue
  fi
  if [[ $RC -ne 0 ]]; then
    _storm=$((_storm+1))
    if [[ $_storm -eq 3 ]]; then
      _iss_path="$SIM_ROOT/runs/$RUN_ID/evidence/issues.log"
      if ! grep -q '^ISSUE|driver-restart-storm|' "$_iss_path" 2>/dev/null; then
        echo "ISSUE|driver-restart-storm|supervisor|驱动连续 3 次非熔断 rc≠0 退出（重启循环风险；run16 实锤=issues.log 坏字节致报告链崩 20 轮 67 分钟零告警）——监控侧应即刻介入查驱动尾部 Traceback" >> "$_iss_path"
      fi
      note "⚠ 重启风暴：连续 ${_storm} 次失败——已记单 driver-restart-storm（监控介入信号）"
    fi
    if [[ $_storm -ge 10 ]]; then
      note "连续 ${_storm} 次失败——退避 120s 再续（防刷单与负载；自愈保留）"
      monitor_events
      sleep 120
    fi
  else
    _storm=0
  fi
  note "驱动退出 rc=$RC（${STATE} 无 report_done 键——30s 后按断点续跑）"
  sleep 30
done
