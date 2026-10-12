#!/bin/bash
# tri-disp-backfill.test.sh — DISP 三态归桶收尾件守门（run15 复盘 N2 / V8.17 纪律 43 配套）。
# 夹具=run15 真实台账形态抽样（精确配对/泛指广播/悬挂 DISP/已是三态四种形态各一）。
# 断言：①表外键补观察桶行 ②幂等重跑不重复 ③已修禁自动升桶（归桶行全为观察）。
set -euo pipefail
LC_ALL=C
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/runs/tri-disp-test/evidence"
cp "$HERE/tests/fixtures/tri-disp-issues.log" "$T/runs/tri-disp-test/evidence/issues.log"
export AIPAY_SIM_ROOT="$T"

python3 "$HERE/mux/tri-disp-backfill.py" --run tri-disp-test >/dev/null
N1=$(grep -c '观察（收尾归桶' "$T/runs/tri-disp-test/evidence/issues.log")
[ "$N1" -eq 2 ] || { echo "FAIL: 期望归桶 2 键（receipt 精确+wake 精确），得 $N1"; exit 1; }

python3 "$HERE/mux/tri-disp-backfill.py" --run tri-disp-test >/dev/null
N2=$(grep -c '观察（收尾归桶' "$T/runs/tri-disp-test/evidence/issues.log")
[ "$N2" -eq "$N1" ] || { echo "FAIL: 幂等破坏（$N1 -> $N2）"; exit 1; }

if grep -qE '^DISP\|[^|]+\|[^|]+\|已修（收尾归桶' "$T/runs/tri-disp-test/evidence/issues.log"; then
  echo "FAIL: 归桶件出现自动升桶（已修桶）——纪律 28 禁"; exit 1
fi

echo "PASS tri-disp-backfill（归桶 $N1 键 / 幂等 / 零自动升桶）"
