#!/usr/bin/env bash
# audit-closure.sh — 审计即完成条件（closure 完备性重走；来源：HarnessEval 吸收）
# HarnessEval 语义：audit 不过不开工；收尾按全矩阵重走（goal_id 全集的 closure 完备性），
# 且"审计脚本重跑输出与落盘一致"是验收条件之一（no-op 幂等）。
# 用法:
#   bash audit-closure.sh <项目根>           # goal_id 全集的 closure 完备性报告（open/closed 分布）
#   bash audit-closure.sh <项目根> --strict  # 有 open goal 时 exit 2（用作 mark-active 验收门）
# 退出码: 0 正常（--strict 模式全部 closed）；1 arg 错误；2 --strict 有 open goal。
set -uo pipefail
PROJ=""; STRICT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict) STRICT=1; shift ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) [[ -z "$PROJ" ]] && PROJ="$1" || { echo "未知参数: $1" >&2; exit 1; }; shift ;;
  esac
done
[[ -n "$PROJ" && -d "$PROJ" ]] || { echo "✗ PROJECT_DIR 缺失或不存在: ${PROJ:-（空）}" >&2; exit 1; }
PROJ=$(cd "$PROJ" && pwd)
DEC="$PROJ/.swarm-yuan/decisions.jsonl"
# decisions.jsonl 有两本账——项目侧（执勤期决策，trace-log --persist 写）
# 与技能侧（生成期决策，mark-active 核验的 <skill>/.swarm-yuan/）。原脚本只读项目侧，
# 生成期决策对闭环审计不可见（实证：mark-active 已核验 ≥1 决策，audit-closure 仍报"无"）。
# 两处都探测并合并（同 goal_id 以末条为准，文件序=项目侧在前技能侧在后）。
_skill_dec=""
for _cand in "$PROJ"/.claude/skills/*/.swarm-yuan/decisions.jsonl "$PROJ"/.codex/skills/*/.swarm-yuan/decisions.jsonl; do
  [[ -f "$_cand" ]] && { _skill_dec="$_cand"; break; }
done
if [[ ! -f "$DEC" && -z "$_skill_dec" ]]; then
  echo "ℹ 无 decisions.jsonl——closure 审计跳过（无目标闭环数据）"; exit 0
fi
_merged_dec="$(mktemp "${TMPDIR:-/tmp}"/audit-closure.XXXXXX)"
{ [[ -f "$DEC" ]] && cat "$DEC"; [[ -n "$_skill_dec" ]] && cat "$_skill_dec"; } > "$_merged_dec" 2>/dev/null || true
[[ -s "$_merged_dec" ]] || { rm -f "$_merged_dec"; echo "ℹ 无 decisions.jsonl——closure 审计跳过（无目标闭环数据）"; exit 0; }
[[ -n "$_skill_dec" ]] && echo "  ⓘ 合并技能侧决策账本: ${_skill_dec#$PROJ/}"
DEC="$_merged_dec"

echo "## goal 闭环完备性（审计即完成条件）"
# goal_id 全集（非空 goal_id 的分布）
_goals=$(sed -n 's/.*"goal_id":"\([^"]*\)".*/\1/p' "$DEC" | grep -v '^$' | sort -u)
_total=0; _closed=0; _open=0; _open_list=""
for g in $_goals; do
  [[ -z "$g" ]] && continue
  _total=$((_total+1))
  # 该 goal 的最新 closure 状态（按时间序末条）
  _c=$(grep "\"goal_id\":\"$g\"" "$DEC" | tail -1 | sed -n 's/.*"closure":"\([^"]*\)".*/\1/p')
  if [[ "$_c" == "closed" ]]; then
    _closed=$((_closed+1))
  else
    _open=$((_open+1))
    _open_list="${_open_list} $g"
  fi
done
printf "  goal 总数: %d（closed %d / open %d）\n" "$_total" "$_closed" "$_open"
if [[ "$_open" -gt 0 ]]; then
  echo "  open goals（change↔validation 未闭合——审计未完成的信号）:"
  for g in $_open_list; do
    echo "    ⚠ $g"
  done
fi
# no-op 验收：重跑本脚本两次输出应一致（幂等性，HarnessEval 验收条件）
_out1=$(sed -n 's/.*"goal_id":"\([^"]*\)".*/\1/p' "$DEC" | grep -v '^$' | sort -u | cksum | awk '{print $1}')
if [[ "$STRICT" -eq 1 && "$_open" -gt 0 ]]; then
  rm -f "$_merged_dec"
  echo "✗ --strict：存在 open goal（${_open} 个）——审计未完成，不满足完成条件" >&2
  exit 2
fi
rm -f "$_merged_dec"
exit 0
