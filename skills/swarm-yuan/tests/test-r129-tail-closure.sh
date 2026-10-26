#!/usr/bin/env bash
# test-r129-tail-closure.sh — R129 尾项收口回归锁
#   ① state-machine _sm_conf_val 收敛到 spf_conf_val（lib 加载前移）：值含 # 不再腰斩；占位符
#     <…> 仍视为未配置；${VAR:-def} 自引用仍解析
#   ② spf_conf_val 单引号值剥壳（旧版只剥双引号，单引号值原样带引号读出）
#   ③ verifier all 的 e2e 双跑去重开关 VERIFIER_SKIP_E2E（run-sweep 传入；缺省不变）
#   ④ 三件套反向配对（孤儿门禁片段 / 孤儿 fixture 可见）
#   ⑤ 三处注释 G20 形态清零
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
BASE="$(pwd)"
VERIFIER="$BASE/verifier/v1/run-verifier.sh"
TMP="$(mktemp -d /tmp/r129t.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# ===== 态1：state-machine conf 值含 # ===== 
# 布局：bin/state-machine.sh + bin/spec-first-lib.sh + bin/precheck.conf（同目录=生成物 scripts/ 布局）
B1="$TMP/b1"; mkdir -p "$B1/bin"
cp "$BASE/assets/state-machine.sh" "$BASE/assets/spec-first-lib.sh" "$B1/bin/"
P1="$TMP/proj#hash"; mkdir -p "$P1"
printf 'PROJECT_DIR="%s"  # 行尾注释\n' "$P1" > "$B1/bin/precheck.conf"
( cd "$TMP" && bash "$B1/bin/state-machine.sh" init r129 >/dev/null 2>&1 ); rc=$?
if [[ $rc -eq 0 && -f "$P1/.swarm-yuan/state.yaml" ]]; then
  ok "态1a conf 值含 # 的 PROJECT_DIR 完整读出（state.yaml 落 proj#hash/）"
else
  bad "态1a rc=${rc}；state.yaml 存在=$(test -f "$P1/.swarm-yuan/state.yaml" && echo 是 || echo 否)；旧版会腰斩为 $TMP/proj"
fi
[[ ! -d "$TMP/proj" ]] && ok "态1b 未产生腰斩路径 proj/" || bad "态1b 腰斩路径 proj/ 出现（cut -d'#' 残留）"
# 1c：占位符形态仍视为未配置（状态机特有语义保留）
B1c="$TMP/b1c"; mkdir -p "$B1c/bin" "$B1c/cwd"
cp "$BASE/assets/state-machine.sh" "$BASE/assets/spec-first-lib.sh" "$B1c/bin/"
printf 'PROJECT_DIR="<项目根绝对路径>"\n' > "$B1c/bin/precheck.conf"
( cd "$B1c/cwd" && bash "$B1c/bin/state-machine.sh" init r129c >/dev/null 2>&1 )
[[ -f "$B1c/cwd/.swarm-yuan/state.yaml" && ! -d "$B1c/cwd/<项目根绝对路径>" ]] \
  && ok "态1c 占位符 <…> 仍视为未配置（落 cwd，无字面量垃圾目录）" || bad "态1c 占位符语义丢失"
# 1d：${VAR:-def} 自引用解析仍在
B1d="$TMP/b1d"; mkdir -p "$B1d/bin" "$TMP/selfref"
cp "$BASE/assets/state-machine.sh" "$BASE/assets/spec-first-lib.sh" "$B1d/bin/"
printf 'PROJECT_DIR="${PROJECT_DIR:-%s}"\n' "$TMP/selfref" > "$B1d/bin/precheck.conf"
( cd "$TMP" && bash "$B1d/bin/state-machine.sh" init r129d >/dev/null 2>&1 )
[[ -f "$TMP/selfref/.swarm-yuan/state.yaml" ]] && ok "态1d \${VAR:-def} 自引用解析保留" || bad "态1d 自引用未解析"
# 1e：lib 加载点在 _sm_conf_val 之前（静态）
_lib_ln=$(grep -n '^_spf_lib=' "$BASE/assets/state-machine.sh" | head -1 | cut -d: -f1)
_fn_ln=$(grep -n '^_sm_conf_val()' "$BASE/assets/state-machine.sh" | head -1 | cut -d: -f1)
[[ -n "$_lib_ln" && -n "$_fn_ln" && "$_lib_ln" -lt "$_fn_ln" ]] && ok "态1e lib 加载（:${_lib_ln}）先于 _sm_conf_val（:${_fn_ln}）" || bad "态1e 加载顺序未前移 lib=${_lib_ln} fn=${_fn_ln}"

# ===== 态2：spf_conf_val 单引号剥壳 =====
# shellcheck disable=SC1091
. "$BASE/assets/spec-first-lib.sh"
C2="$TMP/c2.conf"
printf "BASE_BRANCH='release/x'\nSPEC_GLOB=\"docs/**/*.md\"\nBARE=plain\n" > "$C2"
[[ "$(spf_conf_val "$C2" BASE_BRANCH)" == "release/x" ]] && ok "态2a 单引号值剥壳" || bad "态2a 得 $(spf_conf_val "$C2" BASE_BRANCH)"
[[ "$(spf_conf_val "$C2" SPEC_GLOB)" == "docs/**/*.md" ]] && ok "态2b 双引号值不受影响" || bad "态2b"
[[ "$(spf_conf_val "$C2" BARE)" == "plain" ]] && ok "态2c 裸值不受影响" || bad "态2c"

# ===== 态3：VERIFIER_SKIP_E2E 接线（静态）=====
grep -q 'VERIFIER_SKIP_E2E' "$VERIFIER" && grep -q 'E2E SKIP' "$VERIFIER" \
  && ok "态3a run-verifier all 识别 VERIFIER_SKIP_E2E 并披露 SKIP" || bad "态3a run-verifier 缺开关"
grep -q 'VERIFIER_SKIP_E2E=1 bash' "$BASE/tests/run-sweep.sh" \
  && ok "态3b run-sweep 传入 VERIFIER_SKIP_E2E=1" || bad "态3b run-sweep 未传开关"

# ===== 态4：三件套反向配对（函数级沙箱）=====
S4="$TMP/s4"; mkdir -p "$S4/scripts" "$S4/references/frameworks" "$S4/assets/framework-gates" "$S4/tests/fixtures/koa"
printf '# koa\n' > "$S4/references/frameworks/koa.md"; printf '# gate\n' > "$S4/assets/framework-gates/koa.sh"
awk '/^check_framework_fixture_pairing\(\)/,/^}/' "$BASE/scripts/self-check.sh" > "$S4/scripts/fn.sh"
cat > "$S4/scripts/run.sh" <<'EOF'
#!/usr/bin/env bash
set -u
FAIL=0; warn() { echo "WARN:$1"; }
. "$(dirname "$0")/fn.sh"
check_framework_fixture_pairing
echo "FAIL=$FAIL"
EOF
out="$(bash "$S4/scripts/run.sh" 2>&1)"
printf '%s' "$out" | grep -q 'FAIL=0' && printf '%s' "$out" | grep -q '零孤儿' && ok "态4a 全配对零孤儿 FAIL=0" || bad "态4a: $out"
printf '# orphan\n' > "$S4/assets/framework-gates/ghost.sh"            # 孤儿门禁片段
out="$(bash "$S4/scripts/run.sh" 2>&1)"
printf '%s' "$out" | grep -q '孤儿门禁片段.*ghost' && printf '%s' "$out" | grep -q 'FAIL=1' && ok "态4b 孤儿门禁片段检出" || bad "态4b: $out"
rm -f "$S4/assets/framework-gates/ghost.sh"; mkdir -p "$S4/tests/fixtures/lonely"   # 孤儿 fixture
out="$(bash "$S4/scripts/run.sh" 2>&1)"
printf '%s' "$out" | grep -q '孤儿 fixture.*lonely' && ok "态4c 孤儿 fixture 检出" || bad "态4c: $out"

# ===== 态5：三处注释 G20 清零 =====
! grep -q '（[$]SRC_DIR）' "$BASE/install.sh" && ok "态5a install.sh 注释 \${SRC_DIR}" || bad "态5a"
! grep -q 'proj=[$]HOME）' "$BASE/assets/tool-adapters/cursor.sh" && ok "态5b cursor.sh 注释 \${HOME}" || bad "态5b"
grep -q 'wsl --exec env' "$BASE/install.bat" && ! grep -q 'REM WSL 调用形态：wsl bash' "$BASE/install.bat" \
  && ok "态5c install.bat WSL 注释与实际调用形态一致" || bad "态5c install.bat 注释漂移残留"

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "✓ test-r129-tail-closure 全绿（conf 值含 # / 单引号剥壳 / e2e 去重接线 / 反向配对 / 注释清零）"
else
  echo "✗ test-r129-tail-closure 存在失败项" >&2
fi
exit $FAIL
