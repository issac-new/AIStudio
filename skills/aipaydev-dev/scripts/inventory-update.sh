#!/usr/bin/env bash
# inventory-update.sh — 局部清单条目更新（AI 编码中发现语义变化的可执行入口）
#
# 设计动机：SKILL.md 自成长段红线①承诺"语义变化发现即更新清单，不等 refresh"，
# 但此前只有"整仓重探查 → 整表重写 reference-manual.md"的路径，没有"改一条清单条目"
# 的最小操作。AI 在编码中发现"某组件路径改名/某接口语义变更/某约束失效"时，
# 需要局部更新单条目而不动其他条目（避免 last-good 红线触发：整表重写中途失败会丢全部）。
#
# 机制：
#   ① 按 --section §<n> + --match <grep 模式> 定位 reference-manual.md 中的目标行；
#   ② 用 --replace '<新行>' 原子替换该行（新行须以 | 开头的合法表格行）；
#   ③ 或 --delete 删除该行；或 --append '<新行>' 在该 § 表格末尾追加；
#   ④ 写入前先写临时文件 + mv 原子替换（遵循 last-good：写失败不破坏原文件）；
#   ⑤ 更新完成后追加 decisions.jsonl 落痕（trace-log.sh --decision，G1 决策治理）。
#
# 用法:
#   bash inventory-update.sh <SKILL_DIR> --section §4 --match "Example.tsx" --replace '| 新行 | ... |'
#   bash inventory-update.sh <SKILL_DIR> --section §6 --match "GET /api/example" --delete
#   bash inventory-update.sh <SKILL_DIR> --section §9 --append '| 新勾稽 | `src/x.ts` | 稳定 | 探查 | 约束 |'
# 退出码: 0 成功；1 arg 错误 / SKILL_DIR 不存在 / 未命中 / 多义命中 / 新行格式错；2 reference-manual.md 不存在。
# 红线：本脚本只动 reference-manual.md 的 §4/§6/§9 表格数据行；其他节/文件由 --upgrade 或手工处理。
#      替换/删除前必须 --match 唯一命中（多义命中报错，要求更精确模式）。
set -uo pipefail

SKILL_DIR=""; SECTION=""; MATCH=""; REPLACE=""; DELETE=0; APPEND=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --section) SECTION="${2:?--section 需要值}"; shift 2 ;;
    --match)   MATCH="${2:?--match 需要值}";   shift 2 ;;
    --replace) REPLACE="${2:?--replace 需要值}"; shift 2 ;;
    --delete)  DELETE=1; shift ;;
    --append)  APPEND="${2:?--append 需要值}";  shift 2 ;;
    -h|--help)
      sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) [[ -z "$SKILL_DIR" ]] && SKILL_DIR="$1" || { echo "未知参数: $1" >&2; exit 1; }; shift ;;
  esac
done

[[ -n "$SKILL_DIR" && -d "$SKILL_DIR" ]] || { echo "✗ SKILL_DIR 缺失或不存在: ${SKILL_DIR:-（空）}" >&2; exit 1; }
SKILL_DIR=$(cd "$SKILL_DIR" && pwd)
RM="$SKILL_DIR/references/reference-manual.md"
[[ -f "$RM" ]] || { echo "✗ reference-manual.md 不存在: $RM" >&2; exit 2; }

# 操作三选一：--replace / --delete / --append
_ops=0
[[ -n "$REPLACE" ]] && _ops=$((_ops+1))
[[ "$DELETE" -eq 1 ]] && _ops=$((_ops+1))
[[ -n "$APPEND" ]] && _ops=$((_ops+1))
[[ "$_ops" -eq 1 ]] || { echo "✗ 必须且只能给 --replace / --delete / --append 之一" >&2; exit 1; }

# § 限定 §4/§6/§9（§10/§11 等其他节不动——与 inventory-verify 的核验范围对齐）
[[ "$SECTION" =~ ^§[469]$ ]] || { echo "✗ --section 仅支持 §4/§6/§9（inventory-verify 核验范围内）" >&2; exit 1; }

# replace/delete 需要 --match；append 不需要 --match
if [[ -z "$APPEND" && -z "$MATCH" ]]; then
  echo "✗ --replace/--delete 模式须给 --match <grep 正则> 定位目标行" >&2; exit 1
fi

# 新行格式校验（replace/append 须是以 | 开头的合法表格行，至少 2 列）
# 原执法"≥5 列（五维字段）"与 reference-manual.md 模板头注
# "§4/§6/§9 表格行两列（路径/说明与约束）"契约矛盾——按模板两列格式写的清单行被工具拒绝，
# 单条更新通道对两列清单整体不可用。放宽为 ≥2 列（合法表格行的最低形态）；
# 五维字段（维度/路径/稳定性/来源/接口）作为 exploration-guide DIM 台账风格的建议形态保留。
_check_row() { # $1=行
  local row="$1"
  [[ "$row" == "|"* ]] || { echo "✗ 新行必须以 | 开头（markdown 表格行）" >&2; return 1; }
  # 数列数：去掉首尾 |，按 | 分割，字段数 ≥ 2（两列=模板口径下限；五维台账风格建议但不强制）
  local _nf
  _nf=$(printf '%s' "$row" | awk -F'|' '{print NF-2}')
  [[ "$_nf" -ge 2 ]] || { echo "✗ 新行须含至少 2 列（模板两列口径：路径/说明与约束），实际 $_nf 列" >&2; return 1; }
  return 0
}
[[ -n "$REPLACE" ]] && ! _check_row "$REPLACE" && exit 1
[[ -n "$APPEND" ]]  && ! _check_row "$APPEND"  && exit 1

# 提取 §<n> 段范围（与 inventory-verify 相同的 awk 锚定逻辑：^## §<n> 到下一个 ^## 之间）
_sec_num="${SECTION#§}"
_sec_start=$(awk -v sec="$_sec_num" '$0 ~ "^## §" sec "[ .]" { print NR; exit }' "$RM")
[[ -n "$_sec_start" ]] || { echo "✗ §${_sec_num} 节不存在于 $RM" >&2; exit 1; }
_sec_end=$(awk -v start="$_sec_start" 'NR>start && /^## / { print NR-1; found=1; exit } END { if (!found && NR>start) print NR }' "$RM")
_sec_end="${_sec_end:-$(wc -l < "$RM" | tr -d ' ')}"

# 在 §<n> 段内定位目标行（--replace/--delete 模式）
# 用 sed 抽 §<n> 段行范围 + grep -Fn 做字面字符串匹配（避开 awk -v 传含特殊字符值的 BSD 怪异行为）
if [[ -z "$APPEND" ]]; then
  _hits=$(LC_ALL=C sed -n "${_sec_start},${_sec_end}p" "$RM" \
    | LC_ALL=C grep -Fn "$MATCH" \
    | LC_ALL=C awk -F: -v s="$_sec_start" '{ print $1 + s - 1 }')
  _hit_cnt=$(printf '%s\n' "$_hits" | grep -c . || true)
  [[ "${_hit_cnt:-0}" -eq 0 ]] && { echo "✗ §${_sec_num} 段内无命中：$MATCH" >&2; exit 1; }
  [[ "${_hit_cnt:-0}" -gt 1 ]] && {
    echo "✗ §${_sec_num} 段内多义命中（${_hit_cnt} 行）——请精确化 --match：" >&2
    printf '%s\n' "$_hits" | while IFS= read -r _ln; do
      awk -v n="$_ln" 'NR==n { print "  行" n ": " $0 }' "$RM" >&2
    done
    exit 1
  }
  _target_line="$_hits"
  # 读出目标行原文（delete 场景下 mv 后该行已不在，先存起来供反馈展示）
  _target_orig=$(awk -v n="$_target_line" 'NR==n' "$RM" | head -c 200)
fi

# 原子替换：写临时文件 + mv（遵循 last-good：写失败不破坏原文件）
_tmp=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan.XXXXXX")
trap 'rm -f "$_tmp"' EXIT

if [[ -n "$APPEND" ]]; then
  # append：在 §<n> 段末尾（_sec_end 行）追加新行
  awk -v end="$_sec_end" -v new="$APPEND" '
    NR<=end { print }
    NR==end { print new }
    NR>end { print }
  ' "$RM" > "$_tmp"
  _op_desc="append"
elif [[ "$DELETE" -eq 1 ]]; then
  # delete：删除目标行
  awk -v target="$_target_line" 'NR!=target { print }' "$RM" > "$_tmp"
  _op_desc="delete"
else
  # replace：替换目标行
  awk -v target="$_target_line" -v new="$REPLACE" '
    NR==target { print new; next }
    { print }
  ' "$RM" > "$_tmp"
  _op_desc="replace"
fi

# 校验：临时文件必须非空且行数差异合理（replace 行数不变；delete -1；append +1）
_new_lines=$(wc -l < "$_tmp" | tr -d ' ')
_old_lines=$(wc -l < "$RM" | tr -d ' ')
case "$_op_desc" in
  replace) [[ "$_new_lines" -eq "$_old_lines" ]] || { echo "✗ replace 行数漂移（${_old_lines} → ${_new_lines}）" >&2; exit 1; } ;;
  delete)  [[ "$_new_lines" -eq $((_old_lines - 1)) ]] || { echo "✗ delete 行数漂移（${_old_lines} → ${_new_lines}）" >&2; exit 1; } ;;
  append)  [[ "$_new_lines" -eq $((_old_lines + 1)) ]] || { echo "✗ append 行数漂移（${_old_lines} → ${_new_lines}）" >&2; exit 1; } ;;
esac

# 原子替换
mv "$_tmp" "$RM" || { echo "✗ mv 原子替换失败" >&2; exit 1; }
trap - EXIT

# 落痕：trace-log.sh --decision（G1 决策治理）
_tl="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/trace-log.sh"
if [[ -x "$_tl" || -f "$_tl" ]]; then
  _tl_proj=$( (set +u; . "$SKILL_DIR/scripts/precheck.conf" 2>/dev/null; printf '%s' "${PROJECT_DIR:-}") )
  if [[ -n "$_tl_proj" && -d "$_tl_proj" ]]; then
    PROJECT_DIR="$_tl_proj" bash "$_tl" --decision \
      --type Taste \
      --suggestion "inventory-update §${_sec_num} ${_op_desc}: ${MATCH:-$APPEND}" \
      --user-action approved \
      --rationale "AI 编码中发现语义变化（inventory-update.sh 局部更新）" \
      --phase "self-growth" 2>/dev/null || true
  fi
fi

echo "✓ inventory-update 完成：§${_sec_num} ${_op_desc}（reference-manual.md 行数 ${_old_lines} → ${_new_lines}）"
# replace/append 显示当前行内容；delete 显示已删行（删除前已读出目标行原文）
case "$_op_desc" in
  replace) echo "  目标行 ${_target_line}: $(awk -v n="$_target_line" 'NR==n' "$RM" | head -c 120)" ;;
  delete)  echo "  已删行 ${_target_line}: ${_target_orig}" ;;
  append)  : ;;
esac
exit 0
