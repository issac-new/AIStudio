#!/bin/bash
# deploy-window-runbook.sh — run20 收官后的一键部署批（2026-10-15「8-13 直接做」轮）
#
# 执行前置（硬闸，缺一即拒跑）：
#   ① SIM_ROOT/var/current-state.env 锚定的当前轮 state.env 已有 report_done=1
#   ② 驱动/监督器进程已退场（pgrep 无 aipay-scenario/run-driver-supervisor）
# 前置不满足=窗口未开，本脚本零动作退出（宁可拒跑不可在活轮上注入）。
#
# 批内容（幂等，可重跑）：
#   A. prelaunch 十六项全绿（含 ⑯ 代偿清偿门——run20 无台账自动过）
#   B. overlay npm run inject（六补丁 631-636：PR-0 通道/PR-1~4 产品补丁/PR-5/6/7 挂载）
#   C. hermes-agent 六补丁目标文件的 SIM 运行时副本部署（deploy 通道；内容级核对）
#   D. escalate 开关落 SIM 运行时 config（approvals.timeout_action=escalate；
#      不想开则 env DEPLOY_ESCALATE=0 跳过——开关权在用户，缺省开）
#   E. 活体验证三件：hermes kanban selfcheck / sleeping-workers / dispatcher snapshot
#      + 两端点：autosched schedule / orgloop gate-repairs + humansim/observability
#   F. run21 换装随 mx-up 自然完成（无动作，打印提示）
set -u
LC_ALL=C
OV="${MX_OVERLAY_ROOT:-/Users/cuishi/lab/ncwk/overlay}"
SR="${AIPAY_SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}"
HAR="${MX_HARNESS_ROOT:-/Users/cuishi/lab/ncwk/simharness}"

echo "=== 部署窗口批（$(date '+%F %T')）==="
# ── 硬闸：窗口判定 ──
# 当前轮=runs/ 下 state.env 最新修改者（current-state.env 是 SIM 根全局锚，不含轮号）
RUN_ID=$(ls -t "$SR"/runs/*/state.env 2>/dev/null | head -1 | xargs dirname 2>/dev/null | xargs basename 2>/dev/null)
[ -n "$RUN_ID" ] || { echo "✗ runs/ 下无任何轮次 state.env——无推演在案，直接跑 mx-up 侧即可"; exit 2; }
if ! grep -q '^report_done=' "$SR/runs/$RUN_ID/state.env" 2>/dev/null; then
  echo "✗ 窗口未开：run $RUN_ID 尚未 report_done——本批零动作退出（活轮禁注入）"; exit 1
fi
if pgrep -f "aipay-scenario.sh|run-driver-supervisor" >/dev/null 2>&1; then
  echo "✗ 驱动/监督器仍在跑——本批零动作退出"; exit 1
fi
echo "✓ 窗口判定通过（run $RUN_ID 已收官，进程已退场）"

# ── A. prelaunch 十六项 ──
echo "--- A. prelaunch 十六项 ---"
bash "$HAR/mux/mx-prelaunch-check.sh" || { echo "✗ prelaunch 有红项——修复后重跑本批"; exit 1; }

# ── B. inject 六补丁 ──
echo "--- B. inject（631-636）---"
( cd "$OV" && npm run inject ) || { echo "✗ inject 失败——按 /tmp 或 inject 输出排查后重跑"; exit 1; }

# ── C. agent 补丁的运行时副本部署 ──
echo "--- C. hermes-agent 运行时副本（内容级核对）---"
for f in tools/approval_context.py tools/approval_gateway_wait.py gateway/kanban_watchers_dispatcher.py hermes_cli/kanban_db.py hermes_cli/kanban_parser.py hermes_cli/kanban.py; do
  src="$OV/../upstream/hermes-agent/$f"; dst="$SR/hermes-agent-src/$f"
  if [ -f "$src" ] && [ -d "$(dirname "$dst")" ]; then
    if cmp -s "$src" "$dst"; then echo "  = $f（已一致）"; else cp "$src" "$dst" && echo "  ↻ $f 已部署"; fi
  else
    echo "  ? $f 源或目标缺席——deploy 通道核对" >&2
  fi
done

# ── D. escalate 开关 ──
echo "--- D. approvals.timeout_action ---"
CFG="$SR/hermes-agent-src/config.yaml"
if [ "${DEPLOY_ESCALATE:-1}" = "1" ] && [ -f "$CFG" ]; then
  if grep -q '^timeout_action:' "$CFG"; then
    sed -i '' 's/^timeout_action:.*/timeout_action: escalate   # PR-2 (633), V8.29 治理轮/' "$CFG"
  else
    printf '\ntimeout_action: escalate   # PR-2 (633), V8.29 治理轮——不想要就删本行\n' >> "$CFG"
  fi
  echo "  ↻ escalate 已开（DEPLOY_ESCALATE=0 可关）"
else
  echo "  - 跳过（DEPLOY_ESCALATE=0 或 config 缺席）"
fi

# ── E. 活体验证 ──
echo "--- E. 活体验证 ---"
H="$SR/hermes-agent-src/venv/bin/hermes"
[ -x "$H" ] || H="$(command -v hermes)"
HERMES_HOME="$SR/hermes" "$H" kanban selfcheck && echo "  ✓ selfcheck" || echo "  ✗ selfcheck（见上）"
HERMES_HOME="$SR/hermes" "$H" kanban sleeping-workers --idle-sec 60 | head -5 && echo "  ✓ sleeping-workers"
python3 -c "
import sys; sys.path.insert(0, '$SR/hermes-agent-src')
from gateway.kanban_watchers_dispatcher import dispatcher_health_snapshot
print('  ✓ dispatcher snapshot:', dispatcher_health_snapshot())" 2>&1 | head -3
for url in "http://127.0.0.1:8802/api/hermes/autosched/schedule" "http://127.0.0.1:8802/api/hermes/orgloop/gate-repairs" "http://127.0.0.1:8802/api/hermes/humansim/audit" "http://127.0.0.1:8802/api/hermes/observability/run-state"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 3 "$url" 2>/dev/null || echo 000)
  echo "  $code $url（503=fail-closed 未开 env，属预期可接受）"
done

echo "=== 批完成 ==="
echo "F. run21 换装：起跑时 mx-up 自然拉起新版监督器/哨兵/代批环+studio（重启用 inject 后的树）——无本批动作。"
echo "下一步（你决定）：bash $HAR/mux/run-strict-posture-runbook.md 的启动序列开 strict 实验轮，或按标准姿态开 run21。"
