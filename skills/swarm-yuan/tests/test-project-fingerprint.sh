#!/usr/bin/env bash
# test-project-fingerprint.sh — project-fingerprint.sh + generate-skill.sh --refresh 测试（WP-Q3-1）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/project-fingerprint.sh"
GEN="scripts/generate-skill.sh"
TMP="$(mktemp -d /tmp/q3test.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# --- 态 1：算+落盘 ---
mkdir -p "$TMP/proj/src" "$TMP/proj/docs"
printf 'def a(): pass\n' > "$TMP/proj/src/a.py"
printf 'const x = 1\n' > "$TMP/proj/src/b.ts"
printf '# docs\n' > "$TMP/proj/docs/README.md"

out=$(bash "$SH" "$TMP/proj" --write 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态1 落盘 exit 0" || bad "态1 exit=$rc: $out"
[[ -f "$TMP/proj/.swarm-yuan/project-fingerprint" ]] && ok "态1 指纹文件存在" || bad "态1 指纹未写入"

# --- 态 2：--diff 无变化 → quiet 静默 ---
out=$(bash "$SH" "$TMP/proj" --diff --quiet 2>&1); rc=$?
[[ $rc -eq 0 && -z "$out" ]] && ok "态2 无变化 quiet 静默" || bad "态2 exit=$rc out=[$out]"

# --- 态 3：加文件 → 有变化输出 ---
printf 'fn x() {}\n' > "$TMP/proj/src/e.rs"
out=$(bash "$SH" "$TMP/proj" --diff 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态3 有变化 exit 0" || bad "态3 exit=$rc"
echo "$out" | grep -q '⚠ 项目源码已变化' && ok "态3 变化警示行命中" || bad "态3 缺警示行: $out"
echo "$out" | grep -q '+ .rs 新增' && ok "态3 .rs 新增命中" || bad "态3 缺新增行: $out"
echo "$out" | grep -qE '文件数:.*3 → 4' && ok "态3 文件数 4→5 命中" || bad "态3 文件数不符: $out"

# --- 态 4：± 数量变化（加既有扩展名）---
rm "$TMP/proj/src/e.rs"
printf 'const y = 2\n' > "$TMP/proj/src/b2.ts"
# 重置基线
bash "$SH" "$TMP/proj" --write >/dev/null
printf 'const z = 3\n' > "$TMP/proj/src/b3.ts"
out=$(bash "$SH" "$TMP/proj" --diff 2>&1)
echo "$out" | grep -qE '± .ts：2 → 3' && ok "态4 ±.ts 2→3 命中" || bad "态4 缺±行: $out"

# --- 态 5：generate-skill.sh --refresh 无变化 → exit 0 ---
# 先 reset：清掉 b3.ts 让 proj 回到当前指纹基线
rm -f "$TMP/proj/src/b3.ts"
bash "$SH" "$TMP/proj" --write >/dev/null
mkdir -p "$TMP/skill5/references" "$TMP/skill5/scripts"
cat > "$TMP/skill5/SKILL.md" <<EOF2
---
name: t
description: t
status: draft
---
EOF2
cat > "$TMP/skill5/scripts/precheck.conf" <<EOF2
PROJECT_DIR="$TMP/proj"
EOF2
out=$(bash "$GEN" --refresh "$TMP/skill5" 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态5 --refresh 无变化 exit 0" || bad "态5 exit=$rc: $out"
echo "$out" | grep -q '✓ 无变化' && ok "态5 无变化行命中" || bad "态5 缺无变化行: $out"

# --- 态 6：generate-skill.sh --refresh 有变化 → 提示完整更新链（WP-R2-2 升级） ---
printf 'fn z() {}\n' > "$TMP/proj/src/f.rs"
out=$(bash "$GEN" --refresh "$TMP/skill5" 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态6 --refresh 有变化 exit 0" || bad "态6 exit=$rc"
echo "$out" | grep -q '→ 检测到变化，更新链' && ok "态6 更新链提示命中" || bad "态6 缺更新链提示: $out"
echo "$out" | grep -q '重探查变化维度' && ok "态6 含重探查指引" || bad "态6 缺重探查指引: $out"

# --- 态 7：--refresh --commit-fp 落新基线 → 再 --refresh 无变化 ---
out=$(bash "$GEN" --refresh "$TMP/skill5" --commit-fp 2>&1); rc=$?
echo "$out" | grep -q -- '--commit-fp' && ok "态7 commit-fp 行命中" || bad "态7 缺 commit-fp 行"
out2=$(bash "$GEN" --refresh "$TMP/skill5" 2>&1); rc=$?
echo "$out2" | grep -q '✓ 无变化' && ok "态7 commit 后无变化命中" || bad "态7 二次 refresh 仍有变化: $out2"

# --- 态 8：skill conf 缺 PROJECT_DIR → exit 1 ---
mkdir -p "$TMP/skill8/scripts"
cat > "$TMP/skill8/SKILL.md" <<EOF2
---
status: draft
---
EOF2
echo "" > "$TMP/skill8/scripts/precheck.conf"
out=$(bash "$GEN" --refresh "$TMP/skill8" 2>&1); rc=$?
[[ $rc -eq 1 ]] && ok "态8 缺 PROJECT_DIR exit 1" || bad "态8 exit=$rc"

# --- 态 9：元数据文件不纳入指纹（.swarm-yuan/.claude 排除） ---
mkdir -p "$TMP/proj/.swarm-yuan" "$TMP/proj/.claude"
printf 'junk\n' > "$TMP/proj/.swarm-yuan/decisions.jsonl"
printf 'junk\n' > "$TMP/proj/.claude/notes.md"
# 先重置基线（含 rs）
bash "$SH" "$TMP/proj" --write >/dev/null
out=$(bash "$SH" "$TMP/proj" --diff --quiet 2>&1); rc=$?
[[ -z "$out" ]] && ok "态9 元数据忽略 → 无变化静默" || bad "态9 元数据被算入: $out"

# --- 态 10：目录被排除（node_modules/.git） ---
mkdir -p "$TMP/proj/node_modules/xyz" "$TMP/proj/.git/objects"
printf 'junk\n' > "$TMP/proj/node_modules/xyz/pkg.js"
printf 'junk\n' > "$TMP/proj/.git/objects/ab"
bash "$SH" "$TMP/proj" --write >/dev/null
out=$(bash "$SH" "$TMP/proj" --diff --quiet 2>&1); rc=$?
[[ -z "$out" ]] && ok "态10 node_modules/.git 忽略" || bad "态10 未忽略: $out"

# --- 态 11：--diff 无变化非 quiet（WP-R2-1：113 行 $var+多字节 UTF-8 locale 崩溃回归）---
# 态2 只测了 --quiet（[[ 短路不展开 echo），这条例行走"✓ 无变化（文件数=${_tot_b}..."输出路径。
# bash 3.2 + UTF-8 locale 下 $var 紧跟多字节字符会把其首字节吞进变量名 → set -u unbound 崩溃。
out=$(bash "$SH" "$TMP/proj" --diff 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态11 无变化非quiet exit 0" || bad "态11 exit=$rc: $out"
echo "$out" | grep -q '✓ 无变化' && ok "态11 无变化行命中" || bad "态11 缺无变化行: $out"

# --- 态 12：无基线 --diff（WP-R2-1：76 行 $FP_FILE+多字节崩溃回归 + --refresh 假阴性回归）---
mkdir -p "$TMP/proj12/src"
printf 'def a(): pass\n' > "$TMP/proj12/src/a.py"
out=$(bash "$SH" "$TMP/proj12" --diff 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态12 无基线 exit 0" || bad "态12 exit=$rc: $out"
echo "$out" | grep -q '无既有指纹' && ok "态12 无基线提示命中" || bad "态12 缺无基线提示: $out"
# --refresh 在无基线时不得报"无变化"（假阴性）——应透出"无既有指纹"
mkdir -p "$TMP/skill12/scripts"
printf -- "---\nname: t\nstatus: active\n---\n" > "$TMP/skill12/SKILL.md"
echo "PROJECT_DIR=\"$TMP/proj12\"" > "$TMP/skill12/scripts/precheck.conf"
out=$(bash "$GEN" --refresh "$TMP/skill12" 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态12 --refresh 无基线 exit 0" || bad "态12 --refresh exit=$rc: $out"
if echo "$out" | grep -q '✓ 无变化'; then
  bad "态12 --refresh 无基线假阴性（报无变化）: $out"
else
  ok "态12 --refresh 无基线不假阴性"
fi
echo "$out" | grep -q '无指纹基线' && ok "态12 --refresh 无基线提示命中" || bad "态12 --refresh 缺无基线提示: $out"
# --commit-fp 在无基线场景落基线 → 再 --refresh 走正常无变化路径
out=$(bash "$GEN" --refresh "$TMP/skill12" --commit-fp 2>&1); rc=$?
echo "$out" | grep -q -- '--commit-fp' && ok "态12 无基线 commit-fp 落盘" || bad "态12 无基线 commit-fp 未落盘: $out"
[[ -f "$TMP/proj12/.swarm-yuan/project-fingerprint" ]] && ok "态12 基线文件已建" || bad "态12 基线文件未建"
out2=$(bash "$GEN" --refresh "$TMP/skill12" 2>&1)
echo "$out2" | grep -q '✓ 无变化' && ok "态12 落基线后无变化命中" || bad "态12 落基线后仍异常: $out2"

# --- 态 13：WP-R12-C 目录级 scope 报告（~ 内容变化 / + 新增目录 / - 消失目录） ---
mkdir -p "$TMP/proj13/src" "$TMP/proj13/legacy"
printf 'def a(): pass\n' > "$TMP/proj13/src/a.py"
printf 'def old(): pass\n' > "$TMP/proj13/legacy/old.py"
bash "$SH" "$TMP/proj13" --write >/dev/null
# ① src 内容变化（加文件）② 新增 lib 目录 ③ legacy 目录消失
printf 'def b(): pass\n' > "$TMP/proj13/src/b.py"
mkdir -p "$TMP/proj13/lib" && printf 'def c(): pass\n' > "$TMP/proj13/lib/c.py"
rm -rf "$TMP/proj13/legacy"
out=$(bash "$SH" "$TMP/proj13" --diff 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态13 有变化 exit 0" || bad "态13 exit=$rc: $out"
echo "$out" | grep -q '变化目录（scope' && ok "态13 变化目录段命中" || bad "态13 缺变化目录段: $out"
echo "$out" | grep -q '~ src' && ok "态13 ~ src 内容变化命中" || bad "态13 缺 ~ src: $out"
echo "$out" | grep -q '+ lib' && ok "态13 + lib 新增目录命中" || bad "态13 缺 + lib: $out"
echo "$out" | grep -q -- '- legacy' && ok "态13 - legacy 消失目录命中" || bad "态13 缺 - legacy: $out"

# --- 态 14：dir_cksums 入指纹文件 + 无变化时不报目录段 ---
grep -q '^dir_cksums=' "$TMP/proj13/.swarm-yuan/project-fingerprint" && ok "态14 基线含 dir_cksums" || bad "态14 基线缺 dir_cksums"
bash "$SH" "$TMP/proj13" --write >/dev/null
out=$(bash "$SH" "$TMP/proj13" --diff 2>&1)
echo "$out" | grep -q '变化目录' && bad "态14 无变化误报目录段: $out" || ok "态14 无变化不报目录段"
# 顶层散文件归 _root 组
mkdir -p "$TMP/proj14/src"
printf 'def a(): pass\n' > "$TMP/proj14/src/a.py"
printf 'readme\n' > "$TMP/proj14/README.md"
bash "$SH" "$TMP/proj14" --write >/dev/null
grep -q 'dir_cksum\[_root\]' "$TMP/proj14/.swarm-yuan/project-fingerprint" && ok "态14 顶层散文件归 _root 组" || bad "态14 缺 _root 组"

# --- 态 15：WP-R3-2 last-good 红线（--diff 预警 + --write 拒绝 + --force 放行 + <50% 不拦）---
mkdir -p "$TMP/proj15"/{src,lib,test,docs,conf}
for d in src lib test docs conf; do
  for i in 1 2 3 4 5; do printf '// x\n' > "$TMP/proj15/$d/f$i.ts"; done
done
bash "$SH" "$TMP/proj15" --write >/dev/null   # 基线 25 文件
rm "$TMP/proj15/src"/f*.ts "$TMP/proj15/lib"/f*.ts "$TMP/proj15/test"/f*.ts   # 删 15 个（-60%）
out=$(bash "$SH" "$TMP/proj15" --diff 2>&1); rc=$?
echo "$out" | grep -q 'last-good 红线预警' && ok "态15 --diff 触发 last-good 预警" || bad "态15 --diff 缺预警: $out"
echo "$out" | grep -q -- '-60.0%' && ok "态15 预警含百分比" || bad "态15 预警缺百分比: $out"
# --write 无 --force 应拒绝
out=$(bash "$SH" "$TMP/proj15" --write 2>&1); rc=$?
[[ $rc -eq 1 ]] && ok "态15 --write 无 --force exit 1" || bad "态15 --write exit=$rc: $out"
echo "$out" | grep -q 'last-good 红线' && ok "态15 --write 拒绝含红线提示" || bad "态15 --write 缺红线提示: $out"
# 基线应未被覆盖（last-good 保留）
grep -q '^total=25' "$TMP/proj15/.swarm-yuan/project-fingerprint" && ok "态15 旧基线保留（total=25）" || bad "态15 基线被覆盖"
# --write --force 应放行
out=$(bash "$SH" "$TMP/proj15" --write --force 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态15 --write --force exit 0" || bad "态15 --force exit=$rc: $out"
grep -q '^total=10' "$TMP/proj15/.swarm-yuan/project-fingerprint" && ok "态15 --force 落新基线 total=10" || bad "态15 基线未更新"
# 继续删 3 个（10→7，-30% < 50%）→ 不拦截
rm "$TMP/proj15/docs"/f1.ts "$TMP/proj15/docs"/f2.ts "$TMP/proj15/docs"/f3.ts
out=$(bash "$SH" "$TMP/proj15" --write 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态15 -30% 不触发红线（--write 直通）" || bad "态15 -30% 误拦: $out"

# --- 态 16（R33-D6 回归锚）：Maven target/ 构建产物不进指纹（排除链补 target/.gradle/venv）---
mkdir -p "$TMP/proj16/src" "$TMP/proj16/target/classes"
printf 'x\n' > "$TMP/proj16/src/Main.java"
for i in 1 2 3 4 5; do printf 'class C%s{}\n' "$i" > "$TMP/proj16/target/classes/C$i.class"; done
printf 'z\n' > "$TMP/proj16/target/inventory.jar"
out=$(bash "$SH" "$TMP/proj16" --write 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态16 --write exit 0" || bad "态16 exit=$rc: $out"
grep -q '^total=1' "$TMP/proj16/.swarm-yuan/project-fingerprint" \
  && ok "态16 target/ 构建产物不计入指纹（total=1 仅 src/Main.java）" || bad "态16 构建产物漏排: $(head -1 "$TMP/proj16/.swarm-yuan/project-fingerprint")"
# 模拟 mvn build 后 --diff 不误报
printf 'class C9{}\n' > "$TMP/proj16/target/classes/C9.class"
out=$(bash "$SH" "$TMP/proj16" --diff 2>&1)
echo "$out" | grep -q '无变化' && ok "态16 构建产物新增后 --diff 不误报" || bad "态16 构建噪音误报: $out"

[[ $FAIL -eq 0 ]] && { echo "PASS test-project-fingerprint"; exit 0; } || { echo "FAIL test-project-fingerprint" >&2; exit 1; }
