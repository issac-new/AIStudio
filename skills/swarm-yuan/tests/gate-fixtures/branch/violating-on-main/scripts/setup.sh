#!/usr/bin/env bash
# 运行时生成最小 git 仓库：main 分支基线（含 fixture 自带文件入基线，避免未跟踪噪声），
# 停留 main 且留一个白名单外源码改动（src/feature.js 未跟踪）→ fail「保护分支 main 上有实质开发改动」
# 2026-11-12 语义改版：挡实质开发改动，不再挡「检出在 main」本身（clean main 见 compliant-on-main-clean）
# 幂等：先清掉可能残留的 .git 与生成文件，重建结果逐次一致
set -u
rm -rf .git app.txt src
git init -q
# 显式落定初始分支名为 main（不依赖 init.defaultBranch 的机间差异）
git symbolic-ref HEAD refs/heads/main
printf 'fixture\n' > app.txt
# fixture 自带文件（scripts/conf/expected-ids）一并入基线——否则它们以未跟踪身份
# 混入 _git_changed_files 变更面，夹具语义被自身文件污染
git add -A
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
# 白名单外的实质源码改动（未跟踪新文件，模拟在 main 上直接开发）
mkdir -p src
printf 'feature\n' > src/feature.js
