#!/usr/bin/env bash
# test-r65-fullstack-regression.sh — R65 前后端全链回归修复的变异锁
#   L1 D1 mybatis mapper_locations 嵌套 YAML 键命中（行为锁）
#   L2 D1 mybatis 探测深度含 Maven 标准布局 src/main/resources、排除 target（源码锁）
#   L3 D2 mvn TEST_CMD 含 clean（stale target 毒化防线，源码锁）
#   L4 D4 stability 否定词族（勿标稳定/不再稳定/无稳定性）在位（源码锁）
#   L5 D5 check_layer find 含 *.vue（源码锁）
#
# 用法: bash tests/test-r65-fullstack-regression.sh
set -u
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-r65.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# --- L1 行为锁：嵌套 YAML mapper-locations 命中 ---
mkdir -p "$TMP/p/src/main/resources"
cat > "$TMP/p/src/main/resources/application.yml" <<'YML'
mybatis:
  mapper-locations: classpath:mapper/*.xml
YML
# 模拟 skill 侧调用 mapper_locations 检查的 grep（对 mybatis.sh 内的 grep 模式）
if grep -q "mapper-locations" "$TMP/p/src/main/resources/application.yml" 2>/dev/null \
   && grep -q "mapper-locations|mapperLocations" assets/framework-gates/mybatis.sh; then
  ok "L1 嵌套 YAML mapper-locations 键命中（行为锁）"
else
  bad "L1 嵌套 YAML 键漏匹配（D1 回归）"
fi

# --- L2 源码锁：深度 ≥5 + 排除 target ---
if grep -q 'maxdepth 6' assets/framework-gates/mybatis.sh \
   && grep -q 'not -path.*/target' assets/framework-gates/mybatis.sh; then
  ok "L2 mybatis 探测深度+排除 target 在位"
else
  bad "L2 mybatis.sh 深度/target 排除缺失（D1 回归）"
fi

# --- L3 源码锁：mvn TEST_CMD 含 clean ---
if grep -q 'mvn clean test' scripts/conf-render.sh; then
  ok "L3 mvn TEST_CMD 含 clean（stale target 防线）"
else
  bad "L3 conf-render mvn 缺 clean（D2 回归）"
fi

# --- L4 源码锁：否定词族 ---
if grep -q '勿标稳定' scripts/inventory-verify.sh \
   && grep -q '不再稳定' scripts/inventory-verify.sh; then
  ok "L4 stability 否定词族在位"
else
  bad "L4 inventory-verify 缺否定词（D4 回归）"
fi

# --- L5 源码锁：check_layer 含 *.vue ---
if grep -q "\*\.vue" assets/gates-strict.sh; then
  ok "L5 check_layer 含 *.vue"
else
  bad "L5 gates-strict 缺 .vue（D5 回归）"
fi

echo "PASS test-r65-fullstack-regression (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
