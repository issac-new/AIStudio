#!/usr/bin/env bash
# ccswitch bgm peak-window watchdog.
#
# Runs every minute via cron. During the weekday 14:00-18:00 window, if
# proxy_request_logs shows bgm (BigModel official channel) hits within the
# lookback window, immediately trigger a disable — the 14:00 cron may have
# failed, or bgm may have been re-enabled manually.
#
# To avoid false positives from in-flight requests that were already running
# when bgm was disabled, we require >= MIN_HITS hits within LOOKBACK_SEC
# before triggering. A single residual hit is ignored.
#
# Idempotent: disable is safe to run repeatedly.
set -eo pipefail

DB="$HOME/.cc-switch/cc-switch.db"
TOGGLE="$HOME/.hermes/profiles/orchestrator/scripts/ccswitch-peak-toggle.sh"
LOOKBACK_SEC=300          # look back 5 minutes
MIN_HITS=2                # require at least 2 hits to trigger (avoid 1-shot residuals)
LOG="$HOME/.cc-switch/backups/watchdog.log"

BGM_CLAUDE="301b7245-7c7e-4624-adec-c258156b082f"
BGM_CODEX="f0c20665-dbe3-4f46-8536-c0870e8bf7cb"

now=$(date +%s)
dow=$(date +%u)           # 1=Mon .. 7=Sun
hour=$(date +%H)          # 00-23

# Only act on weekdays within 14:00-18:00. `date +%H` is zero-padded, and bash
# (( )) parses leading-zero numbers as OCTAL — 08/09 are invalid octal, so the
# comparison errors and silently evaluates false, making the whole guard false
# and misfiring the watchdog at 08:00-09:59 every weekday. `10#` forces base-10.
if (( dow > 5 )) || (( 10#$hour < 14 )) || (( 10#$hour >= 18 )); then
  exit 0
fi

hits=$(sqlite3 "$DB" <<SQL
.timeout 10000
SELECT COUNT(*) FROM proxy_request_logs
WHERE provider_id IN ('$BGM_CLAUDE', '$BGM_CODEX')
  AND created_at >= ($now - $LOOKBACK_SEC);
SQL
)
hits=$(echo "$hits" | tail -n1 | tr -d '[:space:]')

if [[ "${hits:-0}" -ge "$MIN_HITS" ]]; then
  mkdir -p "$(dirname "$LOG")"
  {
    echo "[$(date '+%F %T')] WATCHDOG: detected $hits bgm hit(s) in last ${LOOKBACK_SEC}s (>= $MIN_HITS) during peak window"
    bash "$TOGGLE" disable
    echo "[$(date '+%F %T')] WATCHDOG: disable triggered"
  } >> "$LOG" 2>&1
  echo "WATCHDOG: $hits bgm hit(s) during peak window — auto-disabled"
fi
