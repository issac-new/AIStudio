#!/usr/bin/env bash
# 无条件清理：移除 fixture 本地 .git（本 fixture 无工作区改动，仅防御性还原）
set -u
git checkout -- . 2>/dev/null || true
rm -rf .git
