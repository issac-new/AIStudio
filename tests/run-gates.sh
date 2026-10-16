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
# 2026-10-16 并行化：串行全量 sh 守门 ~76s（multi-owner-stall 单文件 40s 大头是
# 16s 硬窗×用例），与 prelaunch 其它项叠加总链 >120s 会被外层工具超时杀中途留孤儿
# ——曾误诊为"看板查询间歇挂死"，实测 29 板全 <6s 零失败，真因=超时杀+孤儿堆积假象。
# 各测试用独立 mktemp CTRL 目录互不共享状态，并行安全；聚合退出码=任一失败即非零。
_pids=(); _names=()
for t in "$HERE"/mux/tests/*.test.sh "$HERE"/tests/*.test.sh; do
  bash "$t" &
  _pids+=($!); _names+=("$t")
done
_gate_rc=0
for _i in "${!_pids[@]}"; do
  wait "${_pids[$_i]}" || { echo "FAIL(sh) ${_names[$_i]}"; _gate_rc=1; }
done
[ "$_gate_rc" -eq 0 ] || exit "$_gate_rc"
# fixtures 防污染（run15 前置 P3-8）：vitest 会回写 fixtures 的时间戳/路径（run14 复盘
# 实锤两次提交污染），退出时一律还原已跟踪 fixtures——测试自身不依赖运行期回写。
restore_fixtures() { git -C "$HERE" checkout -- tests/fixtures/ 2>/dev/null || true; }
trap restore_fixtures EXIT
if [ -x "$HERE/node_modules/.bin/vitest" ]; then
  # 2026-10-16：vitest 偶发 [vitest-worker] Timeout calling "onTaskUpdate"——RPC 通信
  # 抖动（机器负载高时 3 跑中 2 次），180/180 全过但 rc=1 假红，prelaunch ① 被假红
  # 拦过两次。判据=测试全过（无 FAIL 行）且唯一错误是 worker RPC 超时→重跑一次；
  # 重跑仍红=真问题放行失败。禁无脑 retry（那会掩盖真失败）。
  _vt_out="$("$HERE/node_modules/.bin/vitest" run --root "$HERE" "$@" 2>&1)"; _vt_rc=$?
  if [ "$_vt_rc" -ne 0 ] && ! printf '%s' "$_vt_out" | grep -qE '(^| )FAIL |✗ |failed \(' \
     && printf '%s' "$_vt_out" | grep -q 'Timeout calling' \
     && printf '%s' "$_vt_out" | grep -qE 'Tests +[0-9]+ passed'; then
    echo "[gates] vitest worker RPC 超时但测试全过——重跑一次（区分基础设施抖动与真失败）"
    _vt_out="$("$HERE/node_modules/.bin/vitest" run --root "$HERE" "$@" 2>&1)"; _vt_rc=$?
  fi
  printf '%s\n' "$_vt_out"
  exit $_vt_rc
fi
MX_OVERLAY_ROOT="${MX_OVERLAY_ROOT:-$(cd "$HERE/../overlay" 2>/dev/null && pwd)}"
cd "$MX_OVERLAY_ROOT"
export NODE_PATH="$MX_OVERLAY_ROOT/node_modules"
npx vitest run --root "$HERE" "$@"
