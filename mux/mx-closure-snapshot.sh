#!/bin/bash
# mx-closure-snapshot.sh — V8.46 治理闭环证据快照（单一入口，fail-soft）
#
# 定位：run22 起，产品侧 2026-10-18/19 落地的治理闭环能力（评审治理/观测告警/
# 改进实验/发布门与 UAT 台账）不再只存在于 UI，而由本脚本在复盘段一次性落成
# evidence/governance-closure/*.json，供报告「证据九」与审计查 16 消费。
#
# 设计约束：
#   1. 只读端点，不写业务状态；台账写入在驱动步 20/21 完成（release-gate/uat-verdict）。
#   2. fail-soft：单个端点失败只记入 summary.failed，不让复盘段失败——
#      报告侧按缺席如实呈现，不把「端点没起」伪装成「治理闭环通过」。
#   3. 数字单一来源：本脚本只搬运产品响应，不在 harness 侧二次计算。
#
# 用法：
#   bash mux/mx-closure-snapshot.sh --run <RUN_ID> [--out <dir>] [--token <jwt>] [--eval-run <id>]
# 输出：
#   <out>/summary.json + 每个端点一份 <name>.json；退出码 0=脚本执行完成（即使有端点失败）
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
RUN_ID=""; OUT=""; TOK="${MX_JWT:-}"; EVAL_RUN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --run) RUN_ID="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    --token) TOK="${2:-}"; shift 2 ;;
    --eval-run) EVAL_RUN="${2:-}"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done
if [[ -z "$RUN_ID" ]]; then echo "用法: $0 --run <RUN_ID> [--out <dir>] [--token <jwt>]" >&2; exit 2; fi

# shellcheck source=mx-lib.sh
source "$HERE/mux/mx-lib.sh"

OUT="${OUT:-$SIM_ROOT/runs/$RUN_ID/evidence/governance-closure}"
mkdir -p "$OUT"
if [[ -z "$TOK" ]]; then
  TOK=$(studio_login 2>/dev/null || true)
fi
if [[ -z "$TOK" ]]; then
  printf '{"run":"%s","ok":0,"failed":["studio-login"],"note":"无法取得 JWT，治理闭环端点未探测"}\n' "$RUN_ID" > "$OUT/summary.json"
  echo "[closure] JWT 不可用——快照未采集（如实记缺口）"
  exit 0
fi

ok=0; failed=()
fetch() { # <name> <path>
  local name="$1" path="$2" file="$OUT/$1.json"
  if studio GET "$path" "$TOK" > "$file" 2>/dev/null && [[ -s "$file" ]]; then
    ok=$((ok+1))
    echo "  ✓ $name"
  else
    rm -f "$file"
    failed+=("$name")
    echo "  ✗ ${name}（${path}）"
  fi
}

echo "[closure] 采集治理结果端点（run=${RUN_ID}）"
fetch obs-signals "/api/harness/obs-signals?days=7"
fetch obs-alerts "/api/harness/obs-alerts?days=7"
fetch tool-audit "/api/harness/tool-audit?days=7"
fetch workbench-overview "/api/harness/workbench/overview"
fetch workbench-experiences "/api/harness/workbench/experiences"
fetch reviewgov-metrics "/api/review/gov/metrics"
fetch reviewgov-nightly "/api/review/gov/nightly/latest"
fetch release-gate "/api/hermes/sim/release-gate?run=${RUN_ID}"
fetch uat-verdicts "/api/hermes/sim/uat-verdicts?run=${RUN_ID}"
[[ -n "$EVAL_RUN" ]] && fetch eval-remediations "/api/hermes/eval/remediations?runId=${EVAL_RUN}"

# 本地台账（驱动步 20/21 写入）与端点读数互证：端点缺席时台账仍可作为证据锚。
rg_file="$SIM_ROOT/runs/$RUN_ID/evidence/release-gate.jsonl"
uv_file="$SIM_ROOT/runs/$RUN_ID/evidence/uat-verdicts.jsonl"
rg_n=0; uv_n=0
[[ -f "$rg_file" ]] && rg_n=$(grep -c . "$rg_file" 2>/dev/null || echo 0)
[[ -f "$uv_file" ]] && uv_n=$(grep -c . "$uv_file" 2>/dev/null || echo 0)

python3 - "$OUT/summary.json" "$RUN_ID" "$ok" "${#failed[@]}" "$rg_n" "$uv_n" "${failed[*]:-}" <<'PY'
import json, sys, time
out, run, ok, failed_n, rg_n, uv_n, failed = sys.argv[1:8]
data = {
    'run': run,
    'generatedAt': int(time.time()),
    'ok': int(ok),
    'failedCount': int(failed_n),
    'failed': [x for x in failed.split() if x],
    'ledgers': {
        'releaseGateRecords': int(rg_n),
        'uatVerdictRecords': int(uv_n),
    },
    'note': '端点失败=如实缺口（报告证据九按缺席呈现）；台账计数来自 evidence/*.jsonl',
}
with open(out, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2)
    fh.write('\n')
PY
echo "[closure] 快照完成：ok=$ok failed=${#failed[@]} release-gate=${rg_n} uat-verdicts=${uv_n} → $OUT/summary.json"
exit 0
