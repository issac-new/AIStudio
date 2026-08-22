#!/bin/bash
# 自动提交workspace变更到Git仓库（防丢失），由launchd定时触发。
# 无变更时静默退出。日志: ~/.hermes/logs/<repo>-auto-push.log
set -u
WORKSPACE="${1:-$HOME/hermes-docker-sandbox/workspace}"
BRANCH="${2:-main}"
LOG="$HOME/.hermes/logs/$(basename "$WORKSPACE")-auto-push.log"
mkdir -p "$(dirname "$LOG")"
cd "$WORKSPACE" || exit 1

git add -A
if git diff --cached --quiet; then
    echo "$(date '+%F %T') no changes" >> "$LOG"; exit 0
fi
git commit -m "Auto-backup: $(date '+%F %H:%M')" >> "$LOG" 2>&1
if git push origin "$BRANCH" >> "$LOG" 2>&1; then
    echo "$(date '+%F %T') push OK" >> "$LOG"
else
    echo "$(date '+%F %T') push FAILED" >> "$LOG"
fi
