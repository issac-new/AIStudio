#!/usr/bin/env bash
# test-r132-coverage-exec-channel.sh — R132 D1 缺陷锁：覆盖率阈值「配置通道≠生效通道」
# 背景：fw_jest_coverage_threshold 旧判据只看配置文件里有没有数值阈值——
#   trade-forge 实态（vite.config.js 有 thresholds 60/60/60/50，但
#   @vitest/coverage-v8 未装、npm test=vitest run 不带 --coverage）被判 PASS，
#   阈值从未生效（R132 全栈回归实抓）。修复=三通道判定：
#   阈值存在 + provider 依赖就位（vitest 须装包，jest 内建免检）+ 执行通道开启
#   （--coverage 脚本或 coverage.enabled/collectCoverage:true）。
# 锁矩阵（态A-E）覆盖全部判定分支；夹具双态另由 run-framework-fixture.sh jest-vitest 承载
# （violating=本缺陷实态，compliant=package.json 带 provider+--coverage）。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

B="$(pwd)"
GATE_FRAG="$B/assets/framework-gates/jest-vitest.sh"

# 组装一次性 precheck（注入 jest-vitest 门禁片段）并跑 --framework，回显输出
_run_case() { # $1=项目目录
  local T
  T="$(mktemp -d /tmp/r132fw.XXXXXX)"
  mkdir -p "$T/scripts"
  cp assets/precheck.sh "$T/scripts/precheck.sh"
  for _gf in gates-strict.sh gates-warn.sh gates-advisory.sh; do
    [[ -f "assets/$_gf" ]] && cp "assets/$_gf" "$T/scripts/$_gf"
  done
  {
    printf 'PROJECT_DIR="%s"\n' "$1"
    printf 'ACTIVE_FRAMEWORKS=("jest-vitest")\n'
    printf 'VITEST_CONFIG_GLOBS=("%s"/vite.config.js "%s"/jest.config.js)\n' "$1" "$1"
    printf 'VITEST_TEST_GLOBS=()\n'
  } > "$T/scripts/precheck.conf"
  awk -v frag="$GATE_FRAG" '
    /^# >>> swarm-yuan:framework-gates >>>/ { print; while ((getline l < frag) > 0) print l; skip=1; next }
    /^# <<< swarm-yuan:framework-gates <<</ { skip=0 }
    !skip { print }
  ' "$T/scripts/precheck.sh" > "$T/scripts/p2.sh" && mv "$T/scripts/p2.sh" "$T/scripts/precheck.sh"
  ( cd "$1" && bash "$T/scripts/precheck.sh" --framework ) 2>&1
  rm -rf "$T"
}

# 态A 无阈值 → fail「未配覆盖率阈值」（R119 旧行为不回归）
TA="$(mktemp -d /tmp/r132a.XXXXXX)"
printf "export default { test: { environment: 'happy-dom' } }\n" > "$TA/vite.config.js"
outA="$(_run_case "$TA")"
if printf '%s\n' "$outA" | grep -q 'fw_jest_coverage_threshold: 未配覆盖率阈值'; then
  ok "态A 无阈值 → fail 未配阈值（R119 口径保持）"
else
  bad "态A 未命中『未配覆盖率阈值』：$(printf '%s\n' "$outA" | grep fw_jest_coverage_threshold | head -1)"
fi
rm -rf "$TA"

# 态B 阈值已配、同目录无 package.json（provider 无从装）→ fail provider 缺失（D1 实态）
TB="$(mktemp -d /tmp/r132b.XXXXXX)"
printf "export default { test: { coverage: { provider: 'v8', thresholds: { lines: 80 } } } }\n" > "$TB/vite.config.js"
outB="$(_run_case "$TB")"
if printf '%s\n' "$outB" | grep -qF 'provider @vitest/coverage-v8|istanbul 未在同目录 package.json 依赖' ; then
  ok "态B 阈值+无 provider → fail provider 缺失（D1 实态，配置通道≠生效通道）"
else
  bad "态B 未命中 provider 缺失：$(printf '%s\n' "$outB" | grep fw_jest_coverage_threshold | head -1)"
fi
rm -rf "$TB"

# 态C 阈值+provider 已装，但脚本无 --coverage 且 enabled 未开 → fail 执行通道未开
TC="$(mktemp -d /tmp/r132c.XXXXXX)"
printf "export default { test: { coverage: { provider: 'v8', thresholds: { lines: 80 } } } }\n" > "$TC/vite.config.js"
printf '{"scripts":{"test":"vitest run"},"devDependencies":{"@vitest/coverage-v8":"^2.1.0"}}\n' > "$TC/package.json"
outC="$(_run_case "$TC")"
if printf '%s\n' "$outC" | grep -qF 'test 脚本不带 --coverage 且 coverage.enabled/collectCoverage 未设 true'; then
  ok "态C 阈值+provider+无执行通道 → fail 执行通道未开"
else
  bad "态C 未命中执行通道未开：$(printf '%s\n' "$outC" | grep fw_jest_coverage_threshold | head -1)"
fi
rm -rf "$TC"

# 态D 阈值+provider+test 脚本 --coverage → pass（全就位）
TD="$(mktemp -d /tmp/r132d.XXXXXX)"
printf "export default { test: { coverage: { provider: 'v8', thresholds: { lines: 80 } } } }\n" > "$TD/vite.config.js"
printf '{"scripts":{"test":"vitest run --coverage"},"devDependencies":{"@vitest/coverage-v8":"^2.1.0"}}\n' > "$TD/package.json"
outD="$(_run_case "$TD")"
if printf '%s\n' "$outD" | grep -q 'fw_jest_coverage_threshold: 已配覆盖率阈值且各配置执行通道均就位'; then
  ok "态D 阈值+provider+--coverage → pass 全就位"
else
  bad "态D 未命中全就位 pass：$(printf '%s\n' "$outD" | grep fw_jest_coverage_threshold | head -1)"
fi
rm -rf "$TD"

# 态E jest 内建路径：jest.config coverageThreshold + collectCoverage:true → pass（免 provider）
TE="$(mktemp -d /tmp/r132e.XXXXXX)"
printf "export default { collectCoverage: true, coverageThreshold: { global: { lines: 80 } } }\n" > "$TE/jest.config.js"
printf '{"scripts":{"test":"jest"},"devDependencies":{"jest":"^29.0.0"}}\n' > "$TE/package.json"
outE="$(_run_case "$TE")"
if printf '%s\n' "$outE" | grep -q 'fw_jest_coverage_threshold: 已配覆盖率阈值且各配置执行通道均就位'; then
  ok "态E jest 内建覆盖率+collectCoverage → pass（jest 免 provider 检）"
else
  bad "态E 未命中 jest pass：$(printf '%s\n' "$outE" | grep fw_jest_coverage_threshold | head -1)"
fi
rm -rf "$TE"

# 态K（R139）：Jest testEnvironment 键名大小写——已配 jsdom 不得误报「未配 environment」
TK="$(mktemp -d /tmp/r132k.XXXXXX)"
printf "export default { testEnvironment: 'jsdom' }\n" > "$TK/jest.config.js"
outK="$(_run_case "$TK")"
if printf '%s\n' "$outK" | grep -q 'fw_jest_environment: 已显式配置 environment'; then
  ok "态K Jest testEnvironment（大写 E）被认可（-i 兼容）"
else
  bad "态K testEnvironment 误报: $(printf '%s\n' "$outK" | grep fw_jest_environment | head -1)"
fi
if printf '%s\n' "$outK" | grep -q 'fw_jest_environment: 未配'; then
  bad "态K 仍误报未配 environment"
else
  ok "态K 无「未配 environment」误报"
fi
rm -rf "$TK"

# 态L（R139）：混合配置「部分包未配阈值」→ fail 逐包点名（旧 cov_ok 单布尔静默 pass）
TL="$(mktemp -d /tmp/r132l.XXXXXX)"
printf "export default { test: { coverage: { enabled: true, thresholds: { lines: 80 } } } }\n" > "$TL/vite.config.js"
printf '{"scripts":{"test":"vitest run --coverage"},"devDependencies":{"@vitest/coverage-v8":"^2.1.0"}}\n' > "$TL/package.json"
printf "export default { testEnvironment: 'node' }\n" > "$TL/jest.config.js"
outL="$(_run_case "$TL")"
if printf '%s\n' "$outL" | grep -q 'fw_jest_coverage_threshold: 未配覆盖率阈值' && printf '%s\n' "$outL" | grep -q 'jest.config.js'; then
  ok "态L 混合配置未配阈值的包被 fail 点名（不再被合规包掩盖）"
else
  bad "态L 静默 pass 或未点名: $(printf '%s\n' "$outL" | grep fw_jest_coverage_threshold | head -1)"
fi
if printf '%s\n' "$outL" | grep -q 'vite.config.js（'; then
  bad "态L 合规包（vite.config.js）被误点名"
else
  ok "态L 合规包不误点名"
fi
rm -rf "$TL"

# 夹具双态（violating=态B 实态锁定；compliant=package.json 带 provider+--coverage）
outF="$(bash tests/run-framework-fixture.sh jest-vitest 2>&1)"
if printf '%s\n' "$outF" | grep -q 'compliant → PASS' && printf '%s\n' "$outF" | grep -q 'violating → 检出'; then
  ok "态F jest-vitest 夹具双态（violating=阈值无 provider 实态 / compliant=全就位）"
else
  bad "态F 夹具双态失败：$(printf '%s\n' "$outF" | tail -2 | tr '\n' ' ')"
fi

# ---- D2/D3：check_api 接口测试覆盖的配置面可达性 + Java 路由枚举完整性 ----

# 组装 --api 一次性 precheck（无框架门禁注入），$1=项目目录 $2=附加 conf 行
_run_api_case() {
  local T
  T="$(mktemp -d /tmp/r132api.XXXXXX)"
  mkdir -p "$T/scripts"
  cp assets/precheck.sh "$T/scripts/precheck.sh"
  for _gf in gates-strict.sh gates-warn.sh gates-advisory.sh; do
    [[ -f "assets/$_gf" ]] && cp "assets/$_gf" "$T/scripts/$_gf"
  done
  {
    printf 'PROJECT_DIR="%s"\n' "$1"
    printf 'ACTIVE_FRAMEWORKS=()\n'
    printf 'API_SPEC_DIR=""\n'
    printf '%s\n' "$2"
  } > "$T/scripts/precheck.conf"
  ( cd "$1" && bash "$T/scripts/precheck.sh" --api ) 2>&1
  rm -rf "$T"
}

# 态G conf-render lite 档渲染 API_TEST 块（D2：配置面可达性——arch 模板单一事实源抽段）
TG="$(mktemp -d /tmp/r132g.XXXXXX)"
bash scripts/conf-render.sh "$TG" --profile lite --out "$TG/out" >/dev/null 2>&1
if grep -q '^API_TEST_REQUIRE_STATUS=' "$TG/out/precheck.conf" 2>/dev/null \
   && grep -q '^API_TEST_MIN_RATIO=' "$TG/out/precheck.conf" 2>/dev/null; then
  ok "态G lite 渲染含 API_TEST_* 配置面（D2：test 任务 --api 不再空转）"
else
  bad "态G lite conf 缺 API_TEST_* 块：$(grep -c 'API_TEST' "$TG/out/precheck.conf" 2>/dev/null || echo 0) 处"
fi
rm -rf "$TG"

# 态H 未启用披露（D2：静默 return 0 → warn「核验空转」）
TH="$(mktemp -d /tmp/r132h.XXXXXX)"
outH="$(_run_api_case "$TH" 'WRITE_HANDLER_DIRS=()')"
if printf '%s\n' "$outH" | grep -q 'gate_api_test_coverage: 接口测试覆盖检查未启用'; then
  ok "态H 未配置 API_TEST_* 时披露「核验空转」（不静默当通过）"
else
  bad "态H 未命中披露 warn：$(printf '%s\n' "$outH" | grep -c gate_api_test_coverage || echo 0) 行"
fi
rm -rf "$TH"

# 态I Java 无参映射+类级前缀组合（D3）：POST /api/orders（@PostMapping 无参）+ GET /api/orders/stats
# 均被枚举且被测试覆盖；类级 @RequestMapping 不再被当端点计数（否则 total=3 而非 2）。
TI="$(mktemp -d /tmp/r132i.XXXXXX)"
mkdir -p "$TI/src/main" "$TI/src/test"
cat > "$TI/src/main/OrderController.java" <<'JEOF'
@RestController
@RequestMapping("/api/orders")
public class OrderController {
    @PostMapping
    public String create() { return "created"; }

    @GetMapping("/stats")
    public String stats() { return "stats"; }
}
JEOF
cat > "$TI/src/test/OrderControllerTest.java" <<'JEOF'
class OrderControllerTest {
    void createOrder() { mockMvc.perform(post("/api/orders")).andExpect(status().isCreated()); }
    void statsOk() { mockMvc.perform(get("/api/orders/stats")).andExpect(status().isOk()); }
}
JEOF
outI="$(_run_api_case "$TI" 'WRITE_HANDLER_DIRS=("src/main")
API_TEST_DIRS=()
API_TEST_MIN_RATIO=80
API_TEST_STRICT=1
API_TEST_REQUIRE_STATUS=1')"
if printf '%s\n' "$outI" | grep -q '接口测试覆盖 2/2（100%）≥ 阈值 80%' \
   && printf '%s\n' "$outI" | grep -q '状态码断言（2/2）'; then
  ok "态I Java 无参映射按类级前缀枚举（2/2 全覆盖；类级 RequestMapping 不计端点）"
else
  bad "态I 未命中 2/2：$(printf '%s\n' "$outI" | grep -E '接口测试覆盖|gate_api' | head -2 | tr '\n' ' ')"
fi

# 态J 去掉 POST 测试 → 1/2 fail（strict=1；D3 修复前 POST 端点根本不可见、删测不红）
rm "$TI/src/test/OrderControllerTest.java"
cat > "$TI/src/test/OrderControllerTest.java" <<'JEOF'
class OrderControllerTest {
    void statsOk() { mockMvc.perform(get("/api/orders/stats")).andExpect(status().isOk()); }
}
JEOF
outJ="$(_run_api_case "$TI" 'WRITE_HANDLER_DIRS=("src/main")
API_TEST_DIRS=()
API_TEST_MIN_RATIO=80
API_TEST_STRICT=1
API_TEST_REQUIRE_STATUS=1')"
if printf '%s\n' "$outJ" | grep -q '接口测试覆盖 1/2（50%）< 阈值 80%' \
   && printf '%s\n' "$outJ" | grep -q 'POST /api/orders'; then
  ok "态J POST 端点缺测被点名 fail（无参映射缺口可见——修复前不可见）"
else
  bad "态J 未命中 1/2 fail：$(printf '%s\n' "$outJ" | grep -E '接口测试覆盖|gate_api' | head -2 | tr '\n' ' ')"
fi
rm -rf "$TI"

if [[ "$FAIL" -eq 0 ]]; then
  echo "test-r132-coverage-exec-channel: 全部通过"
  exit 0
else
  echo "test-r132-coverage-exec-channel: 存在失败" >&2
  exit 1
fi
