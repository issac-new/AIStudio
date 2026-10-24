#!/usr/bin/env bash
# informational-steps-check.sh — CI 信息性步骤台账对账（R130：continue-on-error 不得永久失明）
#
# 背景：ci.yml 有三个「信息性」步骤（BSD/Windows 兼容面，逐个修中）设 continue-on-error 且脚本末尾
# 把失败吞成 echo ⚠——结果既不阻塞 Job，也没有任何机制记录「它到底红了多久、是不是已经转绿」。
# 「逐个修中」没有截止日期就会变成永久失明（R126 审计测试体系 #10）。
#
# 机制：ci/informational-steps.conf 登记每个信息性步骤的台账状态三值：
#   observe  观察期——只记录结果，不阻塞；但 deadline 到期后本检查 exit 1，逼人归类（red/green）
#   red      已知红——步骤转绿时 exit 1（棘轮：修好了就把它从 red 挪到 green，不能再回红）
#   green    须绿——步骤红时 exit 1（真回归，不再被 continue-on-error 掩盖）
# 步骤真实结果由 CI 经环境变量注入：INFO_OUTCOME_<STEP_ID 大写>=success|failure（GitHub steps.<id>.outcome）。
# 未注入（本地/该 Job 未跑）的步骤只打印「未知」不判定。
#
# 用法：bash ci/informational-steps-check.sh [<conf 路径>] [<今天 YYYY-MM-DD，缺省取系统日期>]
# 退出码：0 全部合规；1 任一违规（到期未归类 / red 转绿 / green 变红 / conf 格式错）
# conf 行格式（TAB 分隔，# 开头注释）：step_id<TAB>state<TAB>deadline(YYYY-MM-DD)<TAB>reason
set -euo pipefail

CONF="${1:-$(cd "$(dirname "$0")" && pwd)/informational-steps.conf}"
TODAY="${2:-$(date -u +%Y-%m-%d)}"
[[ -f "$CONF" ]] || { echo "✗ 台账不存在: ${CONF}" >&2; exit 1; }
[[ "$TODAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "✗ 日期格式非法: ${TODAY}" >&2; exit 1; }

_to_num() { printf '%s' "$1" | tr -d '-'; }   # 2026-11-20 → 20261120，字典序即日期序
_today_n=$(_to_num "$TODAY")
bad=0; n=0
echo "▶ CI 信息性步骤台账对账（今天 ${TODAY}；台账 $(basename "$CONF")）"
while IFS=$'\t' read -r sid state deadline reason || [[ -n "${sid:-}" ]]; do
  [[ -z "${sid:-}" || "$sid" == \#* ]] && continue
  n=$((n+1))
  if [[ -z "${state:-}" || -z "${deadline:-}" ]]; then
    echo "  ✗ 行格式错（需 step_id<TAB>state<TAB>deadline<TAB>reason）: ${sid}"; bad=1; continue
  fi
  case "$state" in observe|red|green) ;; *) echo "  ✗ ${sid}: state 非法「${state}」（observe|red|green）"; bad=1; continue ;; esac
  if ! [[ "$deadline" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "  ✗ ${sid}: deadline 格式非法「${deadline}」"; bad=1; continue
  fi
  _env="INFO_OUTCOME_$(printf '%s' "$sid" | tr '[:lower:]-' '[:upper:]_')"
  outcome="${!_env:-}"
  case "$state" in
    observe)
      if [[ $(_to_num "$deadline") -lt "$_today_n" ]]; then
        echo "  ✗ ${sid}: 观察期已于 ${deadline} 到期仍未归类（本次结果=${outcome:-未知}）——改台账为 red 或 green，不得续观察而不留痕"; bad=1
      else
        echo "  · ${sid}: 观察中（结果=${outcome:-未知}，截止 ${deadline}）"
      fi ;;
    red)
      if [[ "$outcome" == "success" ]]; then
        echo "  ✗ ${sid}: 台账为 red 但本次已转绿——棘轮：把台账改为 green（修好了不能再回红）"; bad=1
      else
        echo "  · ${sid}: 已知红（结果=${outcome:-未知}）"
      fi ;;
    green)
      if [[ "$outcome" == "failure" ]]; then
        echo "  ✗ ${sid}: 台账为 green 但本次失败——真回归（continue-on-error 不再掩盖）"; bad=1
      else
        echo "  ✓ ${sid}: 须绿且绿（结果=${outcome:-未知}）"
      fi ;;
  esac
done < "$CONF"
[[ "$n" -gt 0 ]] || { echo "  ✗ 台账为空（零登记=失明回归）"; bad=1; }
if [[ "$bad" -eq 0 ]]; then
  echo "✓ 信息性步骤台账合规（${n} 项）"
else
  echo "✗ 信息性步骤台账违规——见上方 ✗ 行" >&2
  exit 1
fi
