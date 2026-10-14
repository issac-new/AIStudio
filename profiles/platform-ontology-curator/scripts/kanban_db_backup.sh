#!/bin/bash
# kanban_db_backup.sh — cron shim for platform-ontology-curator profile scheduler
# canonical: ~/.hermes/bin/kanban_db_backup.py (gap-20261013-004 / t_97bcc860)
exec python3 "$HOME/.hermes/bin/kanban_db_backup.py" "$@"
