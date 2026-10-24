#!/usr/bin/env bash
# project-fingerprint.sh — 项目源码指纹（自成长机制最小切片）
# 把项目源码的"结构指纹"算出来写到 .swarm-yuan/project-fingerprint：
#   文件数 / 源码扩展名分布 / 关键目录 sha256(文件名列表)
# 用法:
#   bash project-fingerprint.sh <PROJECT_DIR> [--write] [--diff] [--quiet]
#     --write  写入指纹到 <project>/.swarm-yuan/project-fingerprint（默认只算不写）
#     --diff   与已存指纹对比，输出变化摘要（新增/删除/修改计数 + 前 10 条样例）
#     --quiet  --diff 模式下，无变化时不输出（适合 SessionStart hook）
#     --force  --write 时若 total 较既有基线骤降 >50%（last-good 红线），
#              默认拒绝写入并提示；--force 显式覆盖（用于项目大幅重构的真实场景）。
# 退出码: 0 正常；1 arg 错误 / PROJECT_DIR 不存在 / --write 触发 last-good 红线且未 --force。
# 红线：本脚本只做指纹（轻量、可秒级完成），不做内容分析；内容比对是 --upgrade 干的事。
set -uo pipefail

PROJ=""; WRITE=0; DIFF=0; QUIET=0; FORCE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --write) WRITE=1; shift ;;
    --diff)  DIFF=1; shift ;;
    --quiet) QUIET=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) [[ -z "$PROJ" ]] && PROJ="$1" || { echo "未知参数: $1" >&2; exit 1; }; shift ;;
  esac
done
[[ -n "$PROJ" && -d "$PROJ" ]] || { echo "✗ PROJECT_DIR 缺失或不存在: ${PROJ:-（空）}" >&2; exit 1; }
PROJ=$(cd "$PROJ" && pwd)

FP_FILE="$PROJ/.swarm-yuan/project-fingerprint"

# 算当前指纹（轻量三件：总文件数 / 扩展名分布 / 文件名列表 cksum）
_compute_fp() {
  local p="$1"
  {
    # 排除 .git/node_modules/dist/build/.next/.cache + 元数据（.swarm-yuan/.claude/.vscode/.idea）
    # 排除链缺 Maven target/（25 个 .class/.jar/.lst 计入基线
    # → 每次 mvn build 后 --diff 误报「项目已变化」，自成长链被构建噪音误触发）。顺带补 Gradle/venv。
    # inventory-dimensions.conf DIM_DATA_MODEL 排除链同源（--exclude-dir=target），两处口径一致。
    # 排除链缺 bin/ obj/——.NET 构建
    # 产物（实测基线 552 个 .dll/.pdb/.deps.json 混入 685 总文件）随 SDK/包版本或 clean 重建
    # 改变文件集 → --diff 误报。补两目录（与 target/dist 同族通用产物名；inventory-dimensions
    # 各维 --exclude-dir=bin/obj 已同步）。
    local find_args=( -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/target/*' -not -path '*/bin/*' -not -path '*/obj/*' -not -path '*/.gradle/*' -not -path '*/venv/*' -not -path '*/.venv/*' -not -path '*/.next/*' -not -path '*/.cache/*' -not -path '*/__pycache__/*' -not -path '*/.swarm-yuan/*' -not -path '*/.claude/*' -not -path '*/.vscode/*' -not -path '*/.idea/*' )
    # 总文件数
    local total
    total=$(find "$p" "${find_args[@]}" 2>/dev/null | LC_ALL=C grep -c .)
    echo "total=$total"
    # 扩展名分布：按 basename 最后 . 后缀计数（POSIX while 循环更稳，sed BRE/ERE 各平台差异大）
    local ext_dist
    ext_dist=$(find "$p" "${find_args[@]}" 2>/dev/null | while IFS= read -r f; do
      local base="${f##*/}"
      if [[ "$base" == *.* ]]; then echo ".${base##*.}"; else echo "(none)"; fi
    done | LC_ALL=C tr '[:upper:]' '[:lower:]' | LC_ALL=C sort | LC_ALL=C uniq -c | LC_ALL=C sort -rn | head -20 \
      | LC_ALL=C awk '{printf "ext[%s]=%s ", $2, $1}' )
    echo "ext_dist=${ext_dist:-none}"
    # 关键目录列表 cksum（不含内容，仅文件名路径做"骨架指纹"）
    local skel
    skel=$(find "$p" "${find_args[@]}" 2>/dev/null \
      | LC_ALL=C sort \
      | LC_ALL=C cksum \
      | awk '{print $1}')
    echo "skel_cksum=${skel:-0}"
    # 顶层目录分组 cksum（dsh agent-instructions 路径级 digest 的 bash 最小切片，
    # 见 references/dsh-engineering-methodology.md §3.2）——单趟 find 按顶层目录分组到临时文件
    # （find 输出已 sort，组内追加保序 → cksum 确定），--diff 据此报告"哪个 scope 变了"，
    # AI 自成长重探查只针对变化 scope（局部重探查），不整仓重扫。
    # 顶层散文件归入 _root 组；组文件放 g/ 子目录防与 _root 命名冲突。
    local _gdir dc="" g rel c
    _gdir=$(mktemp -d 2>/dev/null) && mkdir -p "$_gdir/g" && {
      find "$p" "${find_args[@]}" 2>/dev/null | LC_ALL=C sort | while IFS= read -r f; do
        rel="${f#$p/}"
        case "$rel" in
          */*) printf '%s\n' "$rel" >> "$_gdir/g/${rel%%/*}" ;;
          *)   printf '%s\n' "$rel" >> "$_gdir/_root" ;;
        esac
      done
      [[ -f "$_gdir/_root" ]] && { c=$(LC_ALL=C cksum < "$_gdir/_root" | awk '{print $1}'); dc="dir_cksum[_root]=${c} "; }
      for g in "$_gdir/g"/*; do
        [[ -f "$g" ]] || continue
        c=$(LC_ALL=C cksum < "$g" | awk '{print $1}')
        dc="${dc}dir_cksum[$(basename "$g")]=${c} "
      done
      rm -rf "$_gdir"
    }
    echo "dir_cksums=${dc:-none}"
    # 算指纹的时间戳（便于日志查证）
    echo "ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }
}

if [[ "$WRITE" -eq 1 ]]; then
  # last-good 红线：若既有基线存在且新指纹 total 骤降 >50%，默认拒绝写入
  # （防 AI 在项目异常状态/扫盘 bug 下把"条目数骤降"的指纹误落为新基线，覆盖 last-good）。
  # 真实的项目重构场景由 --force 显式覆盖（UserChallenge 类决策，须决策落痕）。
  if [[ -f "$FP_FILE" && "$FORCE" -ne 1 ]]; then
    _old_total=$(LC_ALL=C sed -n 's/^total=\([0-9]*\).*/\1/p' "$FP_FILE" | head -1)
    _new_total=$( _compute_fp "$PROJ" | LC_ALL=C sed -n 's/^total=\([0-9]*\).*/\1/p' | head -1 )
    _old_total="${_old_total:-0}"; _new_total="${_new_total:-0}"
    if [[ "$_old_total" -gt 0 && "$_new_total" -gt 0 ]]; then
      # 用 awk 判 (_new_total * 2 < _old_total)（即骤降 >50%），bash 整数比较避开浮点
      if awk -v n="$_new_total" -v o="$_old_total" 'BEGIN{ exit !(n*2 < o) }'; then
        _pct=$(awk -v n="$_new_total" -v o="$_old_total" 'BEGIN{ printf "%.1f", (o-n)*100/o }')
        echo "✗ last-good 红线：文件数从 ${_old_total} 骤降到 ${_new_total}（-${_pct}% > 50%）——可能项目处于异常状态（清理中段/git 切换/扫描路径错误）" >&2
        echo "  保留旧基线: $FP_FILE" >&2
        echo "  若这是真实的大规模重构，请确认后显式覆盖：bash $0 $PROJ --write --force" >&2
        exit 1
      fi
    fi
  fi
  mkdir -p "$PROJ/.swarm-yuan"
  _compute_fp "$PROJ" > "$FP_FILE"
  echo "✓ 已写入指纹: $FP_FILE"
  cat "$FP_FILE" | head -3
  exit 0
fi

# 默认/--diff 都先算一遍当前指纹到临时，再与已有指纹对比
_curr=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan.XXXXXX")
trap 'rm -f "$_curr"' EXIT
_compute_fp "$PROJ" > "$_curr"

if [[ ! -f "$FP_FILE" ]]; then
  if [[ "$DIFF" -eq 1 ]]; then
    echo "无既有指纹: ${FP_FILE}（建议先跑 --write 落基线）"
    exit 0
  fi
  echo "✓ 当前指纹（未落盘）:"
  cat "$_curr"
  exit 0
fi

if [[ "$DIFF" -ne 1 ]]; then
  echo "✓ 当前指纹 vs $FP_FILE"
  diff -u "$FP_FILE" "$_curr" | head -10 || true
  exit 0
fi

# --diff 模式：parse 两边字段做差异（避免直接 diff 文本——cksum 变化不直观）
# bash 3.2 不支持关联数组，用 _kv_KEY=value 形式前缀变量模拟
# （_parse 函数已删——定义后零调用，_load_kv 才是活路径）
_load_kv() { # $1=file  $2=prefix  → 设置 _kv_<prefix>_<key>="value"
  local prefix="$2" key value
  # awk: key=第 1 字段；value=拼接 NF>=2 之后所有字段（ext_dist 含等号）
  while IFS= read -r line; do
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    value="${line#*=}"
    [[ -n "$key" && -n "$value" ]] && export "_kv_${prefix}_${key}=$value"
  done < "$1"
}
_load_kv "$FP_FILE" "a"
_load_kv "$_curr" "b"

_tot_a="${_kv_a_total:-0}"; _tot_b="${_kv_b_total:-0}"
_sk_a="${_kv_a_skel_cksum:-0}"; _sk_b="${_kv_b_skel_cksum:-0}"
_ext_a="${_kv_a_ext_dist:-none}"; _ext_b="${_kv_b_ext_dist:-none}"
_dc_a="${_kv_a_dir_cksums:-none}"; _dc_b="${_kv_b_dir_cksums:-none}"

if [[ "$_tot_a" == "$_tot_b" && "$_sk_a" == "$_sk_b" && "$_ext_a" == "$_ext_b" && "$_dc_a" == "$_dc_b" ]]; then
  [[ "$QUIET" -ne 1 ]] && echo "✓ 无变化（文件数=${_tot_b}，skel_cksum=${_sk_b}）"
  exit 0
fi

# 有变化 → 输出差异摘要
# 指引从"只 --upgrade"升级为完整更新链（--upgrade 只刷工具链，清单需重探查+核验）
echo "⚠ 项目源码已变化——按目标技能 SKILL.md「自成长」段走更新链："
echo "  ① 生成器 generate-skill.sh --upgrade 刷工具链 ② AI 重探查变化维度更新 reference-manual.md 清单"
echo "  ③ inventory-verify.sh 计数核验 ④ 本脚本 --write 落新基线"
# last-good 红线预警（--diff 视角）：total 骤降 >50% 时显著提示，避免 AI 顺势 --write
if [[ "${_tot_a:-0}" -gt 0 && "${_tot_b:-0}" -gt 0 ]]; then
  if awk -v n="$_tot_b" -v o="$_tot_a" 'BEGIN{ exit !(n*2 < o) }'; then
    _pct=$(awk -v n="$_tot_b" -v o="$_tot_a" 'BEGIN{ printf "%.1f", (o-n)*100/o }')
    echo "  🚨 last-good 红线预警：文件数从 ${_tot_a} 骤降到 ${_tot_b}（-${_pct}% > 50%）"
    echo "     可能项目处于异常状态（清理中段/git 切换/扫描路径错误）——落新基线前请先人工核查"
    echo "     若确认是真实重构，--write 须加 --force 显式覆盖（决策须落痕 trace-log.sh --decision）"
  fi
fi
echo "  文件数:    ${_tot_a} → ${_tot_b}（Δ $((${_tot_b} - ${_tot_a}))）"
echo "  骨架 cksum: ${_sk_a} → ${_sk_b}"
if [[ "${_ext_a}" != "${_ext_b}" ]]; then
  echo "  扩展分布变化:"
  # 拆解两个分布到同 key 计数，逐 key 对比
  # 把 ext[.ts]=1 这种字符串解析成 key=.ts count=1，写临时文件再用 awk 对比
  _ext_a_norm=$(echo "${_ext_a}" | LC_ALL=C tr ' ' '\n' | LC_ALL=C grep -E '^ext\[' | LC_ALL=C sort -u)
  _ext_b_norm=$(echo "${_ext_b}" | LC_ALL=C tr ' ' '\n' | LC_ALL=C grep -E '^ext\[' | LC_ALL=C sort -u)
  _a_t=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan-a.XXXXXX"); _b_t=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan-b.XXXXXX")
  printf '%s\n' "$_ext_a_norm" | LC_ALL=C awk -F= '{ k=$1; sub(/^ext\[/, "", k); sub(/\]$/, "", k); print k, $2 }' > "$_a_t"
  printf '%s\n' "$_ext_b_norm" | LC_ALL=C awk -F= '{ k=$1; sub(/^ext\[/, "", k); sub(/\]$/, "", k); print k, $2 }' > "$_b_t"
  # 行格式 "key count"
  _join=$(LC_ALL=C join -j 1 -e '0' -o '0,1.2,2.2' "$_a_t" "$_b_t" 2>/dev/null || true)
  # 消失：a 有 b 没有（按 key 比，不看 count）
  comm -23 <(LC_ALL=C awk '{print $1}' "$_a_t" | LC_ALL=C sort) <(LC_ALL=C awk '{print $1}' "$_b_t" | LC_ALL=C sort) | while IFS= read -r k; do
    [[ -n "$k" ]] && echo "    - ${k} 消失（之前 $(LC_ALL=C awk -v kk="$k" '$1==kk{print $2}' "$_a_t" | head -1)）"
  done
  # 新增：b 有 a 没有
  comm -13 <(LC_ALL=C awk '{print $1}' "$_a_t" | LC_ALL=C sort) <(LC_ALL=C awk '{print $1}' "$_b_t" | LC_ALL=C sort) | while IFS= read -r k; do
    [[ -n "$k" ]] && echo "    + ${k} 新增 $(LC_ALL=C awk -v kk="$k" '$1==kk{print $2}' "$_b_t" | head -1)"
  done
  # 数量变化：join 结果过滤 na != nb
  if [[ -n "$_join" ]]; then
    while IFS=' ' read -r k na nb; do
      [[ "$na" != "$nb" && "$na" != "0" && "$nb" != "0" ]] && echo "    ± ${k}：${na} → ${nb}"
    done <<< "$_join"
  fi
  rm -f "$_a_t" "$_b_t"
fi
# 顶层目录 scope 变化报告（局部重探查指引——只重探查变化的 scope，不整仓重扫）
if [[ "${_dc_a}" != "${_dc_b}" ]]; then
  echo "  变化目录（scope——AI 自成长只重探查这些目录的组件/接口/约束）:"
  _dc_a_norm=$(echo "${_dc_a}" | LC_ALL=C tr ' ' '\n' | LC_ALL=C grep -E '^dir_cksum\[' | LC_ALL=C sort -u)
  _dc_b_norm=$(echo "${_dc_b}" | LC_ALL=C tr ' ' '\n' | LC_ALL=C grep -E '^dir_cksum\[' | LC_ALL=C sort -u)
  _da_t=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan-da.XXXXXX"); _db_t=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan-db.XXXXXX")
  printf '%s\n' "$_dc_a_norm" | LC_ALL=C awk -F= '{ k=$1; sub(/^dir_cksum\[/, "", k); sub(/\]$/, "", k); print k, $2 }' > "$_da_t"
  printf '%s\n' "$_dc_b_norm" | LC_ALL=C awk -F= '{ k=$1; sub(/^dir_cksum\[/, "", k); sub(/\]$/, "", k); print k, $2 }' > "$_db_t"
  # 消失：a 有 b 没有
  comm -23 <(LC_ALL=C awk '{print $1}' "$_da_t" | LC_ALL=C sort) <(LC_ALL=C awk '{print $1}' "$_db_t" | LC_ALL=C sort) | while IFS= read -r k; do
    [[ -n "$k" ]] && echo "    - ${k}（目录消失——清单中该 scope 的条目须移除）"
  done
  # 新增：b 有 a 没有
  comm -13 <(LC_ALL=C awk '{print $1}' "$_da_t" | LC_ALL=C sort) <(LC_ALL=C awk '{print $1}' "$_db_t" | LC_ALL=C sort) | while IFS= read -r k; do
    [[ -n "$k" ]] && echo "    + ${k}（新增目录——按 §D.0 形态判定是否引入新维度）"
  done
  # cksum 变化：两边都有但值不同
  LC_ALL=C join -j 1 "$_da_t" "$_db_t" 2>/dev/null | LC_ALL=C awk '$2 != $3 {print $1}' | while IFS= read -r k; do
    [[ -n "$k" ]] && echo "    ~ ${k}（内容变化——重探查该 scope 的新增/消失/改名组件）"
  done
  rm -f "$_da_t" "$_db_t"
fi
echo "  → 跑 bash scripts/generate-skill.sh --upgrade 或 --refresh <skill-dir> 查看详情"
exit 0