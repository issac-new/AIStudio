#!/usr/bin/env bash
# test-skill-manifest.sh — 目标技能自描述清单（WP7）
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-manifest.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }
PROJ="$TMP/proj"; mkdir -p "$PROJ"; printf '{"name":"manifest-demo","version":"1.0.0"}\n' > "$PROJ/package.json"
SKILLS="$TMP/skills"
SKIP_BAT=1 bash "$BASE/scripts/generate-skill.sh" --profile standard --industry none mdemo "$PROJ" "$SKILLS" >/tmp/swarm-manifest-create.$$ 2>&1
M="$SKILLS/mdemo/skill-manifest.json"
if [[ -f "$M" ]]; then ok "manifest 落盘"; else bad "manifest 缺失"; fi
if python3 -m json.tool "$M" >/dev/null 2>&1; then ok "manifest JSON 合法"; else bad "manifest JSON 非法"; fi
grep -q '"name": "mdemo"' "$M" 2>/dev/null && ok "name" || bad "name"
grep -q '"profile": "standard"' "$M" 2>/dev/null && ok "profile" || bad "profile"
grep -q '"industry": "none"' "$M" 2>/dev/null && ok "industry" || bad "industry"
grep -q '"gates": {"total": 56' "$M" 2>/dev/null && ok "gates.total" || bad "gates.total"
grep -q '"frameworks": {"total": 81' "$M" 2>/dev/null && ok "frameworks.total" || bad "frameworks.total"
n="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["files"]["count"])' "$M" 2>/dev/null || echo 0)"
[[ "${n:-0}" -ge 90 ]] && ok "files.count ${n}" || bad "files.count ${n}"
rm -f /tmp/swarm-manifest-create.$$
echo "PASS test-skill-manifest ($pass ok, $fail fail)"
[[ "$fail" -eq 0 ]]
