#!/usr/bin/env bash
# test-skill-behavioral-eval.sh — Tier-3 行为评测的四态守门
# 态1 模板 dry-run：不烧 token，exit 0 且打印计划
# 态2 runner 不可用：exit 2（绝不读成 0）
# 态3 动作断言命中：假 runner 输出含期望动作 → PASS
# 态4 动作断言未命中/触禁止项：→ FAIL，exit 1
set -uo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$BASE/scripts/skill-behavioral-eval.sh"
SKILL="$BASE/SKILL.md"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-behave-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
FAILS=0
ok()   { printf '  ✓ %s\n' "$*"; }
bad()  { printf '  ✗ %s\n' "$*"; FAILS=$((FAILS + 1)); }

# 态1：模板 dry-run
out="$(bash "$SCRIPT" --cases "$BASE/assets/evals/behavioral.tsv" --skill "$SKILL" --dry-run 2>&1)"; rc=$?
[[ "$rc" -eq 0 ]] && ok "态1 模板 dry-run exit 0" || bad "态1 模板 dry-run 期望 0，实际 ${rc}"
case "$out" in *"Tier-3 计划"*) ok "态1 打印计划" ;; *) bad "态1 未打印计划" ;; esac

# 态2：runner 不可用（用真实用例触发，避免被"用例为空"抢先）
printf 'case_id\tprompt\texpect_actions\tforbid_actions\n1\t做点事\tWrite.*a\t\n' > "$TMP/c1.tsv"
out="$(bash "$SCRIPT" --cases "$TMP/c1.tsv" --skill "$SKILL" --runner definitely-not-a-runner-xyz 2>&1)"; rc=$?
[[ "$rc" -eq 2 ]] && ok "态2 runner 不可用 exit 2" || bad "态2 期望 exit 2，实际 ${rc}"
case "$out" in *"exit 2"*|*"未运行"*) ok "态2 披露未运行" ;; *) bad "态2 未披露（读成通过的风险）" ;; esac

# 假 runner：把 stream-json 一行打到 stdout
mkdir -p "$TMP/bin"
cat > "$TMP/bin/fake-runner" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"src/split.js"}}]}}'
exit 0
EOF
chmod +x "$TMP/bin/fake-runner"

# 态3：期望动作命中
printf 'case_id\tprompt\texpect_actions\tforbid_actions\n1\t改文件\tWrite.*src/split\\.js;\t\n' > "$TMP/c3.tsv"
out="$(PATH="$TMP/bin:$PATH" bash "$SCRIPT" --cases "$TMP/c3.tsv" --skill "$SKILL" --runner fake-runner 2>&1)"; rc=$?
[[ "$rc" -eq 0 ]] && ok "态3 动作命中 exit 0" || { bad "态3 期望 0，实际 ${rc}"; printf '%s\n' "$out" | sed 's/^/    /'; }

# 态4a：期望动作未出现
printf 'case_id\tprompt\texpect_actions\tforbid_actions\n1\t改文件\tBash.*npm test\t\n' > "$TMP/c4a.tsv"
out="$(PATH="$TMP/bin:$PATH" bash "$SCRIPT" --cases "$TMP/c4a.tsv" --skill "$SKILL" --runner fake-runner 2>&1)"; rc=$?
[[ "$rc" -eq 1 ]] && ok "态4a 期望未命中 exit 1" || bad "态4a 期望 1，实际 ${rc}"
case "$out" in *"期望动作未出现"*) ok "态4a 报出缺失动作" ;; *) bad "态4a 未报缺失动作" ;; esac

# 态4b：触发禁止项
printf 'case_id\tprompt\texpect_actions\tforbid_actions\n1\t改文件\tWrite.*src/split\\.js\tEdit.*package\\.json;Write.*src/split\\.js\n' > "$TMP/c4b.tsv"
out="$(PATH="$TMP/bin:$PATH" bash "$SCRIPT" --cases "$TMP/c4b.tsv" --skill "$SKILL" --runner fake-runner 2>&1)"; rc=$?
[[ "$rc" -eq 1 ]] && ok "态4b 触禁止项 exit 1" || bad "态4b 期望 1，实际 ${rc}"
case "$out" in *"禁止动作出现"*) ok "态4b 报出禁止项" ;; *) bad "态4b 未报禁止项" ;; esac

if [[ "$FAILS" -eq 0 ]]; then echo "PASS test-skill-behavioral-eval"; exit 0; fi
echo "FAIL test-skill-behavioral-eval（${FAILS} 项）"; exit 1
