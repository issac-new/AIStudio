#!/bin/bash
# chain-watch run12 (2026-10-09 20:17): observe the post-recovery self-heal chain.
# Exit 0 = all three DEV branches landed AND driver running.
# Exit 2 = 60 min cap. Exit 3 = gateway went dark a SECOND time (needs human/monitor).
# Gateway posture per user ruling: on a NEW true outage, wait 5 min; if nobody
# recovers, fire ONE mx-up per watcher lifetime (same rule as gw-watch).
LC_ALL=C; export LC_ALL
SR="${AIPAY_SIM_ROOT:-$HOME/ncwk-sim-mux}"
REPO=$SR/central/aipaydev
LOG=$SR/var/chain-watch.log
POLL=60
CAP=$(( $(date +%s) + 7200 ))

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

driver_procs() {
  ps -axo command 2>/dev/null | grep 'aipay-scenario' | grep -v grep | grep -v chain-watch | wc -l | tr -d ' '
}

branches_missing() {
  local out
  out=$(git -C "$REPO" ls-remote origin \
        refs/heads/feat/DEV-MP refs/heads/feat/DEV-CHWX refs/heads/feat/DEV-CHALI 2>/dev/null)
  local miss=""
  echo "$out" | grep -q 'feat/DEV-MP'    || miss="$miss MP"
  echo "$out" | grep -q 'feat/DEV-CHWX'  || miss="$miss CHWX"
  echo "$out" | grep -q 'feat/DEV-CHALI' || miss="$miss CHALI"
  echo "$miss"
}

: > "$LOG"
log "chain-watch start: watching branches MP/CHWX/CHALI + driver + gateway"

mxup_used=0
dark_since=0
outages_seen=0
n=0

while true; do
  now=$(date +%s)
  miss=$(branches_missing)
  dp=$(driver_procs)
  lp=$(gw_listener)

  if [ -n "$lp" ]; then
    if [ "$dark_since" -gt 0 ]; then
      log "gateway listener back (pid=$lp) after dark streak"
    fi
    dark_since=0
  else
    if [ "$dark_since" -eq 0 ]; then
      dark_since=$now
      outages=$((outages_seen + 1))
      log "GATEWAY DARK onset (event #$outages_seen)"
    fi
    dark_for=$((now - dark_since))
    if [ "$outages_seen" -ge 2 ]; then
      log "second outage event, dark ${dark_for}s -> exit 3 for monitor attention"
      exit 3
    fi
    if [ "$dark_for" -ge 300 ] && [ "$mxup_used" -eq 0 ]; then
      log "true outage 5min, nobody recovered -> one mx-up (posture)"
      ( cd /Users/cuishi/lab/ncwk/simharness && LC_ALL=C bash mux/mx-up.sh ) >> $SR/var/chain-mxup.log 2>&1 &
      mxup_used=1
    fi
  fi

  n=$((n + 1))
  if [ $((n % 5)) -eq 1 ]; then
    log "obs: missing=[${miss:-none}] driver_procs=$dp listener=${lp:-none}"
  fi

  if [ -z "$miss" ] && [ "$dp" -gt 0 ]; then
    log "CHAIN COMPLETE: all branches landed, driver_procs=$dp"
    exit 0
  fi

  if [ "$now" -ge "$CAP" ]; then
    log "cap reached: missing=[${miss:-none}] driver_procs=$dp listener=${lp:-none}"
    exit 2
  fi

  sleep $POLL
done
