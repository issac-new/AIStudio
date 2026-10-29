#!/usr/bin/env bash
# test-spec-template-gating.sh — spec-template §14-18 profile 门控测试（WP-P5/M5）
# 态1: lite 生成产物无 §14-§18、保留 §13/§19
# 态2: compliance 生成产物保留 §14-§18
# 态3: lite 产物无 profile-gate 门控注释残留
# 附带: standard 与 lite 同裁剪（§14 缺、§19 留）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d /tmp/stgtest.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# R118：在临时副本上生成，避免中断/失败时把 .claude/skills 残留写进仓库 fixture。
SRC_FIX="tests/fixtures/gin"
FIX="$TMP/gin"
cp -R "$SRC_FIX" "$FIX"

# 态 1：lite profile 生成的 skill 的 spec-template 无 §14-§18
# 注：--profile 必须置于位置参数之前（generate-skill.sh 仅在前导 --* 上消费 flag）
mkdir -p "$FIX/.claude/skills"  # 显式 .claude 布局（不随默认落点变化）
bash scripts/generate-skill.sh --profile lite demolite "$FIX" >/dev/null 2>&1
tpl="$FIX/.claude/skills/demolite/assets/spec-template.md"
[[ -f "$tpl" ]] && ok "lite spec-template 落盘" || bad "lite spec-template 缺失"
grep -q '## 14\. ★交付衰减分析' "$tpl" && bad "lite 不应含 §14" || ok "lite 无 §14"
grep -q '## 19\. ★测试左移' "$tpl" && ok "lite 保留 §19" || bad "lite 缺 §19"
grep -q '## 13\. 参考资料' "$tpl" && ok "lite 保留 §13" || bad "lite 缺 §13"

# 态 2：compliance profile 保留 §14-§18
bash scripts/generate-skill.sh --profile compliance democomp "$FIX" >/dev/null 2>&1
tplc="$FIX/.claude/skills/democomp/assets/spec-template.md"
[[ -f "$tplc" ]] && ok "compliance spec-template 落盘" || bad "compliance spec-template 缺失"
grep -q '## 14\. ★交付衰减分析' "$tplc" && ok "compliance 含 §14" || bad "compliance 缺 §14"
grep -q '## 18\. ★领域知识约束' "$tplc" && ok "compliance 含 §18" || bad "compliance 缺 §18"

# 态 3：门控标记注释不泄漏到产物（裁剪后 lite 产物无 profile-gate 注释）
grep -q 'profile-gate' "$tpl" && bad "lite 产物残留门控注释" || ok "lite 无门控注释残留"

# 附带：standard 与 lite 同裁剪
bash scripts/generate-skill.sh --profile standard demostd "$FIX" >/dev/null 2>&1
tpls="$FIX/.claude/skills/demostd/assets/spec-template.md"
[[ -f "$tpls" ]] && ok "standard spec-template 落盘" || bad "standard spec-template 缺失"
grep -q '## 14\. ★交付衰减分析' "$tpls" && bad "standard 不应含 §14" || ok "standard 无 §14"
grep -q '## 19\. ★测试左移' "$tpls" && ok "standard 保留 §19" || bad "standard 缺 §19"
grep -q 'profile-gate' "$tpls" && bad "standard 产物残留门控注释" || ok "standard 无门控注释残留"

# 清理生成产物（含 generate-skill 创建的 .claude/skills 父目录，保持 fixture 干净）
rm -rf "$FIX/.claude/skills/demolite" "$FIX/.claude/skills/democomp" "$FIX/.claude/skills/demostd"
rmdir "$FIX/.claude/skills" "$FIX/.claude" 2>/dev/null || true

[[ $FAIL -eq 0 ]] && { echo "PASS test-spec-template-gating"; exit 0; } || { echo "FAIL test-spec-template-gating" >&2; exit 1; }
