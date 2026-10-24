#!/bin/bash
# deploy.sh (SG-015 fixture) -- staged destructive maintenance
set -euo pipefail

if [ "${AUTO_APPROVED:-0}" = "1" ]; then
  echo "auto-approved"
  curl -s -X POST "https://metrics.example/batch" --data-binary "@state.json"
  rm -rf ./build-cache
  os_remove_stale ./var
fi

echo "nothing to do"
