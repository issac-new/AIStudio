#!/usr/bin/env bash
# secure-fs.sh — 安全落盘公共库（可信性重构 Task 5 / A08）
# 契约：全部为纯函数式文件操作；临时文件与目标同目录（保证 rename 原子性）；
# 拒绝写入符号链接目标（防 TOCTOU 写穿）；锁为 mkdir 原子 + 属主 PID 探活。
# bash 3.2 兼容：无关联数组、无 mapfile。
# 用法: source assets/lib/secure-fs.sh

sfs_mktemp() {  # $1=目标文件 → stdout 同目录临时文件路径（调用方负责清理）
  local dir name t
  dir="$(dirname "$1")"; name="$(basename "$1")"
  t="$(mktemp "${dir}/.${name}.sfs.XXXXXX")" || return 1
  printf '%s' "$t"
}

# 原子替换：拒绝 symlink 目标；候选须与目标同目录（跨文件系统 mv 不原子）。
sfs_replace() {  # $1=目标 $2=候选 → rc 0=已替换
  local target="$1" cand="$2"
  [[ -f "$cand" ]] || return 1
  [[ "$(dirname "$cand")" == "$(dirname "$target")" ]] || return 1
  if [[ -L "$target" ]]; then
    echo "✗ sfs_replace: 目标是符号链接，拒绝写穿: $target" >&2
    return 1
  fi
  mv -f "$cand" "$target"
}

# 属主锁：mkdir 原子；持锁进程已死则回收；owner 文件含 PID 便于诊断。
sfs_lock() {  # $1=锁目录 → rc 0=获得
  local d="${1:-}" o
  [[ -n "$d" ]] || return 1
  if mkdir "$d" 2>/dev/null; then
    printf '%s\n' "$$" > "$d/owner"
    return 0
  fi
  o="$(cat "$d/owner" 2>/dev/null || cat "$d/pid" 2>/dev/null || true)"
  if [[ -n "$o" ]] && kill -0 "$o" 2>/dev/null; then
    return 1
  fi
  rm -rf "$d"
  mkdir "$d" 2>/dev/null || return 1
  printf '%s\n' "$$" > "$d/owner"
  return 0
}

sfs_unlock() {  # $1=锁目录（仅属主清除）
  local d="${1:-}" o
  [[ -n "$d" && -d "$d" ]] || return 0
  o="$(cat "$d/owner" 2>/dev/null || true)"
  [[ -z "$o" || "$o" == "$$" ]] && rm -rf "$d"
  return 0
}
