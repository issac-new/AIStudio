#!/usr/bin/env bash
# test-execution-surface-budget.sh — 执行面复杂度预算锁（决策 54）
#
# 锁两件事：
#   ① facts.conf 的引擎/框架门禁 LOC 上限存在且被 self-check 消费；
#   ② 当前域源代码行数不超过上限（超限即测试失败，逼迫等额删减或登记上调）。
# 口径与 facts.conf 注释一致：引擎=precheck.sh + assets/gates/<domain>/*.sh（域源，不含聚合视图）；
# 框架=assets/framework-gates/*.sh。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
FACTS="$BASE/assets/facts.conf"
FAIL=0
ok()  { echo "  ✓ $*"; }
bad() { echo "  ✗ $*" >&2; FAIL=1; }

[[ -f "$FACTS" ]] || { echo "✗ facts.conf 缺失" >&2; exit 1; }
# shellcheck disable=SC1090
. "$FACTS"

for k in FACT_ENGINE_CODE_LOC_MAX FACT_FRAMEWORK_GATE_LOC_MAX; do
  eval "v=\${$k:-}"
  if [[ -n "$v" && "$v" -gt 0 ]]; then ok "$k=$v"; else bad "$k 缺失或非正数"; fi
done

eng=$( { cat "$BASE/assets/precheck.sh" "$BASE/assets/gates/_lib.sh" "$BASE"/assets/gates/*/*.sh; } 2>/dev/null | wc -l | tr -d ' ')
fw=$(cat "$BASE"/assets/framework-gates/*.sh 2>/dev/null | wc -l | tr -d ' ')
eng=${eng:-0}; fw=${fw:-0}

if [[ "${FACT_ENGINE_CODE_LOC_MAX:-0}" -gt 0 && "$eng" -le "$FACT_ENGINE_CODE_LOC_MAX" ]]; then
  ok "引擎域源代码 $eng ≤ ${FACT_ENGINE_CODE_LOC_MAX}"
else
  bad "引擎域源代码 $eng > ${FACT_ENGINE_CODE_LOC_MAX:-0}（新增代码须等额删减或登记预算）"
fi
if [[ "${FACT_FRAMEWORK_GATE_LOC_MAX:-0}" -gt 0 && "$fw" -le "$FACT_FRAMEWORK_GATE_LOC_MAX" ]]; then
  ok "框架门禁注入代码 $fw ≤ ${FACT_FRAMEWORK_GATE_LOC_MAX}"
else
  bad "框架门禁注入代码 $fw > ${FACT_FRAMEWORK_GATE_LOC_MAX:-0}（新增代码须等额删减或登记预算）"
fi

if grep -q 'FACT_ENGINE_CODE_LOC_MAX' "$BASE/scripts/self-check.sh" \
   && grep -q 'FACT_FRAMEWORK_GATE_LOC_MAX' "$BASE/scripts/self-check.sh"; then
  ok "self-check 消费两个预算键"
else
  bad "self-check 未消费预算键（声明无执行面）"
fi

echo "test-execution-surface-budget: $([[ $FAIL -eq 0 ]] && echo PASS || echo FAIL)"
[ "$FAIL" -eq 0 ]
