#!/usr/bin/env bash
set -u
rm -rf .git .claude src
git init -q
git symbolic-ref HEAD refs/heads/main
mkdir -p src/core .claude/skills/app/references
printf 'export function legacy() { return 1; }\n' > src/core/legacy.js
cat > .claude/skills/app/references/reference-manual.md <<'RM'
# reference-manual
## §4 组件库清单

| 路径 | 说明与约束 |
|------|--------------|
| `src/core/legacy.js` | 遗留核心算法（稳定，禁止改签名——下游 3 处消费） |
RM
git add src .claude
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
git checkout -q -b feat/compliant-stable
# compliant：feat 分支只改可写区，稳定单元不动 → pass
printf 'export function fresh() { return 1; }\n' > src/core/extra.js
git add src
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "只改可写区"
