#!/usr/bin/env python3
"""fp_match.py — agentic 工具指纹类别匹配器（纯检测分析，零攻击内容）"""
import argparse, json, os, sys

DEFAULT_RULES = {
    "strong": {
        "selfupdate_ua": {"field": "ua", "patterns": ["artex-selfupdate", "artex-enrich"],
                          "last_verified": "2026-10-13", "source": "selfupdate/github.go:101"},
        "console_title": {"field": "title", "patterns": ["Autonomous Penetration Testing Console"],
                          "last_verified": "2026-10-13", "source": "web/src/config/app-config.ts:10"},
    },
    "weak": {
        "default_ports": {"field": "port", "values": [8787, 8788], "pair_mode": True,
                          "last_verified": "2026-10-13", "source": "cmd/artex/main.go:55-57"},
        "custom_session_header": {"field": "header_names", "patterns": ["x-session-key", "x-session-id"],
                                  "last_verified": "2026-10-13", "source": "agent/provider.go:79-86 模式"},
        "relay_domain": {"field": "domain", "patterns": [], "note": "事件实证域名入库需人工确认",
                         "last_verified": "2026-10-13"},
    },
}

def match_event(ev, rules):
    hits_strong, hits_weak = [], []
    for cat, rule in rules["strong"].items():
        v = str(ev.get(rule["field"], "")).lower()
        if any(p.lower() in v for p in rule.get("patterns", [])) or \
           (ev.get(rule["field"]) in rule.get("values", [])):
            hits_strong.append(cat)
    for cat, rule in rules["weak"].items():
        if "values" in rule and rule.get("field") == "port":
            if ev.get("port") in rule["values"]:
                hits_weak.append(cat)
            continue
        v = ev.get(rule["field"])
        if isinstance(v, list):
            names = [str(x).lower() for x in v]
            if any(p.lower() in n for p in rule.get("patterns", []) for n in names):
                hits_weak.append(cat)
        elif v is not None:
            s = str(v).lower()
            if any(p.lower() in s for p in rule.get("patterns", [])):
                hits_weak.append(cat)
    if hits_strong:
        return {"verdict": "match-strong", "hits": hits_strong}
    if len(set(hits_weak)) >= 2:
        return {"verdict": "match-cross", "hits": hits_weak}
    if hits_weak:
        return {"verdict": "below-threshold", "hits": hits_weak}
    return {"verdict": "clean", "hits": []}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", type=argparse.FileType("r"))
    ap.add_argument("--rules", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "rules.json"))
    ap.add_argument("--emit-default-rules", action="store_true")
    a = ap.parse_args()
    if a.emit_default_rules:
        print(json.dumps(DEFAULT_RULES, ensure_ascii=False, indent=2))
        return 0
    if not a.events:
        print("BLOCKED: 需要 --events 或 --emit-default-rules", file=sys.stderr)
        return 1
    rules = json.load(open(a.rules)) if os.path.exists(a.rules) else DEFAULT_RULES
    for line in a.events:
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        m = match_event(r, rules)
        print(json.dumps({"event": r.get("event_id", ""), "verdict": m["verdict"], "hits": m["hits"]},
                         ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
