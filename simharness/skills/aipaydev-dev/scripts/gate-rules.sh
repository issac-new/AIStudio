#!/usr/bin/env bash
# gate-rules.sh — rules.d 三值规则求值器（Codex Decision 架构的 bash 最小切片）
#
# 设计：
#   规则是数据不是代码：rules.d/*.rules 行格式
#     # 注释行
#     <pattern> → <allow|prompt|forbid> # <justification（forbid 须含替代方案）>
#   pattern 为 shell glob（fnmatch 语义，* 通配）；求值时多规则命中取最严：
#     forbid > prompt > allow（Codex execpolicy policy.rs .max() 同构）
#   求值器只是求值器：零内置规则（项目规则由探查期生成 / 审批沉淀写入）
#
# FORBID 消息 = 给模型的 API（Codex 拒绝消息带替代方案语义）：
#   FORBID <rule-id>: <原因>；替代：<justification 中"替代："后的内容>
#
# 用法:
#   bash gate-rules.sh <rules.d 目录> <待判定命令串>          # 输出三值之一 + FORBID 行
#   bash gate-rules.sh <rules.d 目录> <命令> --quiet           # 只输出三值（脚本内嵌用）
#   bash gate-rules.sh <rules.d 目录> --persist "<pattern>" <allow|prompt|forbid> "<justification>" [--goal <goal_id>]
#                                                               # 审批沉淀：临时放行持久化为规则
#                                                               # （写 approved.rules + decisions.jsonl 落痕，DESIGN §5.2）
# 退出码: 0=allow / 3=prompt / 2=forbid / 1=参数错（fail-closed：rules.d 缺失时 deny-ish →
#   返回 prompt——无规则数据时命令须过宿主审批通道，不静默放行；§2.2 教义）
# 红线: 求值模式不改任何文件；--persist 是唯一写入路径（校验→写 approved.rules→决策落痕，
#   禁止绕过校验直写规则文件）。FORBID 文案透传 stderr（宿主 hook deny 的 stderr 会回给模型）。
set -uo pipefail

RULES_DIR="${1:-}"
CMD="${2:-}"
QUIET=0
[[ "${3:-}" == "--quiet" ]] && QUIET=1

# ===== 审批沉淀模式（--persist）=====
if [[ "$CMD" == "--persist" ]]; then
  P_PAT="${3:-}"; P_DEC="${4:-}"; P_JUST="${5:-}"; P_GOAL=""
  shift 5 2>/dev/null || true
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --goal) P_GOAL="${2:-}"; shift 2 ;;
      *) echo "未知参数: $1（--persist 支持 --goal <goal_id>）" >&2; exit 1 ;;
    esac
  done
  [[ -d "$RULES_DIR" ]] || { echo "✗ rules.d 不存在: $RULES_DIR" >&2; exit 1; }
  [[ -n "$P_PAT" && -n "$P_JUST" ]] || { echo "Usage: bash gate-rules.sh <rules.d> --persist \"<pattern>\" <allow|prompt|forbid> \"<justification>\" [--goal <goal_id>]" >&2; exit 1; }
  case "$P_DEC" in allow|prompt|forbid) ;; *) echo "✗ verdict 须为 allow|prompt|forbid（收到: ${P_DEC}）" >&2; exit 1 ;; esac
  # 行格式纪律：forbid 须带替代方案（规则文件 §格式 同款约束）
  if [[ "$P_DEC" == "forbid" ]] && ! printf '%s' "$P_JUST" | grep -q '替代[：:]'; then
    echo "✗ forbid 规则的 justification 须含「替代：<方案>」（FORBID 消息 = 给模型的 API，§5.2）" >&2; exit 1
  fi
  # 幂等防线：同 pattern 已在任何规则文件 → 拒绝重复沉淀（改判请先删旧行）
  if grep -qF -- "$P_PAT" "$RULES_DIR"/*.rules 2>/dev/null; then
    echo "✗ pattern 已存在规则（$RULES_DIR 中命中「$P_PAT」）——改判请先删旧行再沉淀，避免双规则" >&2; exit 1
  fi
  _today=$(date -u +%Y-%m-%d)
  _target="$RULES_DIR/approved.rules"
  [[ -f "$_target" ]] || printf '# approved.rules — 审批沉淀（gate-rules.sh --persist 写入；每行 = 一次审批的持久化，可删行回退）\n' > "$_target"
  printf '%s → %s # %s（沉淀于 %s）\n' "$P_PAT" "$P_DEC" "$P_JUST" "$_today" >> "$_target" || { echo "✗ 写入失败: $_target" >&2; exit 1; }
  # 决策落痕（trace-log --decision；找不到记录器则降级提示，规则已生效不回滚）
  _tl=""; for _cand in "$(dirname "$0")/trace-log.sh" "$(dirname "$0")/../assets/trace-log.sh"; do
    [[ -f "$_cand" ]] && _tl="$_cand" && break
  done
  if [[ -n "$_tl" ]]; then
    _tl_args=(--decision --type UserChallenge --suggestion "rules: $P_PAT → $P_DEC" --user-action approved --outcome implemented --rationale "$P_JUST" --phase rules --reversibility reversible)
    [[ -n "$P_GOAL" ]] && _tl_args+=(--goal "$P_GOAL")
    bash "$_tl" "${_tl_args[@]}" >/dev/null 2>&1 && echo "✓ 已沉淀并落痕：${P_PAT} → ${P_DEC}（approved.rules + decisions.jsonl）" || echo "✓ 已沉淀：${P_PAT} → ${P_DEC}（approved.rules）；⚠ decisions.jsonl 落痕失败（trace-log 降级）" >&2
  else
    echo "✓ 已沉淀：${P_PAT} → ${P_DEC}（approved.rules）；⊘ trace-log.sh 未找到（决策落痕降级跳过）" >&2
  fi
  exit 0
fi

[[ -n "$CMD" ]] || {
  echo "Usage: bash gate-rules.sh <rules.d> <command> [--quiet]" >&2
  echo "       bash gate-rules.sh <rules.d> --persist \"<pattern>\" <verdict> \"<justification>\" [--goal <id>]" >&2
  exit 1
}

# 无规则数据 → prompt（fail 方向：不静默 allow，走审批；§2.2——有下层门禁兜底处才可 fail-open）
_shopt_nullglob=$(shopt -p nullglob 2>/dev/null || true)
shopt -s nullglob
_rule_files=("$RULES_DIR"/*.rules)
eval "$_shopt_nullglob" 2>/dev/null || true
[[ ${#_rule_files[@]} -eq 0 ]] && { [[ $QUIET -eq 0 ]] && echo "PROMPT（无规则数据——命令走宿主审批通道）"; echo "prompt"; exit 3; }

# 取命令首 token 做前缀匹配用（git push origin main → "git push"）
_first_two=$(printf '%s' "$CMD" | awk '{print $1" "$2}')
_first_one=$(printf '%s' "$CMD" | awk '{print $1}')

_decision=""     # 最严决策
_hit_line=""     # 命中的规则原文（最严者）
_rank() { case "$1" in forbid) echo 3;; prompt) echo 2;; allow) echo 1;; *) echo 0;; esac }

for _rf in "${_rule_files[@]}"; do
  while IFS= read -r _line || [[ -n "$_line" ]]; do
    _line="${_line%"${_line##*[![:space:]]}"}"   # 去尾空白
    [[ -z "$_line" || "$_line" == \#* ]] && continue
    # 解析: <pattern> → <decision> [# justification]
    # BSD awk -F 不支持多字节分隔符（→ 是 UTF-8 三字节）——用 sed 切
    _pat=$(printf '%s' "$_line" | sed 's/→.*$//' | sed 's/[[:space:]]*$//')
    _rest=$(printf '%s' "$_line" | sed -n 's/^[^→]*→//p')
    _dec=$(printf '%s' "$_rest" | awk '{print $1}')
    _just=$(printf '%s' "$_rest" | sed -n 's/^[[:space:]]*[a-z]*[[:space:]]*#[[:space:]]*//p')
    [[ -z "$_pat" || -z "$_dec" ]] && continue
    case "$_dec" in allow|prompt|forbid) ;; *) continue ;; esac
    # glob 匹配（对首 token 或首两 token；pattern 含空格则对首两 token 匹配）
    _matched=0
    # pattern 尾部 " *" 视为"可有可无的尾参"（npm publish * 也命中裸 "npm publish"）
    _pat_base="${_pat% \*}"
    case "$_first_two" in $_pat) _matched=1 ;; esac
    [[ "$_matched" -eq 0 ]] && case "$_first_one" in $_pat_base) _matched=1 ;; esac
    [[ "$_matched" -eq 0 ]] && case "$_first_two" in $_pat_base) _matched=1 ;; esac
    [[ "$_matched" -eq 0 ]] && case "$CMD" in $_pat) _matched=1 ;; esac
    # 3+ token pattern 的"尾 * 可省"失守——
    # "可有可无的尾参"只靠 _first_two 覆盖两 token（npm publish *），四 token 如
    # "docker compose down -v *"对裸命令不命中（CMD 全串 vs 含 * glob 差尾参），静默降级 prompt。
    # 补 CMD 前缀匹配 _pat_base*：裸命令与带任意尾参均命中，与行格式注释语义一致。
    [[ "$_matched" -eq 0 ]] && case "$CMD" in $_pat_base*) _matched=1 ;; esac
    [[ "$_matched" -eq 0 ]] && continue
    # 取最严
    if [[ $( _rank "$_dec") -ge $( _rank "${_decision:-allow}") || -z "$_decision" ]]; then
      if [[ -z "$_decision" ]] || [[ $( _rank "$_dec") -gt $( _rank "$_decision") ]]; then
        _decision="$_dec"; _hit_line="$_line"; _hit_pat="$_pat"; _hit_just="$_just"; _hit_file="$_rf"
      fi
    fi
  done < "$_rf"
done

_decision="${_decision:-prompt}"   # 规则文件存在但无一命中 → prompt（兜底矩阵语义）

if [[ "$_decision" == "forbid" ]]; then
  # 消息规格（头注释契约）：FORBID <rule-id>: <原因>；替代：<方案>——
  # _alt 提取后曾未使用（死变量），整段 justification 原样输出。
  _alt=$(printf '%s' "${_hit_just:-}" | sed -n 's/.*替代[：:][[:space:]]*//p')
  _reason=$(printf '%s' "${_hit_just:-}" | sed 's/[；;][[:space:]]*替代[：:].*$//')
  _rid=$(basename "${_hit_file:-${_rule_files[0]}}" .rules)
  if [[ -n "$_alt" ]]; then
    [[ $QUIET -eq 0 ]] && printf 'FORBID %s: %s；替代：%s\n' "$_rid" "${_reason:-命中规则「${_hit_pat}」}" "$_alt" >&2
  else
    [[ $QUIET -eq 0 ]] && printf 'FORBID %s: 命中规则「%s」——%s\n' "$_rid" "${_hit_pat}" "${_hit_just:-无理由}" >&2
  fi
elif [[ "$_decision" == "prompt" && $QUIET -eq 0 && -n "${_hit_just:-}" ]]; then
  printf 'PROMPT: %s\n' "$_hit_just" >&2
fi

[[ $QUIET -eq 0 ]] && printf '%s\n' "$_decision" | tr '[:lower:]' '[:upper:]'
printf '%s\n' "$_decision"
case "$_decision" in
  forbid) exit 2 ;;
  prompt) exit 3 ;;
  allow)  exit 0 ;;
esac
