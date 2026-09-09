#!/usr/bin/env bash
# skill-health-audit.sh — Skill 库健康度审计（P2-3）v2 2026-08-27 重写
# v2 修复：
#   1. Phase 3 O(n²) 子进程炸弹（709²≈50万次 grep 必然超时 exit 1）→ awk 单次扫描
#   2. Phase 4 每 skill 全量 grep SOUL → 预拼一次大文本再单次 grep -F 批查
#   3. 谎报「报告已保存至 /tmp/...」但从不写文件 → 真实落盘
# 原则：只报告不修改，结果供人工决策
set -euo pipefail

SKILLS_DIR="${HOME}/.hermes/skills"
DAYS_STALE="${1:-90}"
REPORT="/tmp/skill-health-audit-$(date +%Y%m%d-%H%M%S).txt"

main() {
echo "================================================================"
echo "Skill 库健康度审计 v2"
echo "================================================================"
echo "审计时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "Skill 目录: $SKILLS_DIR"
echo "Stale 阈值: $DAYS_STALE 天"
echo ""

# ---------- Phase 1: 总量统计 ----------
total_skills=$(find "$SKILLS_DIR" -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
total_categories=$(ls -d "$SKILLS_DIR"/*/ 2>/dev/null | wc -l | tr -d ' ')
echo "[Phase 1] Skill 总数: $total_skills / 分类数: $total_categories"
echo "按分类统计（前 10）:"
find "$SKILLS_DIR" -name "SKILL.md" 2>/dev/null | awk -F/ '
  { path=$0; sub(".*/skills/", "", path); n=split(path, a, "/"); print a[1] }' | sort | uniq -c | sort -rn | head -10 | while read -r count name; do
  printf "  %-35s %3d\n" "$name" "$count"
done
echo ""

# ---------- Phase 2: Stale ----------
echo "[Phase 2] Stale skill（>${DAYS_STALE} 天未更新）:"
find "$SKILLS_DIR" -name "SKILL.md" -mtime +${DAYS_STALE} 2>/dev/null | while read -r f; do
  mtime=$(stat -f "%Sm" -t "%Y-%m-%d" "$f" 2>/dev/null || echo "?")
  echo "  ${f#"$SKILLS_DIR"/} (最后更新: $mtime)"
done
stale_total=$(find "$SKILLS_DIR" -name "SKILL.md" -mtime +${DAYS_STALE} 2>/dev/null | wc -l | tr -d ' ')
echo "Stale 总数: $stale_total / $total_skills"
echo ""

# ---------- Phase 3: 同名重复（awk 单遍，O(n) ）----------
echo "[Phase 3] 重复 skill（同名不同分类，物理双份）:"
find "$SKILLS_DIR" -name "SKILL.md" 2>/dev/null | awk -F/ '
  { path=$0; sub(".*/skills/", "", path); n=split(path, a, "/"); print a[n-1] "\t" path }
' | sort | awk -F'\t' '
  $1 == prev { if (!printed) { print "  重复: " prev " -> " prevpath; printed=1 } print "        " $2 }
  { prev=$1; prevpath=$2; printed=0 }'
echo ""

# ---------- Phase 4: 零引用（预拼 SOUL 大文本，单次批查）----------
echo "[Phase 4] 零引用 skill（未被任何 SOUL.md 引用，仅列前 30）:"
SOULBLOB=$(mktemp)
cat ~/.hermes/profiles/*/SOUL.md > "$SOULBLOB" 2>/dev/null || true
zero_total=0
while read -r skill_file; do
  name=$(basename "$(dirname "$skill_file")")
  if ! grep -qF "$name" "$SOULBLOB"; then
    echo "  ${skill_file#"$SKILLS_DIR"/}"
    zero_total=$((zero_total+1))
    [ "$zero_total" -ge 30 ] && break
  fi
done < <(find "$SKILLS_DIR" -name "SKILL.md" 2>/dev/null)
rm -f "$SOULBLOB"
echo "零引用 skill 总数(截断至30): $zero_total"
echo ""

# ---------- Phase 5: 汇总 ----------
echo "[Phase 5] 汇总: total=$total_skills stale=$stale_total"
[ "$total_categories" -gt 20 ] && echo "  - 分类过多（$total_categories 个），考虑合并相似分类"
echo ""
}

main | tee "$REPORT"
echo "详细报告已保存至: $REPORT"
