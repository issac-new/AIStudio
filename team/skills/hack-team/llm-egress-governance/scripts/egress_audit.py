#!/usr/bin/env python3
"""egress_audit.py — LLM 出口审计（配置清单 + 录制流量，离线判定，零主动探测）"""
import argparse, json, os, sys

DEFAULT_WHITELIST = [
    "api.openai.com", "api.anthropic.com", "api.deepseek.com",
    "api.moonshot.cn", "api.moonshot.ai", "api.mistral.ai",
    "generativelanguage.googleapis.com",
    "openai.app.msh.team",  # cc-switch 本地代理
    "localhost", "127.0.0.1", "::1",
]

def host_of(url):
    s = url.split("://", 1)[-1].split("/")[0].split(":")[0]
    return s.lower()

def judge(base_url, proxy, extra_headers, whitelist):
    """返回 (verdict, reasons)"""
    reasons = []
    host = host_of(base_url) if base_url else ""
    local_proxy = proxy and ("127.0.0.1" in proxy or "localhost" in proxy)
    d1 = host and host not in whitelist
    d3 = bool(proxy) and not local_proxy
    d2_headers = any(h.lower().startswith("x-session") for h in (extra_headers or []))
    if d1:
        reasons.append(f"D1 nonstandard base_url={host}")
    if d2_headers:
        reasons.append("D2 custom session header")
    if d3:
        reasons.append(f"D3 standalone proxy={proxy}")
    if d1 and (d2_headers or d3):
        return "egress-relay-suspect", reasons
    if d1:
        return "egress-nonstandard", reasons
    if d2_headers:
        return "watch", reasons
    if d3:
        return "watch", reasons
    return "clean", reasons

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    default_rules = os.path.join(here, "rules.json")
    ap = argparse.ArgumentParser()
    ap.add_argument("--inventory", type=argparse.FileType("r"), help="主机配置清单 JSONL")
    ap.add_argument("--traffic", type=argparse.FileType("r"), help="代理日志 JSONL")
    ap.add_argument("--rules", default=default_rules if os.path.exists(default_rules) else None)
    ap.add_argument("--emit-default-rules", action="store_true")
    a = ap.parse_args()
    if a.emit_default_rules:
        print(json.dumps({"whitelist": DEFAULT_WHITELIST}, ensure_ascii=False, indent=2))
        return 0
    if not a.inventory and not a.traffic:
        print("BLOCKED: 需要 --inventory / --traffic / --emit-default-rules", file=sys.stderr)
        return 1
    whitelist = DEFAULT_WHITELIST
    if a.rules and os.path.exists(a.rules):
        whitelist = json.load(open(a.rules)).get("whitelist", DEFAULT_WHITELIST)
    def audit(rec, source_field):
        verdict, reasons = judge(rec.get("base_url", ""), rec.get("proxy", ""),
                                 rec.get("extra_headers", []), whitelist)
        return {"id": rec.get(source_field, ""), "verdict": verdict, "reasons": reasons}
    for fh in (a.inventory, a.traffic):
        if not fh:
            continue
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            r = audit(rec, "host" if fh is a.inventory else "event_id")
            print(json.dumps(r, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
