#!/bin/bash
# mx-harness-snapshot.sh — Harness 运行底座快照（V8.42，2026-10-18）
#
# 用途：把产品侧九层运行面（九层体检/过程质量/执法决策/运行清单/预算/沙箱租约）
# 固化成一份 JSON + 一份人读 Markdown，供推演证据归档与报告第 9 章引用。
#
# 用法：
#   bash mux/mx-harness-snapshot.sh --out <dir>/harness-summary.json [--token <jwt>] [--require]
#   缺省 studio=http://127.0.0.1:8802（MX_HARNESS_STUDIO 可覆写）；token 也可用 MX_HARNESS_TOKEN。
#
# 语义：
#   - 默认 fail-soft：端点缺席如实标 ok=false，不中断推演，仍写快照。
#   - --require：任一端点非 200/ok!=true 即退出 1（prelaunch 用）。
set -u
LC_ALL=C

HERE="$(cd "$(dirname "$0")/.." && pwd)"
STUDIO="${MX_HARNESS_STUDIO:-http://127.0.0.1:${MX_STUDIO_PORT:-8802}}"
TOKEN="${MX_HARNESS_TOKEN:-}"
OUT=""
REQUIRE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="${2:-}"; shift 2 ;;
    --studio) STUDIO="${2:-}"; shift 2 ;;
    --token) TOKEN="${2:-}"; shift 2 ;;
    --require) REQUIRE=1; shift ;;
    *) echo "[harness] 未知参数：$1" >&2; exit 2 ;;
  esac
done

if [[ -z "$OUT" ]]; then
  echo "[harness] 缺 --out <file>" >&2
  exit 2
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/mx-harness.XXXXXX")" || exit 2
trap 'rm -rf "$TMP"' EXIT

AUTH=()
[[ -n "$TOKEN" ]] && AUTH=(-H "Authorization: Bearer ${TOKEN}")

# 名称|路径（顺序即报告展示顺序）
ENDPOINTS=(
  "nineLayers|/api/harness/nine-layers?days=7"
  "processQuality|/api/harness/process-quality?days=7"
  "policyDecisions|/api/harness/policy-decisions?days=7&limit=1"
  "runManifests|/api/harness/run-manifests?days=7&limit=1"
  "budgetStatus|/api/harness/budget-status"
  "sandboxLeases|/api/harness/sandbox/leases"
)

for entry in "${ENDPOINTS[@]}"; do
  name="${entry%%|*}"
  path="${entry#*|}"
  code="$(curl -sS -m 8 -o "$TMP/${name}.json" -w '%{http_code}' \
    ${AUTH[@]+"${AUTH[@]}"} "${STUDIO}${path}" 2>/dev/null || echo 000)"
  printf '%s' "$code" > "$TMP/${name}.code"
done

mkdir -p "$(dirname "$OUT")"
python3 - "$TMP" "$OUT" "$STUDIO" "${MX_RUN_ID:-${RUN_ID:-}}" "$REQUIRE" <<'PY'
import json, os, sys, time
from pathlib import Path

tmp = Path(sys.argv[1]); out = Path(sys.argv[2]); studio = sys.argv[3]; run_id = sys.argv[4]; require = sys.argv[5] == "1"
names = ["nineLayers", "processQuality", "policyDecisions", "runManifests", "budgetStatus", "sandboxLeases"]
labels = {
    "nineLayers": "九层运行体检", "processQuality": "过程质量", "policyDecisions": "执法决策账",
    "runManifests": "运行清单", "budgetStatus": "预算状态", "sandboxLeases": "沙箱租约",
}

def load(name):
    code_path = tmp / f"{name}.code"
    body_path = tmp / f"{name}.json"
    code = 0
    try:
        code = int((code_path.read_text() or "0").strip())
    except Exception:
        code = 0
    data = None
    try:
        data = json.loads(body_path.read_text(encoding="utf-8", errors="replace") or "null")
    except Exception:
        data = None
    ok = code == 200 and isinstance(data, dict) and data.get("ok") is True
    return {"status": code, "ok": ok, "data": data if ok else None,
            "error": None if ok else (f"HTTP {code}" if code != 200 else "ok!=true/非法 JSON")}

endpoints = {n: load(n) for n in names}
summary = {}
try:
    d = endpoints["nineLayers"]["data"] or {}
    summary["layers"] = d.get("counts") or {"covered": None, "partial": None, "missing": None}
except Exception:
    summary["layers"] = {"covered": None, "partial": None, "missing": None}
try:
    m = (endpoints["processQuality"]["data"] or {}).get("metrics") or {}
    summary["processQuality"] = {k: m.get(k) for k in
        ("runs", "toolCalls", "failedCalls", "duplicateCallRate", "toolFailureRate",
         "longChainRate", "firstPassSuccessRate", "specComplianceRate")}
except Exception:
    summary["processQuality"] = {}
try:
    d = endpoints["policyDecisions"]["data"] or {}
    summary["policy"] = {"total": d.get("total"), "allow": (d.get("byOutcome") or {}).get("allow"),
                         "deny": (d.get("byOutcome") or {}).get("deny")}
except Exception:
    summary["policy"] = {"total": None, "allow": None, "deny": None}
try:
    d = endpoints["runManifests"]["data"] or {}
    entries = d.get("entries") or []
    priced = [e for e in entries if (e.get("cost") or {}).get("priced")]
    spend = sum(float((e.get("cost") or {}).get("costIdleUsd") or 0) for e in entries)
    summary["manifests"] = {"total": d.get("total"), "sampled": len(entries),
                            "priced": len(priced), "spendUsd": round(spend, 6)}
except Exception:
    summary["manifests"] = {"total": None, "sampled": None, "priced": None, "spendUsd": None}
try:
    s = (endpoints["budgetStatus"]["data"] or {}).get("status") or {}
    summary["budget"] = {"action": s.get("action"), "spentUsd": s.get("spentUsd"),
                         "limitUsd": s.get("limitUsd"), "enforce": s.get("enforce")}
except Exception:
    summary["budget"] = {"action": None, "spentUsd": None, "limitUsd": None, "enforce": None}
try:
    leases = (endpoints["sandboxLeases"]["data"] or {}).get("leases") or []
    now = time.time() * 1000
    expired = [l for l in leases if isinstance(l, dict) and isinstance(l.get("expiresAt"), (int, float)) and l["expiresAt"] <= now]
    summary["sandbox"] = {"leases": len(leases), "expired": len(expired)}
except Exception:
    summary["sandbox"] = {"leases": None, "expired": None}

report = {
    "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    "runId": run_id or None,
    "studio": studio,
    "endpoints": endpoints,
    "summary": summary,
}
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

# 人读摘要（报告第 9 章优先引用本文件；缺席时由报告侧如实标未采集）
def val(v, kind="raw"):
    if v is None:
        return "—"
    if kind == "pct" and isinstance(v, (int, float)):
        return f"{v * 100:.1f}%"
    if kind == "usd" and isinstance(v, (int, float)):
        return f"${v:.4f}"
    return str(v)

md = [
    f"# Harness 运行面快照（{report['generatedAt']}）",
    "",
    f"- runId：{run_id or '（未提供）'}",
    f"- studio：{studio}",
    "",
    "| 端点 | 状态 | 关键读数 |",
    "|---|---|---|",
]
rows = [
    ("九层运行体检", endpoints["nineLayers"], f"覆盖 {val(summary['layers'].get('covered'))} / 部分 {val(summary['layers'].get('partial'))} / 缺失 {val(summary['layers'].get('missing'))}"),
    ("过程质量", endpoints["processQuality"], f"重复率 {val(summary['processQuality'].get('duplicateCallRate'), 'pct')} · 失败率 {val(summary['processQuality'].get('toolFailureRate'), 'pct')} · 首过 {val(summary['processQuality'].get('firstPassSuccessRate'), 'pct')} · 规范符合 {val(summary['processQuality'].get('specComplianceRate'), 'pct')}"),
    ("执法决策账", endpoints["policyDecisions"], f"放行 {val(summary['policy'].get('allow'))} / 拒绝 {val(summary['policy'].get('deny'))}（窗口内 {val(summary['policy'].get('total'))}）"),
    ("运行清单", endpoints["runManifests"], f"{val(summary['manifests'].get('total'))} 条 · 已定价 {val(summary['manifests'].get('priced'))} · 估算 {val(summary['manifests'].get('spendUsd'), 'usd')}"),
    ("预算状态", endpoints["budgetStatus"], f"动作 {val(summary['budget'].get('action'))} · 支出 {val(summary['budget'].get('spentUsd'), 'usd')} / 限额 {val(summary['budget'].get('limitUsd'), 'usd')} · 执法 {val(summary['budget'].get('enforce'))}"),
    ("沙箱租约", endpoints["sandboxLeases"], f"租约 {val(summary['sandbox'].get('leases'))} · 已过期 {val(summary['sandbox'].get('expired'))}"),
]
for label, ep, reading in rows:
    status = "✅" if ep["ok"] else f"⬜ {ep['error']}"
    md.append(f"| {label} | {status} | {reading} |")
md += ["", "> 数据源：产品 `/api/harness/*` 只读端点；缺席如实标 ⬜，不造数。"]
(out.parent / "harness-summary.md").write_text("\n".join(md) + "\n", encoding="utf-8")

missing = [labels[n] for n in names if not endpoints[n]["ok"]]
print(f"[harness] {len(names) - len(missing)}/{len(names)} 端点可用 → {out}")
if missing:
    print(f"[harness] 缺：{'、'.join(missing)}")
sys.exit(1 if (len(missing) > 0 and require) else 0)
PY
rc=$?
if [[ "$REQUIRE" -eq 1 && "$rc" -ne 0 ]]; then
  echo "[harness] --require：存在不可用端点（见上）" >&2
  exit 1
fi
exit 0
