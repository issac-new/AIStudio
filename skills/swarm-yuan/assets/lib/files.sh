#!/usr/bin/env bash
# files.sh — 扫描上下文公共库（WP5）
# 一次 find 建缓存，门禁/探测器按名/glob 查询；排除链只在这里维护一份。
# 用法: source assets/lib/files.sh; files_init "$PROJECT_DIR"; files_by_glob 'package.json'; files_cleanup

FILES_CACHE=""

files_init() {  # $1=根目录
  local root="${1:-.}"
  root="${root%/}"
  FILES_CACHE="$(mktemp "${TMPDIR:-/tmp}/swarm-files.XXXXXX")"
  find "$root" \
    \( -type d \( \
      -name node_modules -o -name .git -o -name target -o -name build -o -name dist -o \
      -name vendor -o -name .venv -o -name venv -o -name site-packages -o -name __pycache__ -o -name .swarm-yuan -o \
      -path "$root/research" -o -path "$root/docs" -o -path "$root/third_party" -o \
      -path "$root/tests/fixtures" -o -path "$root/tests/gate-fixtures" \
    \) -prune \) -o -type f -print > "$FILES_CACHE" 2>/dev/null || true
}

files_by_glob() {  # $1=glob（匹配 basename）→ stdout 路径
  local pat="${1:-}" f
  [[ -n "$FILES_CACHE" && -f "$FILES_CACHE" ]] || return 0
  while IFS= read -r f; do
    [[ -n "$f" ]] || continue
    case "${f##*/}" in $pat) printf '%s\n' "$f" ;; esac
  done < "$FILES_CACHE"
}

files_first() {  # $1=glob → stdout 首个命中
  files_by_glob "$1" | head -1
}

files_count() {  # $1=glob → stdout 数量
  files_by_glob "$1" | wc -l | tr -d ' '
}

files_cleanup() {
  if [[ -n "$FILES_CACHE" && -f "$FILES_CACHE" ]]; then rm -f "$FILES_CACHE"; fi
  FILES_CACHE=""
}
