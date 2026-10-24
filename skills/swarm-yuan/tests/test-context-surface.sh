#!/usr/bin/env bash
# test-context-surface.sh — context-surface.sh 双态测试（WP-P0）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1   # swarm-yuan 根
SH="scripts/context-surface.sh"
TMP=$(mktemp -d /tmp/cstest.XXXXXX)
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# --- 态 1：--files 已知文件，字节/行数精确断言 ---
mkdir -p "$TMP/files"
printf 'abc\n' > "$TMP/files/a.md"   # 4 bytes, 1 line
printf 'x'      > "$TMP/files/b.md"   # 1 byte, 0 lines
out=$(bash "$SH" --files "$TMP/files/a.md" "$TMP/files/b.md")
echo "$out" | grep -qF "4	1	" && ok "--files a.md 字节/行数" || bad "--files a.md 行缺失: $out"
echo "$out" | grep -qF "1	0	" && ok "--files b.md 字节/行数" || bad "--files b.md 行缺失"
echo "$out" | grep -qF "5	1	TOTAL" && ok "TOTAL 合计" || bad "TOTAL 错误: $(echo "$out" | tail -1)"

# --- 态 2：缺失文件 → MISSING 行，exit 0（fail-open）---
out=$(bash "$SH" --files "$TMP/files/a.md" "$TMP/files/nope.md")
rc=$?
[[ $rc -eq 0 ]] && ok "缺失文件 exit 0" || bad "缺失文件 exit=$rc"
echo "$out" | grep -qF "MISSING	MISSING	" && ok "MISSING 行" || bad "MISSING 行缺失"

# --- 态 3：--skill 目录双态 ---
mkdir -p "$TMP/skill/references"
printf 's\n' > "$TMP/skill/SKILL.md"
printf 'r\n' > "$TMP/skill/references/r1.md"
out=$(bash "$SH" --skill "$TMP/skill")
[[ "$(echo "$out" | grep -c '	')" -ge 3 ]] && ok "--skill 双文件+TOTAL" || bad "--skill 行数异常: $out"
out=$(bash "$SH" --skill "$TMP/nonexist" 2>&1); rc=$?
[[ $rc -eq 1 ]] && ok "--skill 目录不存在 exit 1" || bad "--skill 目录不存在 exit=$rc"

# --- 态 4：--gen 自指（swarm-yuan 自身三件套）确定性 ---
o1=$(bash "$SH" --gen); o2=$(bash "$SH" --gen)
[[ "$o1" == "$o2" ]] && ok "--gen 幂等" || bad "--gen 两次输出不一致"
echo "$o1" | grep -qE '^[0-9]+	[0-9]+	TOTAL$' && ok "--gen TOTAL 格式" || bad "--gen TOTAL 格式异常"
[[ "$(echo "$o1" | wc -l | tr -d ' ')" -eq 4 ]] && ok "--gen 3 文件+TOTAL" || bad "--gen 行数异常: $o1"

[[ $FAIL -eq 0 ]] && { echo "PASS test-context-surface"; exit 0; } || { echo "FAIL test-context-surface" >&2; exit 1; }
