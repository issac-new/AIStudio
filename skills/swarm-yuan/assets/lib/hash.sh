#!/usr/bin/env bash
# hash.sh — 校验和公共库（WP5）
# 优先 shasum（macOS/BSD），回退 sha256sum（Linux）。

hash_sha256_file() {  # $1=文件 → stdout hex（失败为空）
  local f="${1:-}"
  [[ -f "$f" ]] || return 1
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | awk '{print $1}'
  else
    return 1
  fi
}

hash_sha256_stdin() {  # stdin → stdout hex
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    return 1
  fi
}

hash_cksum_file() {  # $1=文件 → stdout cksum 数值
  cksum "${1:-}" 2>/dev/null | awk '{print $1}'
}
