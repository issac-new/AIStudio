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
# 方案正本与 TS 层读「已提交内容」（git show main:path）——主树工作副本可能承载并行
# 会话的在途草稿（run14 实锤：16:0x 他人未提交方案稿带 4 处 HARD 把全仓守门拦红）。
# 门禁语义=「HARD=0 才提交」：查提交态，工作副本与提交态不一致时 WARN 提示作者提交前重跑。
_ov_committed() { # <repo> <path> → 临时文件路径（已提交内容），失败回退工作副本
  git -C "$1" show "main:$2" > "$TMP_PLAN_DIR/$(basename "$2")" 2>/dev/null && \
    { [ "$1" != "$OV" ] || ! cmp -s "$TMP_PLAN_DIR/$(basename "$2")" "$1/$2" && \
      echo "WARN jargon-source-gate: $2 工作副本与 main 提交态不一致（在途草稿？）——提交前请重跑本守门" >&2; }
  echo "$TMP_PLAN_DIR/$(basename "$2")"
}
TMP_PLAN_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_PLAN_DIR"' EXIT
PLAN_FILE=$(_ov_committed "$OV" docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md)
[ -s "$PLAN_FILE" ] || PLAN_FILE="$PLAN"
python3 "$JC" \
  "$HERE/mux/mx-report-gen.py" \
  "$HERE/mux/final-report-merge.py" \
  "$HERE/mux/mx-narrative-skeleton.py" \
  "$HERE/mux/mx-report-audit.py" \
  "$HERE/mux/r18_matrix.py" \
  "$PLAN_FILE"
rc=$?
# 产品 TS 报告层（overlay custom/server/report/——REST 接线的语义正本）：主树缺席时
# 镜像树兜底；两层都缺席（独立克隆跑守门）则跳过并 WARN，不 fail-closed（python 五
# 文件+方案才是推演链路本体，TS 层缺席不阻断推演侧守门）。同样只查提交态。
OV="/Users/cuishi/lab/ncwk/overlay"
[ -d "$OV/custom/server/report" ] || OV="/Volumes/nvme2230/lab/ncwk/overlay"
if [ -d "$OV/custom/server/report" ]; then
  TS_DIR="$TMP_PLAN_DIR/ts"; mkdir -p "$TS_DIR"
  for f in "$OV"/custom/server/report/*.ts "$OV"/custom/server/report/__tests__/*.ts; do
    rel=${f#"$OV"/}
    git -C "$OV" show "main:$rel" > "$TS_DIR/$(basename "$rel")" 2>/dev/null || cp "$f" "$TS_DIR/"
  done
  python3 "$JC" "$TS_DIR"/*.ts
  rc2=$?
  [ "$rc2" -ne 0 ] && rc=$rc2
else
  echo 'WARN jargon-source-gate: overlay custom/server/report 未找到（主树+镜像均缺席），TS 层本次未检'
fi
if [ "$rc" -ne 0 ]; then
  echo 'FAIL jargon-source-gate: HARD 违规见上——改人话后再提交（教学卡/机器字面量豁免由词表承载）'
  exit "$rc"
fi
echo 'PASS jargon-source-gate（5 报告链源文件+方案正本，HARD=0）'
