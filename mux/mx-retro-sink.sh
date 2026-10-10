#!/bin/bash
# mx-retro-sink.sh — 轮间教训自动沉淀（能力补齐·差距四：自成长闭环件）。
# 背景：每轮 G6 复盘的改进项此前靠人工改 harness 技能源——学习单向且易漏。
# 本脚本从复盘文档机械提取可沉淀条目（改进项/教训/根因行），去重后追加进
# aipaydev-dev 技能的 references/lessons.md（install_skills 全目录分发，下轮
# profile 自动携带）。
# 用法：bash mx-retro-sink.sh <复盘文档.md> [--dry]
#   提取判据（保守，宁缺勿滥）：行首列表项且含「改进/教训/lesson/根因/F[0-9]」
#   关键词；已含同句（前 60 字符指纹）的条目跳过；每文档追加一节带来源与日期。
# 退出码：0=成功或无可提取；1=文档缺失/目标不可写。
set -uo pipefail

DOC="${1:-}"
DRY=0
[[ "${2:-}" == "--dry" ]] && DRY=1
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DEFAULT="$HERE/skills/aipaydev-dev/references/lessons.md"
TARGET="${MX_RETRO_SINK_TARGET:-$TARGET_DEFAULT}"

if [[ -z "$DOC" || ! -f "$DOC" ]]; then
  echo "usage: bash mx-retro-sink.sh <复盘文档.md> [--dry]" >&2
  exit 1
fi
if [[ ! -d "$(dirname "$TARGET")" ]]; then
  echo "FAIL 目标目录不存在（技能骨架缺 references/？）：$TARGET" >&2
  exit 1
fi

# 提取：行首 -/* 列表项 + 关键词（排除纯标题/表格行）
EXTRACTED=$(grep -nE '^[[:space:]]*[-*] .*(改进|教训|lesson|根因|F[0-9]+)' "$DOC" \
  | sed -E 's/^[0-9]+:[[:space:]]*[-*] //' | grep -vE '^\|' || true)
[[ -z "$EXTRACTED" ]] && { echo "无匹配条目（关键词：改进/教训/lesson/根因/F 编号）——不追加"; exit 0; }

# 去重指纹：条目前 60 字符
mkdir -p "$(dirname "$TARGET")"; touch "$TARGET"
NEW_ITEMS=""
while IFS= read -r item; do
  fp=$(printf '%s' "$item" | cut -c1-60)
  if grep -qF "$fp" "$TARGET" 2>/dev/null; then continue; fi
  NEW_ITEMS="${NEW_ITEMS}- ${item}
"
done <<< "$EXTRACTED"
[[ -z "$NEW_ITEMS" ]] && { echo "全部条目已存在（指纹去重）——不追加"; exit 0; }

if [[ "$DRY" -eq 1 ]]; then
  echo "--dry：将追加 $(printf '%s' "$NEW_ITEMS" | grep -c '^-' ) 条："; printf '%s' "$NEW_ITEMS"
  exit 0
fi
{
  printf '\n## %s 轮间沉淀（源：%s）\n\n' "$(date '+%Y-%m-%d')" "$(basename "$DOC")"
  printf '%s' "$NEW_ITEMS"
} >> "$TARGET"
echo "已追加 $(printf '%s' "$NEW_ITEMS" | grep -c '^-') 条 → ${TARGET}（随 install_skills 分发，下轮生效）"
