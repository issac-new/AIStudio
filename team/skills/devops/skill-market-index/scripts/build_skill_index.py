#!/usr/bin/env python3
"""build_skill_index.py — skill market index generator (format 1).

Localized translation of the dsh plugin-market generator: recursively scan a
skill tree for SKILL.md frontmatter (name/version/description/tags) and emit
one static index.json. Read-only scan; never executes skill code.

Upstream anchors: apps/plugin-market-generator/README.md (format, invalid
list, deterministic rewrite), packages/util/plugin-market-index/src/types.ts.

Exit codes: 0 = index written (warnings allowed); 1 = root unreadable or
zero entries; 2 = invalid arguments.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from skillindexlib import (  # noqa: E402
    FrontmatterError,
    atomic_write_if_changed,
    extract_fields,
)

GENERATOR = "build_skill_index.py"
GENERATOR_VERSION = "0.1.0"

# Roots that are canonical bodies of bundled/official skills. An entry whose
# real directory sits under one of these is L0-Trusted (official-bundled);
# everything else found under the scanned root is L1-Reviewed (local-managed).
_BUNDLED_ROOTS = (
    os.path.realpath(os.path.expanduser("~/.hermes/hermes-agent")),
)


def _walk(root: str, skip: set[str] | None = None):
    """Yield (dirpath, name) for every dir containing SKILL.md, following
    symlinks with a realpath-visited guard (the tree has mutual symlinks).
    A directory reachable through several paths is emitted exactly once —
    dedupe by realpath at emit time, not only at list time."""
    skip = skip or set()
    stack = [(root, "")]
    visited: set[str] = set()
    while stack:
        current, rel = stack.pop()
        real = os.path.realpath(current)
        if real in visited:
            continue
        visited.add(real)
        try:
            entries = sorted(os.listdir(current), reverse=True)
        except OSError:
            continue
        for name in entries:
            if name in skip or name.startswith("."):
                continue
            path = os.path.join(current, name)
            child_real = os.path.realpath(path)
            if os.path.isfile(os.path.join(path, "SKILL.md")) and child_real not in visited:
                yield path, (rel + "/" + name).lstrip("/") if rel else name
                visited.add(child_real)
            if os.path.isdir(path):
                stack.append((path, (rel + "/" + name).lstrip("/") if rel else name))
    # nothing


def _mtime_iso(path: str) -> str:
    try:
        ts = os.stat(path).st_mtime
    except OSError:
        ts = 0
    return _dt.datetime.fromtimestamp(ts, tz=_dt.timezone.utc).isoformat()


def build(root: str, title: str, description: str = "") -> dict:
    root = os.path.realpath(os.path.expanduser(root))
    if not os.path.isdir(root):
        print(f"error: root is not a directory: {root}", file=sys.stderr)
        sys.exit(1)
    skills: list[dict] = []
    warnings: list[dict] = []
    seen_names: dict[str, str] = {}
    for skill_dir, rel in _walk(root):
        skill_file = os.path.join(skill_dir, "SKILL.md")
        try:
            with open(skill_file, encoding="utf-8", errors="replace") as fh:
                text = fh.read(200_000)
        except OSError as exc:
            warnings.append({"path": skill_file, "reason": "unparsable-frontmatter",
                             "detail": str(exc)})
            continue
        try:
            fields = extract_fields(text)
        except FrontmatterError as exc:
            warnings.append({"path": skill_file, "reason": str(exc)})
            continue
        name = fields.get("name") or os.path.basename(skill_dir)
        if not name:
            warnings.append({"path": skill_file, "reason": "missing-name"})
            continue
        real_dir = os.path.realpath(skill_dir)
        if name in seen_names:
            warnings.append({
                "path": skill_file,
                "reason": "duplicate-name",
                "detail": f"same name as {seen_names[name]}",
            })
            continue
        seen_names[name] = real_dir
        tags = fields.get("tags") or []
        engines_hermes = fields.get("engines_hermes")
        compat = (
            {"engines": {"hermes": engines_hermes}} if engines_hermes else None
        )
        trust_level = "L1-Reviewed"
        trust_basis = "local-managed"
        if any(real_dir.startswith(r + os.sep) or real_dir == r for r in _BUNDLED_ROOTS):
            trust_level, trust_basis = "L0-Trusted", "official-bundled"
        skills.append({
            "name": name,
            "version": fields.get("version") or "",
            "description": fields.get("description") or "",
            "tags": tags,
            "category": os.path.basename(os.path.dirname(skill_dir)),
            "skill_file": skill_file,
            "source": {"type": "local", "path": real_dir},
            "compat": compat,
            "trust": {"level": trust_level, "basis": trust_basis},
            "installed_at": _mtime_iso(skill_file),
        })
    skills.sort(key=lambda s: s["name"])
    stats = {
        "total": len(skills),
        "warnings": len(warnings),
        "missing_frontmatter": sum(
            1 for w in warnings if w["reason"] == "missing-frontmatter"
        ),
        "without_engines": sum(1 for s in skills if s["compat"] is None),
        "trust": {
            "L0-Trusted": sum(1 for s in skills if s["trust"]["level"] == "L0-Trusted"),
            "L1-Reviewed": sum(1 for s in skills if s["trust"]["level"] == "L1-Reviewed"),
            "unclassified": 0,
        },
    }
    return {
        "format": 1,
        "title": title,
        "description": description,
        "generated_at": _dt.datetime.now(tz=_dt.timezone.utc).isoformat(
            timespec="seconds"
        ),
        "root": root,
        "generator": {"name": GENERATOR, "version": GENERATOR_VERSION},
        "stats": stats,
        "warnings": warnings,
        "skills": skills,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog=GENERATOR,
        description="Scan a skill tree for SKILL.md frontmatter and emit a "
                    "static market index (format 1). Read-only scan.",
    )
    ap.add_argument("--root", required=True, help="skill tree root to scan")
    ap.add_argument("-o", "--output", required=True, help="index.json path")
    ap.add_argument("--title", default="Hermes Skill Market",
                    help="index title (default: %(default)s)")
    ap.add_argument("--description", default="", help="index description")
    args = ap.parse_args(argv)
    root = os.path.expanduser(args.root)
    if not os.path.isdir(root):
        print(f"error: --root is not a directory: {root}", file=sys.stderr)
        return 1
    index = build(root, args.title, args.description)
    if index["stats"]["total"] == 0:
        print("error: zero entries collected — refusing to write empty index",
              file=sys.stderr)
        return 1
    payload = json.dumps(index, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    os.makedirs(os.path.dirname(os.path.abspath(args.output)) or ".", exist_ok=True)
    written = atomic_write_if_changed(args.output, payload)
    s = index["stats"]
    print(
        f"index written: {args.output} ({'rewritten' if written else 'unchanged'}), "
        f"skills={s['total']}, warnings={s['warnings']} "
        f"(missing_frontmatter={s['missing_frontmatter']}), "
        f"without_engines={s['without_engines']}, "
        f"trust L0/L1/unclassified="
        f"{s['trust']['L0-Trusted']}/{s['trust']['L1-Reviewed']}/"
        f"{s['trust']['unclassified']}"
    )
    for w in index["warnings"]:
        print(f"warning: {w['reason']}: {w['path']}"
              + (f" ({w['detail']})" if w.get("detail") else ""), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
