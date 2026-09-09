#!/usr/bin/env python3
"""Extract ONLY the swarm:f2-verification-stamp hunk from `git diff -U3`.

The runtime repo has OTHER uncommitted changes in kanban_db.py (guardrail
triggers, workspace_kind default). This script filters hunks by marker so the
generated patch file carries exactly one feature — re-applying it later never
stomps sibling work (skill: hermes-source-patch-persistence, weixin lesson).
"""
import subprocess
import sys

REPO = "/Users/YOURNAME/.hermes/hermes-agent"
TARGET = "hermes_cli/kanban_db.py"
MARKER = sys.argv[2] if len(sys.argv) > 2 else "swarm:f2-verification-stamp"

diff = subprocess.run(
    ["git", "diff", "-U3", "--", TARGET],
    cwd=REPO, capture_output=True, text=True, check=True,
).stdout

lines = diff.splitlines(keepends=True)
header, hunks, current = [], [], None
for line in lines:
    if line.startswith("@@"):
        if current:
            hunks.append(current)
        current = [line]
    elif current is not None:
        current.append(line)
    else:
        header.append(line)
if current:
    hunks.append(current)

keep = [h for h in hunks if any(MARKER in ln for ln in h)]
if len(keep) != 1:
    sys.exit(
        f"FATAL: expected exactly 1 hunk containing {MARKER}, found {len(keep)}. "
        "Refusing to write an ambiguous patch."
    )

out = "".join(header) + "".join("".join(h) for h in keep)
path = sys.argv[1]
with open(path, "w") as f:
    f.write(out)
print(f"wrote {path}: {len(out)} bytes, 1 hunk, marker-filtered")
