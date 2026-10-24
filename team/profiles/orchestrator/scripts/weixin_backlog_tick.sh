#!/bin/bash
# weixin_backlog_tick.sh — 补投队列 tick shim（cron 不传参 + 脚本必须在 profile scripts/ 内）
# 2026-09-07 修复：原 job script 指向 profile scripts/ 但脚本只在全局 ~/.hermes/scripts/
# （Script not found 44 连败）；且 cron 子进程无 WEIXIN_HOME_CHANNEL（No home channel 报错）。
export WEIXIN_HOME_CHANNEL="<dad-wechat-id>@im.wechat"
exec /usr/bin/python3 /Users/YOURNAME/.hermes/scripts/weixin_backlog_deliver.py tick --max 3
