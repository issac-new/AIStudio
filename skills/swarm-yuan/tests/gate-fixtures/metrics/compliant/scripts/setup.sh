#!/usr/bin/env bash
# 运行时把 fixture-data/gate-runs.jsonl 复制到 .swarm-yuan/gate-runs/，
# 保证度量门禁有历史趋势数据可读（.swarm-yuan/ 被 gitignore，数据须由 setup 钩子还原）。
# 同款模式见 sensitive/compliant-gitleaks/scripts/setup.sh（fixture-data -> 运行时位置）。
set -u
mkdir -p .swarm-yuan/gate-runs
cp fixture-data/gate-runs.jsonl .swarm-yuan/gate-runs/gate-runs.jsonl
