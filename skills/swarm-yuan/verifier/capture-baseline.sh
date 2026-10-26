#!/usr/bin/env bash
# capture-baseline.sh — 性能基线采集（WP-P0/M6）
# 用法: bash verifier/capture-baseline.sh <out-dir> [--skill-dir <生成产物路径>]
# 采集（脚本侧、确定性）:
#   ① context-surface --gen    → context-surface-gen.tsv（生成期必读面字节/行数）
#   ② context-surface --skill  → context-surface-skill.tsv（仅给了 --skill-dir 时）
#   ③ detect-frameworks.sh 在固定 fixture 上的耗时 → script-timings.txt（脚本 wall-clock 样本）
#   ④ 门禁脚本 LOC/字节快照     → gate-loc.txt
#   MANIFEST.md 记录采集时间/commit/文件清单。
# 诚实声明：模型侧基线（真实生成一次的 trace/cost-report）无法由脚本自动产出——
#   须在 WP-P2~P5 合入前用真项目跑一次生成，把 cost-report 手动落入 baselines/pre-opt/model-side/。
set -uo pipefail

OUT="${1:?用法: capture-baseline.sh <out-dir> [--skill-dir <dir>]}"; shift || true
SKILL_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill-dir) SKILL_DIR="${2:?--skill-dir 需要路径}"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done
ROOT=$(cd "$(dirname "${0}")/.." && pwd)
SY="$ROOT"
mkdir -p "$OUT"

# ① 生成期必读面
bash "$SY/scripts/context-surface.sh" --gen > "$OUT/context-surface-gen.tsv" \
  && echo "✓ context-surface-gen.tsv"

# ② 目标 skill 加载面（可选）
if [[ -n "$SKILL_DIR" ]]; then
  bash "$SY/scripts/context-surface.sh" --skill "$SKILL_DIR" > "$OUT/context-surface-skill.tsv" \
    && echo "✓ context-surface-skill.tsv"
fi

# ③ 脚本耗时样本（fixture = tests/fixtures 下第一个目录，记录其名）
fx="$(ls "$SY/tests/fixtures" 2>/dev/null | head -1)"
{
  echo "# script-timings（wall-clock 秒，$(date -u +%Y-%m-%dT%H:%M:%SZ)）"
  if [[ -n "$fx" ]]; then
    t0=$(date +%s)
    bash "$SY/scripts/detect-frameworks.sh" "$SY/tests/fixtures/$fx" >/dev/null 2>&1
    t1=$(date +%s)
    echo "detect-frameworks.sh fixture=$fx $((t1-t0))s"
  else
    echo "detect-frameworks.sh SKIPPED（tests/fixtures 为空）"
  fi
} > "$OUT/script-timings.txt" && echo "✓ script-timings.txt"

# ④ 门禁脚本 LOC/字节快照
{
  for f in assets/precheck.sh assets/gates-strict.sh assets/gates-warn.sh assets/gates-advisory.sh; do
    [[ -f "$SY/$f" ]] || continue
    printf '%s\t%s\t%s\n' "$(wc -l < "$SY/$f" | tr -d ' ')" "$(wc -c < "$SY/$f" | tr -d ' ')" "$f"
  done
} > "$OUT/gate-loc.txt" && echo "✓ gate-loc.txt"

# MANIFEST
{
  echo "# 性能基线 MANIFEST"
  echo "- 采集时间: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- commit: $(cd "$ROOT" && git rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "- 文件: context-surface-gen.tsv$( [[ -n "$SKILL_DIR" ]] && echo ' context-surface-skill.tsv') script-timings.txt gate-loc.txt"
  echo "- 模型侧基线: 未自动采集（见 capture-baseline.sh 头部诚实声明）"
} > "$OUT/MANIFEST.md" && echo "✓ MANIFEST.md → $OUT"
exit 0
