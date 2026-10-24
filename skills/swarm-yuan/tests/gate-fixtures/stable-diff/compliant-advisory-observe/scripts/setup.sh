#!/usr/bin/env bash
# 运行时初始化 fixture 本地 git 仓库并制造「未声明的稳定层改动」：
#   1) 基线提交（main 分支，内容=入库原样）
#   2) 工作区追加改动（不提交），使 git diff HEAD 命中 STABLE_GLOBS
set -u
# 幂等恢复：上次运行中断残留 .git 时先还原工作区再重建
if [[ -d .git ]]; then git checkout -- . 2>/dev/null || true; rm -rf .git; fi
git init -q
git symbolic-ref HEAD refs/heads/main
git config user.email fixture@example.com
git config user.name fixture
git config commit.gpgsign false
git config core.autocrlf false
git add -A
git commit -qm "baseline"
# 未声明的稳定层改动（留工作区，teardown 负责还原）
printf '\n// 未声明的稳定层改动\n' >> src/stable/order.ts
