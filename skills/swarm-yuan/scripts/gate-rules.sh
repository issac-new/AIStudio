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
EXPLAIN=0
case "${3:-}" in
  --quiet) QUIET=1 ;;
  --explain) EXPLAIN=1 ;;
esac
[[ "${4:-}" == "--explain" ]] && EXPLAIN=1

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

# ===== R125 复合命令拆分与归一化求值 =====
# 旧实现只对整条命令的首词/首两词求值：`git status && rm -rf /` 首词 allow 即整条放行。
# 现按 shell 分隔符（; | & 与换行，引号内不拆）切段，逐段求值取最严；
# 每段另做归一化（剥 sudo/env/command 包装词、bash -c 内层、env 赋值前缀、命令绝对路径）。
_rank() { case "$1" in forbid) echo 3;; prompt) echo 2;; allow) echo 1;; *) echo 0;; esac }

_split_segments() {
  printf '%s' "$1" | awk '
  BEGIN { s = ""; q = "" }
  {
    n = length($0)
    for (i = 1; i <= n; i++) {
      c = substr($0, i, 1)
      # 反斜杠只在单引号外转义后一个字符；不可把被转义引号当成引号结束。
      if (c == "\\" && q != "\047" && i < n) { s = s c substr($0, ++i, 1); continue }
      if (q != "") { s = s c; if (c == q) q = ""; continue }
      if (c == "\"" || c == "\047") { q = c; s = s c; continue }
      if (c == ";" || c == "|" || c == "&") {
        if ((c == "&" || c == "|") && i < n && substr($0, i+1, 1) == c) i++
        printf "%s%c", s, 0; s = ""; continue
      }
      s = s c
    }
    if (q != "") s = s "\n"
    else { printf "%s%c", s, 0; s = "" }
  }
  END { if (s != "") printf "%s%c", s, 0 }'
}

_normalize_seg() {
  local seg="$1" w inner rest
  seg="${seg#"${seg%%[![:space:]]*}"}"
  while :; do
    case "$seg" in
      "("*|"{"*) seg="${seg#?}"; seg="${seg#"${seg%%[![:space:]]*}"}" ;;
      *) break ;;
    esac
  done
  case "$seg" in
    bash\ -c\ *|sh\ -c\ *|zsh\ -c\ *|*/bash\ -c\ *|*/sh\ -c\ *)
      inner="${seg#* -c }"
      case "$inner" in
        \"*\") inner="${inner#\"}"; inner="${inner%\"}" ;;
        \'*\') inner="${inner#\'}"; inner="${inner%\'}" ;;
      esac
      seg="$inner" ;;
  esac
  while :; do
    w="${seg%%[[:space:]]*}"
    [[ -z "$w" ]] && break
    case "$w" in
      sudo|env|command|exec|nohup|time|nice|builtin|xargs)
        seg="${seg#"$w"}"; seg="${seg#"${seg%%[![:space:]]*}"}"; continue ;;
      */*)
        rest="${seg#"$w"}"
        seg="${w##*/}${rest}" ;;
      *=*)
        seg="${seg#"$w"}"; seg="${seg#"${seg%%[![:space:]]*}"}"; continue ;;
    esac
    break
  done
  printf '%s' "$seg"
}

_decision=""; _hit_line=""; _hit_pat=""; _hit_just=""; _hit_file=""; _hit_seg=""
_e_dec=""; _e_line=""; _e_pat=""; _e_just=""; _e_file=""

# 对单个命令段求值（R124 的 bash 参数展开解析，locale 无关）；结果写 _e_*
_eval_seg() {
  local seg="$1" _first_two _first_one _rf _line _pat _rest _dec _just _matched _pat_base
  _e_dec=""; _e_line=""; _e_pat=""; _e_just=""; _e_file=""
  _first_two=$(printf '%s' "$seg" | awk '{print $1" "$2}')
  _first_one=$(printf '%s' "$seg" | awk '{print $1}')
  # R126：小写候选（命令段不变形，仅匹配侧多判一次；性能=每段一次 tr 两次 awk）
  local _seg_lc _f2_lc _f1_lc
  _seg_lc=$(printf '%s' "$seg" | tr '[:upper:]' '[:lower:]')
  if [[ "$_seg_lc" != "$seg" ]]; then
    _f2_lc=$(printf '%s' "$_seg_lc" | awk '{print $1" "$2}')
    _f1_lc=$(printf '%s' "$_seg_lc" | awk '{print $1}')
  else
    _f2_lc="$_first_two"; _f1_lc="$_first_one"
  fi
  for _rf in "${_rule_files[@]}"; do
    while IFS= read -r _line || [[ -n "$_line" ]]; do
      _line="${_line%"${_line##*[![:space:]]}"}"   # 去尾空白
      [[ -z "$_line" || "$_line" == \#* ]] && continue
      # 解析: <pattern> → <decision> [# justification]
      # BSD awk -F 不支持多字节分隔符（→ 是 UTF-8 三字节）——不用 sed 切（C locale 下按字节匹配
      # 会截断 UTF-8 中文理由变乱码，R124 实证）。bash 参数展开按字面字节匹配，locale 无关。
      _pat="${_line%%→*}"
      _rest="${_line#*→}"
      _pat="${_pat#"${_pat%%[![:space:]]*}"}"
      _pat="${_pat%"${_pat##*[![:space:]]}"}"
      _dec="${_rest#"${_rest%%[![:space:]]*}"}"
      _dec="${_dec%%[[:space:]]*}"
      if [[ "$_rest" == *"#"* ]]; then
        _just="${_rest#*#}"
        _just="${_just#"${_just%%[![:space:]]*}"}"
      else
        _just=""
      fi
      [[ -z "$_pat" || -z "$_dec" ]] && continue
      case "$_dec" in allow|prompt|forbid) ;; *) continue ;; esac
      _matched=0
      _pat_base="${_pat% \*}"
      case "$_first_two" in $_pat) _matched=1 ;; esac
      [[ "$_matched" -eq 0 ]] && case "$_first_one" in $_pat_base) _matched=1 ;; esac
      [[ "$_matched" -eq 0 ]] && case "$_first_two" in $_pat_base) _matched=1 ;; esac
      [[ "$_matched" -eq 0 ]] && case "$seg" in $_pat) _matched=1 ;; esac
      [[ "$_matched" -eq 0 ]] && case "$seg" in $_pat_base*) _matched=1 ;; esac
      # R126：小写形态二次判定——大小写不敏感文件系统（macOS APFS 默认）上 `RM -RF /`
      # 真会执行 rm 但不命中全小写规则表。规则全小写，命令段小写化后重判一次。
      if [[ "$_matched" -eq 0 && "$_seg_lc" != "$seg" ]]; then
        case "$_f2_lc" in $_pat) _matched=1 ;; esac
        [[ "$_matched" -eq 0 ]] && case "$_f1_lc" in $_pat_base) _matched=1 ;; esac
        [[ "$_matched" -eq 0 ]] && case "$_f2_lc" in $_pat_base) _matched=1 ;; esac
        [[ "$_matched" -eq 0 ]] && case "$_seg_lc" in $_pat) _matched=1 ;; esac
        [[ "$_matched" -eq 0 ]] && case "$_seg_lc" in $_pat_base*) _matched=1 ;; esac
      fi
      [[ "$_matched" -eq 0 ]] && continue
      if [[ -z "$_e_dec" ]] || [[ $( _rank "$_dec") -gt $( _rank "$_e_dec") ]]; then
        _e_dec="$_dec"; _e_line="$_line"; _e_pat="$_pat"; _e_just="$_just"; _e_file="$_rf"
      fi
    done < "$_rf"
  done
}

_record_decision() { # $1=段 $2=decision；其余命中信息来自 _eval_seg
  local seg="$1" decision="$2"
  if [[ -z "$_decision" ]] || [[ $( _rank "$decision") -gt $( _rank "$_decision") ]]; then
    _decision="$decision"; _hit_line="$_e_line"; _hit_pat="$_e_pat"; _hit_just="$_e_just"; _hit_file="$_e_file"; _hit_seg="$seg"
  fi
}

# 命令替换体提取（R128）：`$( … )`（嵌套感知）与反引号对内的命令在求值时真实执行，
# 旧版 _split_segments 只按 ; | & 切段，`echo $(rm -rf x)` 整段首词 echo 无规则 → prompt，
# forbid 被藏进替换体。单引号内不展开故跳过；双引号内仍展开故纳入。
# 输出：每个替换体一段，NUL 分隔（与 _split_segments 同协议），由 _eval_command 递归求值。
_extract_cmdsubs() {
  printf '%s' "$1" | awk '
  BEGIN { q = ""; depth = 0; body = ""; bt = 0; btbody = "" }
  {
    n = length($0)
    for (i = 1; i <= n; i++) {
      c = substr($0, i, 1)
      if (c == "\\" && q != "\047" && i < n) {
        if (depth > 0) body = body c substr($0, i+1, 1)
        if (bt) btbody = btbody c substr($0, i+1, 1)
        i++; continue
      }
      if (q == "\047") { if (c == "\047") q = ""; else if (depth > 0) body = body c; continue }
      if (bt) {
        if (c == "`") { printf "%s%c", btbody, 0; btbody = ""; bt = 0 }
        else btbody = btbody c
        continue
      }
      if (c == "\047" && depth == 0) { q = "\047"; continue }
      if (c == "\047") { q = "\047"; body = body c; continue }
      if (c == "$" && i < n && substr($0, i+1, 1) == "(") {
        if (depth > 0) body = body "$("
        depth++; i++; continue
      }
      if (depth > 0) {
        if (c == ")") { depth--; if (depth == 0) { printf "%s%c", body, 0; body = "" } else body = body c; continue }
        body = body c; continue
      }
      if (c == "`") { bt = 1; btbody = ""; continue }
    }
  }'
}

# 每个终端命令段都有裁决，未匹配段为 prompt；归一不是已完成求值，
# 例如 bash -c 内仍可有多条命令，须递归拆分。原始包装层的 forbid/prompt 仍取最严。
_eval_command() {
  local command="$1" depth="${2:-0}" raw normalized sub
  if [[ "$depth" -ge 16 ]]; then
    _e_line=""; _e_pat=""; _e_just=""; _e_file=""
    _record_decision "$command" prompt
    return 0
  fi
  while IFS= read -r -d '' raw; do
    raw="${raw#"${raw%%[![:space:]]*}"}"
    [[ -z "$raw" ]] && continue
    _eval_seg "$raw"
    normalized=$(_normalize_seg "$raw")
    if [[ -n "$normalized" && "$normalized" != "$raw" ]]; then
      case "$_e_dec" in forbid|prompt) _record_decision "$raw" "$_e_dec" ;; esac
      _eval_command "$normalized" "$((depth + 1))"
    else
      _record_decision "$raw" "${_e_dec:-prompt}"
    fi
    # R128：段内命令替换体（$(…)/`…`）作为子命令递归求值——替换体里的 forbid 不得被外层首词掩盖
    while IFS= read -r -d '' sub; do
      sub="${sub#"${sub%%[![:space:]]*}"}"
      [[ -z "$sub" ]] && continue
      _eval_command "$sub" "$((depth + 1))"
    done < <(_extract_cmdsubs "$raw")
  done < <(_split_segments "$command")
}

_eval_command "$CMD"

_decision="${_decision:-prompt}"   # 规则文件存在但无一命中 → prompt（兜底矩阵语义）

# --explain：把"哪个命令段命中哪条规则"回放给调用方（排查误报/复盘拦截的依据）
if [[ $EXPLAIN -eq 1 ]]; then
  if [[ -n "${_hit_pat:-}" ]]; then
    printf 'EXPLAIN: segment=%s | pattern=%s | decision=%s | rule=%s\n' \
      "${_hit_seg:-}" "$_hit_pat" "$_decision" "$(basename "${_hit_file:-?}" .rules)" >&2
  else
    printf 'EXPLAIN: 无规则命中（命令=%s），兜底 decision=%s\n' "$CMD" "$_decision" >&2
  fi
fi

if [[ "$_decision" == "forbid" ]]; then
  # 消息规格（头注释契约）：FORBID <rule-id>: <原因>；替代：<方案>——
  # _alt 提取后曾未使用（死变量），整段 justification 原样输出。
  _alt=""
  case "${_hit_just:-}" in
    *"替代："*) _alt="${_hit_just#*替代：}" ;;
    *"替代:"*) _alt="${_hit_just#*替代:}" ;;
  esac
  _reason="${_hit_just:-}"
  case "$_reason" in
    *"；替代"*) _reason="${_reason%%；替代*}" ;;
    *"; 替代"*) _reason="${_reason%%; 替代*}" ;;
    *";替代"*) _reason="${_reason%%;替代*}" ;;
  esac
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
