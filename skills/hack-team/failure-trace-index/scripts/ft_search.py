#!/usr/bin/env python3
"""ft_search.py — 失败台账关键词检索（多词 AND，claim+context 全文）"""
import argparse, json, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ledger", required=True, help="逗号分隔多文件")
    ap.add_argument("--query", required=True)
    ap.add_argument("--category", default=None)
    a = ap.parse_args()
    terms = [t for t in a.query.lower().split() if t]
    hits = []
    for path in a.ledger.split(","):
        path = path.strip()
        if not path or not os.path.exists(path := path):
            continue
        for line in open(path):
            line = line.strip()
            if not line:
                continue
            e = json.loads(line)
            hay = (e["claim"] + " " + e.get("context", "")).lower()
            if all(t in hay for t in terms) and (a.category is None or e["category"] == a.category):
                hits.append(e)
    for e in hits:
        print(f"{e['id']} [{e['category']}] {e['claim']} (card={e['card_id']}, eng={e['engagement']})")
    print(f"-- {len(hits)} hit(s)")
    return 0

import os
if __name__ == "__main__":
    raise SystemExit(main())
