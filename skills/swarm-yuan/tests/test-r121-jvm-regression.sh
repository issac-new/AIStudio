#!/usr/bin/env bash
# test-r121-jvm-regression.sh — R121 JVM 项目级回归轮缺陷锁
# 背景：order-forge（Spring Boot 3 + MyBatis XML + Spring Batch + Vue3/Element）真实项目
# 首跑门禁暴露两项生成器缺陷，此测试防复发：
#   D1 fw_sboot_transactional_selfinvoke 误报——@Transactional 方法体内 throw new
#      IllegalArgumentException(...) 的构造形态被当"同类方法自调用"（提取端把 new 当
#      返回类型/构造类名当方法名，命中端空格+类名( 复现）；修复=检测前剥构造形态 +
#      提取端方法名限小写开头。锁=spring-boot compliant 夹具（已补异常构造形态）双态。
#   D2 fw_mybatis_dollar 修复建议文案 bad substitution——suggest 双引号内字面 ${} 被
#      bash 展开（precheck.sh: line N: ... bad substitution）；修复=\${} 转义。锁=
#      mybatis violating 夹具输出命中 fail 且零 bad substitution。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# 态1 spring-boot 夹具双态：compliant（含异常构造形态）PASS + violating 检出
out1="$(bash tests/run-framework-fixture.sh spring-boot 2>&1)"
if printf '%s\n' "$out1" | grep -q 'compliant → PASS' && printf '%s\n' "$out1" | grep -q 'violating → 检出'; then
  ok "态1 spring-boot 双态（compliant 含异常构造形态不误报）"
else
  bad "态1 spring-boot 双态失败：$(printf '%s\n' "$out1" | tail -2 | tr '\n' ' ')"
fi
grep -q 'IllegalArgumentException' tests/fixtures/spring-boot/compliant/OrderService.java \
  && ok "态1b compliant 夹具保留异常构造形态（防形态被静默删掉致锁失效）" \
  || bad "态1b compliant 夹具异常构造形态缺失"

# 态2 mybatis violating 夹具：fw_mybatis_dollar fail 命中 + 输出零 bad substitution
# 模板以 X 结尾（BSD/GNU mktemp 可移植；带 .log 后缀在 BSD 下不随机化，并发 sweep 会撞名）
tmp2="$(mktemp "${TMPDIR:-/tmp}/r121myb.XXXXXX")"
B="$(pwd)"
REPO_ROOT="$(cd "$B/.." && pwd)"
T="$(mktemp -d /tmp/r121fw.XXXXXX)"
mkdir -p "$T/scripts"
cp assets/precheck.sh "$T/scripts/precheck.sh"
for _gf in gates-strict.sh gates-warn.sh gates-advisory.sh; do
  [[ -f "assets/$_gf" ]] && cp "assets/$_gf" "$T/scripts/$_gf"
done
sed "s|__REPO_ROOT__|$REPO_ROOT|g" tests/fixtures/mybatis/violating/precheck.conf > "$T/scripts/precheck.conf"
awk -v frag="$B/assets/framework-gates/mybatis.sh" '
  /^# >>> swarm-yuan:framework-gates >>>/ { print; while ((getline l < frag) > 0) print l; skip=1; next }
  /^# <<< swarm-yuan:framework-gates <<</ { skip=0 }
  !skip { print }
' "$T/scripts/precheck.sh" > "$T/scripts/p2.sh" && mv "$T/scripts/p2.sh" "$T/scripts/precheck.sh"
( cd tests/fixtures/mybatis/violating && bash "$T/scripts/precheck.sh" --framework ) > "$tmp2" 2>&1
rc2=$?
rm -rf "$T"
if [[ $rc2 -ne 0 ]] && grep -q 'fw_mybatis_dollar' "$tmp2"; then
  ok "态2a mybatis violating 检出（\${} 注入门禁红）"
else
  bad "态2a mybatis violating 未检出（rc=${rc2}）"
fi
if grep -q 'bad substitution' "$tmp2"; then
  bad "态2b 输出含 bad substitution（suggest \${} 转义回归）"
else
  ok "态2b 输出零 bad substitution（suggest 转义生效）"
fi
rm -f "$tmp2"

# 态3 生成器 precheck.sh 模板无未转义 suggest="${...（双引号内字面 ${ 会展开；
#     已转义形态 "\${}" 的 $ 前是反斜杠，正则要求 $ 前一字符非 \ 以排除）
if grep -nE 'suggest="[^"]*[^\\]\$\{' assets/precheck.sh | head -3 | grep -q .; then
  bad "态3 precheck.sh 模板存在未转义 suggest \${（$(grep -nE 'suggest="[^"]*[^\\]\$\{' assets/precheck.sh | head -1)）"
else
  ok "态3 precheck.sh 模板 suggest 无未转义 \${}"
fi

if [[ $FAIL -eq 0 ]]; then echo "test-r121-jvm-regression: PASS"; else echo "test-r121-jvm-regression: FAIL" >&2; fi
exit $FAIL
