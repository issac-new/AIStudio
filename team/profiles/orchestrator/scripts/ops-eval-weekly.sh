#!/bin/bash
# ops-eval weekly report generator
# Runs weekly, scans all kanban boards, generates agent workflow evaluation report
# Output: ~/.hermes/evals/weekly-$(date +%Y%m%d).md

REPORT_DIR="$HOME/.hermes/evals"
mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/weekly-$(date +%Y%m%d).md"

echo "# Agent 工作流评估周报 $(date +%Y-%m-%d)" > "$REPORT"
echo "" >> "$REPORT"
echo "> 由 ops-eval cron job 自动生成 | 灵感来源：Palantir AIP Evals" >> "$REPORT"
echo "" >> "$REPORT"

for board in swarm hack product ops [已移除] platform; do
  DB="$HOME/.hermes/kanban/boards/$board/kanban.db"
  if [ ! -f "$DB" ]; then continue; fi
  
  TOTAL=$(sqlite3 "$DB" "SELECT count(*) FROM tasks;" 2>/dev/null)
  DONE=$(sqlite3 "$DB" "SELECT count(*) FROM tasks WHERE status='done';" 2>/dev/null)
  BLOCKED=$(sqlite3 "$DB" "SELECT count(*) FROM tasks WHERE status='blocked';" 2>/dev/null)
  RUNNING=$(sqlite3 "$DB" "SELECT count(*) FROM tasks WHERE status='running';" 2>/dev/null)
  
  echo "## $board 看板" >> "$REPORT"
  echo "" >> "$REPORT"
  echo "| 指标 | 值 |" >> "$REPORT"
  echo "|------|-----|" >> "$REPORT"
  echo "| 总任务 | $TOTAL |" >> "$REPORT"
  echo "| 完成 | $DONE |" >> "$REPORT"
  echo "| 阻塞 | $BLOCKED |" >> "$REPORT"
  echo "| 运行中 | $RUNNING |" >> "$REPORT"
  if [ "$TOTAL" -gt 0 ]; then
    RATE=$((DONE * 100 / TOTAL))
    echo "| 完成率 | ${RATE}% |" >> "$REPORT"
  fi
  
  # Top assignees by task count
  echo "" >> "$REPORT"
  echo "### 按执行者统计" >> "$REPORT"
  echo "" >> "$REPORT"
  echo "| 执行者 | 完成 | 阻塞 | 总计 |" >> "$REPORT"
  echo "|--------|------|------|------|" >> "$REPORT"
  sqlite3 "$DB" "SELECT assignee, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END), SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END), count(*) FROM tasks GROUP BY assignee ORDER BY count(*) DESC LIMIT 10;" 2>/dev/null | while IFS='|' read -r assignee done blocked total; do
    echo "| $assignee | $done | $blocked | $total |" >> "$REPORT"
  done
echo "" >> "$REPORT"
done

# ===== 后评价四维（融合万事网联《生产运维后评价机制和流程》V0.1，2026-09-11） =====
# 维度1 变更达成率：release-plan 报告产出量 vs 发布类任务完成量
echo "## 后评价四维（生产机制融合 v1.1）" >> "$REPORT"
echo "" >> "$REPORT"
echo "### ① 变更达成率" >> "$REPORT"
echo "" >> "$REPORT"
REL_PLANS=$(find "$HOME/.hermes" /Users/YOURNAME/hermes-docker-sandbox/workspace -maxdepth 4 -name "release-plan*.md" -mtime -7 2>/dev/null | wc -l | tr -d ' ')
echo "- 近 7 天 release-plan 报告数：$REL_PLANS" >> "$REPORT"
echo "" >> "$REPORT"

# 维度2 工具失败率趋势（token-meter --errors，AutoQA 信号）
echo "### ② 工具失败率趋势" >> "$REPORT"
echo "" >> "$REPORT"
echo '```' >> "$REPORT"
python3 "$HOME/.hermes/bin/token-meter.py" --errors --days 7 2>/dev/null | head -12 >> "$REPORT" || echo "(token-meter 不可用)" >> "$REPORT"
echo '```' >> "$REPORT"
echo "" >> "$REPORT"

# 维度3 问题回顾闭环率：blocked/gave_up 卡的回顾报告覆盖
echo "### ③ 问题回顾闭环率" >> "$REPORT"
echo "" >> "$REPORT"
CLOSED=0
OPEN=0
for board in swarm hack ops platform; do
  DB="$HOME/.hermes/kanban/boards/$board/kanban.db"
  [ -f "$DB" ] || continue
  B=$(sqlite3 "$DB" "SELECT count(*) FROM tasks WHERE status IN ('blocked','gave_up');" 2>/dev/null)
  [ -n "$B" ] && OPEN=$((OPEN + B))
done
echo "- 在卡（blocked/gave_up）：$OPEN 张——每张须有失败模式标签+回顾记录（failure-mode-playbook）" >> "$REPORT"
echo "" >> "$REPORT"

# 维度4 整改验证：看门狗审计结果（D1-D7 / drift report）
echo "### ④ 整改验证（看门狗哨兵）" >> "$REPORT"
echo "" >> "$REPORT"
WD="/Users/YOURNAME/hermes-docker-sandbox/workspace/profiles/orchestrator/scripts/rules_audit_watchdog.py"
[ -f "$WD" ] && { python3 "$WD" >/dev/null 2>&1 && echo "- rules_audit_watchdog D1-D7：全零通过 ✅" >> "$REPORT" || echo "- rules_audit_watchdog：命中异常 ❌（须开问题回顾）" >> "$REPORT"; } || echo "- rules_audit_watchdog 不在位 ❌" >> "$REPORT"
SI="$HOME/.hermes/scripts/soul_integrity_watchdog.py"
[ -f "$SI" ] && { python3 "$SI" >/dev/null 2>&1 && echo "- soul_integrity_watchdog：基线一致 ✅" >> "$REPORT" || echo "- soul_integrity_watchdog：漂移 ❌" >> "$REPORT"; }
DA="$HOME/.hermes/scripts/publish_drift_audit.py"
[ -f "$DA" ] && echo "- publish drift 审计脚本在位（月度 cron）" >> "$REPORT"
echo "" >> "$REPORT"

echo "## 评估维度说明" >> "$REPORT"
echo "" >> "$REPORT"
echo "| 维度 | 指标 | 数据源 |" >> "$REPORT"
echo "|------|------|--------|" >> "$REPORT"
echo "| 完成率 | done/total | kanban.db tasks |" >> "$REPORT"
echo "| 阻塞率 | blocked/total | kanban.db tasks |" >> "$REPORT"
echo "| 按执行者分布 | GROUP BY assignee | kanban.db tasks |" >> "$REPORT"
echo "" >> "$REPORT"
echo "--- 生成时间: $(date '+%Y-%m-%d %H:%M:%S') ---" >> "$REPORT"

echo "Report generated: $REPORT"
