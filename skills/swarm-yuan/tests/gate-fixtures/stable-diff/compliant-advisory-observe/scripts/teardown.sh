#!/usr/bin/env bash
# 无条件清理：还原工作区改动 + 移除 fixture 本地 .git（保持入库文件原样）
set -u
git checkout -- . 2>/dev/null || true
rm -rf .git
