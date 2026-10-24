#!/bin/bash
# unified_nightly_loop.sh — shim: cron no_agent 入口（scheduler 只认 HERMES_HOME/scripts 内真文件）
exec bash /Users/YOURNAME/.hermes/scripts/unified_nightly_loop.sh "$@"
