#!/bin/bash
# mx-sim-gateway-service.sh — SIM 网关 launchd 托管面（宿主清扫豁免+会话回收免疫）
#
# 根治对象（run20 三杀+本日维护窗击杀潮）：宿主 hermes 栈的孤儿清扫器
# （hermes_cli/gateway.py _reap_unsupervised_gateway_orphans）在 macOS 无 systemd
# 时对「无监督形态网关」做 argv 扫描硬杀——SIM 网关 nohup 形态+宿主 pidfile 看不见
# 其记录=每遇宿主 Desktop 启动/维护窗就被当孤儿 SIGTERM。
#
# 豁免机制（读宿主源码实证，hermes_cli/gateway.py:180-205）：孤儿清扫器以
# all_profiles=True 调 _get_service_pids()，其 macOS 分支对 `launchctl list` 输出做
# `ai.hermes.gateway` 前缀扫描——凡该前缀的 LaunchAgent PID 全部进豁免集。
# 故本服务 label 必须为 ai.hermes.gateway-sim（前缀命中+SIM 身份可辨）。
#
# 附带收益：launchd 托管=进程父级是 launchd 而非会话壳——ZCode 会话回收
# （Terminated:15 杀 nohup 子进程组，保母三连死同型）不再波及网关。
#
# 用法：
#   mx-sim-gateway-service.sh up     渲染 plist+bootstrap+就绪探活（幂等）
#   mx-sim-gateway-service.sh down   bootout+清 plist（mx-down 调）
#   mx-sim-gateway-service.sh status 服务状态+端口健康
# 逃生门：MX_GATEWAY_LAUNCHD=0 时 mx-up 回退 nohup 形态（无 GUI 会话/容器场景）。
set -uo pipefail
LABEL="ai.hermes.gateway-sim"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
SIM="${AIPAY_SIM_ROOT:-/Users/cuishi/lab/ncwk-sim-mux}"
HAR="${MX_HARNESS_ROOT:-/Users/cuishi/lab/ncwk/simharness}"
LOGS="$SIM/logs"
PIDS="$SIM/pids"
HERMES_BIN="${HERMES_BIN:-$SIM/bin/hermes-sim}"
# 网关保活：launchd KeepAlive 已担当时钟复活，此处仅兜底探活窗
READY_WAIT="${MX_GATEWAY_READY_WAIT:-90}"

# ── 环境链（与 mx-up.sh nohup 形态逐项一致，防补漏回落宿主家目录）──
gateway_env() {
  # KANBAN_GATE_GUARD 可选面（MX_GATE_GUARD 设了才带）
  local guard=""
  if [ -n "${MX_GATE_GUARD:-}" ]; then
    guard="    <key>KANBAN_GATE_GUARD_FILE</key>
    <string>$SIM/var/current-state.env</string>
    <key>KANBAN_GATE_GUARD_KEYS</key>
    <string>$MX_GATE_GUARD</string>"
  fi
  cat <<EOF
    <key>PYTHONPATH</key>
    <string>$SIM/hermes-agent-src</string>
    <key>HERMES_SKIP_UPDATE</key>
    <string>1</string>
    <key>HERMES_HOME</key>
    <string>$SIM/hermes</string>
    <key>HERMES_RUN_TRACE_DIR</key>
    <string>$SIM/hermes/traces</string>
    <key>HERMES_GATEWAY_LOCK_DIR</key>
    <string>$SIM/gateway-locks</string>
    <key>HERMES_GATEWAY_BUSY_INPUT_MODE</key>
    <string>queue</string>
    <key>HERMES_BIN</key>
    <string>$HERMES_BIN</string>$guard
EOF
}

render_plist() {
  mkdir -p "$HOME/Library/LaunchAgents" "$LOGS" "$PIDS"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$HERMES_BIN</string>
    <string>gateway</string>
    <string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
$(gateway_env)
  </dict>
  <!-- KeepAlive：网关死亡 launchd 立即重拉（替代会话内保母的时钟复活，
       且不受会话回收影响——真机 orchestrator 不受影响，隔离锁目录保证共存） -->
  <key>KeepAlive</key>
  <true/>
  <!-- 退避防崩重启风暴：死亡后 10s 才重拉 -->
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>$LOGS/gateway.log</string>
  <key>StandardErrorPath</key>
  <string>$LOGS/gateway.log</string>
  <key>WorkingDirectory</key>
  <string>$SIM</string>
</dict>
</plist>
EOF
  plutil -lint "$PLIST" >/dev/null 2>&1 || { echo "✗ plist 渲染非法：$PLIST"; return 1; }
  echo "✓ plist 就绪（${PLIST}）"
}

svc_pid() { launchctl list 2>/dev/null | awk -v l="$LABEL" '$3 == l {print $1}' | head -1; }

cmd_up() {
  # 幂等：已 loaded 且端口健康=不动
  local cur; cur=$(svc_pid)
  if [ -n "$cur" ] && [ "$cur" != "-" ] && curl -sf -m 3 http://127.0.0.1:8801/health >/dev/null 2>&1; then
    echo "✓ SIM 网关服务已在位且健康（pid=${cur}）"
    return 0
  fi
  # 清掉 nohup 旧形态（port 冲突前置：旧网关不杀新的起不来）
  local old
  old=$(pgrep -f "hermes-sim.py gateway run" 2>/dev/null | head -1 || true)
  if [ -n "${old:-}" ]; then
    echo "↻ 停 nohup 旧形态网关（pid=${old}）"
    kill "$old" 2>/dev/null || true; sleep 3
  fi
  render_plist || return 1
  # 已 loaded 先 bootout 再 bootstrap（重渲染后需重载）
  launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1
  launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>&1 | head -2
  # 就绪探活
  local i
  for i in $(seq 1 $((READY_WAIT / 5))); do
    sleep 5
    if curl -sf -m 3 http://127.0.0.1:8801/health >/dev/null 2>&1; then
      echo "✓ SIM 网关 launchd 托管就绪（pid=$(svc_pid)，label=${LABEL}）"
      echo "  豁免依据：宿主孤儿清扫器 launchctl list 前缀扫描命中 ai.hermes.gateway* → PID 进豁免集"
      return 0
    fi
  done
  echo "✗ ${READY_WAIT}s 未就绪——查 $LOGS/gateway.log"
  return 1
}

cmd_down() {
  launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 && echo "✓ 服务已卸载（${LABEL}）"
  rm -f "$PLIST" && echo "✓ plist 已清（${PLIST}）"
}

cmd_status() {
  local cur; cur=$(svc_pid)
  echo "label=$LABEL pid=${cur:-未加载}"
  launchctl list 2>/dev/null | awk -v l="$LABEL" '$3 == l'
  curl -sf -m 3 http://127.0.0.1:8801/health >/dev/null 2>&1 && echo "health=200" || echo "health=DOWN"
}

case "${1:-status}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  *) echo "用法: $0 up|down|status"; exit 2 ;;
esac
