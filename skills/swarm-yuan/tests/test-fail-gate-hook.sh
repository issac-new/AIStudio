#!/usr/bin/env bash
# test-fail-gate-hook.sh — fail-gate-hook.sh 双模式测试（WP-Enforce1 + WP-Enforce2）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
HOOK="assets/hooks/fail-gate-hook.sh"
SPFLIB="assets/spec-first-lib.sh"  # R101 判定库与 hook 成套分发——夹具须同布局拷贝（生成物 scripts/ 同目录）
TMP="$(mktemp -d /tmp/fgt.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# 态0（R125）：--self-test 载荷解析自检——退出码字段必须可达，否则红标记无法正常解除
st_out=$(bash "$HOOK" --self-test 2>&1); st_rc=$?
[[ $st_rc -eq 0 && "$st_out" == *exit_code=7* && "$st_out" == *"解析链健康"* ]] \
  && ok "态0 --self-test 载荷解析链健康（exit_code 可达）" || bad "态0: rc=$st_rc $st_out"

setup_proj() {
  mkdir -p "$1/scripts" "$1/.swarm-yuan"
  cat > "$1/SKILL.md" <<EOF
---
status: active
---
EOF
  cat > "$1/scripts/precheck.conf" <<EOF
PROJECT_DIR="$1"
GATE_ENFORCE_DENY="security"
$2
EOF
  echo "security" > "$1/.swarm-yuan/.gate-fail-flag"
}

# --- 态 1：Write 拦截（flag 存在 + 白名单配） ---
setup_proj "$TMP/p1" ""
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/p1/src/foo.py"},"cwd":"'$TMP'/p1"}' | bash "$HOOK" 2>&1)
echo "$out" | grep -q '"permissionDecision":"deny"' && ok "态1 Write 拦截 deny JSON" || bad "态1 未 deny: $out"

# --- 态 2：Write 落盘审计（gate-deny.jsonl） ---
[[ -f "$TMP/p1/.swarm-yuan/gate-deny.jsonl" ]] && ok "态2 deny 落盘存在" || bad "态2 deny 未落盘"
grep -q '"tool":"Write"' "$TMP/p1/.swarm-yuan/gate-deny.jsonl" && ok "态2 落盘 tool=Write" || bad "态2 落盘缺 Write"

# --- 态 3：Write 目标豁免（.swarm-yuan/conf）---
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/p1/.swarm-yuan/decisions.jsonl"},"cwd":"'$TMP'/p1"}' | bash "$HOOK" 2>&1)
[[ -z "$out" ]] && ok "态3 .swarm-yuan 目标豁免" || bad "态3 误拦 conf: $out"

# --- 态 4：Bash 推进态拦截（GATE_ENFORCE_DENY_BASH=push,commit）---
setup_proj "$TMP/p4" 'GATE_ENFORCE_DENY_BASH="push,commit"'
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push origin main"},"cwd":"'$TMP'/p4"}' | bash "$HOOK" 2>&1)
echo "$out" | grep -q '"permissionDecision":"deny"' && ok "态4 Bash git push 拦截" || bad "态4 未 deny: $out"
echo "$out" | grep -q 'GATE_ENFORCE_DENY_BASH' && ok "态4 deny 提示含 GATE_ENFORCE_DENY_BASH" || bad "态4 deny 缺开关提示"

# --- 态 5：Bash 只读放行（git status 不在白名单） ---
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git status"},"cwd":"'$TMP'/p4"}' | bash "$HOOK" 2>&1)
[[ -z "$out" ]] && ok "态5 Bash git status 放行" || bad "态5 误拦只读: $out"

# --- 态 6：Bash 测试命令放行（npm test 不在白名单） ---
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm test"},"cwd":"'$TMP'/p4"}' | bash "$HOOK" 2>&1)
[[ -z "$out" ]] && ok "态6 Bash npm test 放行" || bad "态6 误拦测试: $out"

# --- 态 7：Bash 白名单精确匹配（npm:publish） ---
setup_proj "$TMP/p7" 'GATE_ENFORCE_DENY_BASH="npm:publish"'
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm publish"},"cwd":"'$TMP'/p7"}' | bash "$HOOK" 2>&1)
echo "$out" | grep -q '"permissionDecision":"deny"' && ok "态7 npm:publish 精确拦截" || bad "态7 未 deny: $out"
# 同 conf 下 npm install 应放行（不在白名单）
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm install"},"cwd":"'$TMP'/p7"}' | bash "$HOOK" 2>&1)
[[ -z "$out" ]] && ok "态7 npm install 放行（非白名单）" || bad "态7 误拦 install: $out"

# --- 态 8：draft 期自动关闭（SKILL.md status: draft）---
setup_proj "$TMP/p8" ""
sed -i.bak 's/status: active/status: draft/' "$TMP/p8/SKILL.md"
rm -f "$TMP/p8/SKILL.md.bak"
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/p8/src/foo.py"},"cwd":"'$TMP'/p8"}' | bash "$HOOK" 2>&1)
[[ -z "$out" ]] && ok "态8 draft 期放行（不拦骨架期）" || bad "态8 draft 误拦: $out"

# --- 态 9：flag 不存在时放行 ---
mkdir -p "$TMP/p9/scripts"
cat > "$TMP/p9/SKILL.md" <<EOF
---
status: active
---
EOF
cat > "$TMP/p9/scripts/precheck.conf" <<EOF
PROJECT_DIR="$TMP/p9"
GATE_ENFORCE_DENY="security"
EOF
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/p9/src/foo.py"},"cwd":"'$TMP'/p9"}' | bash "$HOOK" 2>&1)
[[ -z "$out" ]] && ok "态9 flag 不存在放行" || bad "态9 无 flag 误拦: $out"

# --- 态 10：PostToolUse Bash precheck.sh fail 落 flag ---
mkdir -p "$TMP/p10/scripts" "$TMP/p10/.swarm-yuan"
cat > "$TMP/p10/SKILL.md" <<EOF
---
status: active
---
EOF
cat > "$TMP/p10/scripts/precheck.conf" <<EOF
PROJECT_DIR="$TMP/p10"
GATE_ENFORCE_DENY="security"
EOF
# R118：precheck 门禁 fail 时自己写 FAIL_IDS；hook 必须保留而不是覆盖成 DENY_LIST。
mkdir -p "$TMP/p10/.swarm-yuan"
printf 'gate_security_test\n' > "$TMP/p10/.swarm-yuan/.gate-fail-flag"
echo '{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"bash scripts/precheck.sh --all"},"tool_response":{"exit_code":1},"cwd":"'$TMP'/p10"}' | bash "$HOOK" >/dev/null 2>&1
if [[ -f "$TMP/p10/.swarm-yuan/.gate-fail-flag" ]] \
   && grep -q 'gate_security_test' "$TMP/p10/.swarm-yuan/.gate-fail-flag" \
   && ! grep -qx 'security' "$TMP/p10/.swarm-yuan/.gate-fail-flag"; then
  ok "态10 precheck FAIL_IDS 保留（未被 DENY_LIST 覆盖）"
else
  bad "态10 FAIL_IDS 被覆盖或丢失"
fi
# R118：--bogus 这类非门禁非零退出不得置 flag（旧版任意非零都锁编辑）
rm -f "$TMP/p10/.swarm-yuan/.gate-fail-flag"
echo '{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"bash scripts/precheck.sh --bogus"},"tool_response":{"exit_code":1},"cwd":"'$TMP'/p10"}' | bash "$HOOK" >/dev/null 2>&1
[[ ! -f "$TMP/p10/.swarm-yuan/.gate-fail-flag" ]] && ok "态10 非门禁非零退出不置 flag" || bad "态10 --bogus 误置 flag"
# R126：hook 不再按命令文本清 flag——旧契约「precheck pass → hook 清 flag」被
# 「任何含 precheck.sh 的命令 exit 0 即清」的宽松匹配架空（--fix-suggest/--doctor/
# 单门禁绿甚至 cat 都解锁）。清除权属收敛到 precheck 自身（覆盖式全量绿才清），
# hook 在 exit_code=0 时保持 flag 不动。行为级「修复后解锁」由
# test-gate-flag-lifecycle.sh 的 precheck 侧真跑断言兜底。
# （前置：上一态 --bogus 用例自带 rm -f，这里先 replant 再断言「不被清」。）
printf 'gate_security_test\n' > "$TMP/p10/.swarm-yuan/.gate-fail-flag"
echo '{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"bash scripts/precheck.sh --all"},"tool_response":{"exit_code":0},"cwd":"'$TMP'/p10"}' | bash "$HOOK" >/dev/null 2>&1
[[ -f "$TMP/p10/.swarm-yuan/.gate-fail-flag" ]] && ok "态10 hook 不按命令文本清 flag（R126 权属收敛）" || bad "态10 hook 仍按文本清 flag"
# R126 补充：--fix-suggest（FAIL>0 也 exit 0）与 cat 类纯文本命中同样不得清
echo '{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"bash scripts/precheck.sh --fix-suggest"},"tool_response":{"exit_code":0},"cwd":"'$TMP'/p10"}' | bash "$HOOK" >/dev/null 2>&1
[[ -f "$TMP/p10/.swarm-yuan/.gate-fail-flag" ]] && ok "态10 --fix-suggest exit 0 不清 flag" || bad "态10 --fix-suggest 清 flag"
echo '{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"cat scripts/precheck.sh"},"tool_response":{"exit_code":0},"cwd":"'$TMP'/p10"}' | bash "$HOOK" >/dev/null 2>&1
[[ -f "$TMP/p10/.swarm-yuan/.gate-fail-flag" ]] && ok "态10 cat precheck.sh 不清 flag" || bad "态10 cat 清 flag"

# --- 态 11：WP-Enforce3 --report（向后兼容分支：仅旧 gate-deny.jsonl 无 audit） ---
# 手工造一个纯旧格式项目（p1 现在有 audit 文件会走新分支，见态17）
mkdir -p "$TMP/p11/.swarm-yuan"
printf '{"ts":"2026-08-20T01:00:00Z","tool":"Write","target":"src/a.py","gates":"security"}\n' > "$TMP/p11/.swarm-yuan/gate-deny.jsonl"
out=$(bash "$HOOK" --report --project "$TMP/p11" 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态11 --report exit 0" || bad "态11 exit=$rc"
echo "$out" | grep -q '^## fail-gate deny 报告' && ok "态11 旧版报告标题命中" || bad "态11 缺旧标题: $out"
echo "$out" | grep -q '按门禁聚合' && ok "态11 聚合段命中" || bad "态11 缺聚合段: $out"
echo "$out" | grep -q 'security' && ok "态11 security 门禁命中" || bad "态11 缺 security: $out"

# --- 态 12：--report N（限制条数，旧格式项目） ---
printf '{"ts":"2026-08-20T02:00:00Z","tool":"Edit","target":"src/b.py","gates":"security"}\n' >> "$TMP/p11/.swarm-yuan/gate-deny.jsonl"
out=$(bash "$HOOK" --report 1 --project "$TMP/p11" 2>&1)
line_count=$(echo "$out" | grep -cE '^202[0-9]-' || true)
[[ "$line_count" -eq 1 ]] && ok "态12 --report 1 仅 1 条事件" || bad "态12 line_count=$line_count 应=1"

# --- 态 13：--report 无文件（fail-open） ---
out=$(bash "$HOOK" --report --project "$TMP" 2>&1); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -q '无 deny 事件' && ok "态13 无文件 fail-open" || bad "态13 exit=$rc 或缺提示: $out"

# ===== WP-R12-A：gate-audit.jsonl 全量决策审计 =====

# --- 态 14：deny 决策点落 audit 行（handler/decision/reason 三字段） ---
[[ -f "$TMP/p1/.swarm-yuan/gate-audit.jsonl" ]] && ok "态14 audit 文件存在" || bad "态14 audit 未落盘"
grep -q '"handler":"fail-gate-hook:edit"' "$TMP/p1/.swarm-yuan/gate-audit.jsonl" && ok "态14 handler=edit 命中" || bad "态14 缺 handler"
grep -q '"decision":"deny"' "$TMP/p1/.swarm-yuan/gate-audit.jsonl" && grep -q '"reason":"gates-unresolved"' "$TMP/p1/.swarm-yuan/gate-audit.jsonl" \
  && ok "态14 deny/gates-unresolved 命中" || bad "态14 缺 deny 行"

# --- 态 15：豁免路径落 pass 行（态3 的 .swarm-yuan 目标） ---
grep -q '"decision":"pass"' "$TMP/p1/.swarm-yuan/gate-audit.jsonl" && grep -q '"reason":"exempt-path"' "$TMP/p1/.swarm-yuan/gate-audit.jsonl" \
  && ok "态15 豁免路径 pass/exempt-path 命中" || bad "态15 缺豁免 pass 行"

# --- 态 16：Bash 非白名单命令落 pass/bash-not-whitelisted（态5 的 git status） ---
grep -q '"reason":"bash-not-whitelisted"' "$TMP/p4/.swarm-yuan/gate-audit.jsonl" \
  && ok "态16 Bash 非白名单 pass 行命中" || bad "态16 缺 bash-not-whitelisted 行"
grep -q '"handler":"fail-gate-hook:bash"' "$TMP/p4/.swarm-yuan/gate-audit.jsonl" && ok "态16 handler=bash 命中" || bad "态16 缺 bash handler"

# --- 态 17：休眠不写审计（p9 无 flag → 无 audit 文件） ---
[[ ! -f "$TMP/p9/.swarm-yuan/gate-audit.jsonl" ]] && ok "态17 休眠态不写审计" || bad "态17 休眠态误写审计"

# --- 态 18：--report 新分支（audit 存在 → 拦截率） ---
# p1 的决策点：态1 deny + 态3 pass = 2 点 1 deny → 拦截率 50.0%
out=$(bash "$HOOK" --report --project "$TMP/p1" 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态18 --report exit 0" || bad "态18 exit=$rc"
echo "$out" | grep -q '^## fail-gate 审计报告' && ok "态18 新报告标题命中" || bad "态18 缺新标题: $out"
echo "$out" | grep -q '拦截率' && ok "态18 拦截率段命中" || bad "态18 缺拦截率段: $out"
echo "$out" | grep -q '50.0%' && ok "态18 拦截率 50.0% 正确" || bad "态18 拦截率错误: $(echo "$out" | grep '%')"
echo "$out" | grep -q '按工具决策分布' && ok "态18 工具决策分布段命中" || bad "态18 缺分布段: $out"

# --- 态 19-22：rules.d 无条件面（audit-claims-reality 修复回归锚）---
# 修复前：rules.d 求值被 GATE_ENFORCE_DENY 空 + GATE_ENFORCE_DENY_BASH 空两道 early-exit 挡死，
# 默认配置下 FORBID 永不生效。修复后：forbid 无条件 deny（不依赖开关、不依赖门禁红 flag）。
# 布局：模拟生成物 scripts/ 归一（hook + gate-rules.sh 同目录，rules.d 在上一级），
# 与 UNIVERSAL_FILES 新 dest（scripts/fail-gate-hook.sh|hook）一致。
setup_rules_proj() {
  mkdir -p "$1/scripts" "$1/rules.d" "$1/.swarm-yuan"
  cat > "$1/SKILL.md" <<EOF
---
status: active
---
EOF
  cat > "$1/scripts/precheck.conf" <<EOF
PROJECT_DIR="$1"
GATE_ENFORCE_DENY=""
EOF
  cp "$HOOK" "$1/scripts/fail-gate-hook.sh"; cp "$SPFLIB" "$1/scripts/spec-first-lib.sh"
  cp "scripts/gate-rules.sh" "$1/scripts/gate-rules.sh"
  cp assets/rules.d/*.rules "$1/rules.d/"
}

# 态 19：默认配置（白名单全空）+ 无 flag → rules.d FORBID（npm publish）仍硬拦
setup_rules_proj "$TMP/pr1"
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm publish --access public"},"cwd":"'$TMP'/pr1"}' | bash "$TMP/pr1/scripts/fail-gate-hook.sh" 2>&1)
echo "$out" | grep -q '"permissionDecision":"deny"' && ok "态19 rules.d forbid 默认配置硬拦" || bad "态19 未 deny: $out"
echo "$out" | grep -q '替代' && ok "态19 deny 消息带替代方案" || bad "态19 缺替代方案: $out"
grep -q '"reason":"rules-forbid"' "$TMP/pr1/.swarm-yuan/gate-audit.jsonl" 2>/dev/null \
  && ok "态19 forbid 审计落盘" || bad "态19 审计未落盘"

# 态 20：rules.d allow（git status）→ 放行（无 deny 输出）+ 审计 rules-allow
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git status"},"cwd":"'$TMP'/pr1"}' | bash "$TMP/pr1/scripts/fail-gate-hook.sh" 2>&1)
[[ -z "$out" ]] && ok "态20 rules.d allow 放行" || bad "态20 误拦只读: $out"
grep -q '"reason":"rules-allow"' "$TMP/pr1/.swarm-yuan/gate-audit.jsonl" 2>/dev/null \
  && ok "态20 allow 审计落盘" || bad "态20 审计未落盘"

# 态 21：rm -rf 命中 forbid（无条件面第二条默认规则）
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"rm -rf node_modules"},"cwd":"'$TMP'/pr1"}' | bash "$TMP/pr1/scripts/fail-gate-hook.sh" 2>&1)
echo "$out" | grep -q '"permissionDecision":"deny"' && ok "态21 rm -rf forbid 硬拦" || bad "态21 未 deny: $out"

# 态 22：prompt 命中（git push）+ 默认配置（白名单空）→ 落回白名单 → 放行不拦
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push origin main"},"cwd":"'$TMP'/pr1"}' | bash "$TMP/pr1/scripts/fail-gate-hook.sh" 2>&1)
[[ -z "$out" ]] && ok "态22 prompt 落回白名单默认放行" || bad "态22 prompt 被误拦: $out"

# 态 23：draft 期 rules.d forbid 仍硬拦（audit-2026-08-25：forbid 无条件面不被 draft 静默）；
# 但 draft 期白名单/flag 捕获面仍休眠（态 8 语义不变）
setup_rules_proj "$TMP/pr2"
sed -i.bak 's/status: active/status: draft/' "$TMP/pr2/SKILL.md"
rm -f "$TMP/pr2/SKILL.md.bak"
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"rm -rf node_modules"},"cwd":"'$TMP'/pr2"}' | bash "$TMP/pr2/scripts/fail-gate-hook.sh" 2>&1)
echo "$out" | grep -q '"permissionDecision":"deny"' && ok "态23 draft 期 forbid 仍硬拦" || bad "态23 draft 吞了 forbid: $out"
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git status"},"cwd":"'$TMP'/pr2"}' | bash "$TMP/pr2/scripts/fail-gate-hook.sh" 2>&1)
[[ -z "$out" ]] && ok "态23 draft 期 allow 仍放行" || bad "态23 draft 误拦只读: $out"

# 态 24-27：spec 前置门（field-feedback 2026-08-26 P0 锚：SPEC_REQUIRED=1 时写源码区无已批准 spec → deny）
setup_spec_proj() {
  mkdir -p "$1/scripts" "$1/.swarm-yuan" "$1/src" "$1/docs/specs"
  cat > "$1/SKILL.md" <<EOF
---
status: active
---
EOF
  cat > "$1/scripts/precheck.conf" <<EOF
PROJECT_DIR="$1"
WRITABLE_DIRS=("src")
SPEC_REQUIRED="1"
GATE_ENFORCE_DENY=""
EOF
  cp "$HOOK" "$1/scripts/fail-gate-hook.sh"; cp "$SPFLIB" "$1/scripts/spec-first-lib.sh"
}
setup_spec_proj "$TMP/ps1"
# 态24：无 spec 写源码区 → deny
out=$(printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/ps1/src/foo.py"},"cwd":"'$TMP'/ps1"}' | bash "$TMP/ps1/scripts/fail-gate-hook.sh" 2>&1)
echo "$out" | grep -q '"permissionDecision":"deny"' && ok "态24 无 spec 写 src/ 硬拦" || bad "态24 未 deny: $out"
# 态25：已批准 spec（含决策记录、无占位符）→ 放行
printf '# 需求 X\n## 决策记录\n- 方案 A\n' > "$TMP/ps1/docs/specs/001.md"
out=$(printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/ps1/src/foo.py"},"cwd":"'$TMP'/ps1"}' | bash "$TMP/ps1/scripts/fail-gate-hook.sh" 2>&1)
[[ -z "$out" ]] && ok "态25 已批准 spec 放行" || bad "态25 误拦: $out"
# 态26：占位符 spec → deny（骨架铁律同款：占位不算批准）
rm "$TMP/ps1/docs/specs/001.md"; printf '# s\n## 决策记录\n- 待填充\n' > "$TMP/ps1/docs/specs/002.md"
out=$(printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/ps1/src/foo.py"},"cwd":"'$TMP'/ps1"}' | bash "$TMP/ps1/scripts/fail-gate-hook.sh" 2>&1)
echo "$out" | grep -q '"permissionDecision":"deny"' && ok "态26 占位符 spec 仍拦" || bad "态26 占位符被放行: $out"
rm "$TMP/ps1/docs/specs/002.md"
# 态27：draft 骨架期 → spec 门放行（骨架期无 spec 是常态）
sed -i.bak 's/status: active/status: draft/' "$TMP/ps1/SKILL.md"; rm -f "$TMP/ps1/SKILL.md.bak"
out=$(printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/ps1/src/foo.py"},"cwd":"'$TMP'/ps1"}' | bash "$TMP/ps1/scripts/fail-gate-hook.sh" 2>&1)
[[ -z "$out" ]] && ok "态27 draft 骨架期放行" || bad "态27 draft 误拦: $out"

# 态 28-29：双目录布局（回归发现#20b 锁死测试）——生成物真实形态：
# CLAUDE_PLUGIN_ROOT=skill 目录（conf/SKILL.md/hooks 所在），cwd=项目目录（src/.swarm-yuan 所在）。
# 原实现 CONF 全取 CWD 侧 → 双目录下 conf 读不到、spec 门死代码（态 24-27 单目录布局测不出）。
mkdir -p "$TMP/skill28/scripts" "$TMP/proj28/src" "$TMP/proj28/.swarm-yuan"
cat > "$TMP/skill28/SKILL.md" <<EOF
---
status: active
---
EOF
cat > "$TMP/skill28/scripts/precheck.conf" <<EOF
PROJECT_DIR="$TMP/proj28"
WRITABLE_DIRS=("src")
SPEC_REQUIRED="\${SPEC_REQUIRED:-1}"
SPEC_GLOB="\${SPEC_GLOB:-docs/specs/*.md}"
GATE_ENFORCE_DENY=""
EOF
cp "$HOOK" "$TMP/skill28/scripts/fail-gate-hook.sh"; cp "$SPFLIB" "$TMP/skill28/scripts/spec-first-lib.sh"
# 态28：双目录布局无 spec 写项目 src/ → deny（conf 自引用默认 SPEC_REQUIRED 求值为 1）
out=$(printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/proj28/src/foo.py"},"cwd":"'$TMP'/proj28"}' | CLAUDE_PLUGIN_ROOT="$TMP/skill28" bash "$TMP/skill28/scripts/fail-gate-hook.sh" 2>&1)
echo "$out" | grep -q '"permissionDecision":"deny"' && ok "态28 双目录布局无 spec 硬拦（#20b 锁死）" || bad "态28 双目录未 deny: $out"
# 态29：双目录布局批准 spec → 放行（spec 搜索根=项目侧）
mkdir -p "$TMP/proj28/docs/specs"; printf '# X\n## 决策记录\n- 方案 A\n' > "$TMP/proj28/docs/specs/001.md"
out=$(printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/proj28/src/foo.py"},"cwd":"'$TMP'/proj28"}' | CLAUDE_PLUGIN_ROOT="$TMP/skill28" bash "$TMP/skill28/scripts/fail-gate-hook.sh" 2>&1)
[[ -z "$out" ]] && ok "态29 双目录布局批准 spec 放行" || bad "态29 双目录误拦: $out"

# 态 30-31：R25-D3 回归锚——conf 行尾注释（MEASURE 口径）污染 DENY 白名单。
# 修复前：sed 只剥行首/行尾引号，注释文字与中间引号混入 DENY_LIST → PostToolUse 把污染值
# 原样落进 .gate-fail-flag → PreToolUse deny JSON 嵌入后成非法 JSON（宿主解析失败=拦截失效）。
# 断言走完整污染链：先 PostToolUse fail 让 hook 自己落 flag，再 PreToolUse 验输出——
# 手工造干净 flag 测不到此缺陷（R25 判别器教训）。
# 布局：出厂真实形态 = 值带引号 + 行尾 # MEASURE 注释。
setup_comment_proj() {
  mkdir -p "$1/scripts" "$1/.swarm-yuan"
  cat > "$1/SKILL.md" <<EOF
---
status: active
---
EOF
  cat > "$1/scripts/precheck.conf" <<EOF
PROJECT_DIR="$1"
GATE_ENFORCE_DENY="security"  # MEASURE: characteristic=可靠性 function=门禁失败硬拦截白名单 threshold=默认核心门禁
$2
EOF
}

# 态30：注释 conf → precheck 写的 FAIL_IDS 被保留（不覆盖/不污染）→ PreToolUse deny 合法 JSON
setup_comment_proj "$TMP/p30" ""
mkdir -p "$TMP/p30/.swarm-yuan"
printf 'gate_security_test\n' > "$TMP/p30/.swarm-yuan/.gate-fail-flag"
echo '{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"bash scripts/precheck.sh --all"},"tool_response":{"exit_code":1},"cwd":"'$TMP'/p30"}' | bash "$HOOK" >/dev/null 2>&1
[[ -f "$TMP/p30/.swarm-yuan/.gate-fail-flag" ]] && ok "态30 precheck FAIL_IDS flag 在位" || bad "态30 flag 未落盘"
grep -qx 'gate_security_test' "$TMP/p30/.swarm-yuan/.gate-fail-flag" && ok "态30 flag 内容干净（=gate_security_test）" || bad "态30 flag 被覆盖/污染: $(head -c 60 "$TMP/p30/.swarm-yuan/.gate-fail-flag")"
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/p30/src/foo.py"},"cwd":"'$TMP'/p30"}' | bash "$HOOK" 2>&1)
if command -v python3 >/dev/null 2>&1; then
  printf '%s' "$out" | python3 -c 'import sys,json; json.load(sys.stdin)' 2>/dev/null \
    && ok "态30 注释 conf 下 deny JSON 合法" || bad "态30 deny JSON 非法: $out"
else
  echo "$out" | grep -q 'MEASURE' || ok "态30 deny 输出不含注释文本（无 python3 降级）" || bad "态30 注释混入输出: $out"
fi
echo "$out" | grep -q '"permissionDecision":"deny"' && ok "态30 注释 conf 拦截功能正常" || bad "态30 未 deny: $out"
grep -q 'MEASURE' "$TMP/p30/.swarm-yuan/gate-deny.jsonl" 2>/dev/null && bad "态30 审计 gates 字段混入注释" || ok "态30 审计 gates 字段干净"

# 态31：注释 conf 的 GATE_ENFORCE_DENY_BASH → 白名单解析干净，git push 仍拦、npm test 仍放行
setup_comment_proj "$TMP/p31" 'GATE_ENFORCE_DENY_BASH="push,commit"  # MEASURE: 推进态命令拦截白名单'
mkdir -p "$TMP/p31/.swarm-yuan"
printf 'gate_security_test\n' > "$TMP/p31/.swarm-yuan/.gate-fail-flag"
echo '{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"bash scripts/precheck.sh --all"},"tool_response":{"exit_code":1},"cwd":"'$TMP'/p31"}' | bash "$HOOK" >/dev/null 2>&1
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push origin main"},"cwd":"'$TMP'/p31"}' | bash "$HOOK" 2>&1)
echo "$out" | grep -q '"permissionDecision":"deny"' && ok "态31 注释 BASH 白名单 git push 仍拦" || bad "态31 未 deny: $out"
out=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm test"},"cwd":"'$TMP'/p31"}' | bash "$HOOK" 2>&1)
[[ -z "$out" ]] && ok "态31 注释 BASH 白名单 npm test 仍放行" || bad "态31 误拦测试: $out"

# 态 32-35：WRITABLE_DIRS 行尾注释形态（R56-D5 变异锁，2026-09-25 r56-drill-kanban 实锤）——
# conf 模板自身惯用 `WRITABLE_DIRS=(...)  # 注释` 写法，旧式 sed 's/)$//' 行尾锚剥不掉注释 →
# 提取垃圾串 → 可写区匹配恒 false → spec-first 整链静默失效（态 24-29 无注释形态测不出）。
setup_wd_comment_proj() {
  mkdir -p "$1/scripts" "$1/.swarm-yuan" "$1/src" "$1/app" "$1/docs/specs"
  cat > "$1/SKILL.md" <<EOF
---
status: active
---
EOF
  cat > "$1/scripts/precheck.conf" <<EOF
PROJECT_DIR="$1"
$2
SPEC_REQUIRED="1"
GATE_ENFORCE_DENY=""
EOF
  cp "$HOOK" "$1/scripts/fail-gate-hook.sh"; cp "$SPFLIB" "$1/scripts/spec-first-lib.sh"
}
# 态32：WRITABLE_DIRS 带行尾注释 + 无 spec 写 src/ → 必须 deny（D5 回归锁）
setup_wd_comment_proj "$TMP/p32" 'WRITABLE_DIRS=("src")  # MEASURE: characteristic=维护性 function=目录存在性 threshold=非空'
out=$(printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/p32/src/foo.py"},"cwd":"'$TMP'/p32"}' | bash "$TMP/p32/scripts/fail-gate-hook.sh" 2>&1)
echo "$out" | grep -q '"permissionDecision":"deny"' && ok "态32 WRITABLE_DIRS 行尾注释仍拦（D5 锁）" || bad "态32 注释形态 spec-first 静默失效: $out"
# 态33：同 conf 注释形态 + 已批准 spec → 放行（注释形态不误报）
printf '# 需求 X\n## 决策记录\n- 方案 A\n' > "$TMP/p32/docs/specs/001.md"
out=$(printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/p32/src/foo.py"},"cwd":"'$TMP'/p32"}' | bash "$TMP/p32/scripts/fail-gate-hook.sh" 2>&1)
[[ -z "$out" ]] && ok "态33 注释形态批准 spec 放行" || bad "态33 误拦: $out"
# 态34：WRITABLE_DIRS 空数组带注释（模板未配形态）→ 放行（不阻碍诊断语义保留）
setup_wd_comment_proj "$TMP/p34" 'WRITABLE_DIRS=()  # TODO:model'
out=$(printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/p34/src/foo.py"},"cwd":"'$TMP'/p34"}' | bash "$TMP/p34/scripts/fail-gate-hook.sh" 2>&1)
[[ -z "$out" ]] && ok "态34 空数组+注释放行（未配语义保留）" || bad "态34 未配误拦: $out"
# 态35：多元素数组带注释——第二目录 app/ 也必须命中（剥引号+拆词不被注释污染）
setup_wd_comment_proj "$TMP/p35" 'WRITABLE_DIRS=("src" "app")  # MEASURE: 双目录'
out=$(printf '%s' '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"'$TMP'/p35/app/foo.py"},"cwd":"'$TMP'/p35"}' | bash "$TMP/p35/scripts/fail-gate-hook.sh" 2>&1)
echo "$out" | grep -q '"permissionDecision":"deny"' && ok "态35 多元素数组+注释第二目录命中" || bad "态35 app/ 未命中: $out"

# 态36/37（R126-G1 回归锁）：PostToolUse 对"命令文本含 precheck.sh 的只读命令 rc=0"
# 不得清 flag——旧实现在此按子串匹配 + rc=0 清 flag，一条 grep 就能解除 L1 拦截。
# 根治后 flag 清除唯一归属 precheck 自身（全绿退出自清），hook 侧不再写/清。
setup_proj "$TMP/p36" ""
printf 'gate_branch_main\n' > "$TMP/p36/.swarm-yuan/.gate-fail-flag"
echo '{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"grep -n foo scripts/precheck.sh"},"tool_response":{"exit_code":0},"cwd":"'$TMP'/p36"}' | bash "$HOOK" >/dev/null 2>&1
[[ -f "$TMP/p36/.swarm-yuan/.gate-fail-flag" ]] && grep -q 'gate_branch_main' "$TMP/p36/.swarm-yuan/.gate-fail-flag" \
  && ok "态36 只读 grep（文本含 precheck.sh）rc=0 不清 flag" || bad "态36 flag 被只读命令误清"
echo '{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"bash scripts/precheck.sh --doctor"},"tool_response":{"exit_code":0},"cwd":"'$TMP'/p36"}' | bash "$HOOK" >/dev/null 2>&1
[[ -f "$TMP/p36/.swarm-yuan/.gate-fail-flag" ]] \
  && ok "态37 precheck --doctor（非门禁调用）rc=0 不清 flag" || bad "态37 doctor 误清 flag"

[[ $FAIL -eq 0 ]] && { echo "PASS test-fail-gate-hook"; exit 0; } || { echo "FAIL test-fail-gate-hook" >&2; exit 1; }
