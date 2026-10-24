#!/usr/bin/env bash
# 清理 setup.sh 生成的 git 仓库与样本目录（幂等，路径缺失不报错；bin/ocr 为入库资产保留）
set -u
rm -rf .git src
