#!/usr/bin/env bash
# test-test-quality-gates.sh — check_test 第二层回归锁
# 覆盖：覆盖率报告解析（lcov/cobertura/jacoco/coverage-summary/命令输出）、阈值拦截、
# 零断言/断言密度、聚焦测试、可选变异分数。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
BASE="$(pwd)"
TMP="$(mktemp -d /tmp/tqg.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

new_project() {
  P="$TMP/p$1"
  mkdir -p "$P/scripts" "$P/tests"
  cp "$BASE/assets/precheck.sh" "$BASE/assets/gates-warn.sh" \
     "$BASE/assets/gates-strict.sh" "$BASE/assets/gates-advisory.sh" \
     "$BASE/assets/gate-enforce-level.conf" "$BASE/assets/memory-backends.sh" \
     "$P/scripts/" 2>/dev/null || true
  cat > "$P/tests/order.test.ts" <<'EOF'
test('rejects invalid order', () => {
  expect(() => create({ qty: -1 })).toThrow('invalid');
});
test('returns 404 when order missing', () => {
  expect(find('missing')).toBeNull();
});
EOF
}

run_gate() { # $1=conf 追加内容 → stdout 门禁输出
  cat > "$P/scripts/precheck.conf" <<EOF
PROJECT_DIR="$P"
TEST_CMD="echo ok"
$1
EOF
  bash "$P/scripts/precheck.sh" --test 2>&1 || true
}

# 1) lcov 60% < 80% → fail
new_project 1
mkdir -p "$P/coverage"
printf 'TN:\nSF:src/a.ts\nLF:10\nLH:6\nend_of_record\n' > "$P/coverage/lcov.info"
out=$(run_gate 'COVERAGE_MIN=80')
grep -qF 'gate_test_coverage' <<<"$out" && grep -qF '60%' <<<"$out" \
  && ok "lcov 60% < 80% → fail" || bad "lcov 阈值未拦截: $out"

# 2) lcov 90% ≥ 80% → pass
new_project 2
mkdir -p "$P/coverage"
printf 'TN:\nSF:src/a.ts\nLF:10\nLH:9\nend_of_record\n' > "$P/coverage/lcov.info"
out=$(run_gate 'COVERAGE_MIN=80')
grep -qF '覆盖率 90%' <<<"$out" && ! grep -qF 'gate_test_coverage:' <<<"$out" \
  && ok "lcov 90% ≥ 80% → pass" || bad "lcov 合规侧误报: $out"

# 3) Jacoco LINE counter → 解析为 75%，阈值 80 → fail
new_project 3
mkdir -p "$P/target/site/jacoco"
cat > "$P/target/site/jacoco/jacoco.xml" <<'EOF'
<report name="demo"><counter type="INSTRUCTION" missed="10" covered="90"/><counter type="LINE" missed="25" covered="75"/></report>
EOF
out=$(run_gate 'COVERAGE_MIN=80')
grep -qF '75%' <<<"$out" && grep -qF 'gate_test_coverage' <<<"$out" \
  && ok "jacoco XML 75% → fail" || bad "jacoco 解析失败: $out"

# 4) Cobertura line-rate=0.85 → pass
new_project 4
cat > "$P/coverage.xml" <<'EOF'
<coverage line-rate="0.85" branch-rate="0.70"></coverage>
EOF
out=$(run_gate 'COVERAGE_MIN=80')
grep -qF '覆盖率 85%' <<<"$out" && ! grep -qF 'gate_test_coverage:' <<<"$out" \
  && ok "cobertura 0.85 → 85% pass" || bad "cobertura 解析失败: $out"

# 5) coverage-summary.json lines.pct=72 → fail
new_project 5
mkdir -p "$P/coverage"
printf '{"total":{"lines":{"total":100,"covered":72,"pct":72}}}\n' > "$P/coverage/coverage-summary.json"
out=$(run_gate 'COVERAGE_MIN=80')
grep -qF '72%' <<<"$out" && grep -qF 'gate_test_coverage' <<<"$out" \
  && ok "coverage-summary 72% → fail" || bad "coverage-summary 解析失败: $out"

# 6) TEST_CMD 输出行覆盖率 → 90% pass
new_project 6
out=$(run_gate 'COVERAGE_MIN=80
TEST_CMD="echo \"Lines : 90.0%\""')
grep -qF '覆盖率 90%' <<<"$out" && ! grep -qF 'gate_test_coverage:' <<<"$out" \
  && ok "终端摘要 90% → pass" || bad "终端摘要解析失败: $out"

# 7) COVERAGE_MIN 配置但无报告 → fail
new_project 7
out=$(run_gate 'COVERAGE_MIN=80')
grep -qF '未找到/无法解析覆盖率报告' <<<"$out" \
  && ok "无报告 → fail（不静默放行）" || bad "无报告未拦截: $out"

# 8) 零断言 + strict → fail
new_project 8
cat > "$P/tests/order.test.ts" <<'EOF'
test('runs without checking anything', () => { run(); });
EOF
out=$(run_gate 'TEST_MIN_ASSERTIONS_PER_CASE=1
TEST_QUALITY_STRICT=1')
grep -qF 'gate_test_quality_assertions' <<<"$out" \
  && ok "零断言文件 → fail" || bad "零断言未拦截: $out"

# 9) 有断言 + 负向关键词 → 断言密度/负向均 pass
new_project 9
out=$(run_gate 'TEST_MIN_ASSERTIONS_PER_CASE=1
TEST_MIN_NEGATIVE_RATIO=20
TEST_QUALITY_STRICT=1')
grep -qF '断言密度 1.00 条/用例 ≥ 阈值 1' <<<"$out" \
  && grep -qF '负向/边界测试文件占比 100% ≥ 阈值 20%' <<<"$out" \
  && ok "断言密度/负向用例合规 → pass" || bad "合规测试误报: $out"

# 10) 聚焦测试 → fail（不受 strict 影响）
new_project 10
cat >> "$P/tests/order.test.ts" <<'EOF'
test.only('focused only', () => { expect(1).toBe(1); });
EOF
out=$(run_gate 'TEST_MIN_ASSERTIONS_PER_CASE=1
TEST_QUALITY_STRICT=0')
grep -qF 'gate_test_quality_focused' <<<"$out" \
  && ok "test.only → fail" || bad "聚焦测试未拦截: $out"

# 11) 变异分数 40% < 60% → fail
new_project 11
out=$(run_gate 'MUTATION_CMD="echo \"Mutation score: 40%\""
MUTATION_MIN_SCORE=60')
grep -qF 'gate_test_mutation' <<<"$out" && grep -qF '40%' <<<"$out" \
  && ok "mutation 40% < 60% → fail" || bad "变异阈值未拦截: $out"

# 12) 变异分数 80% ≥ 60% → pass
new_project 12
out=$(run_gate 'MUTATION_CMD="echo \"Mutation score: 80%\""
MUTATION_MIN_SCORE=60')
grep -qF 'mutation score 80%' <<<"$out" && ! grep -qF 'gate_test_mutation:' <<<"$out" \
  && ok "mutation 80% ≥ 60% → pass" || bad "变异合规侧误报: $out"

# 13) Go coverprofile 按语句块聚合：1/2 覆盖 = 50%，阈值 80 → fail
new_project 13
cat > "$P/coverage.out" <<'EOF'
mode: set
example.com/demo/a.go:1.1,2.2 1 1
example.com/demo/a.go:3.1,4.2 1 0
EOF
out=$(run_gate 'COVERAGE_MIN=80')
grep -qF '50%' <<<"$out" && grep -qF 'gate_test_coverage' <<<"$out" \
  && ok "Go coverprofile 50% < 80% → fail" || bad "Go coverprofile 未按语句块解析: $out"

# 14) coverage-summary 必须读 total，不得被后续单文件 100% 覆盖成假阳性
new_project 14
mkdir -p "$P/coverage"
printf '%s\n' '{"total":{"lines":{"total":100,"covered":50,"pct":50}},"src/a.ts":{"lines":{"total":10,"covered":10,"pct":100}}}' > "$P/coverage/coverage-summary.json"
out=$(run_gate 'COVERAGE_MIN=80')
grep -qF '50%' <<<"$out" && grep -qF 'gate_test_coverage' <<<"$out" \
  && ok "coverage-summary total 50%（单文件 100% 不干扰）→ fail" || bad "coverage-summary 未读取 total 汇总: $out"

[[ $FAIL -eq 0 ]] && { echo "PASS test-test-quality-gates"; exit 0; } || { echo "FAIL test-test-quality-gates" >&2; exit 1; }
