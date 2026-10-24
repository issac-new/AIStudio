#!/usr/bin/env bash
# 运行时生成最小 git 仓库：main 基线（upstream/ 只读 + src/ 可写），
# feat 分支改动 upstream/ 并提交 → git diff --name-only main...HEAD 命中只读目录
# 幂等：先清残留再重建，重建结果逐次一致
set -u
rm -rf .git upstream src
git init -q
git symbolic-ref HEAD refs/heads/main
mkdir -p upstream src
printf 'vendor v1\n' > upstream/vendor.txt
printf 'console.log("app v1");\n' > src/app.js
git add upstream src
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
git checkout -q -b feat/scope-violating
printf 'vendor v2\n' > upstream/vendor.txt
git add upstream/vendor.txt
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "改动只读目录"
