#!/bin/bash
# 根治空流——一次性运维：重启 gateway 加载 agent_init api_mode 补丁。
# 本文件由 cron 脚本任务执行（no_agent 形态），输出会被 cron 日志捕获。
set -u
exec > /tmp/restart-gw.log 2>&1
echo "[$(date '+%H:%M:%S')] 旧 gateway pid=$(lsof -nP -iTCP:8650 -sTCP:LISTEN -t 2>/dev/null | head -1)"
osascript -e 'tell application id "ai.hermes.gateway" to quit' 2>/dev/null || true
sleep 4
launchctl kickstart -k gui/501/ai.hermes.gateway 2>/dev/null || true
for i in $(seq 1 20); do
  sleep 3
  GPID=$(lsof -nP -iTCP:8650 -sTCP:LISTEN -t 2>/dev/null | head -1)
  if [ -n "$GPID" ]; then
    H=$(curl -s -m 5 http://127.0.0.1:8650/health 2>/dev/null | head -c 80)
    echo "[$(date '+%H:%M:%S')] new gateway pid=$GPID health=$H"
    # 补丁加载验证：确认 gateway 进程运行的是打过补丁的 agent_init（进程内 grep 不可行，用文件级+反向校验）
    cd /Users/YOURNAME/.hermes/hermes-agent && git apply --reverse --check /Users/YOURNAME/.hermes/patches/hermes-agent-init-apimode-route-declare.patch 2>/dev/null \
      && echo "patch in tree: YES" || echo "patch in tree: NO"
    exit 0
  fi
done
echo "gateway 未在 60s 内回来" >&2
exit 1
