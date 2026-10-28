#!/usr/bin/env bash
# vendor/<tree> 基线替换（AIStudio 单仓整合轮；流程正本=vendor/VENDOR.md）
# 用法: bash scripts/vendor-sync.sh <hermes-studio|hermes-agent|zcode> [升级源根]
#   升级源根默认仓内 upstream/（本地基建、gitignored，须先 git pull/checkout 到目标版本）。
#   旧多仓布局的兄弟 ../upstream 已不适用（2026-10-28 对账修正默认值）。
# 替换后: VENDOR_SYNC=1 git add vendor/<tree> && git commit，再 npm run inject 重放补丁过验证门。
set -euo pipefail
tree="${1:?用法: vendor-sync.sh <hermes-studio|hermes-agent|zcode> [升级源根]}"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
src_root="${2:-$repo_root/upstream}"
src="$src_root/$tree"
dst="$repo_root/vendor/$tree"
# 自删守卫（先于 .git 检查）：源与目标解析到同一路径时 rm -rf 会删掉唯一源。
# 历史默认值 ../upstream 在某些布局下会软链/等于 vendor/，见 2026-10-28 对账。
_src_real="$(cd "$src" 2>/dev/null && pwd -P || true)"
_dst_real="$(cd "$dst" 2>/dev/null && pwd -P || true)"
if [ -n "$_src_real" ] && [ "$_src_real" = "$_dst_real" ]; then
  echo "[vendor-sync] 源与目标同一路径（${_src_real}），拒绝执行（会删掉唯一基线源）"; exit 1
fi
[ -d "$src/.git" ] || { echo "[vendor-sync] 升级源必须是 git 仓: $src"; exit 1; }
ver="$(git -C "$src" describe --tags --always 2>/dev/null || git -C "$src" rev-parse --short HEAD)"
echo "[vendor-sync] $tree: $ver → $dst（整树替换）"
rm -rf "$dst"
mkdir -p "$dst"
git -C "$src" archive --format=tar HEAD | tar -x -C "$dst"
echo "[vendor-sync] 完成。后续：VENDOR_SYNC=1 git add vendor/$tree && git commit -m \"chore: vendor/$tree 基线 → $ver\"；npm run inject 重放补丁并过验证门。"
