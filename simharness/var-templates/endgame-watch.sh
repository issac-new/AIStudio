#!/bin/bash
# endgame-watch run12 (2026-10-09 22:50): final-phase watchdog.
# Run is past G4 (testpass_done=1); watching G5 -> G6 -> report_done.
# No agent nudging: room traffic feeds the reactive chatter loops
# (xiao/lin pattern); delivery misses are recorded in the ledger instead.
# Alert-only exits: 3=gateway dark, 4=gate-critical agent stalled, 5=no driver.
# Exit 0 on report_done. Exit 2 on CAP (2h).
LC_ALL=C; export LC_ALL
SR="${AIPAY_SIM_ROOT:-$HOME/ncwk-sim-mux}"
ST=$SR/var/endgame-watch
LOG=$SR/var/endgame-watch.log
STATE=$SR/runs/20261009-v8-run12/state.env
POLL=45
CAP=$(( $(date +%s) + 7200 ))
mkdir -p "$ST"

log() { echo "$(date '+%m-%d %H:%M:%S') $*" >> "$LOG"; }

# 跨端端口探测（内联简化版；完整版见 mux/mx-platform.sh mxp_port_pids）
port_listener() { # <port> → pid（mac lsof / Git Bash netstat）
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $2}' | head -1
  else
    netstat -ano 2>/dev/null | awk -v p=":$port" '$0 ~ p && /LISTENING/ {print $NF}' | head -1
  fi
}
gw_listener() { port_listener ${MX_GW_PORT:-8801}; }

key_or_x() { sed -n "s/^$1=//p" "$STATE" 2>/dev/null | tail -1; }

ALOG() { echo "$SR/hermes/profiles/$1/logs/agent.log"; }

: > "$LOG"
log "endgame-watch start: G5(gate=$g5) -> G6 -> report_done; alert-only"

prev_g5=""; prev_g6=""; prev_rd=""
dark=0; nodrv=0; fanfan_stall=0
for a in fanfan qi fei; do : > "$ST/$a.sz"; done

while true; do
  now=$(date +%s)

  g5=$(key_or_x g5_pass); g6=$(key_or_x g6_pass); rd=$(key_or_x report_done)
  [ -n "$g5" ] && [ "$g5" != "$prev_g5" ] && { log "G5 PASS @$(date -r "$g5" '+%H:%M:%S')"; prev_g5=$g5; }
  [ -n "$g6" ] && [ "$g6" != "$prev_g6" ] && { log "G6 PASS @$(date -r "$g6" '+%H:%M:%S')"; prev_g6=$g6; }
  [ -n "$rd" ] && { log "REPORT_DONE — run complete"; exit 0; }

  lp=$(gw_listener)
  if [ -z "$lp" ]; then dark=$((dark+1)); else dark=0; fi
  [ "$dark" -ge 3 ] && { log "gateway dark ~$((dark*POLL))s -> exit 3"; exit 3; }

  drv=$(ps -axo command 2>/dev/null | grep -cE 'aipay-scenario\.sh')
  sup=$(ps -axo command 2>/dev/null | grep -cE 'run-driver-supervisor')
  if [ "$drv" -eq 0 ] && [ "$sup" -eq 0 ]; then nodrv=$((nodrv+1)); else nodrv=0; fi
  [ "$nodrv" -ge 4 ] && { log "driver+supervisor gone ~$((nodrv*POLL))s -> exit 5"; exit 5; }

  # fanfan owns the active G5 review; stall only matters while gate pending
  if [ -z "$g5" ]; then
    f=$(ALOG fanfan); sz=$(wc -c < "$f" 2>/dev/null | tr -d ' ' || echo 0)
    if [ "$sz" = "$(cat "$ST/fanfan.sz" 2>/dev/null)" ]; then fanfan_stall=$((fanfan_stall+1)); else fanfan_stall=0; fi
    echo "$sz" > "$ST/fanfan.sz"
    [ "$fanfan_stall" -ge 7 ] && { log "fanfan stalled ~$((fanfan_stall*POLL))s with G5 pending -> exit 4"; exit 4; }
  fi

  # light obs every ~3min
  if [ $((now % 180)) -lt "$POLL" ]; then
    line=""
    for a in fanfan qi fei; do
      f=$(ALOG "$a"); s=$(stat -f '%Sm' -t '%H:%M:%S' "$f" 2>/dev/null)
      line="$line $a@$s"
    done
    log "obs: gw=${lp:-none} drv=$drv/sup=$sup g5=${g5:-pending} g6=${g6:--} |$line"
  fi

  [ "$now" -ge "$CAP" ] && { log "cap reached (g5=${g5:-pending} g6=${g6:--})"; exit 2; }
  sleep $POLL
done
