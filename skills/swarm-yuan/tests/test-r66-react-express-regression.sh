#!/usr/bin/env bash
# test-r66-react-express-regression.sh — R66 React+Express 全链回归修复的变异回归断言
#   L1 A1 P1 待补独立 grep（不再依赖四词前置）——行为锁
#   L2 A2 BUILD_CMD 自指防 fork bomb（scripts.build 含 npm run build → 留空）——行为锁
#   L3 A5 check_layer import 提取含 CommonJS require（源码锁）
#   L4 A4 JSON 契约面列族承载位（源码锁）
#   L5 A6 待确认事项清单用途行 + A7 git 降级披露（源码锁）
#
# 用法: bash tests/test-r66-react-express-regression.sh
set -u
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-r66.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

# --- L1 行为锁：（P1 待补）行不含四词也必须被 verify-completeness 检出 ---
mkdir -p "$TMP/s1/references"
printf '# t skill\nstatus: draft\n' > "$TMP/s1/SKILL.md"
printf '# m\n\n| a | （P1 待补）说明 |\n' > "$TMP/s1/references/reference-manual.md"
out=$(bash scripts/generate-skill.sh --verify-completeness "$TMP/s1" --strict 2>&1)
printf '%s' "$out" | grep -q 'P1' \
  && ok "L1 P1 待补独立检出（行为锁）" || bad "L1 P1 行漏检（A1 回归）：${out}" 

# --- L2 行为锁：自指 build → 留空 ---
mkdir -p "$TMP/p2"
printf '{"name":"t","scripts":{"build":"cd frontend && npm run build"}}' > "$TMP/p2/package.json"
bash scripts/conf-render.sh "$TMP/p2" --out "$TMP/cf2" >/dev/null 2>&1
if grep -q "BUILD_CMD=''" "$TMP/cf2/precheck.conf" 2>/dev/null; then
  ok "L2 自指 build 留空防 fork bomb（行为锁）"
else
  bad "L2 自指 build 未留空（A2 回归）：$(grep BUILD_CMD "$TMP/cf2/precheck.conf" 2>/dev/null)"
fi

# --- L3 源码锁：require 入 import 提取 ---
grep -q 'require' assets/gates-strict.sh \
  && grep -qE "require\\\\.\\(\\['" assets/gates-strict.sh 2>/dev/null \
  && ok "L3 check_layer require 形态在位" \
  || { grep -q "require\\\\(" assets/gates-strict.sh && ok "L3 check_layer require 形态在位" || bad "L3 gates-strict 缺 require（A5 回归）"; }

# --- L4 源码锁：JSON 契约面列族 ---
grep -q 'JSON 契约面列族' references/template-spec.md \
  && ok "L4 JSON 契约面承载位在位" || bad "L4 template-spec 缺 JSON 契约面列族（A4 回归）"

# --- L5 源码锁：待确认事项清单用途 + git 降级 ---
grep -q '待确认事项清单（拿不准语义集中落此）' scripts/generate-skill.sh \
  && grep -q '非 git 仓库时依赖类门禁依赖 git 历史' assets/gates-warn.sh \
  && ok "L5 待确认事项清单用途行 + git 降级披露在位" \
  || bad "L5 A6/A7 缺失（回归）"

echo "PASS test-r66-react-express-regression (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
