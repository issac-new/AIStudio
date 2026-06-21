#!/bin/bash
# overlay/scripts/sync-upstream.sh — 升级 hermes-studio 上游
set -e
cd "$(dirname "$0")/.."

echo "[sync] 1. clean(撤销 B 类 patch)"
npm run clean

echo "[sync] 2. fetch + reset upstream/hermes-studio"
cd ../upstream/hermes-studio
git fetch origin
git reset --hard origin/main
cd ../../overlay

echo "[sync] 3. re-inject(应用 40 patch 含 package.json+lock + 建 node_modules 符号链接)"
npm run inject

echo "[sync] 3b. install deps(patch 017/040 加 matrix-js-sdk 到 package.json+lock)"
cd ../upstream/hermes-studio && npm ci --no-audit --no-fund && cd ../../overlay

echo "[sync] 4. verify"
npm run verify

echo "[sync] 完成。若 inject 失败,按 spec §3.5 修复 patch;若 entry shim 失效,按 §3.3 修复 shim。"
echo "[sync] 接下来:npm run build && npm run test"
