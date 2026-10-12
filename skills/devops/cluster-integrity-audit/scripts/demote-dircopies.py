#!/usr/bin/env python3
"""Demote real-dir bundled skill copies in profiles to symlinks into the shared layer.

Implements the inventory_watchdog DIRCOPIES criterion: a profile's skills/<name>
that is a REAL directory while ~/.hermes/skills/<name> is also a directory is a
copytree residue (update seeding bug) and must be a symlink.

Conservative vs `skill-fence.py apply`: no board pruning, no config rewrite.
Archives before replacing (reversible under skills-archive/_trash_demote/).
orchestrator exempt (it owns custom real-dir skills).

Run: python3 scripts/demote-dircopies.py
Verify after: python3 ~/.hermes/profiles/orchestrator/scripts/inventory_watchdog.py
(check rc separately: cmd > /tmp/out 2>&1; rc=$?)
"""
import os
import shutil

HERMES = os.path.expanduser("~/.hermes")
SHARED = os.path.join(HERMES, "skills")
PROFILES = os.path.join(HERMES, "profiles")
TRASH = os.path.join(HERMES, "skills-archive", "_trash_demote")
EXEMPT = {"orchestrator"}

os.makedirs(TRASH, exist_ok=True)
demoted, notes = [], []
for prof in sorted(os.listdir(PROFILES)):
    if prof in EXEMPT or prof.startswith(("_", ".")) or prof.endswith(".archived"):
        continue
    sd = os.path.join(PROFILES, prof, "skills")
    if not os.path.isdir(sd):
        continue
    for entry in sorted(os.listdir(sd)):
        if entry.startswith("."):
            continue
        src = os.path.join(sd, entry)
        shared = os.path.join(SHARED, entry)
        if os.path.isdir(src) and not os.path.islink(src) and os.path.isdir(shared):
            dst = os.path.join(TRASH, prof, entry)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if os.path.exists(dst):
                shutil.rmtree(dst)
            shutil.move(src, dst)
            os.symlink(shared, src)
            demoted.append(f"{prof}/{entry}")
        elif os.path.isdir(src) and not os.path.islink(src):
            notes.append(f"{prof}/{entry}: real dir, no shared counterpart (left alone)")

print(f"demoted {len(demoted)}:")
for d in demoted:
    print(" ", d)
print(f"notes {len(notes)}:")
for n in notes:
    print(" ", n)

broken = 0
for base in (SHARED, PROFILES):
    for root, dirs, files in os.walk(base):
        for e in dirs + files:
            p = os.path.join(root, e)
            if os.path.islink(p) and not os.path.exists(p):
                broken += 1
                print("BROKEN:", p)
print(f"broken symlinks after run: {broken}")
