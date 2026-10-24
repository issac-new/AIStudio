#!/usr/bin/env bash
# test-r70-ci-red-fix.sh — CI 连续四轮红修复的回归断言（R70）
#
# 背景：R66-A1 在 [[ ]] 内写 ${targets[@]+x} 触发 SC2199（error 级），R67-F7 无引号展开
# $_iv_out + set -o pipefail 使 gen-e2e 的 --mark-active 环节静默死亡——R66/R67/R68/R69
# 连续四轮 CI 红未被察觉。本测试锁两处修复 + shellcheck 零 error 面。
set -u
BASE="$(cd "$(dirname "${0}")/.." && pwd)"          # swarm-yuan/
cd "${BASE}" || exit 1
pass=0; fail=0
ok()  { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

GS="scripts/generate-skill.sh"

# L1 行为锁：shellcheck error 级零出现（SC2199 回归即红）
if command -v shellcheck >/dev/null 2>&1; then
  errs=$(shellcheck -x -e SC2086,SC1090,SC1091,SC2155,SC2034,SC2230,SC2004,SC2312 \
    -f gcc "${GS}" 2>/dev/null | grep -c 'error:' || true)
  if [[ "${errs}" -eq 0 ]]; then
    ok "L1 shellcheck 对 ${GS} 零 error（SC2199 修复保持）"
  else
    bad "L1 shellcheck 报 ${errs} 个 error——SC2199 类问题回归"
  fi
else
  echo "  ⊘ L1 跳过（shellcheck 未安装；CI 与 verifier all 内含同断言）"
fi

# L2 源码锁：R67-F7 维度展示必须带引号展开（无引号 $_iv_out 在 set -o pipefail 下分词+管道断即静默死）
if grep -qF 'printf "%s\n" "${_iv_out}"' "${GS}" 2>/dev/null || \
   grep -qF "printf '%s\n' \"\${_iv_out}\"" "${GS}" 2>/dev/null; then
  ok "L2 F7 维度展示为带引号展开形态"
else
  bad "L2 F7 维度展示未找到带引号形态——无引号 \$_iv_out 回归"
fi
if grep -nE "printf .*[\$]\{_?iv_out\} *\|" "${GS}" | grep -vF '"${_iv_out}"' >/dev/null 2>&1; then
  bad "L2b 存在无引号的 \$_iv_out 管道展开"
else
  ok "L2b 无引号 \$_iv_out 管道展开零出现"
fi

# L3 源码锁：[[ ]] 内 ${arr[@]} 形态禁入（SC2199 源头；排除注释行）；计数惯形 ${#arr[@]} 在位
if grep -nE '\[\[ .*[\$]\{[A-Za-z_]+\[@\]' "${GS}" | grep -v '^[0-9]*:[[:space:]]*#' >/dev/null 2>&1; then
  bad "L3 [[ ]] 内出现 \${arr[@]} 形态（SC2199 源头回归）"
else
  ok "L3 [[ ]] 内 \${arr[@]} 形态零出现"
fi
# R128：verify_completeness 拆分后空数组守卫下沉到子函数（`[[ ${#targets[@]} -eq 0 ]] && return 0`），
# 原字面 `-gt 0` 形态不再存在；本断言守的是「数组成员测试用计数惯形而非 SC2199 形态」这一纪律，
# 不是某一行的字面——放宽为计数惯形任一比较形态在位（-gt/-eq），L3 继续守 SC2199 形态零出现。
if grep -qE '\[\[ \$\{#targets\[@\]\} -(gt|eq) 0 \]\]' "${GS}"; then
  ok "L3b 数组成员测试用计数惯形"
else
  bad "L3b 计数惯形缺失——R66-A1 判定回归"
fi

echo "PASS test-r70-ci-red-fix (${pass} ok, ${fail} fail)"
[[ ${fail} -eq 0 ]]
