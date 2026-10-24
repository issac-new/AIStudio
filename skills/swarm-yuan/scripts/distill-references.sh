#!/usr/bin/env bash
# distill-references.sh — 目标技能分发面的"吸收叙述"净化器（R125）
#
# 问题（审计 R125）：生成器侧 references 承载两类内容——
#   A) 目标技能每次会话加载要用的"方法/机制/规则"（消费面）；
#   B) 生成器每轮"运行时刷新"把上游 release note 逐版吸收的叙述（版本注记段）。
# 旧实现把 A、B 混在同一份文件里随 UNIVERSAL_FILES 分发到目标技能——目标技能读者
# 为不消费的 B 类内容付每会话加载税，预算 FACT_ARTIFACT_BYTES_BUDGET 因此逐轮上涨
# （32 次例外登记、预算从 262144 升到 598016，只升不降）。这是预算棘轮的根因。
#
# 做法：把 B 类段从"分发面"剥离——
#   仓内生成器侧档（references/*.md）保留全量（含版本基线/吸收段，是供应链决策史）；
#   复制进目标技能骨架时，按"净化清单"把该文件的 B 类段截断在边界标题之前。
# 净化清单在本文件 DISTILL_BOUNDS 注册（数据驱动，新增文件只需追加一行，不改逻辑）：
#   <相对 references/ 的文件名> | <截断边界标题（含 ##，该标题起及之后全部剥离）>
#
# 用法：
#   bash distill-references.sh <源 references 目录> <文件相对路径> <输出路径>
#     输出 = 净化后的文件（无净化规则则原样拷贝）
#   bash distill-references.sh --estimate <源 references 目录>
#     只报告每文件可剥离字节数（评估用，不写文件）
#
# 消费方：generate-skill.sh copy_universal_templates 对 |ref 类文件调用本脚本。
# 红线：剥离只发生在"复制进目标技能"这一刻，不改仓内源档；仓内档保持全量可审。
set -uo pipefail

# 净化清单（数据驱动）——边界标题起及之后全部剥离
DISTILL_BOUNDS=(
  "claude-code-capabilities.md|## 版本基线"
  "codex-methodology.md|## 版本基线"
  "codex-security-methodology.md|## 十二、版本与来源"
)

_usage() {
  echo "用法: bash distill-references.sh <源references目录> <文件相对路径> <输出路径>"
  echo "      bash distill-references.sh --estimate <源references目录>"
  exit 1
}

# 计算某文件的剥离量：边界标题行号（0=无边界）
_bound_line() { # $1=文件 $2=文件相对路径
  local f="$1" rel="$2" b rule
  for rule in "${DISTILL_BOUNDS[@]}"; do
    case "$rule" in
      "$rel|"*) b="${rule#*|}" ;;
      *) continue ;;
    esac
    grep -nF -m1 "$b" "$f" 2>/dev/null | head -1 | cut -d: -f1
    return 0
  done
  echo 0
}

if [[ "${1:-}" == "--estimate" ]]; then
  SRC_DIR="${2:-}"
  [[ -d "$SRC_DIR" ]] || _usage
  total=0
  for rule in "${DISTILL_BOUNDS[@]}"; do
    f="${rule%%|*}"
    [[ -f "$SRC_DIR/$f" ]] || continue
    bl=$(_bound_line "$SRC_DIR/$f" "$f")
    [[ "$bl" == "0" || -z "$bl" ]] && continue
    full=$(wc -c < "$SRC_DIR/$f" | tr -d ' ')
    keep=$(head -n "$((bl - 1))" "$SRC_DIR/$f" | wc -c | tr -d ' ')
    strip=$((full - keep))
    printf '%-34s full=%7d keep=%7d strip=%7d\n' "$f" "$full" "$keep" "$strip"
    total=$((total + strip))
  done
  echo "TOTAL 可剥离 ${total}B（目标技能分发面减负）"
  exit 0
fi

SRC_DIR="${1:-}"
REL="${2:-}"
OUT="${3:-}"
[[ -n "$SRC_DIR" && -n "$REL" && -n "$OUT" ]] || _usage
[[ -f "$SRC_DIR/$REL" ]] || { echo "ERROR: 源文件不存在: $SRC_DIR/$REL" >&2; exit 1; }

bl=$(_bound_line "$SRC_DIR/$REL" "$REL")
if [[ "$bl" != "0" && -n "$bl" && "$bl" -gt 1 ]]; then
  head -n "$((bl - 1))" "$SRC_DIR/$REL" > "$OUT"
  # 尾部补一行交代（目标技能读者知道完整版在生成器仓内）
  printf '\n---\n\n> 注：本节之后为生成器侧"版本基线 / 运行时吸收叙述"段，不随目标技能分发（每会话加载税）。\n> 完整版与逐版能力明细见生成器仓 references/%s（同标题起）。\n' "$REL" >> "$OUT"
else
  cp "$SRC_DIR/$REL" "$OUT"
fi
