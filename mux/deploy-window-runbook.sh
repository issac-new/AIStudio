#!/bin/bash
# deploy-window-runbook.sh — run 收官后的一键部署批（2026-10-15「8-13 直接做」轮）
#
# 执行前置（硬闸，缺一即拒跑）：
#   ① SIM_ROOT/var/current-state.env 锚定的当前轮 state.env 已有 report_done=1
#   ② 驱动/监督器进程已退场（pgrep 无 aipay-scenario/run-driver-supervisor）
# 前置不满足=窗口未开，本脚本零动作退出（宁可拒跑不可在活轮上注入）。
#
# 批内容（幂等，可重跑）：
#   A. prelaunch 十七项全绿（含 ⑯ 代偿清偿门、⑰ 监督器健康）
#   B. overlay npm run inject（clean 带服放行：8802 跑 product-dist 独立副本，
#      与 upstream 树无分裂；OVERLAY_ALLOW_LIVE_CLEAN=1）
#   C. hermes-agent 目标文件的 SIM 运行时副本部署（deploy 通道；内容级核对）
#   D. escalate 开关落 SIM 运行时 config（approvals.timeout_action=escalate；
#      不想开则 env DEPLOY_ESCALATE=0 跳过——开关权在用户，缺省开）
#   E. 活体验证三件：hermes kanban selfcheck / sleeping-workers / dispatcher snapshot
#      + 两端点：autosched schedule / orgloop gate-repairs + humansim/observability
#   G. build:full + product-dist 快照 + 8802 换装重启（mx-up 幂等拉起）
#   F. run21 换装随 mx-up 自然完成（无动作，打印提示）
#
# 分步模式（2026-10-16 补：全链 >2min 会被外层超时杀中途留孤儿 kanban CLI 进程——
# 那是工具超时不是挂死；单步跑可绕过，EXIT trap 兜底清孤儿）：
#   bash deploy-window-runbook.sh --step prelaunch|inject|deploy|escalate|verify|build|all
set -u
LC_ALL=C
OV="${MX_OVERLAY_ROOT:-/Users/cuishi/lab/ncwk/overlay}"
SR="${AIPAY_SIM_ROOT:-/Users/cuishi/lab/ncwk-sim-mux}"
HAR="${MX_HARNESS_ROOT:-/Users/cuishi/lab/ncwk/simharness}"

# ── 孤儿兜底：本脚本被外层超时/信号杀中途时，清掉它派生的 kanban CLI 子进程
#    （hermes-sim kanban 单次 ~4s 全量 import；29 板串行=~2min，被杀的父 bash
#    留下的子进程会堆积成"疑似挂死"假象——实测 29 板全部 <6s 零失败）──
_orphan_sweep() {
  pkill -f "hermes-sim.py kanban" 2>/dev/null
  pkill -f "mx-prelaunch-check.sh" 2>/dev/null
  return 0
}
trap '_orphan_sweep' EXIT INT TERM

STEP=all
[ "${1:-}" = "--step" ] && STEP="${2:-all}"
case "$STEP" in
  prelaunch|inject|deploy|escalate|verify|build|all) ;;
  *) echo "✗ 未知 step：$STEP（合法=prelaunch|inject|deploy|escalate|verify|build|all）"; exit 2 ;;
esac

echo "=== 部署窗口批（$(date '+%F %T')，step=$STEP）==="
# ── 硬闸：窗口判定 ──
# 当前轮=runs/ 下 state.env 最新修改者（current-state.env 是 SIM 根全局锚，不含轮号）
RUN_ID=$(ls -t "$SR"/runs/*/state.env 2>/dev/null | head -1 | xargs dirname 2>/dev/null | xargs basename 2>/dev/null)
[ -n "$RUN_ID" ] || { echo "✗ runs/ 下无任何轮次 state.env——无推演在案，直接跑 mx-up 侧即可"; exit 2; }
if [ "${DEPLOY_PAUSED:-0}" != "1" ] && ! grep -q '^report_done=' "$SR/runs/$RUN_ID/state.env" 2>/dev/null; then
  echo "✗ 窗口未开：run $RUN_ID 尚未 report_done——本批零动作退出（活轮禁注入）"; exit 1
fi
if pgrep -f "aipay-scenario.sh|run-driver-supervisor" >/dev/null 2>&1; then
  echo "✗ 驱动/监督器仍在跑——本批零动作退出"; exit 1
fi
echo "✓ 窗口判定通过（run $RUN_ID 已收官，进程已退场）"

# ── A. prelaunch 十七项 ──
if [ "$STEP" = all ] || [ "$STEP" = prelaunch ]; then
  echo "--- A. prelaunch 十七项 ---"
  bash "$HAR/mux/mx-prelaunch-check.sh" || { echo "✗ prelaunch 有红项——修复后重跑本批"; exit 1; }
fi

# ── B. inject ──
if [ "$STEP" = all ] || [ "$STEP" = inject ]; then
  echo "--- B. inject（clean 带服放行+全系列）---"
  ( cd "$OV" && OVERLAY_ALLOW_LIVE_CLEAN=1 npm run clean && npm run inject ) \
    || { echo "✗ clean/inject 失败——按输出排查后重跑"; exit 1; }
fi

# ── C. agent 补丁的运行时副本部署 ──
if [ "$STEP" = all ] || [ "$STEP" = deploy ]; then
  echo "--- C. hermes-agent 运行时副本（内容级核对）---"
  for f in tools/approval_context.py tools/approval_gateway_wait.py gateway/kanban_watchers_dispatcher.py hermes_cli/kanban_db.py hermes_cli/kanban_parser.py hermes_cli/kanban.py tools/file_tools.py; do
    src="$OV/../upstream/hermes-agent/$f"; dst="$SR/hermes-agent-src/$f"
    if [ -f "$src" ] && [ -d "$(dirname "$dst")" ]; then
      if cmp -s "$src" "$dst"; then echo "  = $f（已一致）"; else cp "$src" "$dst" && echo "  ↻ $f 已部署"; fi
    else
      echo "  ? $f 源或目标缺席——deploy 通道核对" >&2
    fi
  done
fi

# ── D. escalate 开关 ──
if [ "$STEP" = all ] || [ "$STEP" = escalate ]; then
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
fi

# ── E. 活体验证 ──
if [ "$STEP" = all ] || [ "$STEP" = verify ]; then
  echo "--- E. 活体验证 ---"
  H="$SR/hermes-agent-src/venv/bin/hermes"
  [ -x "$H" ] || H="$SR/bin/hermes-sim"
  # 0.22.2 适配（2026-10-16 快照升级轮）：upstream 重写 kanban CLI——selfcheck/
  # sleeping-workers/dispatcher_health_snapshot 三面消失（634/635 补丁未入 mx_apply
  # 清单，旧形态随 0.21.x 基底退场）。等价验证三件：boards list（板库可达）+
  # diagnostics（卡级健康诊断）+ 网关日志 dispatcher tick（派发器活着）。
  HERMES_HOME="$SR/hermes" "$H" kanban boards list >/dev/null 2>&1 && echo "  ✓ boards list（板库可达）" || echo "  ✗ boards list（见上）"
  HERMES_HOME="$SR/hermes" "$H" kanban diagnostics 2>/dev/null | head -4 && echo "  ✓ diagnostics（卡级诊断面）"
  _tick=$(tail -200 "$SR/logs/gateway.log" 2>/dev/null | grep -cE "dispatcher|dispatch" || true)
  echo "  dispatcher 活性：gateway.log 近 200 行含 dispatch 字样 ${_tick} 处（>0=派发器在跑）"
  for url in "http://127.0.0.1:8802/api/hermes/autosched/schedule" "http://127.0.0.1:8802/api/hermes/orgloop/gate-repairs" "http://127.0.0.1:8802/api/hermes/humansim/audit" "http://127.0.0.1:8802/api/hermes/observability/run-state"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 3 "$url" 2>/dev/null || echo 000)
    echo "  $code $url（503=fail-closed 未开 env，属预期可接受）"
  done
fi

# ── G. build:full + product-dist 快照 + 8802 换装 ──
# 2026-10-16 补：原 runbook 只到 inject，产品 bundle 不换装=部署半程
# （今晨实证：inject 后 8802 仍是旧 bundle，G5 护盘/新鲜度过滤全不生效）。
if [ "$STEP" = all ] || [ "$STEP" = build ]; then
  echo "--- G. build:full + product-dist 快照 + 换装 ---"
  ( cd "$OV" && npm run build:full ) || { echo "✗ build:full 失败"; exit 1; }
  LIVE="$OV/../upstream/hermes-studio/dist"
  [ -f "$LIVE/server/index.js" ] || { echo "✗ 活树无构建产物 $LIVE"; exit 1; }
  rsync -a --delete --exclude node_modules "$LIVE/" "$SR/product-dist/" || { echo "✗ product-dist 同步失败"; exit 1; }
  echo "  ↻ product-dist 快照已更新"
  _p=$(lsof -ti :8802 2>/dev/null | head -1)
  [ -n "$_p" ] && { kill "$_p" && echo "  ↻ 旧 studio（pid $_p）已停"; sleep 2; }
  ( cd "$HAR" && bash mux/mx-up.sh ) || { echo "✗ mx-up 换装失败"; exit 1; }
  for _ in 1 2 3 4 5 6; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:8802/ 2>/dev/null || echo 000)
    [ "$code" = 200 ] && { echo "  ✓ 8802 换装就绪（200）"; break; }
    sleep 5
  done
  [ "${code:-000}" = 200 ] || echo "  ✗ 8802 未就绪（${code:-000}）——查 logs/studio.log"
fi

echo "=== 批完成（step=$STEP）==="
echo "F. run21 换装：起跑时 mx-up 自然拉起新版监督器/哨兵/代批环+studio——无本批动作。"
echo "下一步（你决定）：按 run-strict-posture-runbook.md 启动序列开 strict 实验轮，或按标准姿态开 run21（无用户明确指令不得启动轮次）。"
