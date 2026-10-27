#!/usr/bin/env bash
# test-gate-result-contract.sh — 门禁结果模型契约（Task 3 / A02）
# 锁定三态语义：
#   ① 业务 fail（调 fail()）→ fail 计数 + FAIL_IDS + rc=1
#   ② 门禁自身异常（非零返回且无 fail() 增量）→ error 计数 + 显式披露 + rc=1 +
#      合成 gate_<名> 入 FAIL_IDS（deny 链保守闭合）+ 不清除既有 .gate-fail-flag
#   ③ 清洁通过 → rc=0（含尾行条件 pass 的门禁）
# 方法：沙箱复制生产 precheck + gates 三件套，对副本做受控变异（stub 某门禁
# return 23），不触碰生产树。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1" >&2; }

SB="$(mktemp -d "${TMPDIR:-/tmp}/gate-rc.XXXXXX")"
trap 'rm -rf "$SB"' EXIT
mkdir -p "$SB/scripts" "$SB/proj/src" "$SB/proj/.swarm-yuan"
cp "$BASE/assets/precheck.sh" "$BASE/assets/gates-strict.sh" "$BASE/assets/gates-warn.sh" \
   "$BASE/assets/gates-advisory.sh" "$SB/scripts/"
# precheck 从脚本目录定位 conf 与 gates（_CONF_DIR=dirname $0）
cat > "$SB/scripts/precheck.conf" <<EOF
PROJECT_DIR="$SB/proj"
WRITABLE_DIRS=("src")
SCAN_DIRS=("src")
SENSITIVE_EXCLUDE_GLOBS=()
SPEC_REQUIRED=0
BUILD_CMD="true"
TEST_CMD="true"
ACTIVE_FRAMEWORKS=()
EOF
printf 'export const a = 1\n' > "$SB/proj/src/a.ts"

# ---- ① 基线：全绿运行 rc=0（同时锁尾行条件 pass 门禁的显式 rc=0 迁移）----
bash "$SB/scripts/precheck.sh" --all > "$SB/base.log" 2>&1
rc=$?
[[ $rc -eq 0 ]] && ok "① 基线 --all rc=0" || { bad "① 基线 rc=${rc}"; sed -n '1,15p' "$SB/base.log" >&2; }

# ---- ② 业务 fail：TEST_CMD=false → gate_test 入 FAIL_IDS 与 flag ----
sed -i.bak 's/^TEST_CMD="true"/TEST_CMD="false"/' "$SB/scripts/precheck.conf"
bash "$SB/scripts/precheck.sh" --all > "$SB/fail.log" 2>&1
rc=$?
[[ $rc -eq 1 ]] && ok "② 业务 fail rc=1" || bad "② rc=${rc}"
_flag="$SB/proj/.swarm-yuan/.gate-fail-flag"
if [[ -f "$_flag" ]] && grep -qx 'gate_test' "$_flag"; then
  ok "② FAIL_IDS 稳定 id gate_test 入 flag"
else
  bad "② flag 内容: $(cat "$_flag" 2>/dev/null | tr '\n' '|')"
fi
sed -i.bak 's/^TEST_CMD="false"/TEST_CMD="true"/' "$SB/scripts/precheck.conf"

# ---- ③ error 态：变异副本把 check_test 函数体 stub 成 return 23 ----
sed -i.bak2 's/^check_test() {/check_test() {\n  return 23  # 模拟门禁自身异常（工具崩溃\/命令缺失）/' "$SB/scripts/gates-strict.sh"
bash "$SB/scripts/precheck.sh" --all > "$SB/err.log" 2>&1
rc=$?
[[ $rc -eq 1 ]] && ok "③ error 态 rc=1" || bad "③ rc=${rc}"
grep -q 'ERROR' "$SB/err.log" && ok "③ error 显式披露" || { bad "③ 输出无 ERROR 披露"; tail -6 "$SB/err.log" >&2; }
if [[ -f "$_flag" ]] && grep -qx 'gate_test' "$_flag"; then
  ok "③ error 合成 gate_test 入 flag（deny 链闭合）"
else
  bad "③ error 后 flag: $(cat "$_flag" 2>/dev/null | tr '\n' '|')"
fi
# error 不得把输出收成「门禁检查通过」
grep -q '门禁检查通过' "$SB/err.log" && bad "③ error 仍打印通过" || ok "③ error 不冒充通过"

# ---- ④ error 不清旧 flag：预置含 gate_scope 的 flag，error 运行后仍在 ----
printf 'gate_scope\n' > "$_flag"
sed -i.bak3 's/^check_build() {/check_build() {\n  return 23/' "$SB/scripts/gates-warn.sh"
bash "$SB/scripts/precheck.sh" --all > "$SB/err2.log" 2>&1
if [[ -s "$_flag" ]]; then ok "④ error 运行后旧 flag 未被清除"; else bad "④ flag 被清空"; fi

# ⑤ 稳定 id 派生锁：--all 序列中人读消息必须落 gate_test（防 fail() 回退人读 id 变异）
sed -i.bak 's/^TEST_CMD="true"/TEST_CMD="false"/' "$SB/scripts/precheck.conf"
bash "$SB/scripts/precheck.sh" --all > "$SB/seqfail.log" 2>&1
if [[ -f "$_flag" ]] && grep -qx 'gate_test' "$_flag" && ! grep -q '测试失败' "$_flag"; then
  ok "⑤ 序列模式稳定 id 派生（gate_test 而非人读消息）"
else
  bad "⑤ flag 含人读 id: $(cat "$_flag" 2>/dev/null | tr '\n' '|')"
fi

printf 'test-gate-result-contract: PASS %s / FAIL %s\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
