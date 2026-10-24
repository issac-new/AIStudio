#!/usr/bin/env python3
"""worldmonitor-intel: 5 个情报分析算法（纯 stdlib，无依赖）

移植自 https://github.com/koala73/worldmonitor (AGPL-3.0)

用法:
  python3 intel-analysis.py spike <keyword> [--stories stories.json]
  python3 intel-analysis.py cluster [--stories stories.json]
  python3 intel-analysis.py geo [--events events.json]
  python3 intel-analysis.py focal [--mentions mentions.json]
  python3 intel-analysis.py escalate --news N --cii N --geo N --military N [--baseline B]

输入 JSON 格式:
  stories:  [{"title": str, "source": str, "timestamp_ms": int}]
  events:   [{"lat": float, "lon": float, "type": str, "timestamp_ms": int}]
  mentions: {entity: {stream: count}}
"""
import argparse
import json
import math
import sys
import time

# ============ Algorithm 1: Keyword Spike ============
def detect_keyword_spikes(stories, keyword, rolling_window_ms=2*3600*1000,
                          baseline_window_ms=7*24*3600*1000,
                          min_spike_count=5, spike_multiplier=3,
                          min_source_count=2):
    if not stories:
        return {'spike': False, 'reason': 'no stories'}
    now = max(s['timestamp_ms'] for s in stories)
    rolling = [s for s in stories if now - s['timestamp_ms'] <= rolling_window_ms]
    baseline = [s for s in stories if now - s['timestamp_ms'] <= baseline_window_ms]
    kw_lower = keyword.lower()
    roll_hits = [s for s in rolling if kw_lower in s['title'].lower()]
    base_hits = [s for s in baseline if kw_lower in s['title'].lower()]
    roll_count = len(roll_hits)
    base_rate = len(base_hits) / max(1, baseline_window_ms / rolling_window_ms)
    if roll_count < min_spike_count:
        return {'spike': False, 'reason': f'count {roll_count} < floor {min_spike_count}'}
    sources = len({s['source'] for s in roll_hits})
    if sources < min_source_count:
        return {'spike': False, 'reason': f'sources {sources} < {min_source_count}'}
    if base_rate > 0 and roll_count >= base_rate * spike_multiplier:
        return {'spike': True, 'count': roll_count, 'baseline_rate': round(base_rate, 2),
                'multiplier': round(roll_count / max(base_rate, 0.001), 2), 'sources': sources}
    if base_rate == 0:
        return {'spike': roll_count >= min_spike_count, 'count': roll_count,
                'note': 'no baseline, frequency-only', 'sources': sources}
    return {'spike': False, 'reason': f'count {roll_count} < {base_rate * spike_multiplier:.1f}'}

# ============ Algorithm 2: News Clustering ============
def jaccard_similarity(a, b):
    ta, tb = set(a.lower().split()), set(b.lower().split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)

def cluster_news(items, threshold=0.45):
    clusters = []
    for item in items:
        placed = False
        for c in clusters:
            if jaccard_similarity(c['titles'][0], item['title']) >= threshold:
                c['titles'].append(item['title'])
                c['sources'].add(item['source'])
                c['size'] += 1
                placed = True
                break
        if not placed:
            clusters.append({'titles': [item['title']], 'sources': {item['source']}, 'size': 1})
    clusters.sort(key=lambda c: c['size'], reverse=True)
    # Convert sets to sorted lists for JSON serialization
    for c in clusters:
        c['sources'] = sorted(c['sources'])
    return clusters

# ============ Algorithm 3: Geo Convergence ============
def geo_convergence(events, threshold=3, window_ms=24*3600*1000):
    if not events:
        return []
    now = max(e['timestamp_ms'] for e in events)
    CELL_SIZE_DEG = 2.0
    cells = {}
    for e in events:
        if now - e['timestamp_ms'] > window_ms:
            continue
        cx, cy = int(e['lat'] // CELL_SIZE_DEG), int(e['lon'] // CELL_SIZE_DEG)
        cells.setdefault((cx, cy), set()).add(e['type'])
    alerts = []
    for (cx, cy), types in cells.items():
        if len(types) >= threshold:
            alerts.append({
                'cell': (cx, cy),
                'center_lat': round((cx + 0.5) * CELL_SIZE_DEG, 2),
                'center_lon': round((cy + 0.5) * CELL_SIZE_DEG, 2),
                'domains': sorted(types),
                'domain_count': len(types),
                'score': round(len(types) / 5.0, 2)
            })
    return sorted(alerts, key=lambda a: -a['score'])

# ============ Algorithm 4: Focal Point ============
def detect_focal_points(entity_mentions):
    focal = []
    for entity, streams in entity_mentions.items():
        active = [s for s, c in streams.items() if c > 0]
        n = len(active)
        if n >= 5:
            urgency = 'critical'
        elif n >= 3:
            urgency = 'elevated'
        elif n >= 1:
            urgency = 'watch'
        else:
            continue
        focal.append({
            'entity': entity,
            'streams': active,
            'stream_count': n,
            'urgency': urgency,
            'total_mentions': sum(streams.values())
        })
    return sorted(focal, key=lambda f: f['stream_count'], reverse=True)

# ============ Algorithm 5: Escalation Score ============
def escalation_score(news_activity=0, cii_score=None, geo_alert=0,
                     military_activity=0, static_baseline=1.0, weights=None):
    weights = weights or {'news': 0.35, 'cii': 0.25, 'geo': 0.25, 'military': 0.15}

    def norm(v, max_v=100):
        return min(100, max(0, v)) / max_v * 100

    components = {
        'news': norm(news_activity),
        'cii': norm(cii_score) if cii_score is not None else 0,
        'geo': norm(geo_alert),
        'military': norm(military_activity),
    }
    dynamic = sum(components[k] * w for k, w in weights.items())
    combined = dynamic * 0.3 + static_baseline * 70
    scale = 1 if combined < 20 else 2 if combined < 40 else 3 if combined < 60 else 4 if combined < 80 else 5
    return {
        'dynamic_score': round(dynamic, 1),
        'combined_score': round(combined, 1),
        'scale': scale,
        'components': {k: round(v, 1) for k, v in components.items()}
    }

# ============ CLI ============
def _load_json(path):
    if not path:
        return None
    with open(path) as f:
        return json.load(f)

def main():
    parser = argparse.ArgumentParser(description='worldmonitor-intel 情报分析算法')
    sub = parser.add_subparsers(dest='cmd', required=True)

    p_spike = sub.add_parser('spike', help='关键词突增检测')
    p_spike.add_argument('keyword')
    p_spike.add_argument('--stories', help='stories JSON 文件路径')

    p_cluster = sub.add_parser('cluster', help='新闻聚类去重')
    p_cluster.add_argument('--stories', help='stories JSON 文件路径')

    p_geo = sub.add_parser('geo', help='地理汇聚检测')
    p_geo.add_argument('--events', help='events JSON 文件路径')

    p_focal = sub.add_parser('focal', help='焦点实体检测')
    p_focal.add_argument('--mentions', help='mentions JSON 文件路径')

    p_esc = sub.add_parser('escalate', help='热度升级评分')
    p_esc.add_argument('--news', type=float, default=0)
    p_esc.add_argument('--cii', type=float, default=None)
    p_esc.add_argument('--geo', type=float, default=0)
    p_esc.add_argument('--military', type=float, default=0)
    p_esc.add_argument('--baseline', type=float, default=1.0)

    args = parser.parse_args()

    if args.cmd == 'spike':
        stories = _load_json(args.stories) or []
        print(json.dumps(detect_keyword_spikes(stories, args.keyword), ensure_ascii=False, indent=2))
    elif args.cmd == 'cluster':
        items = _load_json(args.stories) or []
        result = cluster_news(items)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.cmd == 'geo':
        events = _load_json(args.events) or []
        print(json.dumps(geo_convergence(events), ensure_ascii=False, indent=2))
    elif args.cmd == 'focal':
        mentions = _load_json(args.mentions) or {}
        print(json.dumps(detect_focal_points(mentions), ensure_ascii=False, indent=2))
    elif args.cmd == 'escalate':
        print(json.dumps(escalation_score(args.news, args.cii, args.geo, args.military, args.baseline),
                         ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
