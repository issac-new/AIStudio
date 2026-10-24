#!/usr/bin/env bash
# 运行时生成最小 git 仓库：main 基线提交后切到 feat/demo（规范分支名场景）
# 幂等：先清掉可能残留的 .git 与生成文件，重建结果逐次一致
set -u
rm -rf .git app.txt
git init -q
git symbolic-ref HEAD refs/heads/main
printf 'fixture\n' > app.txt
git add app.txt
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
git checkout -q -b feat/demo
