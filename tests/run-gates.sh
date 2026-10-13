#!/bin/bash
# run-gates.sh — harness 守门套件入口
# 解析顺序（2026-10-05 起本地自持优先）：本仓 node_modules/vitest ＞ 借道 overlay
# node_modules。此前只借道 overlay（其 node_modules 软链 upstream，产品仓 v0.7.30
# 升级重装时 vitest 缺席，守门链断——守门依赖不得随产品仓升级漂移）。
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
# sh 守门先跑（2026-10-10 起：此前 sh 守门无聚合入口从未被自动执行，run12 源层
# HARD=0 在 F1-F18/V8.5 轮回潮 167 处即此缺口——守门不跑等于没有守门）。
# 2026-10-14 起 tests/ 根的 *.test.sh 同入聚合（isolation-boundary/multi-owner-
# stall/nudge-branch-intel 落地时只手动跑过，无自动入口=守门形同虚设的同型缺口）。
for t in "$HERE"/mux/tests/*.test.sh "$HERE"/tests/*.test.sh; do
  bash "$t"
done
# fixtures 防污染（run15 前置 P3-8）：vitest 会回写 fixtures 的时间戳/路径（run14 复盘
# 实锤两次提交污染），退出时一律还原已跟踪 fixtures——测试自身不依赖运行期回写。
restore_fixtures() { git -C "$HERE" checkout -- tests/fixtures/ 2>/dev/null || true; }
trap restore_fixtures EXIT
if [ -x "$HERE/node_modules/.bin/vitest" ]; then
  "$HERE/node_modules/.bin/vitest" run --root "$HERE" "$@"
  exit $?
fi
MX_OVERLAY_ROOT="${MX_OVERLAY_ROOT:-$(cd "$HERE/../overlay" 2>/dev/null && pwd)}"
cd "$MX_OVERLAY_ROOT"
export NODE_PATH="$MX_OVERLAY_ROOT/node_modules"
npx vitest run --root "$HERE" "$@"
