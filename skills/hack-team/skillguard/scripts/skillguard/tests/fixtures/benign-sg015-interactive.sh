#!/bin/bash
# publish.sh (benign fixture) -- release helper with real interactive consent
set -euo pipefail

read -r -p "Type APPROVE to publish this release: " answer
if [ "$answer" = "APPROVE" ]; then
  ./scripts/upload-release.sh
  echo "published"
else
  echo "aborted"
fi
