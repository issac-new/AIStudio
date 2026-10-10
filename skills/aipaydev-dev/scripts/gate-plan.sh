#!/usr/bin/env bash
# gate-plan.sh — 选择即证据（负空间可审计；来源：HarnessEval 吸收）
# 任务开工时声明"本任务启用哪些门禁/跳过哪些/为什么"（plan）；收口时 diff 实际触发集 vs 计划集。
# HarnessEval 语义：每个"启用"要记 case-grounded 理由，每个"跳过"也要记理由——负空间可审计。
# 用法:
#   bash gate-plan.sh <项目根> --plan "enable:check_branch,check_test|skip:check_compliance(非合规项目),check_dengbao(无等保要求)"
#   bash gate-plan.sh <项目根> --diff          # 收口 diff：plan vs gate-runs 实际触发
# 退出码: 0 正常（含 diff 不一致——advisory 提示）；1 arg 错误。
set -uo pipefail
PROJ=""; MODE=""; PLAN_SPEC=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan)  MODE="plan"; PLAN_SPEC="${2:?--plan 需要 enable/skip 声明}"; shift 2 ;;
    --diff)  MODE="diff"; shift ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) [[ -z "$PROJ" ]] && PROJ="$1" || { echo "未知参数: $1" >&2; exit 1; }; shift ;;
  esac
done
[[ -n "$PROJ" && -d "$PROJ" ]] || { echo "✗ PROJECT_DIR 缺失或不存在: ${PROJ:-（空）}" >&2; exit 1; }
PROJ=$(cd "$PROJ" && pwd)
PLAN_FILE="$PROJ/.swarm-yuan/gate-plan.json"
RUNS_FILE="$PROJ/.swarm-yuan/gate-runs/gate-runs.jsonl"

if [[ "$MODE" == "plan" ]]; then
  mkdir -p "$PROJ/.swarm-yuan"
  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  # PLAN_SPEC 格式: enable:a,b,c|skip:x(理由),y(理由)
  enable_part="${PLAN_SPEC%%|*}"; enable_part="${enable_part#enable:}"
  skip_part=""
  [[ "$PLAN_SPEC" == *"|"* ]] && skip_part="${PLAN_SPEC#*|skip:}"
  # 解析为 JSON
  _en_json=$(printf '%s' "$enable_part" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | awk '{printf "%s\"%s\"", (NR>1?",":""), $0}')
  _sk_json=""
  if [[ -n "$skip_part" ]]; then
    # 解析 skip 列表（gate(reason) 对）——中文内容安全：按 ")" 切段再拆 gate/reason
    _sk_json=$(printf '%s' "$skip_part" | sed 's/)/)\n/g' | while IFS= read -r _seg; do
      [[ -z "$_seg" ]] && continue
      _g="${_seg%%(*}"; _r="${_seg#*(}"; _r="${_r%)}"
      _g="${_g#,}"; _g="${_g# }"; _g="${_g% }"
      [[ -n "$_g" ]] && printf '%s{"gate":"%s","reason":"%s"}' "${_sk_sep:-}" "$_g" "$_r" && _sk_sep=","
    done)
  fi
  printf '{"ts":"%s","enable":[%s],"skip":[%s]}\n' "$ts" "$_en_json" "$_sk_json" > "$PLAN_FILE"
  echo "✓ gate-plan 已落盘: ${PLAN_FILE}（enable $(printf '%s' "$enable_part" | tr ',' '\n' | grep -c .) 项，skip $(printf '%s' "$skip_part" | grep -o '(' | wc -l | tr -d ' ') 项）"
  exit 0
fi

if [[ "$MODE" == "diff" ]]; then
  [[ -f "$PLAN_FILE" ]] || { echo "ℹ 无 gate-plan（未开工声明）——跳过 diff（advisory）"; exit 0; }
  echo "## gate-plan diff（计划 vs 实际触发）"
  # 实际触发的门禁（gate-runs.jsonl 里出现过的 gate）
  _actual=""
  [[ -f "$RUNS_FILE" ]] && _actual=$(sed -n 's/.*"gate":"\([^"]*\)".*/\1/p' "$RUNS_FILE" 2>/dev/null | sort -u)
  # plan enable 列表
  _plan_en=$(sed -n 's/.*"enable":\[\([^]]*\)\].*/\1/p' "$PLAN_FILE" | tr -d '"' | tr ',' '\n')
  _miss=0; _extra=0
  # plan 启用但未触发（missing_evidence——该测没测）
  for g in $_plan_en; do
    [[ -z "$g" ]] && continue
    if ! printf '%s\n' "$_actual" | grep -qx "$g"; then
      echo "  ⚠ missing_evidence: plan 启用但未触发 —— $g"
      _miss=$((_miss+1))
    fi
  done
  # 触发了但不在 plan enable（且不在 skip）——计划外执行
  for g in $_actual; do
    [[ -z "$g" ]] && continue
    if ! printf '%s\n' "$_plan_en" | grep -qx "$g"; then
      if ! grep -q "\"gate\":\"$g\"" "$PLAN_FILE" 2>/dev/null; then
        echo "  ℹ 计划外执行（不在 enable/skip 声明中）—— $g"
        _extra=$((_extra+1))
      fi
    fi
  done
  # skip 声明被违反（声明跳过但触发了）
  _sk_gates=$(sed -n 's/.*"gate":"\([^"]*\)".*/\1/p' "$PLAN_FILE" | sort -u)
  for g in $_sk_gates; do
    [[ -z "$g" ]] && continue
    if printf '%s\n' "$_actual" | grep -qx "$g"; then
      echo "  ⚠ skip 声明被违反（声明跳过但触发了）—— $g"
      _miss=$((_miss+1))
    fi
  done
  [[ "$_miss" -eq 0 && "$_extra" -eq 0 ]] && echo "  ✓ 计划与实际触发一致"
  echo "  （missing_evidence ${_miss} 项，计划外 ${_extra} 项——advisory，不阻断）"
  exit 0
fi

echo "用法: bash gate-plan.sh <项目根> --plan <enable/skip 声明> | --diff" >&2
exit 1
