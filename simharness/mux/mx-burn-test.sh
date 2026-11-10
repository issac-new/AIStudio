#!/bin/bash
# mx-burn-test.sh — 机制类改动的烧机测试（2026-11-02 机制治理批·方案 D）
#
# 为什么有它：run25 实测「守门 128 项全绿仍在真环境连炸 3 个机制缺陷」——标记断言测不出
# 组合行为。整轮 26 步当试验场的代价是 4 小时/次；本脚本用脚本原生的 UNTIL_STEP 只跑到
# 指定步（默认 archgate，约 40 分钟），在真 gateway/真 agent/真闸门链路上把恢复/催办/
# 回灌/闸门等待四类机制跑一遍。
#
# 纪律（写进 docs/design/mechanism-map.md §6）：触及机制地图任一行（恢复/催办/闸门等待/
# 熔断）的改动，合入前必须跑一次本脚本并留在案收据。
#
# 用法：
#   bash mux/mx-burn-test.sh                 # 默认 --until archgate
#   bash mux/mx-burn-test.sh --until triage   # 更轻（约 20 分钟）
#   bash mux/mx-burn-test.sh --dry-run        # 只做前置自检，不跑驱动（prelaunch ㉛ 用）
#   bash mux/mx-burn-test.sh --wait 1800      # 活体 run 占锁时最多等 N 秒
#
# 退出码：0=pass / 1=fail / 2=blocked（活体 run 占锁等前置不满足）/ 3=用法错误
#
# 产物：$SIM_ROOT/runs/<RUN_ID>/burn-test-receipt.json（schema 2：机制 digest 绑定+
#      coverage+driver_log_sha256；由 mux/mx-mechanism-receipt.py emit 序列化——P2 Task 2）
#      $SIM_ROOT/runs/<RUN_ID>/evidence/**（驱动原生证据，与真 run 同构）
#      .qgate/burn/burn-receipts.jsonl（仓内运行态索引，一行一条；gitignored；dry-run 不落件）
set -u
LC_ALL=C

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # → simharness/
SIM="${AIPAY_SIM_ROOT:-/Users/cuishi/lab/ncwk-sim-mux}"
UNTIL="archgate"
RUN_ID=""
WAIT_SEC=0
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --until) UNTIL="${2:-}"; shift 2 ;;
    --run-id) RUN_ID="${2:-}"; shift 2 ;;
    --wait) WAIT_SEC="${2:-0}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "UNKNOWN-ARG: $1（--until/--run-id/--wait/--dry-run）" >&2; exit 3 ;;
  esac
done

STEPS=(smoke appinit people ba reqgate room dispatch register analysis triage anexec review archgate close plan devimpl defect testpass ready release uat workmgr audit retro ide report)
_valid_step() { local s; for s in "${STEPS[@]}"; do [ "$s" = "$1" ] && return 0; done; return 1; }
_valid_step "$UNTIL" || { echo "INVALID-STEP: $UNTIL（合法值：${STEPS[*]}）" >&2; exit 3; }

[ -z "$RUN_ID" ] && RUN_ID="burn-$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$SIM/runs/$RUN_ID"
LOG="$SIM/logs/${RUN_ID}-driver.log"
GATEWAY_HEALTH="${MX_GATEWAY_HEALTH:-http://127.0.0.1:8801/health}"
LOCK="$SIM/.driver.lock.d"

_preflight() { # 返回 0=可跑；非 0=blocked（原因写全局 BLOCK_REASON）
  BLOCK_REASON=""
  [ -d "$SIM" ] || { BLOCK_REASON="SIM_ROOT 不存在：$SIM"; return 1; }
  command -v bash >/dev/null 2>&1 || { BLOCK_REASON="bash 缺席"; return 1; }
  [ -f "$HERE/aipay-scenario.sh" ] || { BLOCK_REASON="驱动脚本缺席：$HERE/aipay-scenario.sh"; return 1; }
  bash -n "$HERE/aipay-scenario.sh" 2>/dev/null || { BLOCK_REASON="驱动脚本语法错（bash -n）"; return 1; }
  bash -n "$HERE/mux/run-driver-supervisor.sh" 2>/dev/null || { BLOCK_REASON="监督器语法错（bash -n）"; return 1; }
  python3 -I -m py_compile "$HERE/mux/mx-mechanism-receipt.py" 2>/dev/null \
    || { BLOCK_REASON="收据件语法错（py_compile mx-mechanism-receipt.py）"; return 1; }
  curl -s -m 5 "$GATEWAY_HEALTH" >/dev/null 2>&1 || { BLOCK_REASON="gateway 健康检查失败：$GATEWAY_HEALTH"; return 1; }
  return 0
}

# 机制文件清单根（digest 用）：仓根=HERE 的上一级
REPO_ROOT="$(cd "$HERE/.." && pwd)"
RECEIPT_PY="$HERE/mux/mx-mechanism-receipt.py"

# 锁判活走 guard CLI 四因子（P2 Task 2 修复：旧实现读 $LOCK/pid——锁目录内实际文件名
# 是 info，ls 恒空 → _lock_free 恒真，活体 run 占锁时烧机会与之并发互踩）
_mg_root=""
_d="$REPO_ROOT"
while [ "$_d" != "/" ]; do
  [ -f "$_d/scripts/platform/runtime/guard-cli.mjs" ] && { _mg_root="$_d"; break; }
  _d="$(dirname "$_d")"
done
MG_CLI="${_mg_root:+$_mg_root/scripts/platform/runtime/guard-cli.mjs}"
_lock_free() {
  [ -n "$MG_CLI" ] || { echo "guard-cli.mjs 未找到（锁判活不可用，fail-closed 拒跑）" >&2; return 1; }
  local st
  st="$("${MX_GUARD_NODE:-node}" "$MG_CLI" lock-status --sim-root "$SIM" 2>/dev/null)" || return 1
  # 推演域独占：owner 或驱动锁持有人任一活（四因子）→ 忙；死/无锁 → 空
  printf '%s' "$st" | jq -e '.driver.alive == true or .owner.alive == true' >/dev/null 2>&1 && return 1
  return 0
}

if [ "$DRY_RUN" -eq 1 ]; then
  if _preflight; then
    echo "BURN-DRY-RUN-OK  SIM=$SIM  UNTIL=$UNTIL  RUN_ID(将用)=$RUN_ID"
    [ "$(_lock_free && echo free || echo busy)" = busy ] && echo "NOTE: 活体 run 占锁——真跑会被 blocked（--wait 可等）"
    exit 0
  else
    echo "BURN-DRY-RUN-FAIL  $BLOCK_REASON"
    exit 2
  fi
fi

# ── 等锁（活体 run 在跑时不得并发：共享 state.env/板库/房间双写互踩，run25 值守定谳）
_waited=0
while ! _lock_free; do
  if [ "$_waited" -ge "$WAIT_SEC" ]; then
    echo "BLOCKED: 活体 run 占驱动锁（$LOCK）——等 ${_waited}s 超限。跑完再用，或 --wait <秒>。"
    exit 2
  fi
  sleep 10; _waited=$((_waited + 10))
  [ $((_waited % 60)) -eq 0 ] && echo "…等驱动锁 ${_waited}s"
done

_preflight || { echo "BLOCKED: $BLOCK_REASON"; exit 2; }

mkdir -p "$RUN_DIR/evidence" "$SIM/logs" "$HERE/../.qgate/burn" 2>/dev/null || true
STARTED_AT="$(date +%s)"
echo "=== 烧机开始 $(date '+%F %T')  RUN_ID=$RUN_ID  UNTIL=$UNTIL  （真 gateway/真 agent，产物落在 $RUN_DIR）==="

# 机制验证的观测面：驱动日志里的这些行是「机制是否被触发/是否打架」的唯一判据。
# 续跑环（2026-11-11 burn2 实证）：场景设计内有「fail 交监督器续跑」路径（G2 判词
# 锚错配重派即此，aipay-scenario.sh 锚错配分支注释明示）——单发执行会把该路径判成
# 终局 fail，把 agent 行为 hiccup 放大成机制失败。与真跑监督器语义对齐：最多 3 试，
# 每试独立日志（最后一试为判读/收据面），任一试 rc=0 即停；幂等依据=场景 state 键跳过。
# spec：docs/superpowers/specs/2026-11-11-burn-resume-attempts.md
MAX_ATTEMPTS=3
ATTEMPT=1
DRV_RC=1
while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
  LOG="$SIM/logs/${RUN_ID}-driver-a${ATTEMPT}.log"
  echo "--- 烧机第 ${ATTEMPT}/${MAX_ATTEMPTS} 试（日志 ${LOG}）---"
  AIPAY_SIM_ROOT="$SIM" RUN_ID="$RUN_ID" UNTIL_STEP="$UNTIL" LC_ALL=C \
    bash "$HERE/aipay-scenario.sh" > "$LOG" 2>&1
  DRV_RC=$?
  if [ "$DRV_RC" -eq 0 ]; then
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ] && sleep 30
done
# 兼容旧消费面：终态日志同步为主日志名（收据/判读/人工查读都指这里）
cp "$LOG" "$SIM/logs/${RUN_ID}-driver.log"
FINISHED_AT="$(date +%s)"
ELAPSED=$((FINISHED_AT - STARTED_AT))

# ── 判读：①驱动退出码（最后一试）②无 FAIL 行 ③到达目标步（state.env 有目标步的 *_done 键）
ST=pass; REASONS="attempts=${ATTEMPT};"
[ "$ATTEMPT" -gt 1 ] && echo "（续跑环共 ${ATTEMPT} 试——${RUN_ID}-driver-a*.log 系列，判读取最后一试）"
[ "$DRV_RC" -ne 0 ] && { ST=fail; REASONS="${REASONS}driver_rc=$DRV_RC;"; }
# grep -c 零匹配时 exit 1 且已打印 0——`|| echo 0` 会再补一行 0，receipt 里嵌进
# "0\n0" 使 JSON 破损（burn-20261103-215414 实锤）。空值兜底改后置展开。
FAIL_LINES="$(grep -cE '^\[mux FAIL |\[ERR\]' "$LOG" 2>/dev/null)"; FAIL_LINES="${FAIL_LINES:-0}"
[ "${FAIL_LINES:-0}" -gt 0 ] && { ST=fail; REASONS="${REASONS}fail_lines=$FAIL_LINES;"; }
DONE_KEYS="$(grep -cE '_done=1|_done=[0-9]{10}' "$RUN_DIR/state.env" 2>/dev/null)"; DONE_KEYS="${DONE_KEYS:-0}"
# 目标步达成判据：目标步自身的 done 键在位（archgate 的键= arch_pass 或 g2_arch_pass；其余用 <step>_done）
case "$UNTIL" in
  archgate) GOAL_OK=$(grep -cE '^(g2_arch_pass|arch_pass)=' "$RUN_DIR/state.env" 2>/dev/null); GOAL_OK="${GOAL_OK:-0}" ;;
  *)        GOAL_OK=$(grep -cE "^${UNTIL}_done=" "$RUN_DIR/state.env" 2>/dev/null); GOAL_OK="${GOAL_OK:-0}" ;;
esac
[ "${GOAL_OK:-0}" -eq 0 ] && { ST=fail; REASONS="${REASONS}goal_step_not_reached($UNTIL);"; }

FAIL_EXCERPT="$(grep -E '^\[mux FAIL |\[ERR\]|unbound variable|Traceback' "$LOG" 2>/dev/null | tail -8 | tr '\n' ' | ' | cut -c1-1200)"

# 收据落件走 mx-mechanism-receipt.py emit（P2 Task 2）：schema 2 + 机制 digest 绑定 +
# coverage + driver_log_sha256，json 序列化替代 shell 拼 JSON（空值场景不再产破损行）
python3 -I "$RECEIPT_PY" emit \
  --root "$REPO_ROOT" \
  --out "$RUN_DIR/burn-test-receipt.json" \
  --index "$HERE/../.qgate/burn/burn-receipts.jsonl" \
  --run-id "$RUN_ID" --until "$UNTIL" --status "$ST" \
  --driver-rc "$DRV_RC" --fail-lines "${FAIL_LINES:-0}" --done-keys "${DONE_KEYS:-0}" \
  --goal-ok "${GOAL_OK:-0}" --started-at "$STARTED_AT" --finished-at "$FINISHED_AT" \
  --log "$LOG" --reasons "${REASONS:-none}" --fail-excerpt "$FAIL_EXCERPT" \
  || echo "WARN: 收据落件失败（rc=$?）——prelaunch ㉛ 会拦，须修复 mx-mechanism-receipt.py"

echo "=== 烧机结果：${ST}（${ELAPSED}s，done 键 ${DONE_KEYS}，FAIL 行 ${FAIL_LINES}）${REASONS:+ 原因=${REASONS}}"
echo "    收据：$RUN_DIR/burn-test-receipt.json"
echo "    日志：$LOG"
[ "$ST" = pass ] && exit 0 || exit 1
