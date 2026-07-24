#!/bin/bash
# overlay/scripts/sync-upstream.sh — 升级 hermes-studio 上游
# 策略(遵循 upstream 目录更新规则):优先取最新 stable release tag,
# 无 release/tag 时 fallback 到 origin/main 最新提交。始终以远端强制覆盖本地。
set -e
cd "$(dirname "$0")/.."
HERMES_REPO="EKKOLearnAI/hermes-studio"

echo "[sync] 1. clean(撤销 B 类 patch)"
npm run clean

echo "[sync] 2. fetch + 取最新 stable release tag(无 tag 则 fallback origin/main)"
cd ../upstream/hermes-studio
git fetch origin --tags --force

# 优先取最新非预发布 release tag;失败则 fallback 到 origin/main
TAG=$(gh release view --repo "${HERMES_REPO}" --json tagName,isPrerelease 2>/dev/null \
  | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin)
    if not d.get("isPrerelease"): print(d["tagName"])
except Exception: pass' 2>/dev/null)
if [ -z "$TAG" ]; then
  echo "[sync]   未取到 gh release tag,fallback git describe origin/main"
  TAG=$(git describe --tags --abbrev=0 origin/main 2>/dev/null || true)
fi

if [ -n "$TAG" ]; then
  echo "[sync]   checkout tag: $TAG (detached HEAD + clean -fdx)"
  git checkout --force --detach "$TAG"
  git clean -fdx
else
  echo "[sync]   无 tag,fallback reset --hard origin/main"
  git reset --hard origin/main
  git clean -fdx
fi
cd ../../overlay

echo "[sync] 3. re-inject(应用 patch + 建 node_modules 符号链接 + server/src/custom 链接)"
npm run inject

echo "[sync] 3b. install deps(git clean -fdx 清了 node_modules,需重装)"
cd ../upstream/hermes-studio && npm install --no-audit --no-fund --ignore-scripts && cd ../../overlay

echo "[sync] 4. 校验上游工作树状态(直接 git status,绕开 verify-clean 路径错配)"
cd ../upstream/hermes-studio
echo "  HEAD: $(git log --oneline -1)"
echo "  dirty files (非 inject 产物应排查): $(git status --porcelain | wc -l | tr -d ' ')"
cd ../../overlay

echo "[sync] 完成。若 inject 失败,按 docs/superpowers/specs 中 overlay 架构 §3.5 修复 patch。"
echo "[sync] 接下来:npm run build:full && npm run test"
