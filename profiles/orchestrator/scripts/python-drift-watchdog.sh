#!/bin/bash
# 薄委托 wrapper：正本在 ~/.hermes/bin/python-drift-watchdog.sh（单一事实源）
# cron job (f8571173d58a) 要求脚本位于 orchestrator scripts/ 目录内
exec /Users/YOURNAME/.hermes/bin/python-drift-watchdog.sh "$@"
