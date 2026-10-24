#!/bin/bash
# shim: cron resolve 限制——真实 wrapper 在 ~/.hermes/scripts/（symlink 会被拦，必须真文件）
exec bash /Users/YOURNAME/.hermes/scripts/evo_nightly_wrapper.sh "$@"
