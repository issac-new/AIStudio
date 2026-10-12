#!/bin/bash
# rc-watch-events-monitor.sh — rc-watch 事件路由的 change-detector（hermes cronjob monitor 门控）
# 语义：输出 = 最近一轮 RC_EVENT 行（rc-watch-cron.sh 写入）。
#   无事件 → 输出恒为空 → 与上一 tick 相同 → agent 跳过（零 LLM）
#   有事件 → 输出变化   → agent 被唤醒并收到 diff → 按 upgrade-eval-checklist §5 建评估卡
# 确定性要求（monitor 铁律）：输出不得含时间戳，否则每 tick 都判变更。
cat /Volumes/YOURVOLUME/lab/data-stack/logs/rc-watch-last-events.txt 2>/dev/null || true
