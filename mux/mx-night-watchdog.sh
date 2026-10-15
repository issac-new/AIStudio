#!/bin/bash
# mx-night-watchdog.sh — run20 夜间机械看守人（V8.29 缺口 E 根治）
# launchd 每 30min 拉起：15min 智能监督存活→静默退出；断档>25min→机械代行
# （驱动重启/网关重拉/防睡/磁盘报警）。智能判断（球位/判词）仍归智能监督，
# 本脚本只兜「会话死→机械层也停」的最坏形态（01:30-07:49 实录）。
set -uo pipefail
SIM=/Volumes/nvme2230/lab/ncwk-sim-mux
LOG=$SIM/logs/run20-night-watchdog.log
ts(){ date '+%F %T'; }
NEWEST=$(ls -t $SIM/logs/run20-monitor-*.log 2>/dev/null | head -1)
if [ -z "$NEWEST" ]; then echo "[$(ts)] 无监督日志，跳过" >> "$LOG"; exit 0; fi
AGE=$(( $(date +%s) - $(stat -f %m "$NEWEST") ))
if [ "$AGE" -le 1500 ]; then
  echo "[$(ts)] 监督存活（${AGE}s）" >> "$LOG"; exit 0
fi
echo "[$(ts)] ⚠ 监督断档 ${AGE}s——机械看守代行" >> "$LOG"
# 驱动链
if ! pgrep -f "aipay-scenario.sh" >/dev/null 2>&1; then
  rm -f "$SIM/var/20261015-v8-run20-supervisor.stop"
  ( cd /Users/cuishi/lab/ncwk/simharness && nohup bash mux/run-driver-supervisor.sh \
      --run 20261015-v8-run20 --start-step archgate >> "$SIM/logs/driver-relaunch-2249.log" 2>&1 & )
  echo "[$(ts)] 已重启驱动监督器" >> "$LOG"
fi
# 网关
GWPID=$(cat "$SIM/pids/gateway.pid" 2>/dev/null || true)
if [ -z "$GWPID" ] || ! ps -p "$GWPID" >/dev/null 2>&1; then
  ( cd /Users/cuishi/lab/ncwk/simharness && bash mux/mx-up.sh >> "$LOG" 2>&1 )
  echo "[$(ts)] 已 mx-up 重拉网关" >> "$LOG"
fi
# 防睡
pgrep -f "caffeinate -dims" >/dev/null 2>&1 || nohup caffeinate -dims >/dev/null 2>&1 &
# 磁盘
AVAIL=$(df -k /System/Volumes/Data | awk 'NR==2{print $4}')
[ "$AVAIL" -lt 20971520 ] && echo "[$(ts)] 🔴 磁盘 <20G（${AVAIL}kB）" >> "$LOG"
touch "$SIM/var/run20-watchdog-alerted"
