#!/usr/bin/env bash
# generate-skill.sh（生成物垫片）— 回归发现 #25（2026-08-27，两宿主整合）
# 生成物不随技能分发生成器本体（三体纪律：install.sh 装生成器；本文件只是转发垫片）——
# settings.local.json 白名单（bash scripts/generate-skill.sh）与 generate-skill.bat
# （Windows 包装器找同伴 .sh）原先都是死引用：生成物 scripts/ 从未有 generate-skill.sh。
# 本垫片按 .swarm-yuan-version 的 source_repo 转发到真实生成器；自举场景（生成器仓自身
# 的 scripts/generate-skill.sh 是本体）不会被本文件覆盖——垫片只存在于生成的目标技能。
set -uo pipefail
_v="$(cd "$(dirname "$0")/.." && pwd)/.swarm-yuan-version"
_r=$(sed -n 's/^source_repo=//p' "$_v" 2>/dev/null | head -1 | tr -d '[:space:]')
if [[ -n "$_r" && -f "$_r/scripts/generate-skill.sh" ]]; then
  exec bash "$_r/scripts/generate-skill.sh" "$@"
fi
echo "ERROR: 未定位生成器——$_v 无 source_repo 或目标缺失。修复：在生成器仓运行 bash install.sh 重装，或手改 source_repo= 指向生成器仓绝对路径。" >&2
exit 1
