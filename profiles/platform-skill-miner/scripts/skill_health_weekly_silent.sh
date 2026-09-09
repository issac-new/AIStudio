#!/bin/bash
# skill-health-weekly 静默版（2026-09-08 改造）
# 原为 agent 模式（周日 03:00，platform-skill-miner 默认模型计费，且上周因
# drift_skip:silent 熔断 error）。审计本身是机械脚本 → no_agent 化，0 token。
# 语义保持：Phase 3 有重复 skill 或脚本异常才输出（stdout 即消息）；健康=静默。
AUDIT=~/.hermes/bin/skill-health-audit.sh
OUT_DIR=~/.hermes/skill-health
mkdir -p "$OUT_DIR"
LOG="$OUT_DIR/audit-$(date +%F).log"

out=$(bash "$AUDIT" 2>&1)
rc=$?
printf '%s\n' "$out" > "$LOG"

# Phase 3 段落 = [Phase 3] 行到下一个 [Phase N] 行之间，除标题/空行外有内容即重复
dups=$(printf '%s\n' "$out" | awk '/\[Phase 3\]/{f=1;next} /\[Phase [0-9]+\]/{f=0} f && NF && $0 !~ /^重复 skill/{print}' | head -5)

if [ "$rc" -ne 0 ]; then
  echo "🔴 skill-health-audit 异常退出 rc=$rc（全文如下）"
  echo ""
  cat "$LOG"
  exit 1
fi
if [ -n "$dups" ]; then
  echo "🟡 skill 库发现同名重复 skill（Phase 3 非空），报告："
  echo ""
  cat "$LOG"
fi
# 健康 = 空输出 = 不投递
exit 0
