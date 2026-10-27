#!/usr/bin/env bash
# test-secure-fs.sh — 安全落盘库契约（Task 5 / A08）
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1090
. "$BASE/assets/lib/secure-fs.sh"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1" >&2; }
SB="$(mktemp -d "${TMPDIR:-/tmp}/sfs-test.XXXXXX")"
trap 'rm -rf "$SB"' EXIT

# ① 同目录临时文件
t="$(sfs_mktemp "$SB/a.txt")"
[[ -f "$t" && "$(dirname "$t")" == "$SB" ]] && ok 'mktemp 与目标同目录' || bad "mktemp 位置: $t"

# ② 原子替换保内容
printf 'old' > "$SB/a.txt"; printf 'new-content' > "$t"
sfs_replace "$SB/a.txt" "$t"
[[ "$(cat "$SB/a.txt")" == "new-content" && ! -e "$t" ]] && ok 'replace 替换成功且候选消失' || bad 'replace 未生效'

# ③ symlink 拒绝写穿
mkdir -p "$SB/victim"
printf 'precious' > "$SB/victim/real.txt"
ln -s "$SB/victim/real.txt" "$SB/link.txt"
t2="$(sfs_mktemp "$SB/link.txt")"; printf 'evil' > "$t2"
if sfs_replace "$SB/link.txt" "$t2" 2>/dev/null; then
  bad 'symlink 目标被写穿'
else
  [[ "$(cat "$SB/victim/real.txt")" == "precious" ]] && ok 'symlink 拒绝且原件未动' || bad '拒绝但原件被改'
fi
rm -f "$t2"

# ④ 跨目录候选拒绝
mkdir -p "$SB/other"
t3="$(sfs_mktemp "$SB/other/x.tmp")"; printf 'x' > "$t3"
sfs_replace "$SB/a.txt" "$t3" 2>/dev/null && bad '跨目录候选被接受' || ok '跨目录候选拒绝'
rm -f "$t3"

# ⑤ 属主锁互斥
L="$SB/.lock"
sfs_lock "$L" && ok '首次获锁' || bad '首次获锁失败'
sfs_lock "$L" 2>/dev/null && bad '重入未互斥' || ok '重入互斥'
sfs_unlock "$L" && ok '属主解锁' || bad '解锁失败'
[[ -d "$L" ]] && bad '解锁后目录残留' || ok '解锁后目录清除'

# ⑥ 陈旧锁回收：伪造成死进程属主
mkdir -p "$L"; printf '999999999\n' > "$L/owner"
sfs_lock "$L" && [[ "$(cat "$L/owner")" == "$$" ]] && ok '死属主锁被回收' || bad '陈旧锁未回收'
sfs_unlock "$L"

# ⑦ 非属主不清锁
mkdir -p "$L"; printf '1\n' > "$L/owner"   # PID 1 恒存活
sfs_unlock "$L"
[[ -d "$L" ]] && ok '非属主锁保留' || bad '非属主锁被误清'
rm -rf "$L"

printf 'test-secure-fs: PASS %s / FAIL %s\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
