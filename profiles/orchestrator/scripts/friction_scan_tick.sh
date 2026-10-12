#!/bin/bash
# shim -> session_friction_scan.py 双雷达（cron 不传参, 硬编码默认窗口）
exec bash -c 'PY=/Users/YOURNAME/.hermes/hermes-agent/venv/bin/python; "$PY" /Users/YOURNAME/.hermes/scripts/session_friction_scan.py --days 7 --threshold 3 2>&1; exit $?'
