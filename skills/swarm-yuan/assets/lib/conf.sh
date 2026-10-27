#!/usr/bin/env bash
# conf.sh — 配置读取公共库（WP5）
# 契约：只读；不修改调用方环境（conf_effective 在子 shell 中 source）。
# 用法: source assets/lib/conf.sh

conf_valid_key() {  # $1=key → rc 0=合法
  case "${1:-}" in
    ""|*[!A-Z0-9_]*) return 1 ;;
    [A-Z_]*) return 0 ;;
    *) return 1 ;;
  esac
}

conf_get() {  # $1=KEY → stdout 当前环境值（空=未设）
  conf_valid_key "${1:-}" || return 1
  eval "printf '%s' \"\${$1:-}\""
}

conf_filled() {  # $1=KEY → rc 0=非空且不是 <占位符>
  local _v
  _v="$(conf_get "${1:-}")" || return 1
  [[ -n "$_v" && "$_v" != *"<"*">"* ]]
}

conf_count_vars() {  # $1=conf 文件 → stdout 变量行数
  local _n
  _n="$(grep -cE '^[A-Z_][A-Z0-9_]*=' "${1:-}" 2>/dev/null || true)"
  printf '%s' "${_n:-0}"
}

conf_effective() {  # $1=基础 conf $2=patch conf $3=KEY → stdout 合成值
  local _base="$1" _patch="$2" _key="$3"
  ( set +u
    [[ -f "$_base" ]] && . "$_base"
    [[ -f "$_patch" ]] && . "$_patch"
    conf_get "$_key"
  )
}

# ===== 有效配置内核（2026-10-26 可信性重构 Task 2 / A04）=====
# 语义：技能 conf 为受信 Shell 配置，按 core→arch→compliance→industry→patch
# 五层链式 source（与运行时 precheck.conf 尾部 source 链同序同义），末层赋值胜出
# ——含赋空（patch 置空即关闭，旧 grep 版读不到空值导致校验面与运行时各看不同真值）。
# 全部查询在子 shell 求值，零调用方污染；数组逐项输出，空格路径保真。

conf_files() {  # $1=skill_dir → stdout 存在的 conf 文件（五层加载序，每行一个）
  local _d="${1:-}" _c
  [[ -n "$_d" ]] || return 0
  for _c in scripts/precheck.conf scripts/precheck.arch.conf \
            scripts/precheck.compliance.conf scripts/precheck.industry.conf \
            scripts/precheck.patch.conf; do
    [[ -f "$_d/$_c" ]] && printf '%s\n' "$_d/$_c"
  done
  return 0
}

_conf_eval() {  # $1=skill_dir $2=求值表达式（子 shell 内、五层 source 后执行）
  local _d="$1"
  (
    set +u
    local _f
    while IFS= read -r _f; do
      . "$_f" || exit 9
    done < <(conf_files "$_d")
    eval "$2"
  )
}

conf_value() {  # $1=KEY $2=skill_dir → stdout 标量有效值（未设/赋空=空串）
  conf_valid_key "${1:-}" || return 1
  _conf_eval "$2" "conf_get '$1'"
}

conf_is_set() {  # $1=KEY $2=skill_dir → rc 0=曾被赋值（含赋空）
  conf_valid_key "${1:-}" || return 1
  _conf_eval "$2" "[[ -n \${$1+x} ]]"
}

conf_items() {  # $1=KEY $2=skill_dir → stdout 数组逐项一行（标量视作单元素；空=零行）
  conf_valid_key "${1:-}" || return 1
  # 未设键输出零行：printf 的空 %s 回放由 has-item 守卫压制。
  _conf_eval "$2" "set -- \${$1[@]+\"\${$1[@]}\"}; if [[ \$# -gt 0 ]]; then printf '%s\\n' \"\$@\"; fi"
}

conf_is_nonempty() {  # $1=KEY $2=skill_dir → rc 0=有效值非空（标量非空或数组含非空元素）
  conf_valid_key "${1:-}" || return 1
  _conf_eval "$2" "case \${$1+x} in x) set -- \${$1[@]+\"\${$1[@]}\"}; for _e in \"\$@\"; do [[ -n \"\$_e\" ]] && exit 0; done ;; esac; exit 1"
}

conf_quote() {  # $1=值 → stdout 可安全 source 的 Shell 字面量（%q）
  printf '%q' "$1"
}

conf_load() {  # $1=skill_dir → rc 0=五层全部可加载（含零文件）；任一加载失败=非零
  local _d="$1" _f _rc=0
  while IFS= read -r _f; do
    ( set +u; . "$_f" ) || _rc=1
  done < <(conf_files "$_d")
  return "$_rc"
}
