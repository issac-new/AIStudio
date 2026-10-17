#!/bin/bash
# 阶段四执行器：agent 侧补丁归档停维护（RETIREMENT-VERDICT §三 阶段四；用户放行后 --apply）。
# 分类单一事实源=scripts/classify-agent-patch.py（首 diff 路径前缀，与 2026-10-17 精确盘点同引擎）。
# 用法：bash scripts/archive-agent-patches.sh [--apply]
#   缺省 dry-run 零改动；--apply：git mv 到 patches/archive-agent-2026-10/ + series 行注释
#   （不自动 commit——人工核对后提交）。
set -euo pipefail
cd "$(dirname "$0")/.."
ARCHIVE_DIR=patches/archive-agent-2026-10
APPLY="${1:-}"
moved=0
mkdir -p "$ARCHIVE_DIR"
for f in patches/*.patch; do
  base=$(basename "$f")
  if python3 scripts/classify-agent-patch.py "$f"; then
    if [ "$APPLY" = "--apply" ]; then
      git mv "patches/$base" "$ARCHIVE_DIR/$base"
      python3 - "$base" <<'PY'
import sys
base = sys.argv[1]
p = 'patches/series'
lines = open(p).read().splitlines()
out = [f'# [stage4-agent-retired 2026-10] {l}' if l.strip() == base else l for l in lines]
open(p, 'w').write('\n'.join(out) + '\n')
PY
    fi
    echo "agent-side: $base"
    moved=$((moved+1))
  fi
done
echo "---"
if [ "$APPLY" = "--apply" ]; then
  echo "已归档 $moved 件 → $ARCHIVE_DIR/（series 已注释；请人工核对后 commit）"
else
  echo "dry-run：$moved 件 agent 侧补丁待归档（--apply 执行；当前零改动）"
fi
