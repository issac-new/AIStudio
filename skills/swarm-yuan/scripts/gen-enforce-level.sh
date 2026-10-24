#!/usr/bin/env bash
# gen-enforce-level.sh —— 扫描 precheck.sh 每个 check_* 函数的 fail() 调用数，
# 按能力自动归类 enforce_level（strict ≥3 / warn 1-2 / advisory 0），生成 gate-enforce-level.conf。
#
# 分类依据（决策 19）：
#   strict   ≥3 fail —— 真正能阻断交付的硬门禁
#   warn     1-2 fail —— 混合 warn，能 fail 但触发条件窄
#   advisory 0 fail  —— 永不 fail，只 warn/pass，天然 warn-only（认知/观测类）
#
# 手动覆盖：在 precheck.sh 顶部 _ENFORCE_OVERRIDE 声明（见 _enforce_of()）。
# 幂等可重跑。self-check.sh 会校验本文件与 precheck.sh 实际 fail 数一致（防漂移）。
set -u

BASE="$(cd "$(dirname "${0}")/.." && pwd)"
PRECHECK="${BASE}/assets/precheck.sh"
OUT="${BASE}/assets/gate-enforce-level.conf"

if [[ ! -f "${PRECHECK}" ]]; then
  echo "✗ precheck.sh 不存在: ${PRECHECK}" >&2
  exit 1
fi

# 拆分后 check_* 函数在 gates-strict/warn/advisory.sh 三文件。
# install.sh 整目录拷贝（含三文件），故安装态 gates-*.sh 仍存在；"单文件打包"形态（内联
# 回 precheck.sh、SWARM_YUAN_BUNDLED=1）为预留扩展点，当前无生产者。
# 扫描文件清单：precheck.sh + 存在的 gates-*.sh。
GATE_FILES="${PRECHECK}"
for _gf in gates-strict.sh gates-warn.sh gates-advisory.sh; do
  [[ -f "${BASE}/assets/${_gf}" ]] && GATE_FILES="${GATE_FILES} ${BASE}/assets/${_gf}"
done

# 用 awk 按行边界提取函数体（从 ^check_xxx() 到下一行 ^}）。
# 不跟大括号深度--python -c / heredoc / case 里的 { } 会污染 depth 跟踪。
# 匹配真实 fail() 调用：行首（可缩进）fail 后跟空白，排除注释行 + echo 字符串里的 "fail" 字样。
# 修复（2026-08-03）：原正则 /(^|[^a-zA-Z0-9_])fail[ \t]+/ 误计 echo "永不 fail" 里的 fail 字样，
#   导致 9 个门禁的 enforce_level 归类错误（check_cognition 0->1, check_crypto 1->3 等）。
#   改为 ^[ \t]*fail[ \t]+ 只匹配行首 fail 调用（真实 fail() 调用都是行首起，echo 字符串内的 fail
#   前面有引号/文字，不匹配行首锚定）。
# bash 3.2 兼容：awk + sort，不依赖 GNU 扩展。
awk '
/^check_[a-z_]+\(\)/ {
  if (cur != "") print cnt "\t" cur
  cur = $0; sub(/\(.*/, "", cur)
  cnt = 0
  in_fn = 1
  next
}
in_fn && /^\}/ { in_fn = 0 }
in_fn {
  # 只计行首 fail 调用（可缩进），排除注释行 + echo 字符串里的 fail 字样
  if ($0 ~ /^[ \t]*fail[ \t]+/) cnt++
}
END { if (cur != "") print cnt "\t" cur }
' $GATE_FILES | sort -t$'\t' -k2 > "${OUT}.tmp"

if [[ ! -s "${OUT}.tmp" ]]; then
  echo "✗ 未扫到任何 check_* 函数（precheck.sh 损坏？）" >&2
  rm -f "${OUT}.tmp"
  exit 1
fi

# 统计三档数量（写入文件头注释）
_strict=$(awk -F'\t' '$1>=3' "${OUT}.tmp" | wc -l | tr -d ' ')
_warn=$(awk -F'\t' '$1>=1 && $1<=2' "${OUT}.tmp" | wc -l | tr -d ' ')
_advisory=$(awk -F'\t' '$1==0' "${OUT}.tmp" | wc -l | tr -d ' ')
_total=$(wc -l < "${OUT}.tmp" | tr -d ' ')

{
  echo "# gate-enforce-level.conf —— 由 gen-enforce-level.sh 自动生成，勿手改"
  echo "# 手动覆盖见 precheck.sh 顶部 _ENFORCE_OVERRIDE（_enforce_of 优先读覆盖）。"
  echo "# 分类规则：strict ≥3 fail / warn 1-2 fail / advisory 0 fail"
  echo "# 统计：strict ${_strict} + warn ${_warn} + advisory ${_advisory} = ${_total}（机械计数，随门禁增删自动变化）"
  echo "#"
  echo "# strict (>=3 fail):"
  awk -F'\t' '$1>=3{printf "#   %s (%d fail)\n", $2, $1}' "${OUT}.tmp" | sort
  echo "# warn (1-2 fail):"
  awk -F'\t' '$1>=1 && $1<=2{printf "#   %s (%d fail)\n", $2, $1}' "${OUT}.tmp" | sort
  echo "# advisory (0 fail):"
  awk -F'\t' '$1==0{printf "#   %s (0 fail)\n", $2}' "${OUT}.tmp" | sort
  echo "#"
  echo "# 格式：check_<fn>=<level>  （level ∈ strict|warn|advisory）"
  echo ""
  while IFS=$'\t' read -r _cnt _fn; do
    case "$_cnt" in
      0) _lv="advisory" ;;
      1|2) _lv="warn" ;;
      *) _lv="strict" ;;
    esac
    printf '%s=%s\n' "$_fn" "$_lv"
  done < "${OUT}.tmp"
} > "${OUT}"

rm -f "${OUT}.tmp"

echo "✓ 生成 ${OUT}"
echo "  strict ${_strict} / warn ${_warn} / advisory ${_advisory} = ${_total}"
