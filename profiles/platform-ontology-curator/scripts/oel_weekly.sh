#!/usr/bin/env bash
# Cron shim (platform-ontology-curator profile): weekly OEL aggregation.
# Canonical script = ~/.hermes/bin/oel_aggregate.py (single source of truth).
exec python3 /Users/YOURNAME/.hermes/bin/oel_aggregate.py "$@"
