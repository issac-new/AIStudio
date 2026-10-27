#!/bin/bash
# 检索深链改为弹窗后，通用射手必须重开并断言目标弹窗，不能只拍背景页。
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$HERE/mux/r18-frames.mjs"
_rc=0
fail() { printf 'FAIL: %s\n' "$*"; _rc=1; }

grep -q 'async function ensurePlannedSearchDialog' "$SCRIPT" || fail '缺少检索弹窗重开函数'
grep -q 'data-testid="global-search-dialog"' "$SCRIPT" || fail '缺少统一弹窗可见选择器'
grep -q 'data-testid="ia-header-search-input"' "$SCRIPT" || fail '缺少顶部检索入口选择器'
[ "$(grep -c 'await ensurePlannedSearchDialog()' "$SCRIPT")" -ge 3 ] || fail 'before/retry/after 三处采集未全部覆盖'
grep -q "if (PLAN_URL.includes('/app/search')) return 'app'" "$SCRIPT" || fail '检索重定向后就绪断言仍等待旧 /app/search 地址'
node --check "$SCRIPT" || fail 'r18-frames.mjs 语法检查失败'
[ "$_rc" -eq 0 ] && printf 'PASS: 检索弹窗采集守门\n'
exit "$_rc"
