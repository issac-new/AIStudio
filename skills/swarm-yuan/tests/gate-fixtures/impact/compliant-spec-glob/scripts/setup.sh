#!/usr/bin/env bash
# 运行时生成最小 git 仓库：main 基线提交全部 fixture 文件，feat 分支携带待审变更（已提交未并回）
# → check_impact 基线短路（R25c-PR2：clean 且不领先才放行）不触发，影响门走 SPEC_GLOB 发现主路径
# 幂等：先清残留再重建，重建结果逐次一致
set -u
rm -rf .git src
git init -q
git symbolic-ref HEAD refs/heads/main
git add -A .
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
git checkout -q -b feat/impact-spec-glob
mkdir -p src
printf 'print("pending change")\n' > src/app.py
git add src
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "待审变更"
