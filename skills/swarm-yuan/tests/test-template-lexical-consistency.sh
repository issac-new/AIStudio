#!/usr/bin/env bash
# test-template-lexical-consistency.sh — R30-D2 守门：模板永久文案不得命中占位符检测词
#
# 真实执勤实证（2026-09-16 R30 Node 栈 shop-api）：--mark-active 卡死三处「填充指引」命中，
# 其一为生成器 heredoc 写进 reference-manual.md 头部的永久性说明 blockquote（含语义/动能两区
# 纪律口径）——verify-completeness 占位符词表（待填充/（待填充）/<占位符>/填充指引）把
# 「骨架未填充痕迹」检测误伤到「填充完成后仍应保留的说明文档」上。AI 按报错做最小动作（删行）
# 连带丢失方法论口径；不删则 --mark-active 永久死锁。
# 修复：永久说明文案统一改词「填充规范」；真占位符（frontmatter description/标题的
# 「（填充指引：…）」——使命就是被 AI 整行替换）保留检测；SKILL.md 交接清单区加显式删除指引；
# _nav_design 行改为指向激活后仍存在的位置（原「下方填充指引」区注定被删）。
# 本测试两层断言：
#   ① 静态：生成器内 blockquote 说明行「> 填充指引」归零；真占位符「（填充指引：」保留 ≥2；
#      _nav_design 行不含「填充指引」；交接清单区标题下紧跟删除指引注释。
#   ② 端到端：tmp 空项目真跑生成（lite）→ --verify-completeness 输出中 references/*.md
#      零「填充指引」命中（模板 emit 的永久文案必须天生过得了自己的检测）。
set -uo pipefail
G="${G:-}"
[[ -n "$G" ]] || G="$(cd "$(dirname "${0}")/.." && pwd)/scripts/generate-skill.sh"
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# --- ① 静态断言 ---
bq=$(grep -c '^> 填充指引' "$G" || true)
[[ "$bq" -eq 0 ]] && ok "① blockquote 永久说明行「> 填充指引」归零" || bad "仍有 ${bq} 行「> 填充指引」blockquote 说明（改词「填充规范」）"
tp=$(grep -c '（填充指引：' "$G" || true)
[[ "$tp" -ge 2 ]] && ok "① 真占位符「（填充指引：」保留 ${tp} 处（description/标题，AI 整行替换语义）" || bad "真占位符不足 2 处（${tp}）——误删会让骨架失去可检测占位"
nav=$(grep -n '_nav_design=' "$G" | grep -c '填充指引' || true)
[[ "$nav" -eq 0 ]] && ok "① _nav_design 行不再引用注定删除的「填充指引」区" || bad "_nav_design 仍引用「填充指引」——激活后指向不存在内容"
guide_note=$(grep -A1 '^## 填充指引' "$G" | grep -c '整区删除' || true)
[[ "$guide_note" -ge 1 ]] && ok "① 交接清单区标题下有显式删除指引" || bad "交接清单区缺删除指引——AI 无从知晓删区是激活终态"

# --- ② 端到端：tmp 空项目真生成（lite）→ verify-completeness 的 references 零误伤 ---
TMP="$(mktemp -d /tmp/tlc.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/app/src"
printf '{"name":"tlc-app","version":"0.0.0","scripts":{"build":"echo b","test":"echo t"}}\n' > "$TMP/app/package.json"
out=$(bash "$G" tlc-dev "$TMP/app" 2>&1)
if [[ ! -d "$TMP/app/.claude/skills/tlc-dev" ]]; then
  bad "② lite 生成失败（无 .claude/skills/tlc-dev）: $(printf '%s' "$out" | tail -2 | tr '\n' ' ')"
else
  vc=$(bash "$G" --verify-completeness "$TMP/app/.claude/skills/tlc-dev" 2>&1)
  ref_hits=$(printf '%s\n' "$vc" | grep 'references/.*填充指引' | grep -vc 'SKILL\.md' || true)
  [[ "$ref_hits" -eq 0 ]] && ok "② 端到端：verify-completeness 报告中 references/*.md 零「填充指引」命中" \
    || bad "② references/*.md 仍有 ${ref_hits} 处模板自缚命中: $(printf '%s\n' "$vc" | grep 'references/.*填充指引' | head -2 | tr '\n' ' ')"
  skill_hits=$(printf '%s\n' "$vc" | grep -c 'SKILL\.md.*填充指引' || true)
  [[ "$skill_hits" -ge 1 ]] && ok "② SKILL.md 交接清单区仍被检出（真待清零项，检测语义未放松）" \
    || bad "② SKILL.md 交接清单区未检出——词表可能被误放松"
fi

[[ $FAIL -eq 0 ]] && { echo "PASS test-template-lexical-consistency"; exit 0; } || { echo "FAIL test-template-lexical-consistency" >&2; exit 1; }
