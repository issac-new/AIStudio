#!/usr/bin/env bash
# test-r62-php-drill-locks.sh — R62 PHP 换栈演练修复的变异锁打包
#
# 第九棒（PHP/phpdotenv 真实项目 280 测试）打出生态五面全盲（规则集/探测/提取/命令嗅探/枚举器），
# php 规则集三件套由 run-framework-fixture.sh php 双态夹具守护；本文件锁工具链四修 + 机制修：
#   L1 D2  PHP 提取（use PSR-4 唯一命中 + require/include 相对引用）——行为锁
#   L2 D2  vendor/ 噪音排除（PHP 的 .venv 等价物）——行为锁
#   L3 D3  conf-render composer 命令族（BUILD=composer install / TEST=vendor/bin/phpunit）——行为锁
#   L4 D4  DIM 枚举器 PHP 形态（Route::/->get(/ *Test.php）——源码锁
#   L5 机制修：framework-conf-consistency 期望值读 FACT_FRAMEWORKS 单一事实源——源码锁
#   L6 php 规则集三件套在位 + 探测信号在位——源码锁
#
# 用法: bash tests/test-r62-php-drill-locks.sh
set -u
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-r62.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# --- 行为锁共用 fixture：小 PHP 项目（use + require + vendor 噪音）---
mkdir -p "$TMP/p/src" "$TMP/p/views" "$TMP/p/vendor/lib"
cat > "$TMP/p/src/A.php" <<'PHP'
<?php
use App\B;
require __DIR__ . '/helpers.php';
PHP
cat > "$TMP/p/src/B.php" <<'PHP'
<?php
class B {}
PHP
cat > "$TMP/p/src/helpers.php" <<'PHP'
<?php
function h() {}
PHP
cat > "$TMP/p/vendor/lib/B.php" <<'PHP'
<?php
class B {}
PHP
echo '{"name":"t/t","require":{}}' > "$TMP/p/composer.json"

bash scripts/relations-extract.sh "$TMP/p" --out "$TMP/rel.jsonl" >/dev/null 2>&1
if grep -q '"to":"src/B.php"' "$TMP/rel.jsonl" 2>/dev/null; then
  ok "L1 D2 use PSR-4 唯一命中边在（行为锁）"
else
  bad "L1 PHP use 边缺失（D2 回归）：$(grep -c . "$TMP/rel.jsonl" 2>/dev/null) 边"
fi
if grep -q 'helpers.php' "$TMP/rel.jsonl" 2>/dev/null && ! grep -q 'vendor' "$TMP/rel.jsonl" 2>/dev/null; then
  ok "L2 D2 require 相对边在 + vendor 噪音零（行为锁）"
else
  bad "L2 require 边缺失或 vendor 泄漏（D2 回归）"
fi

rm -rf "$TMP/cf" && mkdir -p "$TMP/cf"
bash scripts/conf-render.sh "$TMP/p" --out "$TMP/cf" >/dev/null 2>&1
if grep -q "BUILD_CMD='composer install'" "$TMP/cf/precheck.conf" 2>/dev/null \
   && grep -q "TEST_CMD='vendor/bin/phpunit'" "$TMP/cf/precheck.conf" 2>/dev/null; then
  ok "L3 D3 composer 命令族嗅探在（行为锁）"
else
  bad "L3 conf-render 未出 composer 命令族（D3 回归）"
fi

# --- L4 D4 源码锁 ---
if grep -q 'Route::(get|post' assets/inventory-dimensions.conf && grep -q "\*Test.php" assets/inventory-dimensions.conf; then
  ok "L4 D4 DIM PHP 形态在位"
else
  bad "L4 inventory-dimensions 缺 PHP 形态（D4 回归）"
fi

# --- L5 机制修源码锁：期望值读单一事实源 ---
if grep -q "FACT_FRAMEWORKS=" tests/test-framework-conf-consistency.sh \
   && ! grep -qE '\-eq 8[0-9]' tests/test-framework-conf-consistency.sh; then
  ok "L5 机制修：一致性测试读 FACT_FRAMEWORKS（不再手抄）"
else
  bad "L5 一致性测试回退硬编码计数（机制修回归）"
fi

# --- L6 php 三件套 + 信号在位 ---
if [[ -f references/frameworks/php.md && -f assets/framework-gates/php.sh ]] \
   && grep -q 'php|composer' scripts/detect-frameworks.sh; then
  ok "L6 php 规则集三件套 + 探测信号在位"
else
  bad "L6 php 三件套/信号缺失（R62 回归）"
fi

echo "PASS test-r62-php-drill-locks (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
