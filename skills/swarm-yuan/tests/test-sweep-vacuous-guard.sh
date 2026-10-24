#!/usr/bin/env bash
# test-sweep-vacuous-guard.sh — R126：回归基建 fail-closed 与单实例锁回归锁
#
# 修复前缺陷：
#   ① run-verifier.sh fixtures()/gate_fixtures()：fixture 目录失联/改名时 ids 为空 →
#     TOTAL 0 FAILS 0 → rc=0 假绿（vacuous pass）；
#   ② run-sweep.sh 同款：tests/test-*.sh glob 零命中 → 「0 通过 0 失败」exit 0；
#   ③ sweep 单实例约束只有头注释口头约定，无机器强制（sbom/scope fixture 原地
#     setup/teardown + .gate-fail-flag 写仓库树，并发互撞有实锤残留）；
#   ④ run-sweep.sh glob 不覆盖 tests/scripts/test-*.sh（test-memory-writeback 只在 CI 跑）。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
BASE="$(pwd)"                                        # swarm-yuan/
REPO="$(cd "${BASE}/.." && pwd)"                     # 仓库根
TMP="$(mktemp -d /tmp/svg.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# ===== 态1：verifier fixtures 模式空树 fail-closed（行为级） =====
mkdir -p "$TMP/fakeroot/swarm-yuan/tests"            # 有 swarm-yuan 树但无 fixtures 目录
out="$(bash "$REPO/verifier/v1/run-verifier.sh" fixtures "$TMP/fakeroot" 2>&1)"; rc=$?
if [[ $rc -ne 0 ]] && printf '%s' "$out" | grep -q '拒绝 vacuous pass'; then
  ok "态1 fixtures 空树 fail-closed（rc=${rc}）"
else
  bad "态1 空树未拦截 rc=${rc}：$out"
fi

# ===== 态2：verifier gate-fixtures 模式空目录 fail-closed（行为级） =====
mkdir -p "$TMP/fakeroot/swarm-yuan/tests/gate-fixtures"   # 目录在但空
out="$(bash "$REPO/verifier/v1/run-verifier.sh" gate-fixtures "$TMP/fakeroot" 2>&1)"; rc=$?
if [[ $rc -ne 0 ]] && printf '%s' "$out" | grep -q '拒绝 vacuous pass'; then
  ok "态2 gate-fixtures 空目录 fail-closed（rc=${rc}）"
else
  bad "态2 空目录未拦截 rc=${rc}：$out"
fi

# ===== 态3：run-sweep 零命中 fail-closed + tests/scripts 覆盖（静态断言） =====
if grep -q '拒绝假绿' "$BASE/tests/run-sweep.sh" \
   && grep -q 'tests/scripts/test-\*\.sh' "$BASE/tests/run-sweep.sh"; then
  ok "态3 sweep 零命中拒绿 + tests/scripts 纳入 glob"
else
  bad "态3 sweep 缺零命中守卫或 tests/scripts 覆盖"
fi

# ===== 态4：sweep 单实例锁行为级——活锁占位时第二个 sweep 拒跑（rc=2 快速返回） =====
LOCK_DIR="${TMPDIR:-/tmp}/swarm-yuan-sweep.$(printf '%s' "$REPO" | cksum | awk '{print $1}').lock"
rm -rf "$LOCK_DIR"; mkdir -p "$LOCK_DIR"
printf '%s\n' "$$" > "$LOCK_DIR/pid"               # 本测试进程存活 → 模拟在跑 sweep
out="$(bash "$BASE/tests/run-sweep.sh" 2>&1)"; rc=$?
rm -rf "$LOCK_DIR"
if [[ $rc -eq 2 ]] && printf '%s' "$out" | grep -q '已有 sweep 在本仓库树运行'; then
  ok "态4 活锁占位时 sweep 拒跑（rc=2）"
else
  bad "态4 并发锁未生效 rc=${rc}：$out"
fi

# ===== 态5：陈旧锁自动回收（属主 PID 已死→回收续跑，不卡死） =====
rm -rf "$LOCK_DIR"; mkdir -p "$LOCK_DIR"
# 找一个必不存在的 PID：反复自增直到 kill -0 失败
_dead=999999; while kill -0 "$_dead" 2>/dev/null; do _dead=$((_dead+1)); done
printf '%s\n' "$_dead" > "$LOCK_DIR/pid"
# 不真跑全量 sweep——只验证能越过锁检查点：用 timeout 截断，输出含「本地全量回归」头即越锁
out="$( (bash "$BASE/tests/run-sweep.sh" 2>&1 & echo $! > "$TMP/sweep.pid"; sleep 5; kill "$(cat "$TMP/sweep.pid")" 2>/dev/null; wait "$(cat "$TMP/sweep.pid")" 2>/dev/null) )"
# 越锁证据：输出出现回归头；锁被清理（trap）或留死锁由下一轮回收
printf '%s' "$out" | grep -q '本地全量回归' && _passed=1 || _passed=0
rm -rf "$LOCK_DIR"                                  # 被杀进程的 trap 未必跑，兜底清锁
if [[ "$_passed" -eq 1 ]]; then
  ok "态5 陈旧锁回收后续跑（越锁点输出回归头）"
else
  bad "态5 陈旧锁未回收：$out"
fi

# ===== 态6：fixture 运行器清 .gate-fail-flag 残留（静态断言） =====
grep -q 'gate-fail-flag' "$BASE/tests/run-gate-fixture.sh" \
  && ok "态6 run-gate-fixture teardown 清 flag 残留" || bad "态6 缺 flag 残留清理"

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "✓ test-sweep-vacuous-guard 全绿（vacuous pass 清零 + 单实例锁 + 残留清理）"
else
  echo "✗ test-sweep-vacuous-guard 存在失败项" >&2
fi
exit $FAIL
