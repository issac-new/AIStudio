#!/bin/bash
# test-lessons-preserve.sh — EvoTeam 批（2026-11-08）回归锚：轮间教训文件与 SKILL.md 手加行
# 在 --upgrade 后字节级保留。
#
# 背景：references/lessons.md 由 mx-retro-sink 每轮追加（项目内容，模板无此文件）；SKILL.md
# 的 lessons 入口行为手加。实测定谳：upgrade 走 RESUME=1，SKILL.md 整体跳过重写、
# UNIVERSAL_FILES 外路径不被模板触碰——本测试把这个结论钉成守门（将来重写策略重构时
# 此处先红），并覆盖 PROJECT_SPECIFIC_FILES 显式登记路径。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
GEN="scripts/generate-skill.sh"
TMP="$(mktemp -d /tmp/lessons.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# --- 最小目标项目（test-upgrade-hygiene 同款） ---
PROJ="$TMP/demo-proj"
mkdir -p "$PROJ/src"
cat > "$PROJ/package.json" <<'EOF'
{ "name": "demo-proj", "version": "1.0.0", "dependencies": { "express": "^4.19.0" } }
EOF
echo "console.log('demo');" > "$PROJ/src/index.js"
git -C "$PROJ" init -q
git -C "$PROJ" config user.email t@t.local
git -C "$PROJ" config user.name t
git -C "$PROJ" add -A
git -C "$PROJ" commit -qm init

# --- 1. create 骨架 ---
out=$(bash "$GEN" demo-proj "$PROJ" "$PROJ/.claude/skills" 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "create exit 0" || { bad "create exit=$rc: $(echo "$out" | tail -3)"; exit 1; }
SKILL_DIR="$PROJ/.claude/skills/demo-proj"
[[ -f "$SKILL_DIR/SKILL.md" ]] && ok "SKILL.md 生成" || { bad "SKILL.md 缺失"; exit 1; }

# --- 2. 手写项目内容：lessons.md（retro-sink 形态）＋ SKILL.md 手加入口行 ---
mkdir -p "$SKILL_DIR/references"
cat > "$SKILL_DIR/references/lessons.md" <<'EOF'
# aipaydev 轮间教训（自动沉淀）

## 2026-11-08 轮间沉淀（源：demo-retro.md）

- 改进项 F1：审批臂扫描窗 20 条太窄，请求滚页卡死
- 根因：agent 会话静默消失无复活通道
EOF
LESSONS_MD5=$(md5 -q "$SKILL_DIR/references/lessons.md")
MARKER='**轮间教训（lessons.md）**：references/lessons.md 由 mx-retro-sink 自动追加，开工前先读。'
grep -qF "$MARKER" "$SKILL_DIR/SKILL.md" || echo "$MARKER" >> "$SKILL_DIR/SKILL.md"
SKILL_MD5=$(md5 -q "$SKILL_DIR/SKILL.md")

# --- 3. 登记面：PROJECT_SPECIFIC_FILES 含 lessons.md（显式声明单一事实源） ---
grep -q '"references/lessons.md"' scripts/generate-skill.sh && ok "PROJECT_SPECIFIC_FILES 已登记 lessons.md" || bad "PROJECT_SPECIFIC_FILES 未登记"

git -C "$PROJ" add -A
git -C "$PROJ" commit -qm content

# --- 4. upgrade → 两文件字节级保留 ---
out=$(bash "$GEN" --upgrade demo-proj "$PROJ" 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "upgrade exit 0" || bad "upgrade exit=$rc: $(echo "$out" | tail -3)"
[[ "$(md5 -q "$SKILL_DIR/references/lessons.md")" == "$LESSONS_MD5" ]] \
  && ok "lessons.md 字节级保留" || bad "lessons.md 被 upgrade 改写"
grep -qF "$MARKER" "$SKILL_DIR/SKILL.md" \
  && ok "SKILL.md 手加行保留" || bad "SKILL.md 手加行被 upgrade 洗掉"
[[ "$(md5 -q "$SKILL_DIR/SKILL.md")" == "$SKILL_MD5" ]] \
  && ok "SKILL.md 整体字节级保留（RESUME 守卫）" || bad "SKILL.md 被改写"

# --- 5. 二次 upgrade 幂等 ---
bash "$GEN" --upgrade demo-proj "$PROJ" >/dev/null 2>&1
[[ "$(md5 -q "$SKILL_DIR/references/lessons.md")" == "$LESSONS_MD5" ]] \
  && ok "二次 upgrade 幂等" || bad "二次 upgrade 改写 lessons.md"

[[ "$FAIL" -eq 0 ]] && echo 'PASS lessons-preserve（lessons.md/SKILL.md 手改在 upgrade 后保留）'
exit "$FAIL"
