#!/usr/bin/env python3
"""fp_match.py — agentic 工具指纹类别匹配器（纯检测分析，零攻击内容）"""
import argparse, json, os, sys

DEFAULT_RULES = {
    "strong": {
        "selfupdate_ua": {"field": "ua", "patterns": ["artex-selfupdate", "artex-enrich"],
                          "last_verified": "2026-10-13", "source": "selfupdate/github.go:101"},
        "console_title": {"field": "title", "patterns": ["Autonomous Penetration Testing Console"],
                          "last_verified": "2026-10-13", "source": "web/src/config/app-config.ts:10"},
        "tls_default_cert": {"field": "tls_cert_issuer", "patterns": ["pentagi ca"], "last_verified": "2026-11-19", "source": "PentAGI 默认自签 CA ssl.cert.issuer.cn:\"PentAGI CA\"（Shodan 240 命中）；GitGuardian 45 框架普查（FreeBuf 511701 转述，数据锚 2026-11-07，二手未回源）"},
    },
    "weak": {
        "default_ports": {"field": "port", "values": [8787, 8788, 8790, 9137, 5080, 50080, 3333], "pair_mode": True,
                          "last_verified": "2026-11-19", "source": "cmd/artex/main.go:55-57 源码默认；Censys 2026-11-05 公网实测 8787→8790→443→80；v1.7.0 增 Xalgorix:9137/Agent Zero:5080,50080/T3MP3ST:3333（GitGuardian 普查）"},
        "custom_session_header": {"field": "header_names", "patterns": ["x-session-key", "x-session-id"],
                                  "last_verified": "2026-10-13", "source": "agent/provider.go:79-86 模式"},
        "relay_domain": {"field": "domain", "patterns": [], "note": "事件实证域名入库需人工确认",
                         "last_verified": "2026-10-13"},
        "console_title_prefix": {"field": "title", "patterns": ["artex", "scopeweaver"], "prefix_sep": True,
                                 "last_verified": "2026-11-15", "source": "Censys ^ARTEX[ :—] 前缀锚定；ScopeWeaver rebrand"},
        "next_static_asset": {"field": "path", "patterns": ["_next/static"],
                              "last_verified": "2026-11-15", "source": "Censys Next.js 控制台静态资源指纹"},
        "family_console_title": {"field": "title",
                                 "patterns": ["pentagi", "agent zero", "xalgorix", "decepticon", "redcell",
                                              "redamon", "t3mp3st", "incalmo", "cyberstrike", "forang",
                                              "pentestcode", "pentest-swarm", "鸾鸟", "月落", "nebula 3",
                                              "pentest-ai · dashboard", "mergen — arsenal"],
                                 "last_verified": "2026-11-19", "source": "GitGuardian 普查/FreeBuf 511701"},
        "family_favicon_hash": {"field": "favicon_hash",
                                "patterns": ["-1596753120", "964522141", "248472114", "-566184040",
                                             "-1814445533", "-196523122"],
                                "last_verified": "2026-11-19", "source": "GitGuardian 普查/FreeBuf 511701"},
        "console_html_snippet": {"field": "body",
                                 "patterns": ["console for an llm-driven autonomous penetration testing system",
                                              "autonomous red team platform",
                                              "security reconnaissance and vulnerability assessment dashboard",
                                              "xalgorix.theme", "rc-theme", "cyber-theme",
                                              "incalmo c2 server api"],
                                 "last_verified": "2026-11-19", "source": "GitGuardian 普查/FreeBuf 511701"},
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
        seps = rule.get("prefix_seps", [" ", ":", "—", "-", "·"])
        if isinstance(v, list):
            names = [str(x).lower() for x in v]
            if rule.get("prefix_sep"):
                # 前缀锚定：title 以 pattern 开头且紧跟分隔符（Censys ^ARTEX[ :—] 语义），防 SmartArtEXplorer 类中部命中
                if any(n.startswith(p.lower()) and (len(n) == len(p) or n[len(p)] in seps)
                       for p in rule.get("patterns", []) for n in names):
                    hits_weak.append(cat)
            elif any(p.lower() in n for p in rule.get("patterns", []) for n in names):
                hits_weak.append(cat)
        elif v is not None:
            s = str(v).lower()
            if rule.get("prefix_sep"):
                if any(s.startswith(p.lower()) and (len(s) == len(p) or s[len(p)] in seps)
                       for p in rule.get("patterns", [])):
                    hits_weak.append(cat)
            elif any(p.lower() in s for p in rule.get("patterns", [])):
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
