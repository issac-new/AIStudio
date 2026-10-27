#!/usr/bin/env bash
# test-integrity-guard.sh — integrity-guard 保护面/协议/Read 契约（Task 8 / A12）
# 只构造载荷与临时技能树；不执行 payload 命令。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$BASE/assets/hooks/integrity-guard.sh"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1" >&2; }

invoke() { # $1=tool $2=tool_input json → stdout（宿主协议：stdin=完整 hook payload）
  printf '{"tool_name":"%s","tool_input":%s}' "$1" "$2" | bash "$GUARD" 2>/dev/null
}

# ① 核心守门资产 Write deny
for p in "assets/precheck.sh" "scripts/gates-strict.sh" "hooks/fail-gate-hook.sh"; do
  out="$(invoke Write "{\"file_path\":\"/repo/skills/swarm-yuan/$p\"}")"
  printf '%s' "$out" | grep -q '"permissionDecision":"deny"' && ok "deny: $p" || bad "未拦: $p"
done

# ② Read hidden_solution 拦截（头注承诺兑现）
out="$(invoke Read '{"file_path":"/repo/tests/fixtures/min/hidden_solution.md"}')"
printf '%s' "$out" | grep -q '"permissionDecision":"deny"' && ok 'Read hidden_solution 拒绝' || bad 'Read 面放行'
out="$(invoke Read '{"file_path":"/repo/src/app.ts"}')"
[[ -z "$out" ]] && ok '普通 Read 放行' || bad '普通 Read 误拦'

# ③ 特殊路径 JSON 合法性（引号/反斜杠不破坏协议）
if command -v python3 >/dev/null 2>&1; then
  out="$(printf '%s' '{"tool_name":"Write","tool_input":{"file_path":"/repo/framework-gates/we\"quote.sh"}}' | bash "$GUARD" 2>/dev/null)"
  printf '%s' "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["hookSpecificOutput"]["permissionDecision"]=="deny"' \
    && ok '特殊路径 deny JSON 可解析' || bad '特殊路径 JSON 非法: '"$out"
fi

# ④ Bash 变更命令触碰保护资产 deny
out="$(invoke Bash '{"command":"perl -pi -e s/x/y/ /repo/skills/swarm-yuan/assets/precheck.sh"}')"
printf '%s' "$out" | grep -q '"permissionDecision":"deny"' && ok 'Bash sed 保护资产拒绝' || bad 'Bash 面放行'

# ⑤ 无输入/未知工具静默放行
printf '' | bash "$GUARD" >/dev/null 2>&1; [[ $? -eq 0 ]] && ok '空输入放行（rc=0 无输出）' || bad '空输入非零退出'

printf 'test-integrity-guard: PASS %s / FAIL %s\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
