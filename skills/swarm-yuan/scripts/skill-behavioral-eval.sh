#!/usr/bin/env bash
# skill-behavioral-eval.sh — Tier-3 行为评测（按需、烧 token、不进默认门禁）
#
# 查的是 Tier-2 查不到的事：技能被加载后，agent **实际做了什么**。
# 机制来源 addyosmani/agent-skills evals Tier-3，本仓按纪律改写两处：
#   ① 判分用**确定性动作断言**（trace 里出现/不出现哪些动作），不移植 LLM judge——
#      上游自记同一用例 6/6、1/6、2/7 都出现过，随机判分不能做门禁。
#   ② 不进 precheck 默认序列，只能显式调（--behavioral 语义）；跑不起就 exit 2，绝不读成 0。
#
# 用法:
#   bash skill-behavioral-eval.sh --cases <behavioral.tsv> --skill <SKILL.md> [--runner claude|codex]
#                                 [--max-turns N] [--dry-run] [--timeout-s N]
#
# cases 列（制表符分隔，首行必须有表头）:
#   case_id  prompt                          expect_actions           forbid_actions
#   1        <发给 agent 的原始任务描述>      <正则;分号分隔，全部须命中>  <正则;分号分隔，命中即失败>
#
# expect/forbid 匹配的是 stream-json trace 的**原文行**（含工具名与参数），
# 所以写 "Write.*src/split.js" 这类可辨识动作，不要写自然语言结论。
#
# 退出码：0 全过；1 有失败；2 无法运行（runner 不可用 / 用例缺失）——2 绝不读成 0。

set -u

CASES=""
SKILL=""
RUNNER=""
MAX_TURNS=12
TIMEOUT_S=600
DRY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cases) CASES="${2:-}"; shift 2 ;;
    --skill) SKILL="${2:-}"; shift 2 ;;
    --runner) RUNNER="${2:-}"; shift 2 ;;
    --max-turns) MAX_TURNS="${2:-12}"; shift 2 ;;
    --timeout-s) TIMEOUT_S="${2:-600}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "skill-behavioral-eval: 未知参数 $1" >&2; exit 2 ;;
  esac
done

[[ -n "$CASES" && -f "$CASES" ]] || { echo "skill-behavioral-eval: 缺 --cases 或文件不存在（${CASES:-未给}）" >&2; exit 2; }
[[ -n "$SKILL" && -f "$SKILL" ]] || { echo "skill-behavioral-eval: 缺 --skill 或文件不存在（${SKILL:-未给}）" >&2; exit 2; }

# 用例装载（只取有内容的行）
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-behave.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
grep -v '^#' "$CASES" | grep -v '^[[:space:]]*$' | tail -n +2 > "$TMP/cases.tsv"

# runner 选择：显式 --runner 优先，否则按 claude → codex 顺序探测
_pick_runner() {
  local c
  # 显式 --runner 是权威：找不到就失败，不静默回落到别的宿主（回落会真烧 token 且结论不对应）
  if [[ -n "$RUNNER" ]]; then
    command -v "$RUNNER" >/dev/null 2>&1 && { printf '%s' "$RUNNER"; return 0; }
    return 1
  fi
  for c in claude codex; do
    command -v "$c" >/dev/null 2>&1 && { printf '%s' "$c"; return 0; }
  done
  return 1
}

# dry-run 只打印计划不烧 token，必须在 runner 探测之前——否则无 claude/codex 的环境
# （Linux CI 容器）先 exit 2，计划面永远不可达（态1 实抓，2026-11-12）。
if [[ "$DRY" -eq 1 ]]; then
  echo "▶ Tier-3 计划（dry-run，不烧 token）"
  _dr="$(_pick_runner 2>/dev/null || true)"
  echo "  runner    = ${RUNNER:-${_dr:-未探测到}}"
  [[ -n "${RUNNER}${_dr}" ]] || \
    echo "             （dry-run 不要求 runner 在位；实跑需 claude/codex 在 PATH 或 --runner 显式给定）"
  echo "  skill     = ${SKILL}"
  echo "  max-turns = ${MAX_TURNS}  timeout = ${TIMEOUT_S}s"
  n=0
  while IFS=$'\t' read -r cid prompt expect forbid; do
    [[ -z "${cid:-}" ]] && continue
    n=$((n + 1))
    echo "  case ${cid}: prompt=${prompt:0:60}… expect=[${expect}] forbid=[${forbid:-无}]"
  done < "$TMP/cases.tsv"
  echo "  共 ${n} 例"$([[ "$n" -eq 0 ]] && echo "（模板态：尚未填用例）" || true)
  exit 0
fi

RUNNER_BIN="$(_pick_runner)" || {
  echo "skill-behavioral-eval: 无可用 runner（claude/codex 都不在 PATH）——Tier-3 未运行（exit 2，不计为通过）" >&2
  exit 2
}

if [[ -s "$TMP/cases.tsv" ]]; then :; else echo "skill-behavioral-eval: 用例为空（只有表头）——先按目标仓真实任务填用例（exit 2）" >&2; exit 2; fi

_fail=0; _pass=0; _total=0
while IFS=$'\t' read -r cid prompt expect forbid; do
  [[ -z "${cid:-}" ]] && continue
  _total=$((_total + 1))
  trace="$TMP/case-${cid}.jsonl"
  case "$RUNNER_BIN" in
    claude)
      # --append-system-prompt 注入技能全文；acceptEdits 让执行侧真能改文件（否则只会叙述）
      timeout "$TIMEOUT_S" "$RUNNER_BIN" -p "$prompt" --verbose --output-format stream-json \
        --permission-mode acceptEdits \
        --allowedTools 'Read,Glob,Grep,Edit,Write,Bash' \
        --max-turns "$MAX_TURNS" \
        --append-system-prompt "Follow this skill exactly:

$(cat "$SKILL")" > "$trace" 2>"$TMP/case-${cid}.err"
      rc=$?
      ;;
    codex)
      timeout "$TIMEOUT_S" "$RUNNER_BIN" exec --sandbox read-only \
        "Read and follow this skill exactly, then do the task.

$(cat "$SKILL")

TASK: $prompt" > "$trace" 2>"$TMP/case-${cid}.err"
      rc=$?
      ;;
    *)
      # 自定义 runner：约定兼容 `-p <prompt>`，stdout 输出 trace（便于接其他宿主或做假 runner 测试）
      timeout "$TIMEOUT_S" "$RUNNER_BIN" -p "Read and follow this skill exactly, then do the task.

$(cat "$SKILL")

TASK: $prompt" > "$trace" 2>"$TMP/case-${cid}.err"
      rc=$?
      ;;

  esac

  if [[ "$rc" -ne 0 ]] || [[ ! -s "$trace" ]]; then
    echo "  ✗ case ${cid}：执行失败 rc=${rc}（$(tail -1 "$TMP/case-${cid}.err" 2>/dev/null | cut -c1-100)）——不计为通过"
    _fail=$((_fail + 1))
    continue
  fi

  miss=""
  IFS=';' read -r -a _expect <<< "${expect:-}"
  for pat in ${_expect[@]+"${_expect[@]}"}; do
    [[ -z "$pat" ]] && continue
    grep -qE "$pat" "$trace" || miss="${miss}期望动作未出现: ${pat}；"
  done
  banned=""
  IFS=';' read -r -a _forbid <<< "${forbid:-}"
  for pat in ${_forbid[@]+"${_forbid[@]}"}; do
    [[ -z "$pat" ]] && continue
    grep -qE "$pat" "$trace" && banned="${banned}禁止动作出现: ${pat}；"
  done

  if [[ -z "$miss" && -z "$banned" ]]; then
    echo "  ✓ case ${cid}：期望动作全命中，未触禁止项"
    _pass=$((_pass + 1))
  else
    echo "  ✗ case ${cid}：${miss}${banned}"
    _fail=$((_fail + 1))
  fi
done < "$TMP/cases.tsv"

echo "Tier-3 行为评测：${_total} 例，PASS ${_pass}，FAIL ${_fail}（runner=${RUNNER_BIN}）"
[[ "$_fail" -eq 0 ]] && exit 0 || exit 1
