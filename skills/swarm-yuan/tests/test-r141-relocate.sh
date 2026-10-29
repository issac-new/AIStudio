#!/usr/bin/env bash
# test-r141-relocate.sh — R141 项目根重定位锁（迁移/克隆后 --upgrade）
#
# 背景（实栈实抓）：项目目录整体迁移或克隆到新路径后，技能 precheck.conf 的
# PROJECT_DIR 是 AUTO:detected 旧绝对路径；--upgrade 保留用户配置时未刷新它，
# 门禁会读旧项目的 coverage/target 产物（R141 实抓：clone 内跑门禁却报原目录
# jacoco.xml），覆盖率/测试结论错判。
#
# 锁矩阵：
#   ① 项目内技能迁移 → 升级刷新 PROJECT_DIR/SKILL.md/操作档，旧路径零残留；
#   ② 历史 specs/reviews 不自动改写（证据保留）；
#   ③ 升级幂等：第二次不再报迁移；
#   ④ 外部 target-dir → 只告警不自动改写（防误改他项目技能）。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
GEN="$BASE/scripts/generate-skill.sh"
TMP="$(mktemp -d /tmp/r141-relocate.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $*"; }
bad() { echo "  ✗ $*" >&2; FAIL=1; }

mkproj() {  # $1=dir
  mkdir -p "$1/src"
  printf '[package]\nname = "reloc"\nversion = "0.1.0"\nedition = "2021"\n' > "$1/Cargo.toml"
  printf 'fn main() {}\n' > "$1/src/main.rs"
  printf '# demo\n' > "$1/README.md"
}

A="$TMP/old-place/reloc-proj"; mkproj "$A"
# target-dir 显式钉住 .claude/skills（测试聚焦迁移语义，不随默认落点变化；2026-10-29 起默认 .agent/skills）
bash "$GEN" --profile lite reloc "$A" "$A/.claude/skills" >/dev/null 2>&1 || { bad "前置: 生成失败"; exit 1; }
SD_A="$A/.claude/skills/reloc"
[[ -f "$SD_A/scripts/precheck.conf" ]] && ok "前置: 技能就位" || { bad "前置: 缺 precheck.conf"; exit 1; }
grep -q "^PROJECT_DIR=$A" "$SD_A/scripts/precheck.conf" && ok "前置: PROJECT_DIR=旧路径" || bad "前置: PROJECT_DIR 非预期"
# 在操作档里植入旧路径（recipes 常含项目根命令示例）
printf '\n- 前置查询：bash scripts/relations-query.sh %s --field amount\n' "$A" >> "$SD_A/references/recipes.md"
# 历史证据档（不应被改写）
mkdir -p "$A/docs/specs"
printf '# spec\n\n证据路径：%s/src/main.rs\n' "$A" > "$A/docs/specs/history.md"

# ===== ① 迁移：复制整个项目到新路径，升级刷新 =====
B="$TMP/new-place/reloc-proj"; mkdir -p "$(dirname "$B")"; cp -Rp "$A" "$B"
out=$(bash "$GEN" --upgrade reloc "$B" 2>&1); rc=$?
[[ "$rc" -eq 0 ]] && ok "①a 迁移后升级 rc 0" || bad "①a 升级失败 rc=${rc}：$(printf '%s' "$out" | tail -2)"
printf '%s' "$out" | grep -q '项目根已迁移' && ok "①b 升级披露项目根迁移" || bad "①b 未披露迁移"
grep -q "^PROJECT_DIR=$B" "$B/.claude/skills/reloc/scripts/precheck.conf" \
  && ok "①c precheck.conf PROJECT_DIR 已刷新" || bad "①c PROJECT_DIR 未刷新"
grep -q "| 项目根 | $B |" "$B/.claude/skills/reloc/SKILL.md" \
  && ok "①d SKILL.md 项目根已刷新" || bad "①d SKILL.md 项目根未刷新"
if grep -rqF "$A" "$B/.claude/skills/reloc" --exclude-dir='.upgrade-backup-*' --exclude-dir=effects 2>/dev/null; then
  bad "①e 技能操作档仍含旧路径：$(grep -rlF "$A" "$B/.claude/skills/reloc" --exclude-dir='.upgrade-backup-*' --exclude-dir=effects | head -3 | tr '\n' ' ')"
else
  ok "①e 技能操作档旧路径零残留"
fi

# ===== ② 历史证据保留 =====
grep -qF "$A" "$B/docs/specs/history.md" && ok "② 历史 specs 保留原路径（证据不篡改）" || bad "② 历史证据被改写"

# ===== ③ 幂等：再次升级不报迁移 =====
out2=$(bash "$GEN" --upgrade reloc "$B" 2>&1)
printf '%s' "$out2" | grep -q '项目根已迁移' && bad "③ 二次升级重复报迁移（非幂等）" || ok "③ 二次升级不再报迁移（幂等）"

# ===== ④ 外部 target-dir：只告警不改写 =====
C="$TMP/other/proj-c"; mkproj "$C"
EXT="$TMP/external-skills"
bash "$GEN" --profile lite reloc "$A" "$EXT" >/dev/null 2>&1 || true
SD_EXT="$EXT/reloc"
if [[ -f "$SD_EXT/scripts/precheck.conf" ]]; then
  out3=$(bash "$GEN" --upgrade reloc "$C" "$EXT" 2>&1)
  if printf '%s' "$out3" | grep -q '技能目录不在新项目根内'; then
    ok "④a 外部 target-dir 告警不自动改写"
  else
    bad "④a 外部 target-dir 未告警"
  fi
  grep -q "^PROJECT_DIR=$A" "$SD_EXT/scripts/precheck.conf" \
    && ok "④b 外部技能 PROJECT_DIR 保持原值（不误改）" || bad "④b 外部技能 PROJECT_DIR 被改写"
else
  ok "④ skip：外部 target-dir 生成形态不适用（不阻断）"
fi

echo "test-r141-relocate: $([[ $FAIL -eq 0 ]] && echo PASS || echo FAIL)"
[ "$FAIL" -eq 0 ]
