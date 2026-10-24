#!/usr/bin/env bash
# mine-habits.sh — 开发者行为机械挖掘（核心链条⑥"吸收具体开发人员的实际研发流程和习惯"）
# 纯机械 git log 统计初稿 → .swarm-yuan/notes/habits.md，AI 审读三去向：
#   提交/分支习惯 → 目标技能 SKILL.md 铁律段（引用来源，不写死值）；
#   工作偏好     → dev-guide.md「开发偏好」节；
#   隐式耦合/热点 → reference-manual.md 说明列注意事项 + recipes.md 配方提取（§D.7 源②）。
# 六维度：提交前缀分布 / 分支命名分布 / 提交规模分桶 / 共变文件 Top 对 / 热点文件 Top / 测试文件提交占比。
# 红线：本脚本只统计不判断（"怎么吸收"是 AI 审读判断，机械/AI 边界见 generation-flow H-C）。
# 用法:
#   bash mine-habits.sh <PROJECT_DIR> [--since <git日期>] [--max-commits <N>] [--out <文件>]
#     --since        统计窗口（git log --since 语法），默认 "180 days ago"
#     --max-commits  共变对计算的提交数上限（复杂度封顶），默认 500
#     --out          初稿落盘路径，默认 <PROJECT_DIR>/.swarm-yuan/notes/habits.md
# 输出: stdout 人读摘要；初稿 markdown 写 --out。非 git 仓库 / 窗口内零提交 → 显式披露 + exit 0（fail-open，同 project-fingerprint 口径）。
# 兼容: bash 3.2（无 declare -A，直方图全走 awk）；LC_ALL=C 排序保证确定性。
set -uo pipefail

PROJ=""; SINCE="180 days ago"; MAXC=500; OUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --since)       SINCE="${2:?--since 需要参数}"; shift 2 ;;
    --max-commits) MAXC="${2:?--max-commits 需要参数}"; shift 2 ;;
    --out)         OUT="${2:?--out 需要路径}"; shift 2 ;;
    -h|--help)     sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) [[ -z "$PROJ" ]] && PROJ="$1" || { echo "未知参数: $1" >&2; exit 1; }; shift ;;
  esac
done
[[ -n "$PROJ" && -d "$PROJ" ]] || { echo "✗ PROJECT_DIR 缺失或不存在: ${PROJ:-（空）}" >&2; exit 1; }
PROJ=$(cd "$PROJ" && pwd)
[[ -z "$OUT" ]] && OUT="$PROJ/.swarm-yuan/notes/habits.md"

git -C "$PROJ" rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "ℹ 非 git 仓库，无法行为挖掘: ${PROJ}（fail-open，跳过⑥行为吸收维）"
  exit 0
}

_total=$(git -C "$PROJ" log --format=%H --since="$SINCE" 2>/dev/null | LC_ALL=C grep -c . || true)
_total="${_total:-0}"
if [[ "$_total" -eq 0 ]]; then
  echo "ℹ 窗口（--since '${SINCE}'）内零提交，无可挖掘行为（fail-open）"
  exit 0
fi

G="git -C $PROJ"

# --- 1. 提交前缀分布（Conventional Commits 首 token；非 CC 提交归 "(other)"）---
_prefix_tbl=$($G log --format=%s --since="$SINCE" 2>/dev/null | LC_ALL=C awk '
  { s=$0; sub(/^[[:space:]]+/, "", s)
    if (s ~ /^[a-z]+(\([^)]*\))?!?:/) { split(s, a, /[\(:!]/); p=a[1] }
    else p="(other)"
    cnt[p]++ }
  END { for (p in cnt) printf "%d\t%s\n", cnt[p], p }' | LC_ALL=C sort -rn | head -10)

# --- 2. 分支命名分布（近 30 条活跃分支按首段归类）---
_branch_tbl=$($G for-each-ref --sort=-committerdate --count=30 --format='%(refname:short)' refs/heads 2>/dev/null | LC_ALL=C awk '
  { n=split($0, seg, "/"); cls = (n>1) ? seg[1] : "(单段名)"; cnt[cls]++ }
  END { for (c in cnt) printf "%d\t%s\n", cnt[c], c }' | LC_ALL=C sort -rn)

# --- 3. 提交规模分桶（单次提交 ±行数合计：<100 小 / 100-500 中 / >500 大）---
_bucket_tbl=$($G log --shortstat --format=%H --since="$SINCE" 2>/dev/null | LC_ALL=C awk '
  /insertion|deletion/ {
    ins=0; del=0
    if (match($0, /[0-9]+ insertion/)) ins=substr($0, RSTART, RLENGTH)+0
    if (match($0, /[0-9]+ deletion/)) del=substr($0, RSTART, RLENGTH)+0
    t=ins+del
    if (t<100) b="小(<100行)"; else if (t<=500) b="中(100-500行)"; else b="大(>500行)"
    cnt[b]++; n++
  }
  END { for (b in cnt) printf "%d\t%s\n", cnt[b], b; if (n==0) print "0\t(无shortstat)" }' | LC_ALL=C sort -rn)

# --- 4. 共变文件 Top 对（同提交共现 ≥2 次的文件对——隐性耦合信号；单提交 >20 文件跳过防合并噪音）---
_pair_tbl=$($G log --format=%H --name-only --since="$SINCE" -n "$MAXC" 2>/dev/null | LC_ALL=C awk '
  function flush(  i, j, k) {
    if (n >= 2 && n <= 20)
      for (i = 1; i < n; i++) for (j = i + 1; j <= n; j++) {
        if (files[i] > files[j]) k = files[j] SUBSEP files[i]; else k = files[i] SUBSEP files[j]
        cnt[k]++
      }
    n = 0
  }
  /^[0-9a-f][0-9a-f]+$/ && length($0) == 40 { flush(); next }
  NF > 0 { n++; files[n] = $0 }
  END { flush(); for (k in cnt) if (cnt[k] >= 2) printf "%d\t%s\n", cnt[k], k }' \
  | LC_ALL=C sort -rn | head -15 | LC_ALL=C awk -F'\t' '{ gsub(SUBSEP, " ⇄ ", $2); print $1 "\t" $2 }')

# --- 5. 热点文件 Top 15（窗口内被改次数）---
_hot_tbl=$($G log --format= --name-only --since="$SINCE" 2>/dev/null \
  | LC_ALL=C awk 'NF > 0 { cnt[$0]++ } END { for (f in cnt) printf "%d\t%s\n", cnt[f], f }' \
  | LC_ALL=C sort -rn | head -15)

# --- 6. 测试文件提交占比（触及 test/spec/__tests__ 路径的提交 / 总提交）---
_test_ratio=$($G log --format=%H --name-only --since="$SINCE" 2>/dev/null | LC_ALL=C awk '
  /^[0-9a-f][0-9a-f]+$/ && length($0) == 40 { if (n > 0) { total++; if (hasTest) withTest++ }; n = 0; hasTest = 0; next }
  NF > 0 { n++; if ($0 ~ /(test|spec|__tests__)/) hasTest = 1 }
  END { if (n > 0) { total++; if (hasTest) withTest++ }
        if (total > 0) printf "%.0f%%", withTest * 100 / total; else print "n/a" }')

# --- 落盘初稿 ---
mkdir -p "$(dirname "$OUT")"
{
  echo "# 开发者行为挖掘初稿（mine-habits.sh 机械生成——AI 审读采纳，不直接当规范用）"
  echo ""
  echo "> 窗口：--since '${SINCE}'，共 ${_total} 次提交（共变对按最近 ${MAXC} 次计）。生成时间 $(date +%Y-%m-%dT%H:%M:%S%z)。"
  echo "> 三去向（exploration-guide「项目知识读取」节 行为观察）：提交/分支习惯→SKILL.md 铁律段（引用来源）；工作偏好→dev-guide「开发偏好」节；隐式耦合/热点→reference-manual 说明列 + recipes 配方提取（§D.7 源②）。"
  echo ""
  echo "## 提交前缀分布（Top 10）"
  echo ""
  echo "| 前缀 | 次数 |"
  echo "|------|------|"
  if [[ -n "$_prefix_tbl" ]]; then printf '%s\n' "$_prefix_tbl" | LC_ALL=C awk -F'\t' '{ printf "| %s | %s |\n", $2, $1 }'; else echo "| (无提交) | 0 |"; fi
  echo ""
  echo "## 分支命名分布（近 30 条活跃分支按首段）"
  echo ""
  echo "| 首段 | 分支数 |"
  echo "|------|--------|"
  if [[ -n "$_branch_tbl" ]]; then printf '%s\n' "$_branch_tbl" | LC_ALL=C awk -F'\t' '{ printf "| %s | %s |\n", $2, $1 }'; else echo "| (无分支) | 0 |"; fi
  echo ""
  echo "## 提交规模分桶（±行数合计）"
  echo ""
  echo "| 桶 | 提交数 |"
  echo "|----|--------|"
  printf '%s\n' "$_bucket_tbl" | LC_ALL=C awk -F'\t' '{ printf "| %s | %s |\n", $2, $1 }'
  echo ""
  echo "## 共变文件 Top 对（同提交共现 ≥2 次——隐性耦合/拼装单元信号）"
  echo ""
  echo "| 共现次数 | 文件对 |"
  echo "|----------|--------|"
  if [[ -n "$_pair_tbl" ]]; then printf '%s\n' "$_pair_tbl" | LC_ALL=C awk -F'\t' '{ printf "| %s | %s |\n", $1, $2 }'; else echo "| （无 ≥2 次共变对） | — |"; fi
  echo ""
  echo "## 热点文件 Top 15（窗口内被改次数）"
  echo ""
  echo "| 次数 | 文件 |"
  echo "|------|------|"
  if [[ -n "$_hot_tbl" ]]; then printf '%s\n' "$_hot_tbl" | LC_ALL=C awk -F'\t' '{ printf "| %s | %s |\n", $1, $2 }'; else echo "| (无) | — |"; fi
  echo ""
  echo "## 测试文件提交占比"
  echo ""
  echo "- ${_test_ratio} 的提交触及测试文件（test/spec/__tests__ 路径）。"
  echo ""
  echo "## AI 审读指引（机械/AI 边界）"
  echo ""
  echo "- 本文件是统计事实，不是规范——前缀分布 ≠ 必须遵守的提交规范（规范以其书面规则为准，本表只作实证交叉）。"
  echo "- 共变对是隐性耦合信号：高频共变文件对应在 reference-manual 说明列记注意事项，并作为 recipes 配方「复用件清单」的佐证（§D.7 源②）。"
  echo "- 异常信号（如测试占比 0%、单体巨型提交为主）如实写入 dev-guide 注意事项，不粉饰。"
} > "$OUT"

echo "✓ 行为初稿已落盘: ${OUT}（${_total} commits / since='${SINCE}'）"
echo "  AI 下一步：审读三去向（SKILL.md 铁律引用 / dev-guide 开发偏好 / reference-manual 注意事项）"
exit 0
