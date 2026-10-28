#!/usr/bin/env python3
"""query_skill_index.py — Discover-side filter/fuzzy-search over one index.

Localized translation of the dsh Discover idea (index + tag/board filter +
fuzzy search). stdlib-only; reads the static index.json produced by
build_skill_index.py and never fetches anything.

Upstream anchors: packages/boot/plugin-market/src/index.ts (search(url,
query) shape: entries/total/nextOffset, MAX_LIMIT 100),
packages/boot/plugin-market/src/search.ts (CJK bigram tokenize, AND,
prefix + bounded fuzzy, field boost).

Exit codes: 0 = ok (incl. empty result); 1 = no match for --check-engines
or incompatibility; 2 = invalid arguments / unreadable index.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from skillindexlib import (  # noqa: E402
    check_engines,
    current_hermes_version,
    match_score,
)

MAX_LIMIT = 100  # upstream: largest page `search` returns


def _match(entry: dict, args) -> bool:
    if args.category and entry.get("category") != args.category:
        return False
    if args.name and entry.get("name") != args.name:
        return False
    if args.tag:
        tags = set(entry.get("tags") or [])
        if not all(t in tags for t in args.tag):
            return False
    if args.text and match_score(args.text, entry) <= 0.0:
        return False
    return True


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="query_skill_index.py",
        description="Filter and fuzzy-search a skill market index. CJK text "
                    "is bigram-tokenized (upstream search.ts port).",
    )
    ap.add_argument("--index", required=True, help="index.json path")
    ap.add_argument("--text", help="fuzzy search text (AND across terms)")
    ap.add_argument("--tag", action="append", default=[],
                    help="tag filter, repeatable (AND)")
    ap.add_argument("--category", help="category filter (root's first segment)")
    ap.add_argument("--name", help="exact name filter")
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--json", action="store_true", help="JSON output")
    ap.add_argument("--check-engines", metavar="SKILL",
                    help="trust-gate one skill: check engines.hermes against "
                         "the running hermes version")
    args = ap.parse_args(argv)
    if args.offset < 0 or args.limit < 1 or args.limit > MAX_LIMIT:
        print("error: offset must be >=0 and limit an integer 1..100",
              file=sys.stderr)
        return 2
    try:
        with open(args.index, encoding="utf-8") as fh:
            index = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"error: cannot read index {args.index}: {exc}", file=sys.stderr)
        return 2

    if args.check_engines:
        entry = next(
            (s for s in index.get("skills", []) if s.get("name") == args.check_engines),
            None,
        )
        if entry is None:
            print(f"refuse: skill {args.check_engines!r} not found in index",
                  file=sys.stderr)
            return 1
        version = current_hermes_version()
        if version is None:
            print("error: could not determine running hermes version",
                  file=sys.stderr)
            return 2
        code, msg = check_engines(entry, version)
        print(msg)
        return code

    skills = [s for s in index.get("skills", []) if _match(s, args)]
    if args.text:
        scored = [
            (match_score(args.text, s), s)
            for s in skills
        ]
        scored = [(sc, s) for sc, s in scored if sc > 0.0]
        scored.sort(key=lambda pair: (-pair[0], pair[1]["name"]))
        skills = [s for _sc, s in scored]
    total = len(skills)
    page = skills[args.offset: args.offset + args.limit]
    nxt = args.offset + len(page)
    next_offset = nxt if nxt < total else None

    if args.json:
        print(json.dumps(
            {"total": total, "next_offset": next_offset,
             "entries": [{"name": s["name"], "version": s.get("version", ""),
                          "category": s.get("category", ""),
                          "tags": s.get("tags", []),
                          "trust": s.get("trust", {}),
                          "compat": s.get("compat"),
                          "path": (s.get("source") or {}).get("path", "")}
                         for s in page]},
            ensure_ascii=False, indent=1,
        ))
        return 0
    print(f"total: {total}")
    for s in page:
        tags = ",".join(s.get("tags") or []) or "-"
        print(f"{s['name']}\t{s.get('version') or '-'}\t{s.get('category') or '-'}\t{tags}")
    if next_offset is not None:
        print(f"next_offset: {next_offset}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
