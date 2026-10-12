#!/usr/bin/env bash
# Launch litellm proxy for a given venv/version. DATABASE_URL gives the 401 path
# (DB-less raises 400/Exception which the vulnerable fallback does NOT eat).
# usage: start_victim.sh <venv_dir> <db_url> <port>
set -e
VENV="$1"; DB="$2"; PORT="$3"; HERE="$(cd "$(dirname "$0")" && pwd)"
export DATABASE_URL="$DB" LITELLM_MASTER_KEY=sk-gap0904-master PYTHONUNBUFFERED=1
exec "$VENV/bin/litellm" --config "$HERE/config.yaml" --port "$PORT"
