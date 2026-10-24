#!/usr/bin/env bash
# install.sh（生成物垫片）
# install.bat（Windows 包装器）调用同伴 install.sh，但安装器本体不入生成物（三体纪律：
# install.sh 装的是生成器自身，随技能分发会递归安装）。本垫片按 .swarm-yuan-version 的
# source_repo 转发到真实安装器；重新安装/换机重装场景在目标技能目录内跑 install.bat
# 即可到达 source_repo 的 install.sh，不再 No such file。
set -uo pipefail
# R118 ①：CRLF 检出显式报错（Windows autocrlf 克隆）。根治由仓库 .gitattributes 的 *.sh eol=lf 保证。
if grep -q "$(printf '\r')" "$0" 2>/dev/null; then
  printf '%s\n' "ERROR: 安装垫片含 CRLF 换行（Windows core.autocrlf=true 常见），bash 无法可靠解析。请重新克隆或用 sed -i.bak 's/\\r\$//' 修复并删除 .bak。" >&2
  exit 1
fi
_v="$(cd "$(dirname "$0")/.." && pwd)/.swarm-yuan-version"
# R118：只去 CR 与首尾空白，保留路径内部空格（旧版 tr -d '[:space:]' 压扁路径）。
_r=$(sed -n 's/^source_repo=//p' "$_v" 2>/dev/null | head -1 | tr -d '\r')
_r="${_r#"${_r%%[![:space:]]*}"}"
_r="${_r%"${_r##*[![:space:]]}"}"
if [[ -n "$_r" && -f "$_r/install.sh" ]]; then
  exec bash "$_r/install.sh" "$@"
fi
echo "ERROR: 未定位安装器——$_v 无 source_repo 或目标缺失。修复：在生成器仓运行 bash install.sh 重装，或手改 source_repo= 指向生成器仓绝对路径。" >&2
exit 1
