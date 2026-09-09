#!/bin/bash
# nightly-radar-wrapper 23:00 直跑版（2026-09-08 改造）
# 原为 agent 模式：外层 agent 仅透传一条命令，白烧 aim@cc-switch 计费。
# 改为 no_agent：本脚本 stdout 即投递消息，管道内部自证（含 zcode preflight 摘要）。
B=/Volumes/YOURVOLUME/lab/hermes-docker-sandbox/workspace/life-workbench
TODAY=$(date +%F)
cd "$B" || { echo "radar workbench missing: $B"; exit 1; }
exec .venv/bin/python scripts/nightly_radar.py --date "$TODAY" --refresh --supervise
