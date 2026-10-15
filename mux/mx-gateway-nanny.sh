#!/bin/bash
# mx-gateway-nanny.sh —— 网关保母+凶案取证（2026-10-15 三杀悬案催生：10:50 SIGTERM、
# 11:54/14:18 无善后暴毙，凶手未明——下一杀必须抓现行）。
# 每 30s：网关 pid 消失 → 先取证（死时刻日志尾/进程快照/崩溃报告清单/系统日志该 pid）
# → mx-up 幂等复活 → 记 issues.log。与 15min 自动化步骤 9/mx-up 自愈段共存（幂等不互斥）。
# 停止：touch $SIM_ROOT/var/gateway-nanny.stop（run20 收官后停用）。
export LC_ALL=C
SIM_ROOT="${AIPAY_SIM_ROOT:-/Volumes/nvme2230/lab/ncwk-sim-mux}"
PIDF="$SIM_ROOT/pids/gateway.pid"
STOP="$SIM_ROOT/var/gateway-nanny.stop"
FORE="$SIM_ROOT/logs/gateway-nanny.log"
ISS="$SIM_ROOT/runs/20261015-v8-run20/evidence/issues.log"
cd /Users/cuishi/lab/ncwk/simharness || exit 1
echo "[$(date '+%F %T')] gateway-nanny 上岗（pid $$，30s 巡检；stop=$STOP）" >> "$FORE"
while true; do
  if [ -f "$STOP" ]; then
    echo "[$(date '+%F %T')] stop 文件在位，保母退场" >> "$FORE"
    exit 0
  fi
  pid="$(cat "$PIDF" 2>/dev/null)"
  if [ -n "$pid" ] && ! ps -p "$pid" >/dev/null 2>&1; then
    {
      echo ""
      echo "=====[$(date '+%F %T')] 网关 pid=$pid 消失——现场取证====="
      echo "--gateway.log 尾 15 行--"
      tail -15 "$SIM_ROOT/hermes/logs/gateway.log" 2>/dev/null
      echo "--ps 快照（hermes/gateway/kill 相关）--"
      ps aux | grep -iE 'hermes|gateway|pkill' | grep -v grep | head -10
      echo "--最近 3 份崩溃报告--"
      ls -t ~/Library/Logs/DiagnosticReports/ 2>/dev/null | head -3
      echo "--系统日志该 pid 近 3 分钟--"
      log show --last 3m --predicate "processID == $pid" 2>/dev/null | tail -15
      echo "--取证毕，mx-up 复活--"
    } >> "$FORE" 2>&1
    echo "ISSUE|gateway-nanny-revive|$pid|网关 pid 消失（三杀悬案期），保母取证后 mx-up 复活——取证见 logs/gateway-nanny.log" >> "$ISS" 2>/dev/null
    bash mux/mx-up.sh >> "$FORE" 2>&1
  fi
  sleep 30
done
