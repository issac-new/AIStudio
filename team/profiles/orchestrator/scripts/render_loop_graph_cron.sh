#!/bin/bash
# render_loop_graph_cron.sh — shim: cron no_agent 入口（scheduler 只认 HERMES_HOME/scripts 内真文件）
exec /usr/bin/env python3 /Volumes/YOURVOLUME/lab/hermes-docker-sandbox/workspace/life-workbench/scripts/render_loop_graph.py "$@"
