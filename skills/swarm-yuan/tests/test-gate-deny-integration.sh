#!/usr/bin/env bash
# test-gate-deny-integration.sh — 生产 fail flag → fail-gate-hook deny 端到端契约（Task 3 / A03）
# 只向临时项目与临时技能树写夹具；不执行 payload 中的命令。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1" >&2; }

SB="$(mktemp -d "${TMPDIR:-/tmp}/gate-deny.XXXXXX")"
trap 'rm -rf "$SB"' EXIT
mkdir -p "$SB/skill/scripts" "$SB/proj/src" "$SB/proj/.swarm-yuan"
cp "$BASE/assets/precheck.sh" "$BASE/assets/gates-strict.sh" "$BASE/assets/gates-warn.sh" \
   "$BASE/assets/gates-advisory.sh" "$BASE/assets/hooks/fail-gate-hook.sh" "$SB/skill/scripts/"
printf '%s\n' '---' 'status: active' '---' > "$SB/skill/SKILL.md"
cat > "$SB/skill/scripts/precheck.conf" <<EOF
PROJECT_DIR="$SB/proj"
WRITABLE_DIRS=("src")
SCAN_DIRS=("src")
SPEC_REQUIRED=0
GATE_ENFORCE_DENY="test"
TEST_CMD="false"
BUILD_CMD="true"
ACTIVE_FRAMEWORKS=()
EOF
printf 'export const a = 1\n' > "$SB/proj/src/a.ts"

# 生产侧：真实测试失败（TEST_CMD=false），生成 .gate-fail-flag。
bash "$SB/skill/scripts/precheck.sh" --all > "$SB/precheck.log" 2>&1
rc=$?
[[ $rc -eq 1 ]] && ok 'precheck 业务失败 rc=1' || bad "precheck rc=${rc}"
flag="$SB/proj/.swarm-yuan/.gate-fail-flag"
[[ -f "$flag" ]] && grep -qx gate_test "$flag" && ok '生产 flag 含 gate_test' || { bad 'flag 未按稳定 id 生成'; cat "$flag" 2>/dev/null; }

# 消费侧：同一 hook 以 CLAUDE_PLUGIN_ROOT 指向技能根，cwd=项目根，Write 必须 deny。
_payload='{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$SB'/proj/src/a.ts"},"cwd":"'$SB'/proj"}'
_out="$(printf '%s' "$_payload" | CLAUDE_PLUGIN_ROOT="$SB/skill" bash "$SB/skill/scripts/fail-gate-hook.sh" 2>&1)"
_rc=$?
if [[ $_rc -eq 0 ]] && printf '%s' "$_out" | grep -q '"permissionDecision":"deny"'; then
  ok 'hook 对生产 flag 返回 deny'
else
  bad "hook 未 deny: rc=${_rc} out=${_out}"
fi
# deny 输出必须是合法 JSON（路径与原因不能破坏协议）。
if command -v python3 >/dev/null 2>&1; then
  printf '%s' "$_out" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["hookSpecificOutput"]["permissionDecision"]=="deny"' \
    && ok 'deny JSON 可解析' || bad 'deny JSON 非法'
fi

# 修复后（TEST_CMD=true 覆盖式全绿）flag 清除，hook 不再拦。
sed -i.bak 's/^TEST_CMD="false"/TEST_CMD="true"/' "$SB/skill/scripts/precheck.conf"
bash "$SB/skill/scripts/precheck.sh" --all > "$SB/precheck-green.log" 2>&1
[[ $? -eq 0 && ! -f "$flag" ]] && ok '覆盖式修复后 flag 清除' || bad '修复后 flag 未清除'
_out2="$(printf '%s' "$_payload" | CLAUDE_PLUGIN_ROOT="$SB/skill" bash "$SB/skill/scripts/fail-gate-hook.sh" 2>&1)"
printf '%s' "$_out2" | grep -q 'permissionDecision' && bad '修复后仍 deny' || ok '修复后写操作放行'

printf 'test-gate-deny-integration: PASS %s / FAIL %s\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
