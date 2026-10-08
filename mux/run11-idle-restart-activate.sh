#!/bin/bash
# run11 idle 窗自动重启器：三路 dev agent（chen/lin/xiao）全静默 >180s 即执行
# 锁安全网关重启，激活 config.yaml max_concurrent_sessions=30（此前 1，run11 三轮
# 容量风暴根因）。重启后仅对 chen 重发任务书（催办 38min 无响应；xiao/lin 在飞不扰）。
# 幂等：日志里已有 "ACTIVATE-DONE" 即退出。最多等 90 分钟，超时放弃并留日志。
set -u
SIM_ROOT=/Volumes/nvme2230/lab/ncwk-sim-mux
LOG="$SIM_ROOT/logs/idle-restart-activate.log"
PROFILES=(chen lin xiao)
DEADLINE=$(( $(date +%s) + 5400 ))

log() { echo "[$(date '+%F %H:%M:%S')] $*" >> "$LOG"; }
grep -q "ACTIVATE-DONE" "$LOG" 2>/dev/null && { echo already-done; exit 0; }
log "watcher up: waiting for idle window (all of ${PROFILES[*]} quiet >180s), deadline 90min"

quiet_since=0
while (( $(date +%s) < DEADLINE )); do
  now=$(date +%s)
  oldest=$now
  for p in "${PROFILES[@]}"; do
    f="$SIM_ROOT/hermes/profiles/$p/logs/agent.log"
    # 任一行（含 adapter 噪音）都算"有活动"——保守：噪音也推迟重启
    t=$(stat -f%m "$f" 2>/dev/null || echo "$now")
    (( t < oldest )) && oldest=$t
  done
  idle=$(( now - oldest ))
  if (( idle > 180 )); then
    log "idle window (quiet ${idle}s) — restarting gateway"
    GPID=$(cat "$SIM_ROOT/pids/gateway.pid" 2>/dev/null)
    kill "$GPID" 2>/dev/null
    # 锁安全：等旧进程死透（14:15 撞锁实锤：SIGTERM 后还要排干 ~90s）
    for i in $(seq 1 30); do
      ps -p "$GPID" >/dev/null 2>&1 || break
      sleep 5
    done
    if ps -p "$GPID" >/dev/null 2>&1; then
      log "old gateway pid=$GPID still alive after 150s — abort (manual handling)"
      exit 1
    fi
    sleep 5
    ( cd "$SIM_ROOT" && PYTHONPATH="$SIM_ROOT/hermes-agent-src" HERMES_SKIP_UPDATE=1 \
      HERMES_HOME="$SIM_ROOT/hermes" HERMES_GATEWAY_LOCK_DIR="$SIM_ROOT/gateway-locks" \
      HERMES_GATEWAY_BUSY_INPUT_MODE=queue HERMES_BIN="$SIM_ROOT/bin/hermes-sim" \
      nohup "$SIM_ROOT/bin/hermes-sim" gateway run > "$SIM_ROOT/logs/gateway-restart-activate.log" 2>&1 & \
      echo $! > "$SIM_ROOT/pids/gateway.pid" )
    OK=0
    for i in $(seq 1 20); do
      curl -sf -m 2 "http://127.0.0.1:8801/health" >/dev/null 2>&1 && { OK=1; break; }
      sleep 3
    done
    log "restart health_ok=$OK"
    if (( OK )); then
      # 仅 chen 短催办（两轮催办均在 max=1 饥饿期发出未达；重启后 30 槽即投即达。
      # 不对 lin/xiao 发——FORCE 全量重发会把"从零重新执行"带给回合间隙中的他们）
      sleep 10
      out=$(python3 -c "
import json, urllib.request
tok=open('$SIM_ROOT/creds/fanfan.token').read().strip()
body='⏰ 催办（通道已修复）：DEV-PAYCORE 任务书见 14:19 群内重递件。请开始执行：拆分子任务→kanban 建 DEV-PAYCORE 主卡+link 子卡→逐子任务实现（每件独立 commit）→vitest ≥8 用例全绿→push origin feat/DEV-PAYCORE→结论行 DEV-DONE-DEV-PAYCORE。若遇阻塞请在群里说明。[RUN=20261007-v8-run11]'
payload={'msgtype':'m.text','body':body,'m.mentions':{'user_ids':['@chen-agent:matrix.test']}}
req=urllib.request.Request('http://127.0.0.1:8008/_matrix/client/v3/rooms/!HmQhMNMivoYKiKtTcV:matrix.test/send/m.room.message?access_token='+tok, data=json.dumps(payload,ensure_ascii=False).encode(), headers={'Content-Type':'application/json'}, method='POST')
print(json.load(urllib.request.urlopen(req,timeout=20)).get('event_id'))
" 2>&1)
      log "chen nudge post-restart: $out"
      log "ACTIVATE-DONE"
      echo ACTIVATE-DONE
      exit 0
    else
      log "restart FAILED health check — abort"
      exit 1
    fi
  fi
  sleep 30
done
log "90min deadline reached without idle window — giving up (cron/人工接管)"
exit 1
