#!/usr/bin/env bash
# drift-check-approval-smartcache.sh — smart-approve session-cache 源码 patch 自愈看门狗
#
# 检测 tools/approval.py 中 swarm:smart-approve-session-cache 标记是否存活;
# 被 hermes update 冲掉时用 patch 自动重打; 无法干净应用则告警人工。
# 约定: no_agent cron 下 Empty stdout = silent — 健康时静默 exit 0。
set -u

MARKER="swarm:smart-approve-session-cache"
SRC="$HOME/.hermes/hermes-agent/tools/approval.py"
PATCH="$HOME/.hermes/profiles/_shared/decisions/hermes-approval-smartcache.patch"
EXPECTED_MARKERS=2   # 一对标记

[ -f "$SRC" ] || { echo "FATAL: $SRC missing"; exit 2; }
[ -f "$PATCH" ] || { echo "FATAL: patch missing: $PATCH"; exit 2; }

n=$(grep -c "$MARKER" "$SRC" 2>/dev/null || echo 0)
if [ "$n" -ge "$EXPECTED_MARKERS" ]; then
  # 健康; --verbose 才打印
  [ "${1:-}" = "--verbose" ] && echo "✓ smartcache markers present ($n)"
  exit 0
fi

# 漂移: 尝试重打 patch
cd "$HOME/.hermes/hermes-agent" || exit 2
if patch -p1 --dry-run < "$PATCH" >/dev/null 2>&1; then
  patch -p1 < "$PATCH" >/dev/null 2>&1
  n2=$(grep -c "$MARKER" "$SRC" 2>/dev/null || echo 0)
  if [ "$n2" -ge "$EXPECTED_MARKERS" ]; then
    echo "WATCHDOG: smartcache markers lost ($n) — patch reapplied (now $n2). Restart gateways to load."
    exit 1
  fi
fi
echo "WATCHDOG: smartcache markers lost and patch could not apply cleanly — manual rebase needed"
exit 2
