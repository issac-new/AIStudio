#!/usr/bin/env bash
# test-upstream-probe.sh — 上游查新探针离线契约（WP3）
set -uo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)"
PROBE="$BASE/scripts/upstream-probe.sh"
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

if bash "$PROBE" --offline --check >/tmp/swarm-probe-check.$$ 2>&1; then
  ok "runtimes.tsv 结构校验"
else
  bad "runtimes.tsv 结构校验失败"
  cat /tmp/swarm-probe-check.$$ || true
fi
rm -f /tmp/swarm-probe-check.$$

out="$(bash "$PROBE" --json --offline 2>/dev/null)"
n="$(printf '%s' "$out" | grep -o '"id"' | wc -l | tr -d ' ')"
[[ "$n" -eq 22 ]] && ok "JSON 22 条" || bad "JSON 条数 $n ≠ 22"
u="$(printf '%s' "$out" | grep -o '"drift":"unknown"' | wc -l | tr -d ' ')"
[[ "$u" -eq 22 ]] && ok "离线全部 unknown" || bad "离线 drift unknown $u ≠ 22"
printf '%s' "$out" | grep -q '"id":"GitNexus".*"status":"license-risk"' && ok "GitNexus license-risk" || bad "GitNexus 状态缺失"
printf '%s' "$out" | grep -q '"id":"claude-mem".*"status":"watch"' && ok "claude-mem watch" || bad "claude-mem 状态缺失"
printf '%s' "$out" | grep -q '"id":"ocr".*"pkg_name":"@alibaba-group/open-code-review"' && ok "ocr 撞名包名" || bad "ocr 包名缺失"

echo "PASS test-upstream-probe ($pass ok, $fail fail)"
[[ "$fail" -eq 0 ]]
