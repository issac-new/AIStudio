#!/usr/bin/env bash
# 运行时生成最小 git 仓库（main 基线 + feat 分支提交），并确保 bin/ocr 可执行
# 幂等：先清残留再重建，重建结果逐次一致
set -u
rm -rf .git src
chmod +x bin/ocr
git init -q
git symbolic-ref HEAD refs/heads/main
mkdir -p src
printf 'console.log("app v1");\n' > src/app.js
git add src
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
git checkout -q -b feat/review-violating
printf 'console.log("app v2");\n' > src/app.js
git add src/app.js
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "feat 提交"
