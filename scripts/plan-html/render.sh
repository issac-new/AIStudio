#!/bin/bash
# render.sh — 方案正本 md → 带皮肤 HTML（单一事实源=md，派生物随时重出）
# 用法：bash scripts/plan-html/render.sh [输出目录，缺省 /tmp/plan-view]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-/tmp/plan-view}"
SRC="$ROOT/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md"
TITLE="${2:-Swarm Studio 全流程推演方案 V8.3（终态版）}"
mkdir -p "$OUT"
cd "$ROOT/docs/superpowers/specs"
pandoc "$(basename "$SRC")" -f gfm -t html5 -s --toc --toc-depth=3 \
  --include-in-header="$OUT/style-header.html" \
  --metadata title="$TITLE" -o "$OUT/mux-v8-plan.html"
python3 "$OUT/enhance.py"; python3 "$OUT/enhance2.py"
# mermaid 引擎本地化（缺则从 overlay node_modules 拷）
[ -f "$OUT/mermaid.min.js" ] || cp "$ROOT/node_modules/mermaid/dist/mermaid.min.js" "$OUT/" 2>/dev/null || true
(cd "$OUT" && nohup python3 -m http.server 8931 --bind 127.0.0.1 >/dev/null 2>&1 &) 2>/dev/null || true
echo "渲染完成：$OUT/mux-v8-plan.html（http://127.0.0.1:8931/mux-v8-plan.html）"
