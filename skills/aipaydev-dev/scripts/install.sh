#!/usr/bin/env bash
# install.sh（生成物垫片）
# install.bat（Windows 包装器）调用同伴 install.sh，但安装器本体不入生成物（三体纪律：
# install.sh 装的是生成器自身，随技能分发会递归安装）。本垫片按 .swarm-yuan-version 的
# source_repo 转发到真实安装器；重新安装/换机重装场景在目标技能目录内跑 install.bat
# 即可到达 source_repo 的 install.sh，不再 No such file。
set -uo pipefail
_v="$(cd "$(dirname "$0")/.." && pwd)/.swarm-yuan-version"
_r=$(sed -n 's/^source_repo=//p' "$_v" 2>/dev/null | head -1 | tr -d '[:space:]')
if [[ -n "$_r" && -f "$_r/install.sh" ]]; then
  exec bash "$_r/install.sh" "$@"
fi
echo "ERROR: 未定位安装器——$_v 无 source_repo 或目标缺失。修复：在生成器仓运行 bash install.sh 重装，或手改 source_repo= 指向生成器仓绝对路径。" >&2
exit 1
