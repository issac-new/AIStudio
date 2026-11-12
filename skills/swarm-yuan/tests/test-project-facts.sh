#!/usr/bin/env bash
# test-project-facts.sh — 事实层脚本 project-facts.sh 测试（P2-12a/12b 根治，2026-11-12）
# 覆盖：四维机械计数 / 全维缺席 fail-soft / as_of 戳（git 与非 git）/ 符号链接拒绝 / 重跑刷新。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="assets/project-facts.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/pf-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# --- 态 1：四维正向计数（git 仓 + 全维源在位） ---
mkdir -p "$TMP/proj/docs/superpowers/specs" "$TMP/proj/patches" "$TMP/proj/.qgate" "$TMP/proj/vendor" "$TMP/skill/references"
printf 'a\n' > "$TMP/proj/docs/superpowers/specs/2026-01-01-aa.md"
printf 'b\n' > "$TMP/proj/docs/superpowers/specs/2026-01-02-bb.md"
printf '# 注释\n\n001-x.patch\n002-y.patch\n003-z.patch\n' > "$TMP/proj/patches/series"
cat > "$TMP/proj/.qgate/junit-report.xml" <<'X'
<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="42" failures="0" errors="0" time="1.0">
    <testsuite name="a" tests="42" failures="0" errors="0" skipped="0" time="1.0">
    </testsuite>
</testsuites>
X
cat > "$TMP/proj/vendor/VENDOR.md" <<'X'
# vendor/ 上游基线台账

| 树 | commit | 版本 | remote |
|---|---|---|---|
| hermes-studio | `cedaceae` | v0.8.20（tag 说明长文） | https://x |
| hermes-agent | `3b421578` | v0.23.1 | https://y |
| zcode | `b95ebaff` | 包版本 3.18.0（谱系 v3.16.1 系列） | 本地 |
X
( cd "$TMP/proj" && git init -q && git -c user.email=t@t -c user.name=t add -A && git -c user.email=t@t -c user.name=t commit -qm x ) >/dev/null 2>&1
out=$(bash "$SH" "$TMP/skill" "$TMP/proj" 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态1 exit 0" || bad "态1 exit=$rc: $out"
F="$TMP/skill/references/project-facts.md"
[[ -f "$F" ]] && ok "态1 事实层文件存在" || bad "态1 文件未写入"
head -1 "$F" | grep -qE '^as_of: [0-9]{4}-[0-9]{2}-[0-9]{2} @ [0-9a-f]{7,}$' \
  && ok "态1 首行 as_of 戳（日期 @ git HEAD）" || bad "态1 首行格式错: $(head -1 "$F")"
awk -F'|' '/\| specs \|/{v=$(NF-1); gsub(/^[ \t]+|[ \t]+$/, "", v); print v}' "$F" | grep -qx '2' \
  && ok "态1 specs=2" || bad "态1 specs 值错: $(grep '| specs |' "$F")"
awk -F'|' '/\| patches \|/{v=$(NF-1); gsub(/^[ \t]+|[ \t]+$/, "", v); print v}' "$F" | grep -qx '3' \
  && ok "态1 patches=3（注释/空行不计）" || bad "态1 patches 值错: $(grep '| patches |' "$F")"
grep -q '| tests |' "$F" && grep '| tests |' "$F" | grep -q '42（failures=0，errors=0）' \
  && ok "态1 tests=42（failures=0，errors=0）" || bad "态1 tests 值错: $(grep '| tests |' "$F")"
grep -q '| vendor |' "$F" && grep '| vendor |' "$F" | grep -q 'hermes-studio=v0.8.20；hermes-agent=v0.23.1；zcode=3.18.0' \
  && ok "态1 vendor 三树版本 token 命中" || bad "态1 vendor 值错: $(grep '| vendor |' "$F")"
# 无临时候选残留（原子写收尾干净）
ls "$TMP/skill/references/" | grep -q '^\.project-facts\.' \
  && bad "态1 候选文件残留" || ok "态1 无候选残留"

# --- 态 2：重跑刷新（specs 增 1 → 值跟随；as_of 机制 = 数字不冻结） ---
printf 'c\n' > "$TMP/proj/docs/superpowers/specs/2026-01-03-cc.md"
bash "$SH" "$TMP/skill" "$TMP/proj" >/dev/null 2>&1
awk -F'|' '/\| specs \|/{v=$(NF-1); gsub(/^[ \t]+|[ \t]+$/, "", v); print v}' "$F" | grep -qx '3' \
  && ok "态2 重跑后 specs=3（现算不冻结）" || bad "态2 specs 未刷新: $(grep '| specs |' "$F")"

# --- 态 3：全维缺席 fail-soft（空项目 → 全「未采集」且 exit 0） ---
mkdir -p "$TMP/proj3" "$TMP/skill3/references"
printf '{"name":"x"}\n' > "$TMP/proj3/package.json"
out=$(bash "$SH" "$TMP/skill3" "$TMP/proj3" 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态3 空项目 exit 0" || bad "态3 exit=$rc: $out"
F3="$TMP/skill3/references/project-facts.md"
_n=$(grep -c '未采集' "$F3" 2>/dev/null || true)
[[ "$_n" -eq 4 ]] && ok "态3 四维全「未采集」" || bad "态3 未采集计数=${_n}（期望 4）: $(cat "$F3" 2>/dev/null)"
head -1 "$F3" | grep -qE '^as_of: [0-9]{4}-[0-9]{2}-[0-9]{2} @ unknown$' \
  && ok "态3 非 git 项目 HEAD=unknown（显式不猜）" || bad "态3 首行格式错: $(head -1 "$F3")"

# --- 态 4：VENDOR 表行无版本 token → 该树「未采集」，其余树正常 ---
mkdir -p "$TMP/proj4/vendor" "$TMP/skill4/references"
cat > "$TMP/proj4/vendor/VENDOR.md" <<'X'
| 树 | commit | 版本 | remote |
|---|---|---|---|
| tree-a | `aaa` | v1.2.3 | x |
| tree-b | `bbb` | （未定版） | y |
X
bash "$SH" "$TMP/skill4" "$TMP/proj4" >/dev/null 2>&1
grep '| vendor |' "$TMP/skill4/references/project-facts.md" | grep -q 'tree-a=v1.2.3；tree-b=未采集' \
  && ok "态4 无 token 树=未采集" || bad "态4 vendor 值错: $(grep '| vendor |' "$TMP/skill4/references/project-facts.md")"

# --- 态 5：符号链接拒绝（目标文件/references 目录为链接 → exit 1 不越写） ---
mkdir -p "$TMP/proj5" "$TMP/skill5/references" "$TMP/outside"
printf 'sentinel\n' > "$TMP/outside/target.md"
ln -s "$TMP/outside/target.md" "$TMP/skill5/references/project-facts.md"
out=$(bash "$SH" "$TMP/skill5" "$TMP/proj5" 2>&1); rc=$?
[[ $rc -eq 1 ]] && ok "态5 目标符号链接拒绝 exit 1" || bad "态5 exit=$rc: $out"
grep -q 'sentinel' "$TMP/outside/target.md" \
  && ok "态5 链接目标未被改写" || bad "态5 链接目标被污染"

# --- 态 6：参数错误 → exit 1 ---
out=$(bash "$SH" 2>&1); rc=$?
[[ $rc -eq 1 ]] && ok "态6 缺参数 exit 1" || bad "态6 exit=$rc"
out=$(bash "$SH" "$TMP/no-such-skill" "$TMP/proj3" 2>&1); rc=$?
[[ $rc -eq 1 ]] && ok "态6 技能目录缺失 exit 1" || bad "态6 exit=$rc"

[[ $FAIL -eq 0 ]] && { echo "PASS test-project-facts"; exit 0; } || { echo "FAIL test-project-facts" >&2; exit 1; }
