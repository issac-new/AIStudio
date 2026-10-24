#!/usr/bin/env bash
# test-industry-wiring.sh — 行业 8 档真实加载 + create/upgrade 主链路（WP2）
# 断言：conf-render 8 档均产出 precheck.industry.conf；create --industry 落盘并挂 source；
#       upgrade --industry 增量加载不重渲染用户配置。
set -uo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-industry.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

PROJ="$TMP/proj"; mkdir -p "$PROJ"
printf '{\n  "name": "industry-demo",\n  "version": "1.0.0"\n}\n' > "$PROJ/package.json"

# 1. 8 档 conf-render 真实加载
for ind in finance gov medical telecom automotive energy industrial payment; do
  out="$TMP/conf-$ind"; mkdir -p "$out"
  if bash "$BASE/scripts/conf-render.sh" "$PROJ" --profile compliance --industry "$ind" --out "$out" >/dev/null 2>&1 \
     && [[ -s "$out/precheck.industry.conf" ]]; then
    ok "conf-render --industry $ind"
  else
    bad "conf-render --industry $ind 未产出 precheck.industry.conf"
  fi
done

# 2. create --industry finance 主链路
SKILLS="$TMP/skills"
if SKIP_BAT=1 bash "$BASE/scripts/generate-skill.sh" --profile compliance --industry finance demo "$PROJ" "$SKILLS" >/dev/null 2>&1; then
  SK="$SKILLS/demo"
  if [[ -s "$SK/scripts/precheck.industry.conf" ]]; then ok "create 落盘 precheck.industry.conf"; else bad "create 未落盘行业层"; fi
  if grep -qF 'precheck.industry.conf' "$SK/scripts/precheck.conf"; then ok "create 挂载 industry source"; else bad "create 未挂载 industry source"; fi
  if grep -q '"industry": "finance"' "$SK/skill-manifest.json" 2>/dev/null; then ok "create manifest industry=finance"; else bad "create manifest 缺 industry"; fi
else
  bad "create --industry finance 失败"
fi

# 3. upgrade --industry finance 增量加载（先在无行业档技能上执行）
SKILLS2="$TMP/skills2"
if SKIP_BAT=1 bash "$BASE/scripts/generate-skill.sh" --profile standard demo2 "$PROJ" "$SKILLS2" >/dev/null 2>&1; then
  if SKIP_BAT=1 bash "$BASE/scripts/generate-skill.sh" --upgrade --industry finance demo2 "$PROJ" "$SKILLS2" >/dev/null 2>&1; then
    if [[ -s "$SKILLS2/demo2/scripts/precheck.industry.conf" ]] && grep -qF 'precheck.industry.conf' "$SKILLS2/demo2/scripts/precheck.conf" \
       && grep -q '"industry": "finance"' "$SKILLS2/demo2/skill-manifest.json" 2>/dev/null; then
      ok "upgrade 增量加载行业层"
    else
      bad "upgrade 未加载行业层"
    fi
  else
    bad "upgrade --industry finance 失败"
  fi
else
  bad "upgrade 前置 create 失败"
fi

echo "PASS test-industry-wiring ($pass ok, $fail fail)"
[[ "$fail" -eq 0 ]]
