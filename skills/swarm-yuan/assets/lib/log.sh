#!/usr/bin/env bash
# log.sh — 结果输出公共库（WP5）
# 只负责计数与格式；退出码由调用方决定。

LOG_PASS=0
LOG_FAIL=0
LOG_WARN=0

log_ok()   { LOG_PASS=$((LOG_PASS + 1)); printf '  ✓ %s\n' "$*"; }
log_bad()  { LOG_FAIL=$((LOG_FAIL + 1)); printf '  ✗ %s\n' "$*" >&2; }
log_warn() { LOG_WARN=$((LOG_WARN + 1)); printf '  ⚠ %s\n' "$*"; }

log_summary() {  # → rc 0=无失败
  printf '  pass=%s fail=%s warn=%s\n' "$LOG_PASS" "$LOG_FAIL" "$LOG_WARN"
  [[ "$LOG_FAIL" -eq 0 ]]
}
