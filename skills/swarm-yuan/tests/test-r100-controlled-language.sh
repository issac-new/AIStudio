#!/usr/bin/env bash
# test-r100-controlled-language.sh — 受控语言纪律防复发锁
#
# 背景（R100 立法）：全流程推演与回归轮中，AI 面向人的回复黑话密度高、思路跳跃——
# 读者要反复猜指代。立法载体 references/controlled-language-methodology.md（ASD-STE100
# 结构/词汇二分 + 六结构规则 + 黑话替代表 + 回归轮报告格式）。
# 本锁机器执法四面：
#   ① 立法载体在位且要素齐（何时读我头 + 六结构规则锚 + 黑话替代表 + 回归轮报告专项）
#   ② 生成器接线（SKILL.md 工作原则 + 路由表族行）
#   ③ 登记链闭环（G25② capability-map / G25⑤ 路由表 / G25⑥ UNIVERSAL_FILES / FACT_REFERENCES 计数）
#   ④ 生成物接线（lite 档随发受控语言档；standard 档 workflow 骨架含回复纪律锚；产物 SKILL.md 理念行含锚）
set -u
cd "$(dirname "${0}")/.." || exit 1
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1" >&2; fail=$((fail+1)); }

DOC="references/controlled-language-methodology.md"

# --- ① 立法载体在位且要素齐 ---
if [[ -f "$DOC" ]]; then
  ok "立法载体存在: ${DOC}"
else
  bad "立法载体缺失: ${DOC}（受控语言纪律档被删——回复质量将失去约束）"
fi
for anchor in '何时读我' '结论先行' '一词一义' '术语首现定义' '情态不升降级' '黑话替代表' '回归轮报告专项' '箭头链'; do
  if grep -q "$anchor" "$DOC" 2>/dev/null; then
    ok "纪律档含要素锚: ${anchor}"
  else
    bad "纪律档缺要素锚: ${anchor}"
  fi
done
# 双轨制锚（人面/机面分界——防止纪律被误读到机器账本上）
grep -q '双轨制' "$DOC" 2>/dev/null && ok "纪律档含双轨制（人面/机面分界）" || bad "纪律档缺双轨制节"

# --- ② 生成器接线 ---
grep -q '回复纪律（受控语言）' SKILL.md 2>/dev/null \
  && ok "生成器 SKILL.md 工作原则含回复纪律条" \
  || bad "生成器 SKILL.md 工作原则缺回复纪律条"
grep -q 'controlled-language-methodology' SKILL.md 2>/dev/null \
  && ok "生成器 SKILL.md 路由表登记 controlled-language-methodology" \
  || bad "生成器 SKILL.md 路由表未登记 controlled-language-methodology"

# --- ③ 登记链闭环（G25 三面 + 计数） ---
grep -q 'controlled-language-methodology' references/capability-map.md 2>/dev/null \
  && ok "capability-map 收录（G25② 无孤儿档）" \
  || bad "capability-map 未收录 controlled-language-methodology（G25 孤儿档）"
grep -q 'controlled-language-methodology' references/task-methodology-router.md 2>/dev/null \
  && ok "任务路由表可达（G25⑤ 文档路由覆盖）" \
  || bad "任务路由表不可达 controlled-language-methodology（G25 分派落档）"
sed -n '/^UNIVERSAL_FILES=(/,/^)/p' scripts/generate-skill.sh 2>/dev/null | grep -q 'references/controlled-language-methodology.md' \
  && ok "UNIVERSAL_FILES 随技能分发（G25⑥ 分发面）" \
  || bad "UNIVERSAL_FILES 缺 controlled-language-methodology 分发行（目标技能侧分派悬空）"
_fact=$(grep -m1 '^FACT_REFERENCES=' assets/facts.conf 2>/dev/null | sed 's/^FACT_REFERENCES=//; s/[^0-9].*$//')
_real=$(ls references/*.md 2>/dev/null | wc -l | tr -d ' ')
[[ "${_fact:-0}" == "$_real" ]] \
  && ok "FACT_REFERENCES(${_fact}) 与实际 references 计数一致" \
  || bad "FACT_REFERENCES(${_fact:-未设}) ≠ 实际(${_real})——更新 assets/facts.conf"

# --- ④ 生成物接线（create 实测） ---
GEN_SRC="scripts/generate-skill.sh"
grep -q '回复纪律（全节点通用）' "$GEN_SRC" 2>/dev/null \
  && ok "generate-skill.sh 源内 workflow 骨架含回复纪律锚" \
  || bad "generate-skill.sh workflow 骨架缺回复纪律锚（WFEOF）"
grep -q '回复纪律——面向人的输出用受控语言' "$GEN_SRC" 2>/dev/null \
  && ok "generate-skill.sh 源内产物 SKILL.md 理念行含锚" \
  || bad "generate-skill.sh 产物 SKILL.md 理念行缺回复纪律锚"

TMP="$(mktemp -d /tmp/r100ctl.XXXXXX)"
trap 'rm -rf "${TMP}"' EXIT
DEMO="tests/e2e/java-demo"
# lite 档：受控语言档随发（lite 档位标记生效）
if bash "$GEN_SRC" --profile lite r100lite "$DEMO" "$TMP" >/tmp/r100ctl-lite.log 2>&1; then
  [[ -f "$TMP/r100lite/references/controlled-language-methodology.md" ]] \
    && ok "lite 档产物随发受控语言档" \
    || bad "lite 档产物缺 references/controlled-language-methodology.md（lite 分发位失效）"
  grep -q '回复纪律——面向人的输出用受控语言' "$TMP/r100lite/SKILL.md" 2>/dev/null \
    && ok "lite 档产物 SKILL.md 理念行含回复纪律锚" \
    || bad "lite 档产物 SKILL.md 缺回复纪律锚"
else
  bad "lite 档 create 失败（见 /tmp/r100ctl-lite.log）"
fi
# standard 档：workflow 骨架回复纪律锚 + 骨架完整性不受影响（9 节点仍在）
if bash "$GEN_SRC" --profile standard r100std "$DEMO" "$TMP/.claude/skills" >/tmp/r100ctl-std.log 2>&1; then
  grep -q '回复纪律（全节点通用）' "$TMP/.claude/skills/r100std/references/workflow.md" 2>/dev/null \
    && ok "standard 档 workflow 骨架含回复纪律锚" \
    || bad "standard 档 workflow 骨架缺回复纪律锚"
  _nodes=$(grep -c '^## 节点' "$TMP/.claude/skills/r100std/references/workflow.md" 2>/dev/null || echo 0)
  [[ "$_nodes" == "9" ]] \
    && ok "workflow 骨架 9 节点完整（纪律段未挤占结构）" \
    || bad "workflow 骨架节点数=${_nodes}（期望 9——纪律段破坏了骨架结构）"
else
  bad "standard 档 create 失败（见 /tmp/r100ctl-std.log）"
fi

echo "PASS test-r100-controlled-language (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
