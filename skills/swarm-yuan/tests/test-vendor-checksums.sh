#!/usr/bin/env bash
# test-vendor-checksums.sh — vendor 镜像完整性锚（WP2）
# vendor 缺失时跳过（外置后的正常态）；存在时校验 SHA256SUMS 与 --check。
set -uo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)"
VK="$BASE/vendor-knowledge"
[[ -d "$VK" ]] || { echo "SKIP test-vendor-checksums (vendor 未同步)"; exit 0; }

pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

if [[ -f "$VK/SHA256SUMS" ]]; then ok "SHA256SUMS 存在"; else bad "SHA256SUMS 缺失"; fi
n="$(wc -l < "$VK/SHA256SUMS" 2>/dev/null | tr -d ' ')"
if [[ "${n:-0}" -ge 300 ]]; then ok "SHA256SUMS 条目 ${n}"; else bad "SHA256SUMS 条目 ${n:-0}（期望 ≥300）"; fi
if bash "$BASE/scripts/sync-vendor-knowledge.sh" --check >/tmp/swarm-vendor-check.$$ 2>&1; then
  ok "vendor --check 通过"
else
  bad "vendor --check 失败"
  tail -5 /tmp/swarm-vendor-check.$$ || true
fi
rm -f /tmp/swarm-vendor-check.$$

echo "PASS test-vendor-checksums ($pass ok, $fail fail)"
[[ "$fail" -eq 0 ]]
