#!/usr/bin/env bash
# 运行时生成最小 git 仓库：main 基线 + feat 分支只改 .claude/skills/ 与 .swarm-yuan/（工具链自有路径）
set -u
rm -rf .git .claude .swarm-yuan src
git init -q
git symbolic-ref HEAD refs/heads/main
mkdir -p src .claude/skills/app .swarm-yuan
printf 'console.log("app v1");\n' > src/app.js
printf 'name: app\nstatus: active\n' > .claude/skills/app/SKILL.md
printf '{"ts":"t1"}\n' > .swarm-yuan/trace.jsonl
git add src .claude .swarm-yuan
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
git checkout -q -b feat/skill-write
printf '{"ts":"t1"}\n{"ts":"t2"}\n' > .swarm-yuan/trace.jsonl
printf 'name: app\nstatus: active\nrules: updated\n' > .claude/skills/app/SKILL.md
git add .claude .swarm-yuan
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "技能资产升级与账本追加（工具链通道）"
