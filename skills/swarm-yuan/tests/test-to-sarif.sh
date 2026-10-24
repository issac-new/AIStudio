#!/usr/bin/env bash
# test-to-sarif.sh — to-sarif.sh SARIF 2.1.0 转换回归（audit-claims-reality C7 接线）
# 此前 tests/sarif-fixture/ 随 to-sarif.sh 加入但无 runner（孤儿 fixture），SARIF 管线零回归保护。
# 链路：fixture conf（__REPO_ROOT__ 运行时替换）→ precheck --format json --all → to-sarif.sh
#       → expect-output 逐行字面断言（must-contain，与 run-gate-fixture.sh 同款语义）。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
FX="${BASE}/tests/sarif-fixture/compliant"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/sarif-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

echo "▶ to-sarif：precheck --format json → SARIF 2.1.0 转换回归"

# python3 依赖（to-sarif.sh 的转换器）：缺失时明示 skip 而非假通过
if ! command -v python3 >/dev/null 2>&1; then
  echo "  ⊘ SKIP（无 python3，to-sarif.sh 转换器不可用）"
  exit 0
fi

# 准备：拷贝 precheck + gates 三件套到临时 scripts/，conf 占位符替换为 fixture 根
mkdir -p "$TMP/scripts"
cp "${BASE}/assets/precheck.sh" "${BASE}/assets/gates-strict.sh" "${BASE}/assets/gates-warn.sh" "${BASE}/assets/gates-advisory.sh" "$TMP/scripts/"
sed "s|__REPO_ROOT__|${FX}|g" "${FX}/scripts/precheck.conf" > "$TMP/scripts/precheck.conf"

# 跑 precheck --format json --all → to-sarif.sh
# 注：不断言链路 rc——precheck --all 在 fixture 环境（非 git 仓库）门禁 rc 可非 0，
# pipefail 会透传；本测试的断言对象是 to-sarif 的产出质量（非空 + 命中 + 结构合法）。
sarif_out="$( cd "$FX" && bash "$TMP/scripts/precheck.sh" --format json --all 2>/dev/null | bash "${BASE}/scripts/to-sarif.sh" 2>/dev/null )"
[[ -n "$sarif_out" ]] && ok "precheck→to-sarif 链路产出非空" || bad "链路无产出"

# expect-output 逐行字面断言（must-contain）
while IFS= read -r ln || [[ -n "$ln" ]]; do
  [[ -z "$ln" ]] && continue
  case "$ln" in \#*) continue;; esac
  if printf '%s\n' "$sarif_out" | grep -qF "$ln"; then
    ok "SARIF 输出命中: ${ln}"
  else
    bad "SARIF 输出未命中: ${ln}"
  fi
done < "${FX}/expect-output"

# SARIF 是合法 JSON（python3 复核，防"含关键词但结构坏"假通过）
printf '%s\n' "$sarif_out" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("version")=="2.1.0", "version 非 2.1.0"; assert isinstance(d.get("runs"), list), "runs 非数组"' \
  && ok "SARIF 2.1.0 结构合法（version + runs 数组）" || bad "SARIF 结构非法"

[[ $FAIL -eq 0 ]] && { echo "PASS test-to-sarif"; exit 0; } || { echo "FAIL test-to-sarif" >&2; exit 1; }
