#!/usr/bin/env bash
# test-mine-habits.sh — mine-habits.sh 双态测试（R21-B）
# 态1: 固定 fixture 仓六维统计值断言；态2: 非 git 仓 fail-open；态3: 确定性（剥时间戳行后 byte-identical）
# --since 用绝对锚点（R81 根治）：fixture 日期钉死 2026-09-01..05，相对窗口"30 days ago"
# 随日历漂移，2026-10-01 起最早提交掉窗（feat=2→1 等四断言连红）——时间炸弹测试。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
ROOT="$(pwd)"
SH="scripts/mine-habits.sh"
TMP="$(mktemp -d /tmp/mhtest.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# fixture 仓：5 提交（feat×2 / fix×1 / test×1 / chore 分支×1），a.ts+b.ts 共变 2 次，1 提交触及测试文件
make_fixture() {  # $1=目录
  local d="$1"
  mkdir -p "$d"
  git -C "$d" init -q
  git -C "$d" -c user.email=t@t -c user.name=t commit -q --allow-empty -m "init"
  printf 'a\n' > "$d/a.ts"; printf 'b\n' > "$d/b.ts"
  git -C "$d" add -A
  GIT_AUTHOR_DATE="2026-09-01T10:00:00" GIT_COMMITTER_DATE="2026-09-01T10:00:00" \
    git -C "$d" -c user.email=t@t -c user.name=t commit -qm "feat: add a b"
  printf 'c\n' > "$d/c.ts"
  git -C "$d" add -A
  GIT_AUTHOR_DATE="2026-09-02T10:00:00" GIT_COMMITTER_DATE="2026-09-02T10:00:00" \
    git -C "$d" -c user.email=t@t -c user.name=t commit -qm "feat: add c"
  printf 'a2\n' >> "$d/a.ts"; printf 'b2\n' >> "$d/b.ts"
  git -C "$d" add -A
  GIT_AUTHOR_DATE="2026-09-03T10:00:00" GIT_COMMITTER_DATE="2026-09-03T10:00:00" \
    git -C "$d" -c user.email=t@t -c user.name=t commit -qm "fix: touch a b"
  printf 't1\n' > "$d/app.test.ts"
  git -C "$d" add -A
  GIT_AUTHOR_DATE="2026-09-04T10:00:00" GIT_COMMITTER_DATE="2026-09-04T10:00:00" \
    git -C "$d" -c user.email=t@t -c user.name=t commit -qm "test: add test"
  git -C "$d" checkout -qb feature/demo-x
  printf 'x\n' > "$d/x.ts"
  git -C "$d" add -A
  GIT_AUTHOR_DATE="2026-09-05T10:00:00" GIT_COMMITTER_DATE="2026-09-05T10:00:00" \
    git -C "$d" -c user.email=t@t -c user.name=t commit -qm "chore: x"
  git -C "$d" checkout -q master 2>/dev/null || git -C "$d" checkout -q main
}

# --- 态 1：六维统计值断言 ---
mkdir -p "$TMP/proj"
make_fixture "$TMP/proj"
out="$(bash "$SH" "$TMP/proj" --since "2026-08-31" 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && ok "态1 exit 0" || bad "态1 exit=$rc: $out"
HAB="$TMP/proj/.swarm-yuan/notes/habits.md"
[[ -f "$HAB" ]] && ok "态1 初稿落盘 habits.md" || bad "态1 habits.md 未生成"
grep -qF '| feat | 2 |' "$HAB" && ok "态1 前缀分布 feat=2" || bad "态1 前缀分布 feat 计数错误"
grep -qF '| 2 | a.ts ⇄ b.ts |' "$HAB" && ok "态1 共变对 a⇄b=2" || bad "态1 共变对未检出"
grep -qF '25% 的提交触及测试文件' "$HAB" && ok "态1 测试提交占比 25%" || bad "态1 测试占比错误"
grep -qF '| 2 | a.ts |' "$HAB" && ok "态1 热点 a.ts=2" || bad "态1 热点计数错误"
grep -qF '| feature | 1 |' "$HAB" && ok "态1 分支首段 feature=1" || bad "态1 分支分布错误"
grep -q '小(<100行)' "$HAB" && ok "态1 规模分桶小桶存在" || bad "态1 规模分桶缺失"

# --- 态 2：非 git 目录 fail-open（exit 0 + 显式披露）---
mkdir -p "$TMP/plain"
out="$(bash "$SH" "$TMP/plain" 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF '非 git 仓库' && ok "态2 非 git 仓 fail-open + 披露" || bad "态2 行为异常 rc=$rc: $out"

# --- 态 3：确定性（剥时间戳行后两次 byte-identical）---
o1=$(grep -v '生成时间' "$HAB")
bash "$SH" "$TMP/proj" --since "2026-08-31" >/dev/null 2>&1
o2=$(grep -v '生成时间' "$HAB")
[[ "$o1" == "$o2" ]] && ok "态3 确定性 byte-identical（剥时间戳）" || bad "态3 两次输出不一致"

[[ $FAIL -eq 0 ]] && { echo "PASS test-mine-habits"; exit 0; } || { echo "FAIL test-mine-habits" >&2; exit 1; }
