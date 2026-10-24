#!/usr/bin/env bash
# compare-baseline.sh — 性能基线 before/after 对比报告（WP-P6/M6 收尾）
# 消费 pre-opt + post-opt 两份基线（capture-baseline.sh 产出）→ diff 上下文表面/耗时/门禁 LOC
# 输出 markdown 报告（信息性，不设阈值）；各 WP 贡献归因段。
# 诚实限制：脚本无法观测模型 token；上下文表面是字节级代理，wall-clock 是模型处理时间代理（有噪声）。
# 用法:
#   bash compare-baseline.sh <pre-dir> <post-dir> [--stdout]
#     --stdout  只打印不落盘（默认写 <post-dir>/comparison-report.md）
# 退出码: 0 正常（fail-open，缺文件提示）；1 arg 错误。
set -uo pipefail

PRE=""; POST=""; STDOUT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --stdout) STDOUT=1; shift ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) [[ -z "$PRE" ]] && PRE="$1" || { [[ -z "$POST" ]] && POST="$1" || { echo "未知参数: $1" >&2; exit 1; }; }; shift ;;
  esac
done
[[ -n "$PRE" && -n "$POST" ]] || { echo "✗ 用法: compare-baseline.sh <pre-dir> <post-dir> [--stdout]" >&2; exit 1; }
[[ -d "$PRE" && -d "$POST" ]] || { echo "✗ 基线目录不存在: pre=$PRE post=$POST" >&2; exit 1; }

# 读 context-surface-gen.tsv 的 TOTAL 行（bytes lines TOTAL）
_read_total() { # $1=file → echo "bytes lines" 或空
  local f="$1"
  [[ -f "$f" ]] || { echo ""; return; }
  grep -E '^[0-9]+	[0-9]+	TOTAL$' "$f" | tail -1 | awk '{print $1, $2}'
}
pre_total=$(_read_total "$PRE/context-surface-gen.tsv")
post_total=$(_read_total "$POST/context-surface-gen.tsv")
pre_bytes=${pre_total%% *}; pre_lines=${pre_total##* }
post_bytes=${post_total%% *}; post_lines=${post_total##* }

# 降幅百分比（pre-post)/pre*100
_pct() { # $1=pre $2=post
  local p="$1" q="$2"
  [[ -n "$p" && "$p" -gt 0 ]] || { echo "0.0"; return; }
  awk -v p="$p" -v q="$q" 'BEGIN{ printf "%.1f", (p-q)/p*100 }'
}

# 逐文件明细 diff（按 relpath 对齐）
_file_diff() {
  local pf="$PRE/context-surface-gen.tsv" qf="$POST/context-surface-gen.tsv"
  [[ -f "$pf" && -f "$qf" ]] || return
  awk -F'\t' 'NR==FNR{a[$3]=$1"\t"$2; next} $3!="TOTAL" && ($3 in a){split(a[$3],b,"\t"); if(b[1]!=$1||b[2]!=$2) printf "| %s | %s | %s | %s | %s |\n", $3, b[1], $1, b[2], $2}' "$pf" "$qf"
}

# 耗时对比
_timing_diff() {
  [[ -f "$PRE/script-timings.txt" && -f "$POST/script-timings.txt" ]] || return
  echo "| 脚本 | pre-opt | post-opt |"
  echo "|------|---------|----------|"
  paste <(grep -E 'fixture=|^[^#]' "$PRE/script-timings.txt") <(grep -E 'fixture=|^[^#]' "$POST/script-timings.txt") 2>/dev/null \
    | awk -F'\t' '{print "| "$1" | "$2" |"}' || echo "| （耗时行格式不一致，人工对比） | | |"
}

# 门禁 LOC 对比
_loc_diff() {
  [[ -f "$PRE/gate-loc.txt" && -f "$POST/gate-loc.txt" ]] || return
  echo "| 文件 | pre LOC | post LOC | pre bytes | post bytes |"
  echo "|------|---------|----------|-----------|-----------|"
  awk -F'\t' 'NR==FNR{a[$3]=$1"\t"$2; next} ($3 in a){split(a[$3],b,"\t"); printf "| %s | %s | %s | %s | %s |\n", $3, b[1], $1, b[2], $2}' "$PRE/gate-loc.txt" "$POST/gate-loc.txt"
}

# 报告
{
  echo "# 性能基线 before/after 对比报告（compare-baseline.sh）"
  echo ""
  echo "- pre-opt 基线: \`$PRE\`"
  echo "- post-opt 基线: \`$POST\`"
  echo "- 诚实限制: 脚本无法观测模型 token；上下文表面=字节级代理，wall-clock=模型处理时间代理（有噪声）。本报告纯信息性，不设 pass/fail 阈值。"
  echo ""
  echo "## 上下文表面（生成期必读面，字节/行数）"
  echo ""
  if [[ -n "$pre_total" && -n "$post_total" ]]; then
    echo "| 指标 | pre-opt | post-opt | 降幅 |"
    echo "|------|---------|----------|------|"
    echo "| TOTAL 字节 | ${pre_bytes} | ${post_bytes} | $(_pct "$pre_bytes" "$post_bytes")% |"
    echo "| TOTAL 行数 | ${pre_lines} | ${post_lines} | $(_pct "$pre_lines" "$post_lines")% |"
  else
    echo "（context-surface-gen.tsv 缺失，无法对比 TOTAL）"
  fi
  echo ""
  echo "### 变更文件明细（pre vs post 字节/行数不一致项）"
  echo ""
  echo "| 文件 | pre 字节 | post 字节 | pre 行 | post 行 |"
  echo "|------|---------|----------|--------|---------|"
  _file_diff
  echo ""
  echo "## 脚本耗时（wall-clock 样本）"
  echo ""
  _timing_diff
  echo ""
  echo "## 门禁脚本 LOC/字节"
  echo ""
  _loc_diff
  echo ""
  echo "## 各 WP 贡献归因（信息性）"
  echo ""
  echo "- WP-P1（信号索引数据化）: exploration-guide.md 瘦身 ~300 行（信号表外迁为 assets/framework-signals.md）"
  echo "- WP-P2（inventory-verify）: 新增脚本，不直接降上下文表面（核验工作脚本化，模型少跑 grep）"
  echo "- framework-evidence（Step 4 框架深化）: 模型读台账而非逐条跑 grep（62 文件 × ~5 规律的 token 池，最大降幅点，脚本侧不可直接观测）"
  echo "- WP-P4（conf-render）: Step 8 模型只审 TODO:model 清单（从写 158 行变审+补少数，脚本侧不可直接观测）"
  echo "- WP-P5（上下文裁剪）: 目标 skill 加载面按 profile 分层（lite/standard 裁 §14-18 + 认知三件套），用 \`context-surface.sh --skill <lite-skill>\` 对比可见"
  echo "- 模型侧基线: 未自动采集（须手动跑一次生成落 baselines/pre-opt/model-side/，本报告如实披露未采集）"
} > "$POST/comparison-report.md"

if [[ "$STDOUT" -eq 1 ]]; then cat "$POST/comparison-report.md"; else echo "✓ 报告已落 $POST/comparison-report.md"; fi
exit 0
