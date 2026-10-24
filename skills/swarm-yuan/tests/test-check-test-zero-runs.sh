#!/usr/bin/env bash
# test-check-test-zero-runs.sh — R25-PF3 回归锚：check_test 零用例检出须覆盖多 runner 输出形态
#
# 真实执勤实证（2026-09-12 Java 栈 task-core）：mvn test 对无 JUnit 用例项目输出
# "Tests run: 0, Failures: 0"且 exit 0——原正则只认 jest/pytest 风格，零用例假通过穿透
# 门禁打出"✓ 测试通过"。修复补齐三种主流 runner 形态：Maven/Gradle surefire、Node TAP、pytest。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d /tmp/zt.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# stub 门禁输出三函数（check_test 依赖调用方提供）+ 测试命令执行器
run_check_test() { # $1 = fake runner 输出 fixture 文件路径
  : > "$TMP/out.txt"
  pass() { echo "PASS:$1" >> "$TMP/out.txt"; }
  warn() { echo "WARN:$1" >> "$TMP/out.txt"; }
  fail() { echo "FAIL:$1" >> "$TMP/out.txt"; }
  TEST_CMD="cat $1"
  # 测试质量轮后 check_test 的 fail 点 ≥3，enforce 静态分层归 strict（gates-strict.sh）。
  # 若后续再次调档，按 registry-render --check 的 enforce 真值同步本行即可。
  source assets/gates-strict.sh
  check_test > /dev/null 2>&1
  cat "$TMP/out.txt" 2>/dev/null || echo "NO-OUTPUT"
}

# 造 runner 输出 fixture（多行安全）
fixture() { printf '%b' "$2" > "$TMP/fx-$1.txt"; }

# 态 1：Maven/Gradle surefire 形态（执勤实证的穿透形态）
fixture maven 'Tests run: 0, Failures: 0, Errors: 0, Skipped: 0\n'
out=$(run_check_test "$TMP/fx-maven.txt")
grep -q "WARN:.*0 用例" <<<"$out" && ok "态1 surefire Tests run: 0 → warn" || bad "态1 假通过穿透: $out"

# 态 2：Node TAP 形态（node --test 零用例尾部）
fixture tap '# tests 0\n# pass 0\n# fail 0\n'
out=$(run_check_test "$TMP/fx-tap.txt")
grep -q "WARN:.*0 用例" <<<"$out" && ok "态2 Node TAP '# tests 0' → warn" || bad "态2 假通过穿透: $out"

# 态 3：pytest 零用例形态
fixture pytest 'no tests ran in 0.01s\n'
out=$(run_check_test "$TMP/fx-pytest.txt")
grep -q "WARN:.*0 用例" <<<"$out" && ok "态3 pytest 'no tests ran' → warn" || bad "态3 假通过穿透: $out"

# 态 4：jest 风格（原有正则已覆盖，防回归）
fixture jest 'Tests: 0 passed, 0 total\n'
out=$(run_check_test "$TMP/fx-jest.txt")
grep -q "WARN:.*0 用例" <<<"$out" && ok "态4 jest 'Tests: 0 passed' → warn（原有覆盖防回归）" || bad "态4 漏检: $out"

# 态 5：Python unittest 零用例形态
fixture unittest '-------------\nRan 0 tests in 0.000s\n\nOK\n'
out=$(run_check_test "$TMP/fx-unittest.txt")
grep -q "WARN:.*0 用例" <<<"$out" && ok "态5 unittest 'Ran 0 tests' → warn" || bad "态5 漏检: $out"

# 态 6：真用例通过不误报（5 个用例 → PASS 不是 WARN）
fixture real 'Tests run: 5, Failures: 0, Errors: 0, Skipped: 0\n'
out=$(run_check_test "$TMP/fx-real.txt")
grep -q "PASS:测试通过" <<<"$out" && ok "态6 真用例 5 → pass 不误报" || bad "态6 误报: $out"

# 态 7（R30-D3 回归锚）：npm 横幅版本号尾 0 + 脚本名构成 "0 test" 子串——无边界正则
# 对一切版本号以 0 结尾的 npm 项目假报空跑（shop-api@0.1.0 实证）。修复后不误报。
fixture npm '> shop-api@0.1.0 test\n> jest --runInBand\n\nPASS tests/product-service.test.ts\nTests: 1 passed, 1 total\n'
out=$(run_check_test "$TMP/fx-npm.txt")
grep -q "PASS:测试通过" <<<"$out" && ok "态7 npm 横幅 '@0.1.0 test' 版本号子串 → pass 不误报" || bad "态7 版本号子串假报空跑: $out"

# 态 8（R30-D3 防修复过头）：行首 0 用例形态仍须命中（修复加了左边界不得漏检）
fixture linestart '0 passed, 3 failed\n'
out=$(run_check_test "$TMP/fx-linestart.txt")
grep -q "WARN:.*0 用例" <<<"$out" && ok "态8 行首 '0 passed' → warn（左边界行首分支）" || bad "态8 修复过头漏检: $out"

# 态 9：TEST_QUALITY_STRICT=1 时零用例升级为 fail（生成模板默认严格档）
# PROJECT_DIR 指向无测试文件的临时目录，避免质量扫描覆盖 fail 输出（本用例只验零用例分支）
PROJECT_DIR="$TMP"; TEST_QUALITY_STRICT=1
out=$(run_check_test "$TMP/fx-jest.txt")
grep -q "FAIL:gate_test_quality_zero_cases" <<<"$out" \
  && ok "态9 strict 档 0 用例 → fail" || bad "态9 strict 档零用例未升级: $out"
unset TEST_QUALITY_STRICT; unset PROJECT_DIR

[[ $FAIL -eq 0 ]] && { echo "PASS test-check-test-zero-runs"; exit 0; } || { echo "FAIL test-check-test-zero-runs" >&2; exit 1; }
