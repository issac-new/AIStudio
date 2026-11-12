#!/usr/bin/env bash
# 运行时生成最小 git 仓库：main 基线提交（含 fixture 自带文件），停留 main 且有 docs 改动，
# 但 conf 不配置 PROTECTED_BRANCH_ALLOW（legacy 形态）→ fail「保护分支 main 上有实质开发改动」
# 锁「未配置白名单=保护分支上任何变更都拦」契约：既有安装不因升级静默放宽。
# 幂等：先清掉可能残留的 .git 与生成文件，重建结果逐次一致
set -u
rm -rf .git app.txt docs
git init -q
# 显式落定初始分支名为 main（不依赖 init.defaultBranch 的机间差异）
git symbolic-ref HEAD refs/heads/main
printf 'fixture\n' > app.txt
git add -A
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
mkdir -p docs
printf 'plan\n' > docs/plan.md
