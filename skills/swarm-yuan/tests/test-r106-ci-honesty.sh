#!/usr/bin/env bash
# test-r106-ci-honesty.sh — CI 诚实性守门测试（R106）
# 背景：f7ddd4c（交付形态 DoD）带 3 处 G20 违规 + 产物 SKILL.md 超 251B 预算合入 main，
# CI 三洞叠加放行：① self-check job 管道吞退出码（只验证"跑过"不验证"通过"）
# ② verifier step 在 bash -e 下 rc 捕获是死代码（✗ 汇总行永不打出）
# ③ run-verifier bootstrap 票 `|| true` 吞 rc 恒投通过（死票）+ gen-e2e 失败日志进 /tmp 不可见。
# 本测试锁：退出码诚实断言在位 + 死票行为级复活探针（stub precheck 失败必须 FAIL）+ 失败可见性。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1   # swarm-yuan/
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

BASE="$(pwd)"
SWARM_YUAN_SOURCE_ROOT="$(cd "${BASE}/../.." && pwd)"
CI_YML="$SWARM_YUAN_SOURCE_ROOT/.github/workflows/swarm-yuan.yml"
VR="$BASE/verifier/v1/run-verifier.sh"
SWEEP="$BASE/tests/run-sweep.sh"
SC="scripts/self-check.sh"

[[ -f "$CI_YML" ]] || { echo "  ✗ ci.yml 缺失（生成器仓布局异常）" >&2; exit 1; }
[[ -f "$VR" ]]     || { echo "  ✗ run-verifier.sh 缺失" >&2; exit 1; }

# ===== ① self-check job 退出码诚实 =====
grep -q -- '--check-only --ci' "$SWEEP" && ok "1a sweep 在 CI 跑全量 --check-only --ci" || bad "1a self-check CI 旗标漂移（诚实门禁回退）"
grep -q '诚实门禁：违规即红' "$SWEEP" && ok "1b sweep 断言 self-check 非零退出码" || bad "1b 退出码断言缺失（管道吞码洞回开）"
if grep -q 'bash scripts/self-check.sh 2>&1 | grep' "$CI_YML" "$SWEEP"; then bad "1c 旧管道吞退出码模式回潮"; else ok "1c 无管道吞退出码模式"; fi
grep -q -- '--ci) CI_MODE=1' "$SC" && ok "1d self-check.sh 解析 --ci 旗标" || bad "1d --ci 旗标缺失"
bash -n "$SC" && ok "1e self-check.sh 语法（bash -n）" || bad "1e 语法失败"

# ===== ② CI 与本地共用同一全量入口，verifier 退出码由 run_step 捕获 =====
grep -q 'bash skills/swarm-yuan/tests/run-sweep.sh' "$CI_YML" && ok "2a CI 调用统一 run-sweep.sh" || bad "2a CI 未调用统一 run-sweep.sh"
grep -q 'run_step "verifier-all"' "$SWEEP" && ok "2b verifier-all 由 run_step 诚实计票" || bad "2b verifier-all 未纳入统一失败汇总"

# ===== ③ bootstrap 票行为级探针：stub precheck 失败必须投 FAIL 票 =====
SBOX="$(mktemp -d "${TMPDIR:-/tmp}/r106-sbox.XXXXXX")"
mkdir -p "${SBOX}/skills/swarm-yuan/ci" "${SBOX}/skills/swarm-yuan/assets"
printf 'SPEC_FILE=spec.md\n' > "${SBOX}/skills/swarm-yuan/ci/self-precheck.conf"
printf '#!/usr/bin/env bash\nexit 1\n' > "${SBOX}/skills/swarm-yuan/assets/precheck.sh"
bash "$VR" bootstrap "$SBOX" > "${SBOX}/out-fail.log" 2>&1
rc_fail=$?
if [[ $rc_fail -ne 0 ]]; then ok "3a 死票复活：失败 precheck（rc=1）→ bootstrap 判 FAIL（rc=${rc_fail}）"; else bad "3a 死票回潮：precheck 失败仍投通过票"; fi
grep -q 'BOOTSTRAP_SELF_GATE FAIL' "${SBOX}/out-fail.log" && ok "3b FAIL 判定行输出在案" || bad "3b FAIL 判定行缺失"
# 成功路径对照（防误报方向）
printf '#!/usr/bin/env bash\nexit 0\n' > "${SBOX}/skills/swarm-yuan/assets/precheck.sh"
bash "$VR" bootstrap "$SBOX" > "${SBOX}/out-ok.log" 2>&1
rc_ok=$?
[[ $rc_ok -eq 0 ]] && ok "3c 成功路径 rc=0（无误报）" || bad "3c 成功路径误报失败（rc=${rc_ok}）"
rm -rf "${SBOX}"
# 静态锁：rc 捕获行不得带 || true（吞码模式字节级禁回潮）
grep -q -- '--all 2>&1 ) || true' "$VR" && bad "3d || true 吞 rc 模式回潮" || ok "3d 无 || true 吞 rc"

# ===== ④ 失败可见性（日志不得只进 /tmp 黑洞） =====
grep -q 'GEN-E2E 失败日志尾部' "$VR" && ok "4a gen-e2e 失败现场打印" || bad "4a gen-e2e 失败日志黑洞回潮"
grep -q 'E2E 失败日志尾部' "$VR" && ok "4b e2e 失败现场打印" || bad "4b e2e 失败日志黑洞回潮"

# ===== ⑤ 预算登记完整性（超 251B 洞的账面锁：登记值须覆盖实测增量成因注记） =====
grep -q '^FACT_SKILLMD_BYTES_BUDGET=11392' assets/facts.conf && ok "5a SKILL.md 预算第七次登记在位（11392）" || bad "5a 预算登记漂移"
grep -q '交付形态 DoD' assets/facts.conf && ok "5b 登记注记含成因（交付形态功能性增量）" || bad "5b 登记缺成因注记"

if [[ $FAIL -eq 0 ]]; then echo "test-r106-ci-honesty: PASS"; else echo "test-r106-ci-honesty: FAIL" >&2; fi
exit $FAIL
