#!/bin/bash
# loop_liveness_watchdog.sh — shim: cron no_agent 入口（scheduler 只认 HERMES_HOME/scripts 内真文件）
# 真源: ~/.hermes/scripts/loop_liveness_watchdog.sh（01:30 独立于夜间loop，full-done 缺失即告警）
exec bash /Users/YOURNAME/.hermes/scripts/loop_liveness_watchdog.sh "$@"
