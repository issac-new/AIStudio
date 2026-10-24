#!/usr/bin/env bash
# test-mark-active-decisions-fallback.sh — R25-PF2 回归锚：mark-active 决策账本双账回退
#
# 真实执勤实证（2026-09-12 Python 栈 notes-api）：trace-log --decision 与 SKILL.md 填充指引
# 都把决策写到项目侧 .swarm-yuan/decisions.jsonl，--mark-active 的 C2 核验此前只认技能侧账本，
# 按文档执行即死锁（R23-D14 已合并 audit-closure 一侧，此处是另一半）。
# 断言走行为级 smoke：技能侧无账 + 项目侧有账 → mark-active 输出不再含"缺少决策记录"拦截行
# （其他拦截面仍正常工作——反向对照证明拦截面本身没被误删）。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
GEN="scripts/generate-skill.sh"
TMP="$(mktemp -d /tmp/dcf.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

PROJ="$TMP/demo-api"
mkdir -p "$PROJ/src" && printf '{ "name": "demo-api", "version": "1.0.0" }\n' > "$PROJ/package.json"
bash "$GEN" demo-api "$PROJ" >/dev/null 2>&1
SKILL_DIR="$PROJ/.claude/skills/demo-api"
[[ -d "$SKILL_DIR" ]] && ok "create 完成" || bad "create 失败"

# 技能侧账本确保为空（create 骨架默认无账）；决策只写项目侧
mkdir -p "$PROJ/.swarm-yuan"
printf '{"ts":"2026-09-12T00:00:00Z","type":"Mechanical","ai_suggestion":"t","user_action":"approved","outcome":"implemented","rationale":"r","actor":"test"}\n' \
  > "$PROJ/.swarm-yuan/decisions.jsonl"
[[ ! -s "$SKILL_DIR/.swarm-yuan/decisions.jsonl" ]] && ok "技能侧账本为空（回退前置条件）" || bad "技能侧账本非空，前提不成立"

# R75-D3 契约共存：本测试只管决策账本回退语义，spec-first 联动（SPEC_REQUIRED=1 默认开 +
# WRITABLE_DIRS 空 → mark-active 第七关拦截）须先满足才能走到被测拦截面——填充可写区
printf '\n# R75-D3 测试前置：spec-first 联动可写区\nWRITABLE_DIRS=("src")\n' >> "$SKILL_DIR/scripts/precheck.conf"

out=$(bash "$GEN" --mark-active "$SKILL_DIR" 2>&1)
grep -q '缺少决策记录' <<<"$out" \
  && bad "PF2 回归：项目侧有账仍被拦（死锁未解）: $(grep '缺少决策记录' <<<"$out")" \
  || ok "项目侧账本被识别（无 decisions 拦截行）"

# 反向对照：项目侧也无账 → 拦截面必须仍在（防断言空转）
rm -f "$PROJ/.swarm-yuan/decisions.jsonl"
out=$(bash "$GEN" --mark-active "$SKILL_DIR" 2>&1)
grep -q '缺少决策记录' <<<"$out" \
  && ok "对照：双侧无账仍拦（拦截面健在）" \
  || bad "对照：无账不拦（拦截面被误删）"

[[ $FAIL -eq 0 ]] && { echo "PASS test-mark-active-decisions-fallback"; exit 0; } || { echo "FAIL test-mark-active-decisions-fallback" >&2; exit 1; }
