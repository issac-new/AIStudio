#!/usr/bin/env bash
# to-sarif.sh —— 把 precheck.sh --format json 输出转换为 SARIF 2.1.0 合规 JSON
# 用法: bash precheck.sh --format json --all-full | bash scripts/to-sarif.sh > report.sarif
#   或: GATE_JSON_OUT=report.json bash precheck.sh --format json --all-full; bash scripts/to-sarif.sh < report.json > report.sarif
# SARIF 2.1.0（OASIS Standard 2020-03-27）；rules 元数据从 standards-map.conf 取 CWE/条款
# 依赖：bash + python3（三平台 CI 均预装）
set -u
SY_BASE="$(cd "$(dirname "$0")/.." && pwd)"
SMAP="${SY_BASE}/assets/standards-map.conf"

# Read stdin to temp file (heredoc consumes stdin for python script)
_input=$(cat)
_tmpfile="$(mktemp "${TMPDIR:-/tmp}/sarif-in.XXXXXX")"
printf '%s\n' "$_input" > "$_tmpfile"

python3 - "$SMAP" "$_tmpfile" <<'PYEOF'
import sys, json

smap_path = sys.argv[1]
input_path = sys.argv[2]

# Read and parse precheck JSON
with open(input_path) as f:
    raw = f.read()

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    # precheck may print text before JSON; find the JSON line
    for line in raw.split('\n'):
        line = line.strip()
        if line.startswith('{') and '"version"' in line:
            try:
                data = json.loads(line)
                break
            except:
                continue
    else:
        sys.stderr.write("✗ 无法从输入中解析 precheck JSON\n")
        sys.exit(1)

# Build rules from standards-map.conf
rules = []
try:
    with open(smap_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = [p.strip() for p in line.split('|')]
            if len(parts) != 5:
                continue
            rid, cwe, gb, asvs, conf = parts
            if rid == '—' or not rid:
                continue
            props = {}
            if cwe and cwe != '—':
                props['tags'] = [cwe]
            if gb and gb != '—':
                props['standard'] = gb
            rule = {"id": rid}
            if props:
                rule['properties'] = props
            rules.append(rule)
except FileNotFoundError:
    pass

# Map precheck results to SARIF results
level_map = {"fail": "error", "warn": "warning", "pass": "note", "skip": "none"}
sarif_results = []
runs = data.get("runs", [])
for run in runs:
    skipped = run.get("tool", {}).get("driver", {}).get("properties", {}).get("skipped", [])
    for result in run.get("results", []):
        gate = result.get("gate", "unknown")
        status = result.get("status", "skip")
        ids = result.get("ids", [])
        level = level_map.get(status, "note")
        msg_text = f"{gate}: {status}"
        if ids:
            msg_text += f" ids: {', '.join(ids)}"
        sarif_results.append({
            "ruleId": gate,
            "level": level,
            "message": {"text": msg_text},
            "locations": [{
                "logicalLocations": [{
                    "name": gate,
                    "kind": "function"
                }]
            }]
        })

# Assemble SARIF 2.1.0
sarif = {
    "version": "2.1.0",
    "$schema": "https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/schemas/sarif-schema-2.1.0.json",
    "runs": [{
        "tool": {
            "driver": {
                "name": "swarm-yuan precheck.sh",
                "rules": rules,
                "properties": {
                    "skipped": skipped
                }
            }
        },
        "results": sarif_results
    }]
}
print(json.dumps(sarif, ensure_ascii=False))
PYEOF
rc=$?
rm -f "$_tmpfile"
exit $rc
