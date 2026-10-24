#!/usr/bin/env bash
# vendor/<tree> 基线替换（AIStudio 单仓整合轮；流程正本=vendor/VENDOR.md）
# 用法: bash scripts/vendor-sync.sh <hermes-studio|hermes-agent|zcode> [升级源根]
#   升级源根默认仓库根的兄弟 ../upstream（外置 git 仓，须先 git pull/checkount 到目标版本）。
# 替换后: VENDOR_SYNC=1 git add vendor/<tree> && git commit，再 npm run inject 重放补丁过验证门。
set -euo pipefail
tree="${1:?用法: vendor-sync.sh <hermes-studio|hermes-agent|zcode> [升级源根]}"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
src_root="${2:-$repo_root/../upstream}"
src="$src_root/$tree"
dst="$repo_root/vendor/$tree"
[ -d "$src/.git" ] || { echo "[vendor-sync] 升级源必须是 git 仓: $src"; exit 1; }
ver="$(git -C "$src" describe --tags --always 2>/dev/null || git -C "$src" rev-parse --short HEAD)"
echo "[vendor-sync] $tree: $ver → $dst（整树替换）"
rm -rf "$dst"
mkdir -p "$dst"
git -C "$src" archive --format=tar HEAD | tar -x -C "$dst"
echo "[vendor-sync] 完成。后续：VENDOR_SYNC=1 git add vendor/$tree && git commit -m \"chore: vendor/$tree 基线 → $ver\"；npm run inject 重放补丁并过验证门。"
