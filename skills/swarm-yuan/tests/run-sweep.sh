#!/usr/bin/env bash
# run-sweep.sh — 本地全量回归统一入口（R70 流程修复：此前各轮"全量 sweep"是临时 for 循环，
# 只跑 tests/test-*.sh，不含 verifier（shellcheck/产物 e2e/夹具双态）——R66-R69 连续四轮
# CI 红的流程根因。本脚本把"收口前必跑"的完整面固化为单一命令，任一环节失败即非零退出。
#
# 用法: bash swarm-yuan/tests/run-sweep.sh
# 覆盖面（与 CI 同构）:
#   ① tests/test-*.sh + tests/scripts/test-*.sh 全部锁测试（R126 补后者——
#     test-memory-writeback 等此前只在 CI 跑，本地 sweep 名实不符）
#   ② tests/run-e2e.sh（注入链路 e2e）
#   ③ tests/run-gen-e2e.sh（生成产物 e2e——mark-active 闭环）
#   ④ tests/run-fieldchange-e2e.sh（字段变更传播 e2e）
#   ⑤ verifier/v1/run-verifier.sh all（81 夹具双态 + gate fixtures + CLI_AB + golden + shellcheck + 自举）
#   ⑥ self-check.sh --check-only（口径一致性）
#   ⑦ build-compendium.sh --check（汇编六卷快照与正本逐字节一致）
# R126 加固：
#   - vacuous-pass 清零：锁测试 glob 零命中 → fail-closed（旧版「0 通过 0 失败」假绿，
#     tests 目录失联/改名时全量回归静默放行）；
#   - 单实例机器强制：同一仓库树同时只许一个 sweep（mkdir 原子锁 + 属主 PID 探活 +
#     陈旧锁自动回收）——sbom/scope fixture 原地 setup/teardown 与 .gate-fail-flag 写
#     仓库树，并发互撞从此显式报错而非互相污染。
set -u
BASE="$(cd "$(dirname "${0}")/.." && pwd)"          # swarm-yuan/
REPO="$(cd "${BASE}/.." && pwd)"                     # 仓库根（verifier/ 在此）
cd "${REPO}" || exit 1

# ===== 单实例锁（mkdir 原子；锁随树走——按仓库根路径哈希区分 worktree 并行） =====
LOCK_DIR="${TMPDIR:-/tmp}/swarm-yuan-sweep.$(printf '%s' "$REPO" | cksum | awk '{print $1}').lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  _owner="$(cat "$LOCK_DIR/pid" 2>/dev/null)"
  if [[ -n "$_owner" ]] && kill -0 "$_owner" 2>/dev/null; then
    echo "✗ 已有 sweep 在本仓库树运行（pid ${_owner}）——并发 sweep 会互撞 fixture（sbom/scope）与 .gate-fail-flag，等其结束再跑" >&2
    exit 2
  fi
  # 陈旧锁（属主进程已死）回收
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR" 2>/dev/null || { echo "✗ sweep 锁获取失败: $LOCK_DIR" >&2; exit 2; }
fi
printf '%s\n' "$$" > "$LOCK_DIR/pid"

# R118：每次运行独立日志目录——旧版固定 /tmp/sweep-*.log，并发 worktree 会互相覆盖。
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sweep-logs.XXXXXX")"
pass=0; fail=0
cleanup_logs() {
  rm -rf "$LOCK_DIR" 2>/dev/null
  if [[ "${fail:-0}" -eq 0 ]]; then
    rm -rf "$LOG_DIR"
  else
    echo "失败日志保留: $LOG_DIR"
  fi
}
trap cleanup_logs EXIT
ok()  { echo "  ✓ [$1] 通过"; pass=$((pass+1)); }
bad() { echo "  ✗ [$1] 失败（日志: $2）"; fail=$((fail+1)); }

run_step() { # $1=名称 $2=日志路径 $3..=命令
  local name="$1" log="$2"; shift 2
  if "$@" > "${log}" 2>&1; then
    ok "${name}"
  else
    bad "${name}" "${log}"
  fi
}

echo "=== swarm-yuan 本地全量回归（run-sweep.sh）==="

# ① 锁测试全量（WP9：统一 runner——本地 sweep 与 CI 同构；零命中 fail-closed 由 runner 保证）
# 并行度默认 4：parallel_safe=no 的 12 个共享状态测试由 runner 排到最后逐个独占，
# 并行只作用于 parallel_safe=yes 的测试（实测 jobs=4 全量 108 锁测试 0 失败）。
test_n="$(bash "${BASE}/tests/run.sh" --list 2>/dev/null | awk 'NF{n++} END{print n+0}')"
run_step "锁测试（runner，${test_n} 个）" "$LOG_DIR/runner.log" \
  bash "${BASE}/tests/run.sh" --level all --jobs "${SWEEP_JOBS:-4}" --format text
if [[ "$test_n" -eq 0 ]]; then
  echo "  ✗ [锁测试清单] tests/test-*.sh 零命中——tests 目录失联或改名，拒绝假绿" >&2
  fail=$((fail+1))
fi

# ②③④ 三条 e2e
run_step "e2e（注入链路）" "$LOG_DIR/e2e.log" bash "${BASE}/tests/e2e/run-e2e.sh"
run_step "gen-e2e（生成产物/mark-active 闭环）" "$LOG_DIR/gen-e2e.log" bash "${BASE}/tests/e2e/run-gen-e2e.sh"
run_step "fieldchange-e2e" "$LOG_DIR/fieldchange.log" bash "${BASE}/tests/e2e/run-fieldchange-e2e.sh"

# ⑤ verifier all（夹具双态 + gate fixtures + CLI_AB + golden + shellcheck + 自举闭环）
# R129：②③ 已跑 e2e/gen-e2e，verifier all 内不再重复（VERIFIER_SKIP_E2E=1 显式披露跳过）
run_step "verifier-all" "$LOG_DIR/verifier.log" env VERIFIER_SKIP_E2E=1 bash "${REPO}/verifier/v1/run-verifier.sh" all

# ⑥ self-check
run_step "self-check" "$LOG_DIR/self-check.log" bash "${BASE}/scripts/self-check.sh" --check-only

# ⑦ build-compendium（R141：汇编六卷与正本逐字节一致——旧版抽检假绿两例实录后根治入收口门）
run_step "compendium-check" "$LOG_DIR/compendium.log" bash "${BASE}/scripts/build-compendium.sh" --check

echo "=== 汇总：${pass} 通过 / ${fail} 失败（锁测试 ${test_n} 个）==="
[[ ${fail} -eq 0 ]]
