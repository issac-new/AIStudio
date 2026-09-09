#!/usr/bin/env bash
# ccswitch peak-time toggle: disable/restore bgm during weekday 14:00-18:00
# Applies to BOTH claude and codex app_types. bgm = BigModel official channel.
#
# Usage:
#   ccswitch-peak-toggle.sh disable   # 14:00 — remove bgm from queue, promote next
#   ccswitch-peak-toggle.sh restore   # 18:00 — re-add bgm at sort_index=0
#   ccswitch-peak-toggle.sh status    # read-only queue snapshot
#
# Idempotent: safe to run multiple times. busy_timeout is set via a persistent
# .timeout dot-command so it does NOT pollute $(...) captures.
set -eo pipefail

DB="$HOME/.cc-switch/cc-switch.db"
TARGET="bgm"          # provider name in both claude + codex app_types
BACKUP_DIR="$HOME/.cc-switch/backups"

# sqlite3 prints "PRAGMA busy_timeout=N" result (N) on stdout when inline.
# To keep $(...) captures clean, use a here-doc so the pragma result is
# swallowed by the same sqlite3 invocation that runs the real query.
sql() {
  sqlite3 "$DB" <<SQL
.timeout 10000
$1
SQL
}

backup_db() {
  mkdir -p "$BACKUP_DIR"
  cp "$DB" "$BACKUP_DIR/peak_toggle_$(date +%Y%m%d_%H%M%S).db"
}

# Reassign sort_index to a clean 0,1,2,3 sequence (no gaps) via fixed CASE map.
reindex_queue() {
  local app="$1"; shift
  local cases=""
  for pair in "$@"; do
    local n="${pair%%:*}" v="${pair##*:}"
    cases+=" WHEN '$n' THEN $v"
  done
  sql "UPDATE providers SET sort_index = CASE name $cases END
       WHERE app_type='$app' AND in_failover_queue=1;"
}

# Current provider name for an app_type (empty if none).
current_of() { sql "SELECT name FROM providers WHERE app_type='$1' AND is_current=1;" | tail -n1; }
# Next in-queue provider by priority (empty if queue empty).
next_of()    { sql "SELECT name FROM providers WHERE app_type='$1' AND in_failover_queue=1 ORDER BY sort_index ASC LIMIT 1;" | tail -n1; }

case "${1:-status}" in

  disable)
    backup_db
    for app in claude codex; do
      sql "UPDATE providers SET in_failover_queue=0, is_current=0 WHERE app_type='$app' AND name='$TARGET';"
      cur=$(current_of "$app")
      if [[ -z "$cur" ]]; then
        nxt=$(next_of "$app")
        [[ -n "$nxt" ]] && sql "UPDATE providers SET is_current=1 WHERE app_type='$app' AND name='$nxt';"
      fi
    done
    echo "[disable] $(date '+%F %T') bgm removed from claude+codex queues"
    ;;

  restore)
    backup_db
    # --- claude ---
    sql "UPDATE providers SET in_failover_queue=1 WHERE app_type='claude' AND name='$TARGET';"
    sql "UPDATE providers SET is_current=0 WHERE app_type='claude';"
    sql "UPDATE providers SET is_current=1, sort_index=0 WHERE app_type='claude' AND name='$TARGET';"
    reindex_queue claude "bgm:0" "Mkim:1" "Hkim:2" "DS:3"
    # --- codex ---
    sql "UPDATE providers SET in_failover_queue=1 WHERE app_type='codex' AND name='$TARGET';"
    sql "UPDATE providers SET is_current=0 WHERE app_type='codex';"
    sql "UPDATE providers SET is_current=1, sort_index=0 WHERE app_type='codex' AND name='$TARGET';"
    reindex_queue codex "bgm:0" "MKimi:1" "HKimi:2" "DS:3"
    echo "[restore] $(date '+%F %T') bgm restored to queue head (claude+codex)"
    ;;

  status)
    echo "=== $(date '+%F %T') ccswitch queue status ==="
    for app in claude codex; do
      echo "--- $app ---"
      sql "SELECT sort_index, name, in_failover_queue, is_current
           FROM providers WHERE app_type='$app'
           ORDER BY CASE WHEN in_failover_queue=1 THEN 0 ELSE 1 END, sort_index;" \
        | awk 'NF'   # drop blank lines from .timeout echo
      echo ""
    done
    echo "--- proxy /status ---"
    raw=$(curl -s --max-time 3 http://127.0.0.1:15721/status 2>/dev/null || true)
    if [[ -n "$raw" ]]; then
      echo "$raw" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("current_provider=%s success_rate=%s" % (d.get("current_provider"), d.get("success_rate")))' 2>/dev/null \
        || echo "(parse failed) $raw"
    else
      echo "(proxy unreachable)"
    fi
    ;;

  *)
    echo "Usage: $0 {disable|restore|status}" >&2
    exit 1
    ;;
esac
