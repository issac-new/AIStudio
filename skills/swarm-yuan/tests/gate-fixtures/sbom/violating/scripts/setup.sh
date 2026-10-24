#!/usr/bin/env bash
# 运行时生成 node_modules mock（node_modules/ 在 .gitignore 中，无法入库）
set -u
mkdir -p node_modules/evil-lib
cp fixture-data/evil-lib-package.json node_modules/evil-lib/package.json
