#!/bin/bash
# nudge-branch-intel.test.sh — 分支感知催办情报守门（run19 根治件配套）
# 五断言（违一即 FAIL）：
#   ①本轮新鲜+作者匹配的分支 → 输出情报句（分支名@tip）
#   ②上轮遗留分支（tip 早于 run_started_at）→ 不出现在情报里
#   ③作者不属被催负责人 → 不出现在情报里
#   ④origin/main 与 origin 自身 → 排除（main tip 是驱动/PM 的 merge）
#   ⑤DIRECTOR_CLONE 缺失 → 空输出（fail-open，催办退回原文案）
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fails=0

# 提取被测函数（不 source 整库：mx-scenario-lib.sh 顶部有重初始化与 set -euo pipefail）
FN_SRC="$(sed -n '/^_nudge_branch_intel() {/,/^}/p' "$HERE/mux/mx-scenario-lib.sh")"
[[ -n "$FN_SRC" ]] || { echo "FAIL 提取 _nudge_branch_intel 失败（函数不存在？）"; exit 1; }

RS_BASE=1791878855  # run19 起跑锚（固定值，仅作时间基准）
sget() { [[ "$1" = run_started_at ]] && printf '%s' "$RS_BASE"; }

# ── fixture：bare origin + 导演 clone，三个分支覆盖三种时间/作者组合 ──
TD="$(mktemp -d /tmp/nudge-intel-test.XXXXXX)" || exit 1
trap 'rm -rf "$TD"' EXIT
git -C "$TD" init -q --bare origin.git
git -C "$TD" init -q work
git -C "$TD/work" config user.name xiao
git -C "$TD/work" config user.email xiao@aipaydev.local
git -C "$TD/work" remote add origin "$TD/origin.git"
echo a > "$TD/work/a.txt"; git -C "$TD/work" add -A
GIT_AUTHOR_DATE="@$((RS_BASE-86400)) +0800" GIT_COMMITTER_DATE="@$((RS_BASE-86400)) +0800" \
  git -C "$TD/work" commit -qm "stale base"
git -C "$TD/work" push -q origin master 2>/dev/null || git -C "$TD/work" push -q origin main

# ② 上轮遗留分支（作者 xiao，tip 早于本轮）
git -C "$TD/work" checkout -qb feat/OLD
echo old > "$TD/work/old.txt"; git -C "$TD/work" add -A
GIT_AUTHOR_DATE="@$((RS_BASE-3600)) +0800" GIT_COMMITTER_DATE="@$((RS_BASE-3600)) +0800" \
  git -C "$TD/work" commit -qm "stale leg"
git -C "$TD/work" push -q origin feat/OLD

# ① 本轮新鲜分支（作者 xiao，tip 晚于本轮开跑）
git -C "$TD/work" checkout -qb feat/AN-MP master 2>/dev/null || git -C "$TD/work" checkout -qb feat/AN-MP main
echo fresh > "$TD/work/fresh.txt"; git -C "$TD/work" add -A
GIT_AUTHOR_DATE="@$((RS_BASE+100)) +0800" GIT_COMMITTER_DATE="@$((RS_BASE+100)) +0800" \
  git -C "$TD/work" commit -qm "fresh leg"
git -C "$TD/work" push -q origin feat/AN-MP

# ③ 作者不匹配分支（chen 的本轮新推）
git -C "$TD/work" checkout -qb feat/OTHER master 2>/dev/null || git -C "$TD/work" checkout -qb feat/OTHER main
git -C "$TD/work" config user.name chen
echo other > "$TD/work/other.txt"; git -C "$TD/work" add -A
GIT_AUTHOR_DATE="@$((RS_BASE+200)) +0800" GIT_COMMITTER_DATE="@$((RS_BASE+200)) +0800" \
  git -C "$TD/work" commit -qm "other owner"
git -C "$TD/work" push -q origin feat/OTHER

# ④ main 上做一笔本轮新 merge 提交（作者=fanfan-agent）——必须被排除
git -C "$TD/work" config user.name fanfan-agent
git -C "$TD/work" checkout -q master 2>/dev/null || git -C "$TD/work" checkout -q main
echo m > "$TD/work/m.txt"; git -C "$TD/work" add -A
GIT_AUTHOR_DATE="@$((RS_BASE+300)) +0800" GIT_COMMITTER_DATE="@$((RS_BASE+300)) +0800" \
  git -C "$TD/work" commit -qm "pm merge"
git -C "$TD/work" push -q origin HEAD

# 导演 clone（DIRECTOR_CLONE 真实形态：fetch 后有 refs/remotes/origin/*）
git -C "$TD" clone -q "$TD/origin.git" director
DIRECTOR_CLONE="$TD/director"
eval "$FN_SRC"

out_xiao="$(_nudge_branch_intel "xiao")"
out_chen="$(_nudge_branch_intel "chen")"
out_hu="$(_nudge_branch_intel "hu")"

if [[ "$out_xiao" == *"feat/AN-MP@"* && "$out_xiao" == *已见到* ]]; then
  echo "PASS ① 新鲜+作者匹配 → 情报句含 feat/AN-MP@tip"
else echo "FAIL ① xiao 情报异常：$out_xiao"; fails=1; fi

if [[ "$out_xiao" != *feat/OLD* ]]; then
  echo "PASS ② 上轮遗留分支被排除"
else echo "FAIL ② feat/OLD 泄入情报：$out_xiao"; fails=1; fi

if [[ "$out_xiao" != *feat/OTHER* && "$out_chen" == *feat/OTHER@* ]]; then
  echo "PASS ③ 作者匹配正确（chen 见 OTHER、xiao 不见）"
else echo "FAIL ③ 作者匹配异常：xiao=$out_xiao chen=$out_chen"; fails=1; fi

if [[ "$out_xiao" != *main@* && "$out_xiao" != *"origin|"* ]]; then
  echo "PASS ④ origin/main 与 origin 自身被排除"
else echo "FAIL ④ main/origin 泄入：$out_xiao"; fails=1; fi

if [[ -z "$out_hu" ]]; then
  echo "PASS ①b 无匹配者 → 空输出"
else echo "FAIL ①b hu 应为空：$out_hu"; fails=1; fi

DIRECTOR_CLONE="/nonexistent/path"
if [[ -z "$(_nudge_branch_intel "xiao")" ]]; then
  echo "PASS ⑤ clone 缺失 → 空（fail-open）"
else echo "FAIL ⑤ 缺失时应空"; fails=1; fi

(( fails == 0 )) && echo "ALL-PASS" || { echo "HAS-FAIL"; exit 1; }
