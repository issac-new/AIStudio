#!/bin/bash
# 守门：报告链源层 jargon 门禁（run14 轮根治件）。run12 曾达成源层 HARD=0，其后
# F1-F18/V8.5/run14 预注册叙事回潮 167 处——源层无绊线是根因。词表单一事实源=
# overlay scripts/plan-html/jargon-check.py（final-report-merge._load_jargon_words
# 同源），解析序：MX_JARGON_CHECK 覆盖 → 主树 overlay → NVMe 镜像 overlay；
# 词表文件缺失=fail-closed 不静默跳过。方案正本一并入闸（报告解析源单一）。
set -u
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
JC="${MX_JARGON_CHECK:-}"
if [ -z "$JC" ] || [ ! -f "$JC" ]; then
  JC="/Users/cuishi/lab/ncwk/overlay/scripts/plan-html/jargon-check.py"
fi
if [ ! -f "$JC" ]; then
  JC="/Volumes/nvme2230/lab/ncwk/overlay/scripts/plan-html/jargon-check.py"
fi
if [ ! -f "$JC" ]; then
  echo 'FAIL jargon-source-gate: jargon-check.py not found (main tree + mirror both absent; set MX_JARGON_CHECK)'
  exit 1
fi
PLAN="/Users/cuishi/lab/ncwk/overlay/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md"
if [ ! -f "$PLAN" ]; then
  PLAN="/Volumes/nvme2230/lab/ncwk/overlay/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md"
fi
if [ ! -f "$PLAN" ]; then
  echo 'FAIL jargon-source-gate: plan not found (main tree + mirror both absent)'
  exit 1
fi
python3 "$JC" \
  "$HERE/mux/mx-report-gen.py" \
  "$HERE/mux/final-report-merge.py" \
  "$HERE/mux/mx-narrative-skeleton.py" \
  "$HERE/mux/mx-report-audit.py" \
  "$HERE/mux/r18_matrix.py" \
  "$PLAN"
rc=$?
if [ "$rc" -ne 0 ]; then
  echo 'FAIL jargon-source-gate: HARD 违规见上——改人话后再提交（教学卡/机器字面量豁免由词表承载）'
  exit "$rc"
fi
echo 'PASS jargon-source-gate（5 报告链源文件+方案正本，HARD=0）'
