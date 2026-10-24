#!/usr/bin/env bash
# context-surface.sh — 静态上下文表面计量
# 计量「模型必读文件」的字节/行数总量，输出确定性 TSV（同输入字节级一致，可 byte-diff）。
# 用法:
#   bash context-surface.sh --gen             生成期必读面（swarm-yuan 自身三件套）
#   bash context-surface.sh --skill <dir>     目标 skill 加载面（SKILL.md + references/*.md）
#   bash context-surface.sh --files <f...>    任意文件清单
# 输出: stdout TSV「bytes<TAB>lines<TAB>path」按 path 排序 + 末行 TOTAL；
#       缺失文件记 MISSING 行（fail-open 计量，exit 0）；BASE 内路径显示为相对路径（跨机 byte-diff 稳定）。
# 退出码: 0 正常（含 MISSING）；1 参数错误 / --skill 目录不存在。
set -uo pipefail

BASE=$(cd "$(dirname "${0}")/.." && pwd)
MODE=""; SKILL_DIR=""; FILES=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gen)    MODE="gen"; shift ;;
    --skill)  MODE="skill"; SKILL_DIR="${2:?--skill 需要目录}"; shift 2 ;;
    --files)  MODE="files"; shift; FILES="$*"; break ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $1（--help 查看用法）" >&2; exit 1 ;;
  esac
done

_list=""
case "$MODE" in
  gen)
    _list="${BASE}/SKILL.md
${BASE}/references/exploration-guide.md
${BASE}/references/template-spec.md"
    ;;
  skill)
    [[ -d "$SKILL_DIR" ]] || { echo "✗ --skill 目录不存在: $SKILL_DIR" >&2; exit 1; }
    _list="${SKILL_DIR}/SKILL.md"
    if [[ -d "${SKILL_DIR}/references" ]]; then
      for f in "${SKILL_DIR}"/references/*.md; do
        [[ -f "$f" ]] || continue
        _list="${_list}
$f"
      done
    fi
    ;;
  files)
    for f in $FILES; do
      _list="${_list}${_list:+
}$f"
    done
    ;;
  *) echo "用法: context-surface.sh --gen | --skill <dir> | --files <f...>" >&2; exit 1 ;;
esac

_tb=0; _tl=0; _rows=""
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  rel="${f#"${BASE}"/}"
  if [[ -f "$f" ]]; then
    b=$(wc -c < "$f" | tr -d ' ')
    l=$(wc -l < "$f" | tr -d ' ')
    _tb=$((_tb + b)); _tl=$((_tl + l))
    _rows="${_rows}${b}	${l}	${rel}
"
  else
    _rows="${_rows}MISSING	MISSING	${rel}
"
  fi
done <<EOF
${_list}
EOF

TAB=$(printf '\t')
printf '%s' "$_rows" | LC_ALL=C sort -t"$TAB" -k3,3
printf '%s\t%s\tTOTAL\n' "$_tb" "$_tl"
exit 0
