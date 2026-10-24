#!/usr/bin/env bash
# run.sh — 运行上下文公共库（WP5）
# run_id / 临时目录 / 目录锁；bash 3.2 兼容。

run_id() {
  printf '%s-%s' "$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || date +%Y%m%dT%H%M%SZ)" "$$"
}

run_tmpdir() {  # $1=前缀 → stdout 目录
  mktemp -d "${TMPDIR:-/tmp}/${1:-swarm-run}.XXXXXX"
}

run_lock() {  # $1=锁目录 → rc 0=获得；1=被活跃进程持有
  local d="${1:-}" o
  [[ -n "$d" ]] || return 1
  if mkdir "$d" 2>/dev/null; then
    printf '%s\n' "$$" > "$d/pid"
    return 0
  fi
  o="$(cat "$d/pid" 2>/dev/null || true)"
  if [[ -n "$o" ]] && kill -0 "$o" 2>/dev/null; then
    return 1
  fi
  rm -rf "$d"
  mkdir "$d" 2>/dev/null || return 1
  printf '%s\n' "$$" > "$d/pid"
}

run_unlock() {  # $1=锁目录
  [[ -n "${1:-}" ]] && rm -rf "$1"
}
