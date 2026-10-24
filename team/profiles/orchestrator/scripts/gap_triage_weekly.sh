#!/usr/bin/env bash
# gap_triage_weekly.sh — gap_register 批量分诊周 cron shim（t_b2b587af）
# 真源脚本在 life-workbench 仓库（版本化单一来源）；本 shim 仅为 cron scheduler
# 路径逃逸防护（HERMES_HOME/scripts 内解析）而设，禁用 symlink。
# 每周一 09:30 no_agent 触发：0 命中时 stdout 为空 = 静默；有命中时输出建卡报告。
exec /Users/YOURNAME/.hermes/hermes-agent/venv/bin/python /Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench/scripts/gap_triage_weekly.py  # 2026-10-07: 系统 py3.9 无 yaml 致 10-05 rc1（gap 积压 171 条未分诊），改 hermes venv（yaml 6.0.3） "$@"
