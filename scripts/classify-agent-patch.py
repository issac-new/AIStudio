#!/usr/bin/env python3
"""agent 侧补丁分类器（阶段四归档的单一事实源——首 diff 路径前缀判定）。"""
import re, sys
AGENT = re.compile(r'^(hermes_cli|tools|gateway|tui_gateway|evals|toolsets|optional-mcps|model_tools|toolset_distributions|pyproject|main\.py|config)')
m = re.search(r'^(?:---|\+\+\+) [ab]/(\S+)', open(sys.argv[1], encoding='utf-8', errors='ignore').read(), re.M)
sys.exit(0 if (m and AGENT.match(m.group(1))) else 1)
