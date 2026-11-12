#!/usr/bin/env bash
# 运行时生成最小 git 仓库：master 分支基线（含 fixture 自带文件入基线），停留 master
# 且留一个白名单外源码改动（src/feature.js 未跟踪）→ fail「保护分支 master 上有实质开发改动」
# （R56-D3 变异锁：master 基分支仓库默认零保护缺口——git init 默认 master 形态）
# 幂等：先清掉可能残留的 .git 与生成文件，重建结果逐次一致
set -u
rm -rf .git app.txt src
git init -q
# 显式落定初始分支名为 master（不依赖 init.defaultBranch 的机间差异）
git symbolic-ref HEAD refs/heads/master
printf 'fixture\n' > app.txt
git add -A
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
mkdir -p src
printf 'feature\n' > src/feature.js
