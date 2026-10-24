#!/usr/bin/env python3
"""Quick lookup over the anthropic-cybersec-skills-index.

Usage:
  python search-index.py --subdomain cloud-security
  python search-index.py --attck T1555.004
  python search-index.py --tool bloodhound
  python search-index.py --name analyzing-apt-group-with-mitre-navigator
  python search-index.py --list-subdomains
"""
import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.normpath(os.path.join(HERE, "..", "references", "index_data.json"))


def load():
    if not os.path.exists(INDEX):
        raise SystemExit("index_data.json not found at " + INDEX)
    return json.load(open(INDEX))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--subdomain")
    ap.add_argument("--attck")
    ap.add_argument("--tool")
    ap.add_argument("--name")
    ap.add_argument("--list-subdomains", action="store_true")
    a = ap.parse_args()

    d = load()
    bysub, byatt, bytool = d["bysub"], d["byatt"], d["bytool"]

    if a.list_subdomains:
        for s in sorted(bysub, key=lambda k: -len(bysub[k])):
            print(f"{s:32s} {len(bysub[s])}")
        return

    found = None
    if a.subdomain:
        found = bysub.get(a.subdomain, [])
        print(f"# subdomain={a.subdomain} -> {len(found)} skills")
    elif a.attck:
        found = byatt.get(a.attck, [])
        print(f"# attck={a.attck} -> {len(found)} skills")
    elif a.tool:
        found = bytool.get(a.tool, [])
        print(f"# tool={a.tool} -> {len(found)} skills")
    elif a.name:
        hits = []
        for src, m in (("subdomain", bysub), ("attck", byatt), ("tool", bytool)):
            for k, v in m.items():
                if a.name in v:
                    hits.append(f"  {src}:{k}")
        print(f"# name={a.name} appears in:")
        for h in hits:
            print(h)
        return
    else:
        ap.print_help()
        return

    for n in found:
        print(" -", n)


if __name__ == "__main__":
    main()
