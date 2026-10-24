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
