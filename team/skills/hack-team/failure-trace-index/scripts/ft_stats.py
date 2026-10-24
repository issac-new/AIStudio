#!/usr/bin/env python3
"""ft_stats.py — 失败台账统计（按 category / engagement）"""
import argparse, json
from collections import Counter

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ledger", required=True)
    a = ap.parse_args()
    cat, eng = Counter(), Counter()
    n = 0
    for path in a.ledger.split(","):
        path = path.strip()
        if not path:
            continue
        import os
        if not os.path.exists(path):
            continue
        for line in open(path):
            line = line.strip()
            if not line:
                continue
            e = json.loads(line)
            cat[e["category"]] += 1
            eng[e["engagement"]] += 1
            n += 1
    print(f"total={n}")
    print("by_category:", dict(cat))
    print("by_engagement:", dict(eng))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
