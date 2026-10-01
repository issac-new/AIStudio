#!/usr/bin/env bash
# repo-has-freshness.test.sh — repo_has 工件新鲜度时间窗守门（run5 教训根治的单测）
# 用法：bash scripts/aipay/mux/tests/repo-has-freshness.test.sh
# 四例：旧稿拒 / 本轮稿过 / 无起点键旧语义放行 / main 无此文件拒。
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LIB="$DIR/mx-scenario-lib.sh"

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
# ── 测试脚手架：最小 stub（sget/sset/log 走本地 state；不触发 lib 其余初始化）──
export STATE="$T/state.env"
export DIRECTOR_CLONE="$T/clone"
export SCEN_LOG="$T/scen.log"
mkdir -p "$DIRECTOR_CLONE"
sget() { grep -s "^$1=" "$STATE" 2>/dev/null | head -1 | cut -d= -f2-; return 0; }
log() { echo "[test-log] $*" >> "$SCEN_LOG"; }

# ── 构造被测仓：历史提交（旧稿）→ 打 origin/main；新起点后的提交（新稿）──
git -C "$DIRECTOR_CLONE" init -q -b main
git -C "$DIRECTOR_CLONE" config user.email t@t && git -C "$DIRECTOR_CLONE" config user.name t
mkdir -p "$DIRECTOR_CLONE/docs/analysis"
echo "old" > "$DIRECTOR_CLONE/docs/analysis/AN-OLD-analysis.md"
GIT_AUTHOR_DATE="1600000000 +0000" GIT_COMMITTER_DATE="1600000000 +0000" \
  git -C "$DIRECTOR_CLONE" add -A
GIT_AUTHOR_DATE="1600000000 +0000" GIT_COMMITTER_DATE="1600000000 +0000" \
  git -C "$DIRECTOR_CLONE" commit -qm "旧稿（2020 年）"
echo "fresh" > "$DIRECTOR_CLONE/docs/analysis/AN-NEW-analysis.md"
git -C "$DIRECTOR_CLONE" add -A && git -C "$DIRECTOR_CLONE" commit -qm "本轮新稿"
# 只建 remote-tracking ref：git branch -q origin/main 会造出名为 origin/main 的本地分支（语义混淆留脏 ref）
git -C "$DIRECTOR_CLONE" update-ref refs/remotes/origin/main HEAD

# 仅提取 repo_has 函数定义（不 source 全库——避免其初始化副作用）
sed -n '/^repo_has()/,/^}/p' "$LIB" > "$T/repo_has.fn"
# shellcheck disable=SC1090
source "$T/repo_has.fn"

NOW=$(date +%s)
echo "run_started_at=$((NOW - 60))" > "$STATE"

fail=0
t() { # <desc> <期望 0|1> <实际>
  if [ "$2" != "$3" ]; then echo "✗ $1（期望 $2 实得 $3）"; fail=1; else echo "✓ $1"; fi
}

repo_has "docs/analysis/AN-OLD-analysis.md" >/dev/null 2>&1; t "旧稿（2020 提交）不满足新鲜度" 1 $?
repo_has "docs/analysis/AN-NEW-analysis.md" >/dev/null 2>&1; t "本轮稿（起点后提交）通过" 0 $?
repo_has "docs/analysis/AN-ABSENT.md" >/dev/null 2>&1; t "main 无此文件拒" 1 $?
rm -f "$STATE"
repo_has "docs/analysis/AN-OLD-analysis.md" >/dev/null 2>&1; t "无 run_started_at 键=旧语义放行（兼容）" 0 $?
grep -q "跳过新鲜度窗口" "$SCEN_LOG" && echo "✓ 兼容路径留观察日志" || { echo "✗ 兼容路径未留日志"; fail=1; }

if [ "$fail" = 0 ]; then echo "== repo_has 时间窗四例全过 =="; exit 0; else echo "== FAIL =="; exit 1; fi
