#!/usr/bin/env bash
# project-facts.sh — 生成物项目事实层（复盘 P2-12a/12b 根治，2026-11-12）
#
# 问题：项目数字（spec 数/补丁数/测试数/vendor 版本）写死进 SKILL.md 认知摘要后，
# SKILL.md 属 PROJECT_SPECIFIC_FILES 永不重生成——数字随项目演进必漂移（aistudio-dev
# 实测 334 spec/6270 测试 vs 现实 650/8726）。本脚本把数字落到独立可重算文件：
#   <技能目录>/references/project-facts.md（首行 as_of: <日期> @ <git HEAD>）
# SKILL.md 模板只留指针（FACT_PROJECT_FACTS_FILE 单一事实源），不再写死。
#
# 用法:
#   bash project-facts.sh <技能目录> <项目根>    # 现算四维并原子写事实层
# 四维口径（机械计数，缺席输出「未采集」——fail-soft 不猜数）:
#   specs   = docs/superpowers/specs/*.md 文件数（maxdepth 1）
#   patches = patches/series 有效行（非注释、非空行）
#   tests   = .qgate/junit-report.xml 根元素 tests/failures/errors 属性（上一次运行值）
#   vendor  = vendor/VENDOR.md 表行 tree=版本（版本列首个语义化版本 token；口径对齐 AIStudio 形态）
# 退出码: 0 成功（含全维「未采集」）；1 参数错/目录缺失/目标路径符号链接/不可写。
# 红线: 只机械计数不做语义分析；测试数读既有报告不现场跑测试（事实层须秒级可刷新，
#       报告时点滞后由 as_of 行显式化）。bash 3.2 安全（无关联数组/readarray）。
set -uo pipefail

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

SKILL_DIR="${1:-}"
PROJ="${2:-}"
if [ -z "$SKILL_DIR" ] || [ -z "$PROJ" ]; then
  echo "用法: bash project-facts.sh <技能目录> <项目根>（--help 看口径）" >&2
  exit 1
fi
[ -d "$SKILL_DIR" ] || { echo "✗ 技能目录缺失或不存在: $SKILL_DIR" >&2; exit 1; }
[ -d "$PROJ" ]      || { echo "✗ 项目根缺失或不存在: $PROJ" >&2; exit 1; }
SKILL_DIR=$(cd "$SKILL_DIR" && pwd) || exit 1
PROJ=$(cd "$PROJ" && pwd) || exit 1

FACTS_REL="references/project-facts.md"   # 与 assets/facts.conf FACT_PROJECT_FACTS_FILE 同值
FACTS_FILE="$SKILL_DIR/$FACTS_REL"

# 符号链接拒绝（与 generate-skill.sh _validate_generator_writes 同philosophy：
# 生成器写入路径不可为符号链接，防越技能目录写）
if [ -L "$SKILL_DIR/references" ] || { [ -e "$FACTS_FILE" ] && [ -L "$FACTS_FILE" ]; }; then
  echo "✗ 事实层目标路径不可为符号链接: $FACTS_FILE" >&2
  exit 1
fi
mkdir -p "$SKILL_DIR/references" || { echo "✗ 无法创建 references/: $SKILL_DIR/references" >&2; exit 1; }

# ---- specs：docs/superpowers/specs/*.md 计数 ----
_specs_val="未采集"
if [ -d "$PROJ/docs/superpowers/specs" ]; then
  _n=$(find "$PROJ/docs/superpowers/specs" -maxdepth 1 -type f -name '*.md' 2>/dev/null | LC_ALL=C wc -l | tr -d ' ')
  [ -n "$_n" ] && _specs_val="$_n"
fi

# ---- patches：series 有效行（非注释、非空行） ----
_patches_val="未采集"
if [ -f "$PROJ/patches/series" ]; then
  _n=$(grep -vcE '^[[:space:]]*(#|$)' "$PROJ/patches/series" 2>/dev/null || true)
  [ -n "$_n" ] && _patches_val="$_n"
fi

# ---- tests：junit 根元素属性（上一次测试运行值，不现场跑） ----
_tests_val="未采集"
if [ -f "$PROJ/.qgate/junit-report.xml" ]; then
  # 根 <testsuites ...> 开标签内取属性（先截标签防 testsuite 行串扰）
  _root=$(sed -n 's/.*\(<testsuites[^>]*>\).*/\1/p' "$PROJ/.qgate/junit-report.xml" | head -1)
  if [ -n "$_root" ]; then
    _t=$(printf '%s\n' "$_root" | sed -n 's/.*tests="\([0-9][0-9]*\)".*/\1/p')
    _f=$(printf '%s\n' "$_root" | sed -n 's/.*failures="\([0-9][0-9]*\)".*/\1/p')
    _e=$(printf '%s\n' "$_root" | sed -n 's/.*errors="\([0-9][0-9]*\)".*/\1/p')
    # bash 3.2 + UTF-8：$var 紧跟多字节字符会把首字节吞进变量名（set -u 崩溃）——一律 ${var} 或 printf 隔离
    [ -n "$_t" ] && _tests_val="$(printf '%s（failures=%s，errors=%s）' "$_t" "${_f:-?}" "${_e:-?}")"
  fi
fi

# ---- vendor：VENDOR.md 表行 tree=版本（版本列首个语义化版本 token） ----
_vendor_val="未采集"
if [ -f "$PROJ/vendor/VENDOR.md" ]; then
  _vendor_val=$(awk -F'|' '
    {
      t = $2; gsub(/^[ \t]+|[ \t]+$/, "", t)
      # 数据行判定：第一列为树名（字母开头标识符），排除表头「树」与分隔行 ---
      if (t ~ /^[A-Za-z][A-Za-z0-9_.-]*$/) {
        v = $4; gsub(/^[ \t]+|[ \t]+$/, "", v)
        if (match(v, /v?[0-9]+([.][0-9]+)+/)) {
          tok = substr(v, RSTART, RLENGTH)
        } else {
          tok = "未采集"
        }
        printf "%s=%s；", t, tok
      }
    }' "$PROJ/vendor/VENDOR.md")
  # 行尾全角分号收口；空表（无数据行）归「未采集」
  _vendor_val="${_vendor_val%；}"
  [ -n "$_vendor_val" ] || _vendor_val="未采集"
fi

# ---- as_of 戳：日期 + 项目 git HEAD（非 git 项目 unknown，显式不猜） ----
_asof_date=$(date +%Y-%m-%d)
_asof_head=$(git -C "$PROJ" rev-parse --short HEAD 2>/dev/null || true)
[ -n "$_asof_head" ] || _asof_head="unknown"

# ---- 原子写（同目录候选 + mv；写中断保留旧文件） ----
_cand=$(mktemp "$SKILL_DIR/references/.project-facts.XXXXXX") || {
  echo "✗ 无法创建候选文件于 $SKILL_DIR/references" >&2
  exit 1
}
{
  printf 'as_of: %s @ %s\n' "$_asof_date" "$_asof_head"
  printf '\n'
  printf '<!-- 事实层：scripts/project-facts.sh 机械现算，勿手改；刷新：bash scripts/project-facts.sh <技能目录> <项目根> -->\n'
  printf '\n'
  printf '| 事实项 | 口径（机械计数） | 值（as_of 时刻现算） |\n'
  printf '|--------|------------------|----------------------|\n'
  printf '| specs | docs/superpowers/specs/*.md 计数 | %s |\n' "$_specs_val"
  printf '| patches | patches/series 有效行（非注释非空） | %s |\n' "$_patches_val"
  printf '| tests | .qgate/junit-report.xml 根属性（上一次运行值） | %s |\n' "$_tests_val"
  printf '| vendor | vendor/VENDOR.md 表行 tree=版本 | %s |\n' "$_vendor_val"
} > "$_cand" || { rm -f "$_cand"; echo "✗ 事实层写入失败" >&2; exit 1; }
mv "$_cand" "$FACTS_FILE" || { rm -f "$_cand"; echo "✗ 事实层发布失败: $FACTS_FILE" >&2; exit 1; }
echo "✓ 事实层已刷新: ${FACTS_FILE}（as_of ${_asof_date} @ ${_asof_head}）"
exit 0
