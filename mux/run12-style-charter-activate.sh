#!/bin/bash
# style-charter 激活器（2026-10-09 全局文风根治轮）：等 SIM 全 profile 真实工作
# 静默窗（>150s），锁安全重启 gateway，使 style-charter 插件（bundled backend，
# 已落 hermes-agent-src/plugins/）被加载——新会话系统提示词即带受控写作条款。
# SOUL.md/技能副本已文件级落位（无需重启），本脚本只管插件加载这一环。
# 幂等：日志含 ACTIVATE-DONE 即退出。deadline 2h，超时放弃留日志。
# 判活复用 run11-idle-restart-activate.sh 判据：真实工作行（API call/tool/Turn）
# 的最后时间戳，取全 profile 最大值（max）——任何一路在飞都不算静默窗。
set -u
SIM_ROOT=/Volumes/nvme2230/lab/ncwk-sim-mux
LOG="$SIM_ROOT/logs/style-charter-activate.log"
DEADLINE=$(( $(date +%s) + 7200 ))
GW_PID_FILE="$SIM_ROOT/pids/gateway.pid"

log() { echo "[$(date '+%F %H:%M:%S')] $*" >> "$LOG"; }
grep -q "ACTIVATE-DONE" "$LOG" 2>/dev/null && { echo already-done; exit 0; }
log "watcher up: waiting for all-profile idle window (>150s real-work quiet), deadline 2h"

last_real_work_epoch() { # <agent.log>：真实工作行最后时间戳 → epoch；无则 0
  local f="$1" last_line ts t
  last_line=$(grep -E "API call|tool [a-z_]+ completed|Turn (started|ended)" "$f" 2>/dev/null | tail -1)
  if [[ -n "$last_line" ]]; then
    ts=$(printf '%s' "$last_line" | cut -c1-19)
    t=$(date -j -f "%Y-%m-%d %H:%M:%S" "$ts" +%s 2>/dev/null || echo "$(date +%s)")
  else
    t=0
  fi
  echo "$t"
}

while (( $(date +%s) < DEADLINE )); do
  now=$(date +%s)
  newest=0
  for prof in "$SIM_ROOT"/hermes/profiles/*/; do
    f="${prof}logs/agent.log"
    [[ -f "$f" ]] || continue
    t=$(last_real_work_epoch "$f")
    (( t > newest )) && newest=$t
  done
  idle=$(( now - newest ))
  if (( idle > 150 )); then
    log "idle window (all profiles quiet ${idle}s) — restarting gateway"
    GPID=$(lsof -ti :8801 -sTCP:LISTEN 2>/dev/null | head -1)
    [[ -n "$GPID" ]] || { log "no gateway on :8801 — nothing to restart, health-recheck only"; }
    if [[ -n "$GPID" ]]; then
      kill "$GPID" 2>/dev/null
      for i in $(seq 1 30); do
        ps -p "$GPID" >/dev/null 2>&1 || break
        sleep 5
      done
      if ps -p "$GPID" >/dev/null 2>&1; then
        log "old gateway pid=$GPID still alive after 150s — abort (manual handling)"
        exit 1
      fi
      sleep 5
    fi
    ( cd "$SIM_ROOT" && PYTHONPATH="$SIM_ROOT/hermes-agent-src" HERMES_SKIP_UPDATE=1 \
      HERMES_HOME="$SIM_ROOT/hermes" HERMES_GATEWAY_LOCK_DIR="$SIM_ROOT/gateway-locks" \
      HERMES_GATEWAY_BUSY_INPUT_MODE=queue HERMES_BIN="$SIM_ROOT/bin/hermes-sim" \
      nohup "$SIM_ROOT/bin/hermes-sim" gateway run > "$SIM_ROOT/logs/gateway.log" 2>&1 & \
      echo $! > "$GW_PID_FILE" )
    OK=0
    for i in $(seq 1 40); do
      curl -sf -m 2 "http://127.0.0.1:8801/health" >/dev/null 2>&1 && { OK=1; break; }
      sleep 3
    done
    log "restart health_ok=$OK"
    if (( OK )); then
      sleep 5
      LOADED=$(grep -c "style-charter" "$SIM_ROOT/logs/gateway.log" 2>/dev/null || echo 0)
      log "gateway.log style-charter mentions=$LOADED (loader debug may be silent; discovery verified separately)"
      log "ACTIVATE-DONE"
      exit 0
    else
      log "restart FAILED health check — gateway down, MANUAL ATTENTION REQUIRED"
      exit 1
    fi
  fi
  sleep 20
done
log "deadline reached without idle window — gave up (rerun this script later)"
exit 1
