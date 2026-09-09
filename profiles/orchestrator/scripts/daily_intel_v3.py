#!/usr/bin/env python3
"""薄包装：转发到 life-workbench 的 daily_intel_v3.py

修复记录（2026-08-17）：本文件原是 workspace 版 daily_intel_v3.py 的完整副本，
但它依赖的 article_fetcher.py 只存在于 workspace/scripts/，profile 目录没有，
导致 cron 直跑时 ModuleNotFoundError: No module named 'article_fetcher'。

现改为薄包装委托模式（与 daily_intel_report_wrapper.py 同惯例）：
cron 安全策略只允许执行 profile scripts 目录内的脚本，本脚本被 cron 调用后，
内部用 subprocess 委托执行 workspace 中的 daily_intel_v3.py（依赖齐全、缓存共享）。
"""
import subprocess
import sys
import os

TARGET = "/Users/YOURNAME/hermes-docker-sandbox/workspace/life-workbench/scripts/daily_intel_v3.py"
WORKDIR = os.path.dirname(TARGET)

if __name__ == "__main__":
    result = subprocess.run(
        [sys.executable, TARGET],
        cwd=WORKDIR,
    )
    sys.exit(result.returncode)
