#!/usr/bin/env bash
# Cron shim (platform-ontology-curator profile): weekly ontology CQ regression.
# Runs collector cadence + emits OEL candidate rows for GAP/PARTIAL (G8 closed loop).
# Canonical script = ~/.hermes/bin/ontology-cq-regression.py (single source of truth).
exec python3 /Users/YOURNAME/.hermes/bin/ontology-cq-regression.py --emit-oel "$@"
