#!/usr/bin/env bash
# test-r67-thorough-fix.sh — R67 彻底修复轮变异锁（R65+R66 两轮留档 8 条全清）
#   L1 F1 express x-powered-by 含 helmet hidePoweredBy 形态（源码锁）
#   L2 F2 jest-vitest 纯 Jest 项目跳过 jest_fn_to_vi（源码锁）
#   L3 F3 react/vue/element 版本感知头在位（源码锁×3）
#   L4 F4 check_framework_globs 全变量核验（空值 warn）在位（源码锁）
#   L5 F5 DIM_STORE 含 Vuex 形态（源码锁）
#   L6 F6 trace-log PROJECT_DIR 双语义头注在位（源码锁）
#   L7 F7 mark-active 维度 TSV 展示在位（源码锁）
set -u
cd "$(dirname "${0}")/.." || exit 1
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# L1
grep -q 'hidePoweredBy' assets/framework-gates/express.sh \
  && ok "L1 F1 express helmet hidePoweredBy 形态在位" || bad "L1 express.sh 缺 helmet（F1 回归）"
# L2
grep -q '纯 Jest 项目' assets/framework-gates/jest-vitest.sh && grep -q '_vitest_present' assets/framework-gates/jest-vitest.sh \
  && ok "L2 F2 纯 Jest 项目跳过在位" || bad "L2 jest-vitest.sh 缺纯 Jest 检测（F2 回归）"
# L3
grep -q 'version_aware' assets/framework-gates/react.sh \
  && grep -q 'version_aware' assets/framework-gates/vue.sh \
  && grep -q 'version_aware' assets/framework-gates/element.sh \
  && ok "L3 F3 react/vue/element 版本感知头全在位" || bad "L3 版本感知缺（F3 回归）"
# L4
grep -q '全变量核验' scripts/generate-skill.sh && grep -q '_cg_empty' scripts/generate-skill.sh \
  && ok "L4 F4 glob 全变量核验在位" || bad "L4 generate-skill.sh 缺全变量 warn（F4 回归）"
# L5
grep -q 'Vuex' assets/inventory-dimensions.conf \
  && ok "L5 F5 DIM Vuex 形态在位" || bad "L5 inventory-dimensions 缺 Vuex（F5 回归）"
# L6
grep -q '同名不同义' assets/trace-log.sh \
  && ok "L6 F6 PROJECT_DIR 双语义头注在位" || bad "L6 trace-log.sh 缺头注（F6 回归）"
# L7
grep -q '维度 TSV 证据面展示' scripts/generate-skill.sh && grep -q 'DIM_\|PASS\|FAIL' scripts/generate-skill.sh \
  && ok "L7 F7 维度 TSV 展示在位" || bad "L7 generate-skill.sh 缺 TSV 展示（F7 回归）"

echo "PASS test-r67-thorough-fix (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
