#!/bin/bash
# run-gates.sh — harness 守门套件入口（借道 overlay 的 vitest，只读消费其 node_modules）
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
MX_OVERLAY_ROOT="${MX_OVERLAY_ROOT:-$(cd "$HERE/../overlay" 2>/dev/null && pwd)}"
cd "$MX_OVERLAY_ROOT"
export NODE_PATH="$MX_OVERLAY_ROOT/node_modules"
exec npx vitest run --root "$HERE" "$@"
