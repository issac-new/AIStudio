#!/usr/bin/env bash
# 运行时造一个最小 git 仓库：基线提交后在源码里新增一行 TODO 注释（未提交）→ 期望 fail。
set -u
rm -rf .git src
git init -q
git symbolic-ref HEAD refs/heads/main
mkdir -p src
printf 'module.exports = 1\n' > src/a.js
git add src
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
printf 'module.exports = 1\n  // TODO implement\n' > src/a.js
