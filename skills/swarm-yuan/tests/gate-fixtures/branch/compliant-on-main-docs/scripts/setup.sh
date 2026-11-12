#!/usr/bin/env bash
# 运行时生成最小 git 仓库：main 基线提交（含 fixture 自带文件），停留 main 且仅有
# 白名单内 docs 改动（docs/plan.md 未跟踪）→ pass（chore/docs 直提工作流，AGENTS.md 规则 3）
# 幂等：先清掉可能残留的 .git 与生成文件，重建结果逐次一致
set -u
rm -rf .git app.txt docs
git init -q
# 显式落定初始分支名为 main（不依赖 init.defaultBranch 的机间差异）
git symbolic-ref HEAD refs/heads/main
printf 'fixture\n' > app.txt
# fixture 自带文件一并入基线（同 violating-on-main：防未跟踪噪声污染变更面）
git add -A
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
# 白名单内改动：docs 子树新文档（chore/docs 直提形态）
mkdir -p docs
printf 'plan\n' > docs/plan.md
