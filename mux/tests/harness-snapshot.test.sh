#!/bin/bash
# harness-snapshot.test.sh — mx-harness-snapshot.sh 守门（V8.42）
# 覆盖：六端点全可用→快照 JSON 汇总正确；--require 全绿=0；端点全缺席→快照仍落盘且 exit 1。
set -u
LC_ALL=C
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$HERE/mux/mx-harness-snapshot.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/mx-harness-test.XXXXXX")"
SRV_PID=""
cleanup() { [[ -n "$SRV_PID" ]] && kill "$SRV_PID" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

bash -n "$SCRIPT" || fail "脚本语法坏"

PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
cat > "$TMP/mock.py" <<'PY'
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
PORT = int(sys.argv[1])
BODIES = {
    "/api/harness/nine-layers": {"ok": True, "counts": {"covered": 4, "partial": 4, "missing": 1}, "layers": []},
    "/api/harness/process-quality": {"ok": True, "metrics": {"runs": 2, "toolCalls": 10, "failedCalls": 1,
        "duplicateCallRate": 0.1, "toolFailureRate": 0.1, "longChainRate": 0.5,
        "firstPassSuccessRate": 0.5, "specComplianceRate": 0.8}, "steps": {}, "qgate": {}, "notes": []},
    "/api/harness/policy-decisions": {"ok": True, "total": 3, "byOutcome": {"allow": 2, "deny": 1}, "entries": []},
    "/api/harness/run-manifests": {"ok": True, "total": 1, "entries": [{"cost": {"priced": True, "costIdleUsd": 0.01}}]},
    "/api/harness/budget-status": {"ok": True, "status": {"action": "allow", "spentUsd": 0.01, "limitUsd": 5, "enforce": True}},
    "/api/harness/sandbox/leases": {"ok": True, "leases": [{"expiresAt": 9999999999999}]},
}
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        body = BODIES.get(path)
        if body is None:
            self.send_response(404); self.end_headers(); self.wfile.write(b'{"ok":false}')
            return
        raw = json.dumps(body).encode()
        self.send_response(200); self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", PORT), H).serve_forever()
PY
python3 "$TMP/mock.py" "$PORT" >/dev/null 2>&1 &
SRV_PID=$!
for _ in $(seq 1 30); do
  curl -sf -m 1 "http://127.0.0.1:$PORT/api/harness/nine-layers" >/dev/null 2>&1 && break
  sleep 0.2
done

OUT="$TMP/harness-summary.json"
bash "$SCRIPT" --out "$OUT" --studio "http://127.0.0.1:$PORT" >/dev/null 2>&1 || fail "全端点可用时应 exit 0"
[[ -f "$OUT" && -f "$TMP/harness-summary.md" ]] || fail "JSON/MD 快照未落盘"
python3 - "$OUT" <<'PY' || exit 1
import json, sys
d = json.load(open(sys.argv[1]))
s = d["summary"]
assert d["endpoints"]["nineLayers"]["ok"] is True
assert s["layers"]["covered"] == 4 and s["layers"]["missing"] == 1
assert abs(s["processQuality"]["specComplianceRate"] - 0.8) < 1e-9
assert s["policy"] == {"total": 3, "allow": 2, "deny": 1}
assert s["manifests"]["total"] == 1 and abs(s["manifests"]["spendUsd"] - 0.01) < 1e-9
assert s["budget"]["action"] == "allow" and s["budget"]["enforce"] is True
assert s["sandbox"] == {"leases": 1, "expired": 0}
PY

bash "$SCRIPT" --out "$TMP/req.json" --studio "http://127.0.0.1:$PORT" --require >/dev/null 2>&1 || fail "--require 全绿应 exit 0"

kill "$SRV_PID" 2>/dev/null; SRV_PID=""
sleep 0.3
set +e
bash "$SCRIPT" --out "$TMP/dead.json" --studio "http://127.0.0.1:$PORT" --require >/dev/null 2>&1
RC=$?
set -e
[[ "$RC" -eq 1 ]] || fail "端点全缺席 --require 应 exit 1（实际 $RC）"
[[ -f "$TMP/dead.json" ]] || fail "缺席时也应落盘快照（如实标 ok=false）"
python3 - "$TMP/dead.json" <<'PY' || exit 1
import json, sys
d = json.load(open(sys.argv[1]))
assert all(ep["ok"] is False for ep in d["endpoints"].values())
assert d["summary"]["layers"]["covered"] is None
PY

echo "PASS harness-snapshot"
