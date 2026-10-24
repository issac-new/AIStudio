#!/bin/bash
# capability-ladder §6.4 聚类入口（cron --no-agent 薄包装；单一实现在 bin/capability-substitute-suggest.py）
exec python3 "$HOME/.hermes/bin/capability-substitute-suggest.py"
