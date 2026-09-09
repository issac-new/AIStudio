#!/usr/bin/env python3
"""Extract only the hunks containing a given swarm marker from a `git diff` patch.

Used to slim a mixed-feature patch down to a single feature so a drift watchdog
can re-apply it cleanly after `hermes update`.

Why this exists: a patch that bundles unrelated changes (e.g. a voice-STT rewrite
bundled alongside a noise-filter insertion) stops applying once another patch
lands that same STT work in a different form. Re-applying the fat patch would
revert the newer code. The fix is a *pure* single-feature patch — this script
produces one by keeping only hunks that mention the marker.

Usage:
    cd ~/.hermes/hermes-agent
    git diff -U1 <path> > /tmp/full.diff          # -U1 shrinks hunk context overlap
    python3 extract-noisefilter-patch.py /tmp/full.diff "swarm:noise-filter" > slim.patch
    git apply --reverse --check slim.patch && echo "content present & well-formed"

Exit codes: 0 = kept >=1 hunk, 1 = no hunk contained the marker (nothing written).
"""
from __future__ import annotations

import sys


def split_hunks(lines: list[str]) -> tuple[list[str], list[list[str]]]:
    """Split a unified diff into (header_lines, [hunk_lines, ...]).

    Header = diff/index/---/+++ lines plus any context before the first '@@'.
    Each hunk starts at '@@' and runs until the next '@@' or 'diff --git'.
    """
    header: list[str] = []
    hunks: list[list[str]] = []
    cur: list[str] | None = None
    for line in lines:
        if line.startswith(("diff --git", "index ", "--- ", "+++ ")):
            if cur is not None:
                hunks.append(cur)
                cur = None
            header.append(line)
        elif line.startswith("@@"):
            if cur is not None:
                hunks.append(cur)
            cur = [line]
        else:
            (cur if cur is not None else header).append(line)
    if cur is not None:
        hunks.append(cur)
    return header, hunks


def main() -> int:
    if len(sys.argv) != 3:
        sys.stderr.write("usage: extract-noisefilter-patch.py <full.diff> <marker>\n")
        return 2
    diff_path, marker = sys.argv[1], sys.argv[2]
    lines = open(diff_path, encoding="utf-8").read().splitlines(keepends=True)
    header, hunks = split_hunks(lines)
    kept = [h for h in hunks if any(marker in x for x in h)]
    if not kept:
        sys.stderr.write(f"no hunk contains marker {marker!r}\n")
        return 1
    out = header + [x for h in kept for x in h]
    sys.stdout.write("".join(out))
    sys.stderr.write(f"hunks total={len(hunks)} kept={len(kept)} out_lines={len(out)}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
