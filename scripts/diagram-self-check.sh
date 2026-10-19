#!/usr/bin/env bash
# diagram-self-check.sh — diagram-design self_check 机械门禁 CLI（spec 项3）。
# 语义唯一事实源=vendored self_check.py；本脚本只定位 overlay 根并透传参数。
# 用法：scripts/diagram-self-check.sh [--offline] <file.html…>
set -euo pipefail
OVERLAY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$OVERLAY_ROOT/assets/skills/diagram-design/scripts/self_check.py"
if [[ ! -f "$SCRIPT" ]]; then
  echo "self_check.py 不在位：$SCRIPT（vendored 正本缺失）" >&2
  exit 1
fi
exec python3 "$SCRIPT" "$@"
