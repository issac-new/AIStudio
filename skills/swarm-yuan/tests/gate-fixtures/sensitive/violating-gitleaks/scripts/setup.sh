#!/usr/bin/env bash
# 运行时生成 bin/gitleaks mock（fixture 内工具样例由钩子生成，保持仓库树干净）
set -u
mkdir -p bin
cp fixture-data/gitleaks-mock.sh bin/gitleaks
chmod +x bin/gitleaks
