#!/bin/bash
# run-gates.sh — harness 守门套件入口
# 解析顺序（2026-10-05 起本地自持优先）：本仓 node_modules/vitest ＞ 借道 overlay
# node_modules。此前只借道 overlay（其 node_modules 软链 upstream，产品仓 v0.7.30
# 升级重装时 vitest 缺席，守门链断——守门依赖不得随产品仓升级漂移）。
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
# sh 守门先跑（2026-10-10 起：此前 sh 守门无聚合入口从未被自动执行，run12 源层
# HARD=0 在 F1-F18/V8.5 轮回潮 167 处即此缺口——守门不跑等于没有守门）。
for t in "$HERE"/mux/tests/*.test.sh; do
  bash "$t"
done
if [ -x "$HERE/node_modules/.bin/vitest" ]; then
  exec "$HERE/node_modules/.bin/vitest" run --root "$HERE" "$@"
fi
MX_OVERLAY_ROOT="${MX_OVERLAY_ROOT:-$(cd "$HERE/../overlay" 2>/dev/null && pwd)}"
cd "$MX_OVERLAY_ROOT"
export NODE_PATH="$MX_OVERLAY_ROOT/node_modules"
exec npx vitest run --root "$HERE" "$@"
