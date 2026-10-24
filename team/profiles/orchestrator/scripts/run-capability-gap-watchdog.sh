#!/bin/bash
# capability-ladder S2 看门狗入口（cron --no-agent 薄包装；单一实现在 bin/capability-gap-watchdog.py）
exec python3 "$HOME/.hermes/bin/capability-gap-watchdog.py" --quiet "$@"
