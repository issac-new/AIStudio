#!/usr/bin/env python3
"""worldmonitor-intel 情报分析算法（从调研报告恢复，算法移植自 koala73/worldmonitor AGPL-3.0）
用法：
  intel-analysis.py spike "关键词" --stories stories.json
  intel-analysis.py cluster --stories stories.json
  intel-analysis.py geo --events events.json
  intel-analysis.py focal --mentions mentions.json
  intel-analysis.py escalate --news 80 --cii 45 --geo 60 --military 30
数据格式：
  stories.json: [{"title","source","timestamp_ms"}]
  events.json:  [{"title","domain","lat","lon","timestamp_ms"}]
  mentions.json:[{"entity","stream","timestamp_ms"}]  # stream ∈ news/military/cyber/economic
"""
import json, sys, argparse, math
from collections import defaultdict
from datetime import datetime

# ---- Keyword Spike（keyword-spike-core.js 移植）----
DEFAULT_MIN_SPIKE_COUNT = 5
DEFAULT_SPIKE_MULTIPLIER = 3
MIN_SPIKE_SOURCE_COUNT = 2
WINDOW_MS = 2 * 3600 * 1000
BASELINE_MS = 7 * 24 * 3600 * 1000

def cmd_spike(kw, stories):
    now = max((s["timestamp_ms"] for s in stories), default=0) or int(datetime.now().timestamp()*1000)
    win = [s for s in stories if kw.lower() in s["title"].lower() and now - s["timestamp_ms"] <= WINDOW_MS]
    base = [s for s in stories if kw.lower() in s["title"].lower() and now - s["timestamp_ms"] <= BASELINE_MS]
    base_rate = len(base) / 84.0  # 7d=84 个 2h 桶
    win_sources = {s["source"] for s in win}
    if not base:
        return {"keyword": kw, "spike": len(win) >= DEFAULT_MIN_SPIKE_COUNT,
                "count_2h": len(win), "baseline_rate": None, "note": "无基线，退化为纯频率计数（已标注）"}
    ratio = len(win) / base_rate if base_rate else float("inf")
    spike = len(win) >= DEFAULT_MIN_SPIKE_COUNT and ratio >= DEFAULT_SPIKE_MULTIPLIER and len(win_sources) >= MIN_SPIKE_SOURCE_COUNT
    return {"keyword": kw, "spike": spike, "count_2h": len(win), "sources": len(win_sources),
            "baseline_rate_per_2h": round(base_rate, 2), "ratio": round(ratio, 1)}

# ---- News Clustering（news-clustering-core.js，Jaccard ~0.45）----
CLUSTER_THRESHOLD = 0.45
def _tok(t): return set(w for w in t.lower().split() if len(w) > 1)
def _jaccard(a, b):
    u = len(a | b); return len(a & b) / u if u else 0.0
def cmd_cluster(stories):
    clusters = []
    for s in stories:
        tk = _tok(s["title"])
        for c in clusters:
            if any(_jaccard(tk, _tok(m["title"])) >= CLUSTER_THRESHOLD for m in c):
                c.append(s); break
        else:
            clusters.append([s])
    return {"total": len(stories), "clusters": len(clusters),
            "top": sorted(({"size": len(c), "titles": [m["title"][:60] for m in c[:3]]} for c in clusters), key=lambda x: -x["size"])[:5]}

# ---- Geo Convergence（同一 cell 24h ≥3 不同领域）----
CELL_DEG = 5.0
def cmd_geo(events):
    cells = defaultdict(list)
    for e in events:
        cells[(round(e["lat"]/CELL_DEG), round(e["lon"]/CELL_DEG))].append(e)
    hot = [{"cell": k, "domains": sorted({e["domain"] for e in v}), "n_events": len(v)}
           for k, v in cells.items() if len({e["domain"] for e in v}) >= 3]
    return {"hotspots": sorted(hot, key=lambda x: -x["n_events"])[:10]}

# ---- Focal Point（跨流焦点实体）----
def cmd_focal(mentions):
    by_entity = defaultdict(set)
    for m in mentions: by_entity[m["entity"]].add(m["stream"])
    out = [{"entity": e, "streams": sorted(ss), "level": "critical" if len(ss) >= 4 else "elevated" if len(ss) >= 3 else "normal"}
           for e, ss in by_entity.items()]
    return {"entities": sorted(out, key=lambda x: -len(x["streams"]))[:20]}

# ---- Hotspot Escalation（news 35 + cii 25 + geo 25 + military 15，1-5 刻度）----
def cmd_escalate(news, cii, geo, military):
    score = 0.35*news + 0.25*cii + 0.25*geo + 0.15*military
    level = min(5, max(1, math.ceil(score / 20)))
    return {"weighted": round(score, 1), "level_1to5": level}

def load(p):
    with open(p) as f: return json.load(f)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p1 = sub.add_parser("spike"); p1.add_argument("kw"); p1.add_argument("--stories", required=True)
    p2 = sub.add_parser("cluster"); p2.add_argument("--stories", required=True)
    p3 = sub.add_parser("geo"); p3.add_argument("--events", required=True)
    p4 = sub.add_parser("focal"); p4.add_argument("--mentions", required=True)
    p5 = sub.add_parser("escalate")
    for k in ("news","cii","geo","military"): p5.add_argument(f"--{k}", type=float, required=True)
    a = ap.parse_args()
    r = {"spike": lambda: cmd_spike(a.kw, load(a.stories)),
         "cluster": lambda: cmd_cluster(load(a.stories)),
         "geo": lambda: cmd_geo(load(a.events)),
         "focal": lambda: cmd_focal(load(a.mentions)),
         "escalate": lambda: cmd_escalate(a.news, a.cii, a.geo, a.military)}[a.cmd]()
    print(json.dumps(r, ensure_ascii=False, indent=1))
