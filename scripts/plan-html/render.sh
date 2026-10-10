#!/bin/bash
# render.sh — 方案正本 md → 带皮肤 HTML（单一事实源=md，派生物随时重出）
# 用法：bash scripts/plan-html/render.sh [输出目录，缺省 /tmp/plan-view]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-/tmp/plan-view}"
SRC="$ROOT/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md"
TITLE="${2:-Swarm Studio 全流程推演方案 V8.5（回归轮口径修订版）}"
mkdir -p "$OUT"
# 皮肤与增强脚本一律用仓库版（单一事实源），PLAN_VIEW_DIR 穿透 OUT——修掉
# 「enhance 读死 /tmp/plan-view 误碰别的输出目录」的坑（2026-10-10 实锤摸到活页 mtime）
# 头部样式=tokens.css（两页共享基准）+ style-header.html（本页组件）拼接；
# tokens 须包 <style>——裸 CSS 会被 pandoc include-in-header 当正文注入页首
# （2026-10-10 视觉验收实锤：整段 CSS 源码排进左栏、横幅被挤飞）
{ printf '<style>\n'; cat "$ROOT/scripts/plan-html/tokens.css"; printf '\n</style>\n'; cat "$ROOT/scripts/plan-html/style-header.html"; } > "$OUT/style-header.html"
cd "$ROOT/docs/superpowers/specs"
pandoc "$(basename "$SRC")" -f gfm -t html5 -s --toc --toc-depth=3 \
  --include-in-header="$OUT/style-header.html" \
  --metadata title="$TITLE" -o "$OUT/mux-v8-plan.html"
export PLAN_VIEW_DIR="$OUT"
python3 "$ROOT/scripts/plan-html/enhance.py"; python3 "$ROOT/scripts/plan-html/enhance2.py"
# mermaid 引擎本地化（缺则从 overlay node_modules 拷）
[ -f "$OUT/mermaid.min.js" ] || cp "$ROOT/node_modules/mermaid/dist/mermaid.min.js" "$OUT/" 2>/dev/null || true
(cd "$OUT" && nohup python3 -m http.server 8931 --bind 127.0.0.1 >/dev/null 2>&1 &) 2>/dev/null || true
echo "渲染完成：$OUT/mux-v8-plan.html（http://127.0.0.1:8931/mux-v8-plan.html）"
