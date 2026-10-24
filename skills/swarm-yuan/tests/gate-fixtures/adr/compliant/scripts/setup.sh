#!/usr/bin/env bash
# 运行时初始化 fixture 本地 git 仓库（基线提交即现状，diff 为空），
# 使 check_adr §3 的 git diff 输入与宿仓库解耦（机器无关、并行开发无噪音）
set -u
# 幂等恢复：上次运行中断残留 .git 时先还原再重建
if [[ -d .git ]]; then git checkout -- . 2>/dev/null || true; rm -rf .git; fi
git init -q
git symbolic-ref HEAD refs/heads/main
git config user.email fixture@example.com
git config user.name fixture
git config commit.gpgsign false
git config core.autocrlf false
git add -A
git commit -qm "baseline"
