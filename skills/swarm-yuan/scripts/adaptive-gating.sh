#!/usr/bin/env bash
# adaptive-gating.sh — 门禁活跃度治理报告（gstack adaptive gating 移植，治 G5 沉睡门禁）
# 读 gate-runs.jsonl 历史记录，统计每门禁连续零发现次数，输出三档：
#   ACTIVE       — 近 N 次有发现（pass/fail/warn 非 skip）
#   GATE_CANDIDATE — 连续 ≥ THRESHOLD 次零发现（建议审查是否仍有价值）
#   NEVER_GATE   — 安全门禁豁免清单（永不降级）
# 用法: bash adaptive-gating.sh [gate-runs.jsonl 路径] [THRESHOLD=10]
# 输出格式: 状态 门禁名 (连续零发现次数)
set -u

JSONL="${1:-gate-runs.jsonl}"
THRESHOLD="${2:-10}"
case "$THRESHOLD" in
  ''|*[!0-9]*|0) echo "用法: bash adaptive-gating.sh [gate-runs.jsonl] [THRESHOLD=10]（THRESHOLD 须为正整数）" >&2; exit 1 ;;
esac

if [[ ! -s "$JSONL" ]]; then
  echo "ℹ 未找到 gate-runs 证据文件（${JSONL}）——请先在 precheck.conf 配置 GATE_RUNS_DIR 并运行门禁"
  exit 0
fi

# 安全门禁豁免清单（永不降级，保险策略）
# 与 precheck.sh _never_gate 收敛为单源 12 项（原 10 项，补 authz/privacy）
NEVER_GATE="dengbao pia crypto sast-deep sbom release-sign oss-eval shift-left security sensitive authz privacy"

echo "=== 门禁活跃度治理报告（adaptive gating）==="
echo "  数据源: $JSONL  阈值: 连续 ${THRESHOLD} 次零发现"
echo ""

# awk 聚合：逐行提取 gate/status，统计每门禁连续零发现（skip）次数
awk -v never="$NEVER_GATE" -v thr="$THRESHOLD" '
  {
    line=$0; g=""; s=""
    if (match(line, /"gate":"[^"]+"/))   g=substr(line, RSTART+8,  RLENGTH-9)
    if (match(line, /"status":"[^"]+"/)) s=substr(line, RSTART+10, RLENGTH-11)
    if (g == "" || s == "") next
    # 状态 s=skip 为零发现；pass/fail/warn 均算"有发现"
    if (s == "skip") { zero[g]++ } else { zero[g]=0 }
    total[g]++
  }
  END {
    # 按门禁名排序输出
    n=0
    for (g in total) { sorted[n++] = g }
    # 简单冒泡排序（bash 3.2 兼容，门禁数 < 100 可接受）
    for (i=0; i<n; i++) for (j=i+1; j<n; j++)
      if (sorted[i] > sorted[j]) { t=sorted[i]; sorted[i]=sorted[j]; sorted[j]=t }
    for (i=0; i<n; i++) {
      g=sorted[i]; z=zero[g]; t=total[g]
      # 判断是否 NEVER_GATE
      is_ng=0
      split(never, ng_arr, " ")
      for (k in ng_arr) { if (g == ng_arr[k]) { is_ng=1; break } }
      if (is_ng) {
        printf "NEVER_GATE     %-28s (%d 次记录，安全门禁豁免)\n", g, t
      } else if (z >= thr) {
        printf "GATE_CANDIDATE %-28s (连续 %d 次零发现，共 %d 次记录) ← 建议审查\n", g, z, t
      } else if (z > 0) {
        printf "ACTIVE         %-28s (连续 %d 次零发现，共 %d 次记录)\n", g, z, t
      } else {
        printf "ACTIVE         %-28s (近 %d 次有发现，共 %d 次记录)\n", g, z, t
      }
    }
  }
' "$JSONL"

echo ""
echo "说明: GATE_CANDIDATE 连续 ${THRESHOLD} 次零发现，建议审查该门禁是否仍有价值；"
echo "      NEVER_GATE 为安全门禁豁免清单，永不降级（保险策略）。"
