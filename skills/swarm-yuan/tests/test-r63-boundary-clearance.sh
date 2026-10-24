#!/usr/bin/env bash
# test-r63-boundary-clearance.sh — R63 边界披露清账的变异锁
#   L1 边界① composer 通道：composer.json require "php" → 探出 php（行为锁）
#   L2 边界① require-dev 段键也进桶；非 require 段 JSON 键不误报（行为锁）
#   L3 边界① 通道分派/词边界复用在位（源码锁）
#   L4 边界② golden 显式一键重建 opt-in 在位（源码锁：环境变量 + 官方 rebuild 调用）
#   L5 边界② 非 opt-in 时漂移仍 FAIL（不自动跟随——保基线独立性，源码锁）
#
# 用法: bash tests/test-r63-boundary-clearance.sh
set -u
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-r63.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# --- L1 行为锁：require php → php 探出 ---
T1="$TMP/p1"
mkdir -p "$T1"
printf '{\n  "require": { "php": "^8.1", "vlucas/phpdotenv": "^5.6" },\n  "require-dev": { "phpunit/phpunit": "^10" }\n}\n' > "$T1/composer.json"
out=$(bash scripts/detect-frameworks.sh "$T1" 2>&1)
printf '%s' "$out" | grep -q '探测到 1 个框架: php' \
  && ok "L1 composer 通道命中 php（行为锁）" || bad "L1 php 未探出：${out}"

# --- L2 行为锁：require-dev 键进桶 + 顶层 JSON 键不误报 ---
T2="$TMP/p2"
mkdir -p "$T2"
printf '{\n  "name": "t/t",\n  "description": "demo",\n  "require-dev": { "php": ">=8.0" },\n  "autoload": { "psr-4": {} }\n}\n' > "$T2/composer.json"
out=$(bash scripts/detect-frameworks.sh "$T2" 2>&1)
printf '%s' "$out" | grep -q '探测到 1 个框架: php' \
  && ok "L2 require-dev 段键进桶（行为锁）" || bad "L2 require-dev 未命中：${out}"

# --- L3 源码锁：通道接线在位 ---
grep -qF 'composer)  _bucket="$_composer_deps"' scripts/detect-frameworks.sh \
  && grep -qF '"pkgjson" || "$ftype" == "composer"' scripts/detect-frameworks.sh \
  && grep -q '^php|php|composer' scripts/detect-frameworks.sh \
  && ok "L3 composer 通道分派/匹配/信号行在位" || bad "L3 composer 通道接线缺失（①回归）"

# --- L4 源码锁：golden opt-in 重建 ---
grep -q 'SWARM_YUAN_GOLDEN_REBUILD' scripts/self-check.sh \
  && grep -q 'rebuild-golden' scripts/self-check.sh \
  && ok "L4 golden 显式一键重建 opt-in 在位" || bad "L4 self-check 缺 opt-in 重建（②回归）"

# --- L5 源码锁：非 opt-in 漂移仍 FAIL（独立性）---
if awk '/check_golden_vector/,/^}/' scripts/self-check.sh | grep -q 'else' \
   && awk '/golden-vector.txt .*≠ 期望/,/FAIL=1/' scripts/self-check.sh | grep -q 'FAIL=1'; then
  ok "L5 非 opt-in 漂移仍 FAIL（基线独立性保住）"
else
  bad "L5 漂移分支不再 FAIL（独立性回归）"
fi

echo "PASS test-r63-boundary-clearance (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
