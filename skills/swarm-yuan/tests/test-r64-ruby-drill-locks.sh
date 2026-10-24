#!/usr/bin/env bash
# test-r64-ruby-drill-locks.sh — R64 Ruby 换栈演练工具链修复的变异锁
#   L1 Ruby 提取裸名 require_relative（最常见形态）→ 唯一解析 .rb（行为锁）
#   L2 前缀 require_relative './x' → 解析；gem require 不发边（行为锁）
#   L3 conf-render Gemfile 命令族（BUILD=bundle install / TEST=bundle exec rake）（行为锁）
#   L4 DIM Ruby 形态（Sinatra 路由 / *_spec.rb / *.rb include）（源码锁）
#   L5 ruby 规则集三件套在位 + 探测信号在位（源码锁——子代理交付面）
#
# 用法: bash tests/test-r64-ruby-drill-locks.sh
set -u
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-r64.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# --- 行为锁共用 fixture：小 Ruby 项目 ---
mkdir -p "$TMP/p/lib/sub"
printf "require_relative 'helper'\nrequire_relative './sub/deep'\nrequire 'rack'\n" > "$TMP/p/lib/main.rb"
printf "H=1\n" > "$TMP/p/lib/helper.rb"
printf "D=1\n" > "$TMP/p/lib/sub/deep.rb"
echo 'source "https://rubygems.org"' > "$TMP/p/Gemfile"

bash scripts/relations-extract.sh "$TMP/p" --out "$TMP/rel.jsonl" >/dev/null 2>&1
if grep -q '"to":"lib/helper.rb"' "$TMP/rel.jsonl" 2>/dev/null; then
  ok "L1 裸名 require_relative 解析在（行为锁）"
else
  bad "L1 裸名 require_relative 边缺失（D2 回归）"
fi
if grep -q '"to":"lib/sub/deep.rb"' "$TMP/rel.jsonl" 2>/dev/null \
   && ! grep -q '"to".*rack' "$TMP/rel.jsonl" 2>/dev/null; then
  ok "L2 前缀解析在 + gem require 不发边（行为锁）"
else
  bad "L2 前缀边缺失或 gem 泄漏（D2 回归）"
fi

rm -rf "$TMP/cf" && mkdir -p "$TMP/cf"
bash scripts/conf-render.sh "$TMP/p" --out "$TMP/cf" >/dev/null 2>&1
if grep -q "BUILD_CMD='bundle install'" "$TMP/cf/precheck.conf" 2>/dev/null \
   && grep -q "TEST_CMD='bundle exec rake'" "$TMP/cf/precheck.conf" 2>/dev/null; then
  ok "L3 Gemfile 命令族嗅探在（行为锁）"
else
  bad "L3 conf-render 未出 Bundler 命令族（D3 回归）"
fi

if grep -q "(get|post|put|delete|patch) +" assets/inventory-dimensions.conf \
   && grep -q '\*_spec\.rb' assets/inventory-dimensions.conf \
   && grep -q "include='\*\.rb'" assets/inventory-dimensions.conf; then
  ok "L4 DIM Ruby 形态在位"
else
  bad "L4 inventory-dimensions 缺 Ruby 形态（D4 回归）"
fi

if [[ -f references/frameworks/ruby.md && -f assets/framework-gates/ruby.sh ]] \
   && grep -q 'ruby|Gemfile' scripts/detect-frameworks.sh; then
  ok "L5 ruby 规则集三件套 + 探测信号在位"
else
  bad "L5 ruby 三件套/信号缺失（R64 回归——子代理交付面）"
fi

echo "PASS test-r64-ruby-drill-locks (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
