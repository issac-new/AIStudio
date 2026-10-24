#!/usr/bin/env bash
# 运行时生成 bin/cosign mock（fixture 内工具样例由钩子生成，保持仓库树干净）
set -u
mkdir -p bin
cp fixture-data/cosign-mock.sh bin/cosign
chmod +x bin/cosign
