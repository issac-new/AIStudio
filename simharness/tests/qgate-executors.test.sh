#!/bin/bash
# qgate-executors.test.sh — QGate 九门执行器守门（run20 复盘 C4 根治件配套）
# 三路守门：
#   ① 检查器九类逐一跑合成仓 fixture：在案→pass / 缺件→fail / 未知 kind→退出非零；
#   ② 端到端：注入覆盖后跑真 cli.js release-report——九门不再全 INCONCLUSIVE
#      （有产物门出 PASS/FAIL+锚；这是 C4 的验收线，"无信号桶"清零）；
#   ③ 驱动接线符号在位（注入块+release-report 调用同段）。
# fixture 形态对齐 run20 实况：集成分支承载 testlog/测试报告（工作树 main 无），
# 检查器须走 origin/integration/RFD-001 解析——工作树直读测不到这条路径。
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d /tmp/qgate-exec.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
_rc=0
fail() { echo "FAIL: $*"; _rc=1; }

OV="$HERE/mux/qgate-overrides"
CLI="${MX_OVERLAY_ROOT:-$(cd "$HERE/../overlay" 2>/dev/null && pwd)}/custom/qgate/dist/cli.js"

# ── 合成中央仓 fixture ──
CEN="$TMP/aipaydev"
git init -q "$CEN"; git -C "$CEN" config user.email t@t; git -C "$CEN" config user.name t
mkdir -p "$CEN/docs/requirements" "$CEN/docs/acceptance" "$CEN/docs/design" "$CEN/docs/admin"
# 冻结件（G1 面）
cat > "$CEN/docs/requirements/RFD-001.freeze.md" <<'EOF'
# RFD-001 冻结件
- AC-1 下单幂等：同 outTradeNo 重复下单返回同一支付单号
- AC-2 状态机完整
- AC-3 金额口径
- Scope-Out：真实渠道网络联调不在本轮范围
- 追溯：上游=docs/requirements/RFD-001-payment-cashier.md；下游=AC×用例映射表
- frozen: true
EOF
cat > "$CEN/docs/acceptance/RFD-001-acceptance.md" <<'EOF'
# 验收书
- AC-1 通过（用例在案）
- AC-2 通过
- AC-3 不通过（收银台三态缺）
EOF
cat > "$CEN/docs/design/RFD-001-architecture-design.md" <<'EOF'
# 概设
## 接口契约
ChannelAdapter 四方法。
## 数据流与关键路径
统一下单→渠道→回调。
## 风险
双渠道签名差异。
## 决策记录
D-1 分层决策。
## 落库设计
支付单表含 outTradeNo 唯一索引。
EOF
for r in roster app-registry org; do echo "# $r" > "$CEN/docs/admin/$r.md"; done
git -C "$CEN" add -A && git -C "$CEN" commit -qm base && git -C "$CEN" branch -M main
# 集成分支承载 testlog+测试报告（run20 形态：证据在 integration 不在 main 工作树）
git -C "$CEN" checkout -qb integration
mkdir -p "$CEN/docs/evidence" "$CEN/docs/test"
printf 'DEV-CHWX testlog\nRUN=20261015-v8-run20\nTests 37 passed (37)\nexit=0\nnpm audit: found 0 vulnerabilities\nstate-machine 9 passed\n幂等用例 passed\n' > "$CEN/docs/evidence/DEV-CHWX-testlog.txt"
printf '# 测试报告\n结论行 TEST-PASS cases=37 passed=37 failed=0\n' > "$CEN/docs/test/RFD-001-test-report.md"
git -C "$CEN" add -A && git -C "$CEN" commit -qm evidence
git -C "$CEN" checkout -q main
git -C "$CEN" update-ref refs/remotes/origin/integration/RFD-001 "$(git -C "$CEN" rev-parse integration)"

run_check() { (cd "$CEN" && node "$OV/scripts/qgate-checks/qgate-check.mjs" "$1"); }

# ── ① 九类逐一：在案→pass ──
for k in basic-check sast-audit arch-fitness acceptance-coverage intent-drift registers requirement-trace scope-check persistence-integrity; do
  out="$(run_check "$k" 2>&1)"; rc=$?
  if [ $rc -ne 0 ]; then fail "① $k 应 pass（fixture 全在案）：$out"; fi
done
echo "① 九类在案全 pass"

# ── ①b 缺件→fail ──
# 空仓 fixture：工作树与集成分支皆无产物（缺件判定的完整路径——单删工作树会被
# 集成分支兜底读到，run20 形态即证据在 integration 上）。
EMP="$TMP/empty"
git init -q "$EMP"; git -C "$EMP" config user.email t@t; git -C "$EMP" config user.name t
git -C "$EMP" commit -qm base --allow-empty && git -C "$EMP" branch -M main
git -C "$EMP" update-ref refs/remotes/origin/integration/RFD-001 "$(git -C "$EMP" rev-parse HEAD)"
for k in basic-check sast-audit arch-fitness acceptance-coverage intent-drift registers requirement-trace scope-check persistence-integrity; do
  if (cd "$EMP" && node "$OV/scripts/qgate-checks/qgate-check.mjs" "$k" >/dev/null 2>&1); then
    fail "①b $k 空仓应 fail"
  fi
done
# 值错→fail（在案但内容不合规——区分于缺件）：去锁标记
sed -i '' 's/frozen: true/frozen: false/' "$CEN/docs/requirements/RFD-001.freeze.md"
[ "$(run_check intent-drift >/dev/null 2>&1; echo $?)" -ne 0 ] || fail "①b intent-drift 无锁应 fail"
sed -i '' 's/frozen: false/frozen: true/' "$CEN/docs/requirements/RFD-001.freeze.md"
# 报告红→fail（在案但 failed>0）
mkdir -p "$CEN/docs/test"
printf '# 测试报告\nTEST-FAIL cases=10 passed=9 failed=1\n' > "$CEN/docs/test/RFD-001-test-report.md"
[ "$(run_check basic-check >/dev/null 2>&1; echo $?)" -ne 0 ] || fail "①b basic-check 报告红应 fail"
printf '# 测试报告\n结论行 TEST-PASS cases=37 passed=37 failed=0\n' > "$CEN/docs/test/RFD-001-test-report.md"
# 未知 kind→非零
[ "$(run_check no-such-kind >/dev/null 2>&1; echo $?)" -ne 0 ] || fail "①b 未知 kind 应非零退出"
echo "①b 缺件九类全 fail + 值错/报告红/未知 kind 三路 fail"

# ── ② 端到端：注入覆盖→真 cli release-report ──
[ -f "$CLI" ] || fail "② cli.js 缺席（$CLI）——overlay 构建态未就绪"
mkdir -p "$CEN/.qgate/gates" "$CEN/scripts/qgate-checks"
cp "$OV"/gates/*.yaml "$CEN/.qgate/gates/"
cp "$OV"/scripts/qgate-checks/*.mjs "$CEN/scripts/qgate-checks/"
printf 'profile: feature-close\nclaims: []\n' > "$CEN/.qgate/qgate.yaml"
( cd "$CEN" && node "$CLI" run --all --trigger release ) > "$TMP/cli-run.log" 2>&1 || true
( cd "$CEN" && node "$CLI" release-report ) > "$TMP/cli.log" 2>&1 || true
[ -f "$CEN/.qgate/release-report.json" ] || { fail "② release-report 未产出：$(tail -3 "$TMP/cli.log")"; }
python3 - "$CEN/.qgate/release-report.json" <<'PY' || fail "② 九门不再全 INCONCLUSIVE 断言失败"
import json, sys
d = json.load(open(sys.argv[1]))
gates = {g['gateId']: g.get('verdict') for g in d.get('gates', [])}
nine = ['architecture.fitness', 'engineering.basic-check', 'L0.acceptance-coverage',
        'L0.intent-drift', 'L0.registers', 'L0.requirement-trace', 'L0.scope-check',
        'data.persistence-integrity', 'security.sast-audit']
inc = [g for g in nine if gates.get(g) == 'INCONCLUSIVE']
assert not inc, f'仍有 INCONCLUSIVE 门: {inc}（全部: {gates}）'
passed = [g for g in nine if gates.get(g) == 'PASS']
assert len(passed) >= 7, f'PASS 门不足: {passed}（全部: {gates}）'
print(f'② 端到端：九门 INCONCLUSIVE=0，PASS={len(passed)}/9（{passed}）')
PY

# ── ③ 驱动接线符号 ──
grep -q "qgate-overrides/gates" "$HERE/aipay-scenario.sh" || fail "③ 驱动未接注入块"
grep -q "cli.js\" release-report" "$HERE/aipay-scenario.sh" || fail "③ 驱动未接 release-report"
echo "③ 驱动接线符号在位"

[ "$_rc" -eq 0 ] && echo "qgate-executors 全绿" || echo "qgate-executors 存在失败"
exit $_rc
