#!/usr/bin/env bash
# 运行时生成最小 git 仓库：main 基线提交（含 fixture 自带文件），停留 main 且工作区零变更
# → pass（主检出常态停在 main 跑 precheck 属合法形态——2026-11-12 恒红误报修复的锚点用例）
# 幂等：先清掉可能残留的 .git 与生成文件，重建结果逐次一致
set -u
rm -rf .git app.txt
git init -q
# 显式落定初始分支名为 main（不依赖 init.defaultBranch 的机间差异）
git symbolic-ref HEAD refs/heads/main
printf 'fixture\n' > app.txt
# fixture 自带文件一并入基线（同 violating-on-main：防未跟踪噪声污染变更面）
git add -A
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
# 不留任何改动：零变更 + 在 main = 主检出常态
