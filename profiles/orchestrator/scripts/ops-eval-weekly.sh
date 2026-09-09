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
