#!/usr/bin/env bash
# test-effective-conf.sh — conf_* 有效配置内核契约（Task 2，A04 修复的表征测试）
# 语义锁：五层加载序 core→arch→compliance→industry→patch、末层赋值胜出（含赋空）、
# 空白空数组 ( ) 为空、单引号标量、变量名校验、数组逐项输出（含空格路径）、
# %q 引号化、conf_load 失败传播、既有 conf_get/conf_effective 兼容入口存活。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
LIB="$BASE/assets/lib/conf.sh"
# shellcheck disable=SC1090
. "$LIB"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1" >&2; }

SK="$(mktemp -d "${TMPDIR:-/tmp}/ec-test.XXXXXX")"
trap 'rm -rf "$SK"' EXIT
mkdir -p "$SK/scripts"

# ---- 五层最小夹具：末层语义全覆盖 ----
cat > "$SK/scripts/precheck.conf" <<'EOF'
PROJECT_DIR="/tmp/ec demo"
SPEC_REQUIRED='1'
WRITABLE_DIRS=("src" "lib")
ACTIVE_FRAMEWORKS=("vue" "koa")
EOF
cat > "$SK/scripts/precheck.arch.conf" <<'EOF'
SQL_GLOBS=("db/**/*.sql")
EOF
cat > "$SK/scripts/precheck.compliance.conf" <<'EOF'
REVIEW_RECORD_REQUIRED=1
EOF
cat > "$SK/scripts/precheck.industry.conf" <<'EOF'
SENSITIVE_TOOL=gitleaks
EOF
cat > "$SK/scripts/precheck.patch.conf" <<'EOF'
SPEC_REQUIRED=
WRITABLE_DIRS=( )
ACTIVE_FRAMEWORKS=("koa")
EOF

# 1. 加载序：五层齐列，缺失层跳过
_files="$(conf_files "$SK" | wc -l | tr -d ' ')"
[[ "$_files" -eq 5 ]] && ok 'conf_files 五层齐列' || bad "conf_files 层数=${_files}（期望 5）"

# 2. 末层赋空胜出：SPEC_REQUIRED 被 patch 置空（旧 grep 版读不到空值）
_v="$(conf_value SPEC_REQUIRED "$SK")"
[[ -z "$_v" ]] && ok '末层赋空胜出（SPEC_REQUIRED→空）' || bad "SPEC_REQUIRED=${_v}（期望空）"
conf_is_set SPEC_REQUIRED "$SK" && ok '赋空仍算 is_set' || bad '赋空被误判未设置'

# 3. 空白空数组 ( ) = 空（旧判据误判已填）
_n="$(conf_items WRITABLE_DIRS "$SK" | grep -c . || true)"
[[ "$_n" -eq 0 ]] && ok 'WRITABLE_DIRS=( ) 解析为空' || bad "WRITABLE_DIRS 项数=${_n}（期望 0）"

# 4. 单引号标量与 industry 层取值
[[ "$(conf_value SENSITIVE_TOOL "$SK")" == "gitleaks" ]] && ok 'industry 层取值' || bad 'industry 层未入链'
_r="$(conf_value SPEC_REQUIRED "$SK" 2>/dev/null || true)"
_conf_single="$(mktemp -d "${TMPDIR:-/tmp}/ec-one.XXXXXX")"; mkdir -p "$_conf_single/scripts"
printf "SPEC_REQUIRED='1'\n" > "$_conf_single/scripts/precheck.conf"
[[ "$(conf_value SPEC_REQUIRED "$_conf_single")" == "1" ]] && ok '单引号标量取裸值' || bad '单引号值带引号'
rm -rf "$_conf_single"

# 5. 数组末层覆盖 + 逐项输出（含空格路径）
printf 'DOC_DIRS=("docs a" "docs b")\n' >> "$SK/scripts/precheck.patch.conf"
_items="$(conf_items DOC_DIRS "$SK" | tr '\n' '|')"
[[ "$_items" == "docs a|docs b|" ]] && ok '数组逐项输出（空格路径保真）' || bad "DOC_DIRS=${_items}"

# 6. 变量名校验：拒绝注入形态
conf_value 'X}; rm -rf /tmp/pwn; ${x' "$SK" >/dev/null 2>&1 && bad '非法变量名被接受' || ok '非法变量名拒绝'
conf_is_set 'a-b' "$SK" >/dev/null 2>&1 && bad '连字符名被接受' || ok '连字符名拒绝'

# 7. conf_quote：空格与引号 shell 字面量化
_q="$(conf_quote "/tmp/ec demo's")"
printf 'V=%s\n' "$_q" > "$SK/scripts/precheck.quote.conf"
_ev="$( (set +u; . "$SK/scripts/precheck.quote.conf"; printf '%s' "$V") )"
[[ "$_ev" == "/tmp/ec demo's" ]] && ok 'conf_quote 往返保真' || bad "quote 往返=${_ev}"

# 8. conf_load 失败传播：语法坏 conf → 非零
_bad="$(mktemp -d "${TMPDIR:-/tmp}/ec-bad.XXXXXX")"; mkdir -p "$_bad/scripts"
printf 'if [[ broken\n' > "$_bad/scripts/precheck.conf"
conf_load "$_bad" >/dev/null 2>&1 && bad '坏 conf 加载返回 0' || ok '坏 conf 加载传播非零'
rm -rf "$_bad"
conf_load "$SK" >/dev/null 2>&1 && ok '正常链 conf_load rc=0' || bad '正常链加载误报失败'

# 9. 兼容入口存活（既有消费方不破）
[[ "$(conf_effective "$SK/scripts/precheck.conf" "$SK/scripts/precheck.patch.conf" PROJECT_DIR)" == "/tmp/ec demo" ]] \
  && ok 'conf_effective 兼容存活' || bad 'conf_effective 回归'

# 10. 局部污染守卫：查询不污染调用方环境
unset -v SQL_GLOBS 2>/dev/null || true
conf_value SQL_GLOBS "$SK" >/dev/null
[[ -z "${SQL_GLOBS+x}" ]] && ok '查询零调用方污染' || bad '查询污染了调用方'

printf 'test-effective-conf: PASS %s / FAIL %s\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
