#!/bin/bash
# mx-interventions 守门（2026-10-23，天猫联动批）：口径正反例——六类打标/两层分账/
# auto-approve 不计/坏字节容错/缺席 run 非零退出。与 8647 端点对账口径=spec D1-D3。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(mktemp -d /tmp/mx-interv-test.XXXXXX)"
trap 'rm -rf "$ROOT"' EXIT
RUN="$ROOT/runs/r1/evidence"
mkdir -p "$RUN"

printf 'id\tts\ttype\tdefect\tdetail\tstatus\tresolution\n' > "$RUN/compensation-ledger.tsv"
printf 'a1\t2026-10-21 10:00:00\tdispatch-preset\tPR-1\tfrom=qi text=支付渠道收银台\topen\t\n' >> "$RUN/compensation-ledger.tsv"
printf 'a2\t2026-10-21 10:30:00\tdispatch-preset\tPR-1\tfrom=qi text=补充口径\topen\t\n' >> "$RUN/compensation-ledger.tsv"
printf 'a3\t2026-10-21 11:00:00\tdispatch-preset\tPR-2\tbackfill raci\topen\t\n' >> "$RUN/compensation-ledger.tsv"
printf 'a4\t2026-10-21 12:00:00\tnudge\tPR-3\tagents=qi desc=空转轻推\topen\t\n' >> "$RUN/compensation-ledger.tsv"
printf 'a5\t2026-10-21 12:30:00\tcard-backfill\tPR-4\t补登记\topen\t\n' >> "$RUN/compensation-ledger.tsv"
printf 'a6\t2026-10-21 13:00:00\tauto-approve\tPR-5\tauto\topen\t\n' >> "$RUN/compensation-ledger.tsv"
# 坏字节行（errors=replace 容错验证：0xe9 独立字节）
printf 'a7\t2026-10-21 13:30:00\tdispatch-preset\tPR-6\tfrom=hu text=\xe9\x94\x99\topen\t\n' >> "$RUN/compensation-ledger.tsv"
printf '{"ts":"2026-10-21T16:00:00Z","actor":"admin","decision":"approve"}\n{"ts":"2026-10-21T16:30:00Z","actor":"admin","action":"reject"}\n' > "$RUN/release-gate.jsonl"
printf '{"ts":"2026-10-21T17:00:00Z","actor":"admin","ac":"AC-1","verdict":"pass"}\n' > "$RUN/uat-verdicts.jsonl"

SIM_ROOT="$ROOT" "$HERE/../mux/mx-interventions.py" --run r1 --json > /tmp/mx-interv-out.json
python3 - <<'PY'
import json
d = json.load(open("/tmp/mx-interv-out.json")); s = d["stats"]
# 台账 6 介入（auto-approve 不计）+ gate 2 + uat 1 = 9
assert s["total"] == 9, s["total"]
assert s["byLayer"] == {"collab": 4, "delivery": 5}, s["byLayer"]
assert s["byType"] == {"raise": 2, "context": 2, "nudge": 1, "unblock": 1,
                       "confirm": 2, "rework": 1}, s["byType"]
assert s["autoApprove"] == 1
assert s["riskSignals"][0]["id"] == "context-gap" and not s["riskSignals"][0]["hit"]
assert s["riskSignals"][1]["id"] == "misunderstanding" and not s["riskSignals"][1]["hit"]
# 坏字节行存活（a7 → raise，actor=hu）
a7 = [e for e in d["entries"] if e["anchor"] == "a7"]
assert a7 and a7[0]["type"] == "raise" and a7[0]["actor"] == "hu", d["entries"][:3]
print("OK mx-interventions 口径守门 9/六类/两层/容错")
PY

# 缺席 run 非零退出（fail 如实）
if SIM_ROOT="$ROOT" "$HERE/../mux/mx-interventions.py" --run no-such 2>/dev/null; then
  echo "FAIL: 缺席 run 应非零退出"; exit 1
fi
echo "OK 缺席 run 非零退出"
