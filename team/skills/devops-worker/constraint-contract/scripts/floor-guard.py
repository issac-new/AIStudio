#!/usr/bin/env python3
"""floor-guard.py — diff-scoped enforcement of the CONSTRAINTS.md floor.

Ported from agent-skills v0.6.13 constraint-driven-development
references/floor-guard.md (Node reference) to Python3, zero third-party deps.
Contract identical to upstream:
  exit 0  clean (stdout 'floor-guard: clean')
  exit 1  at least one floor violation (stderr, blocks the change)
  exit 2  guard could not run (not a git repo, no merge base) — never read as 0

Detects the five Step-6 weakening moves: threshold moved, test made easier,
checker silenced, unfinished work, new exception row.
Extra adaptation from upstream 'Adapting it': .constraintsignore (one glob per
line; a finding whose file path — or its basename — matches is not flagged).
"""
import argparse
import fnmatch
import os
import re
import subprocess
import sys


def git(args, diff_exit=False):
    """Run git; return stdout str, or None on failure.

    `git diff --no-index` exits 1 whenever the two sides differ, which is the
    normal case for a new file, so that output is kept. Any other failure is
    None, and None never reads as clean.
    """
    try:
        p = subprocess.run(["git"] + args, capture_output=True, text=True,
                           stdin=subprocess.DEVNULL)
    except OSError:
        return None
    if p.returncode == 0:
        return p.stdout
    if diff_exit and p.returncode == 1 and isinstance(p.stdout, str):
        return p.stdout
    return None


def bail(msg):
    print("floor-guard: " + msg, file=sys.stderr)
    sys.exit(2)


def main():
    ap = argparse.ArgumentParser(
        prog="floor-guard",
        description="Diff-scoped enforcement of the CONSTRAINTS.md floor "
                    "(exit 0 clean / 1 violation / 2 cannot run).")
    ap.add_argument("--base", default="origin/main",
                    help="base ref to diff against (default: origin/main)")
    ns = ap.parse_args()
    base = ns.base

    # Run from the top of the work tree so untracked listing and diff paths
    # agree.
    top = (git(["rev-parse", "--show-toplevel"]) or "").strip()
    if not top:
        bail("not inside a git work tree")
    os.chdir(top)

    # Merge base; bail to exit 2 rather than pretending a rootless clone is clean.
    merge_base = (git(["merge-base", base, "HEAD"]) or "").strip()
    if not merge_base:
        bail("no merge base against " + base)

    tracked = git(["diff", "--unified=0", merge_base, "--"])
    if tracked is None:
        bail("could not diff against " + merge_base)
    untracked_out = git(["ls-files", "--others", "--exclude-standard"])
    if untracked_out is None:
        bail("could not list untracked files")
    untracked_parts = []
    for f in [x for x in untracked_out.split("\n") if x]:
        d = git(["diff", "--no-index", "--unified=0", "/dev/null", f],
                diff_exit=True)
        if d is None:
            bail("could not diff untracked file " + f)
        untracked_parts.append(d)
    diff = tracked + "\n" + "\n".join(untracked_parts)

    # Walk the diff. `---`/`+++` are file headers only between a file's `diff`
    # line and its first `@@` hunk; inside a hunk every line is content, so an
    # added `++i` (shown as `+++i`) is a change, not a header.
    added, removed, deleted = [], [], []
    path_of = lambda s: re.sub(r"^[ab]/", "", s)
    cur, old_file, in_header = "", "", False
    for line in diff.split("\n"):
        if line.startswith("diff "):
            in_header = True
        elif line.startswith("@@"):
            in_header = False
        elif in_header:
            if line.startswith("--- "):
                old_file = path_of(line[4:])
            elif line.startswith("+++ "):
                new_file = path_of(line[4:])
                cur = old_file if new_file == "/dev/null" else new_file
                if new_file == "/dev/null":
                    deleted.append(cur)
        elif line.startswith("+"):
            added.append({"file": cur, "text": line[1:]})
        elif line.startswith("-"):
            removed.append({"file": cur, "text": line[1:]})

    # .constraintsignore: one glob per line; exempts a path (or basename).
    ignored = []
    if os.path.isfile(".constraintsignore"):
        with open(".constraintsignore", encoding="utf-8") as fh:
            ignored = [l.strip() for l in fh if l.strip() and not l.startswith("#")]

    findings = []

    def flag(rule, f, text):
        if any(fnmatch.fnmatch(f, pat) or fnmatch.fnmatch(os.path.basename(f), pat)
               for pat in ignored):
            return
        findings.append({"rule": rule, "file": f, "text": text.strip()[:120]})

    is_test = lambda f: re.search(r"\.(test|spec)\.|_test\.|test_", f) is not None
    is_constraints = lambda f: re.search(r"CONSTRAINTS\.md$", f) is not None

    # 1. Silenced checker — extend for your ecosystem.
    SUPPRESSIONS = re.compile(
        r"@ts-ignore|@ts-nocheck|eslint-disable|biome-ignore|# *noqa"
        r"|# *type: *ignore|istanbul ignore|nosemgrep|gitleaks:allow|Stryker disable")
    # 4. Unfinished work.
    STUBS = re.compile(
        r"throw new (Error|NotImplemented).*[Nn]ot implemented"
        r"|catch\s*\(\w*\)\s*\{\s*\}|catch\s*\{\s*\}|\bTODO\b|\bpass\s*# *stub")
    # 2. A test made easier (added skips).
    SKIPS = re.compile(
        r"\.(skip|todo)\b|\bxit\(|\bxdescribe\(|@pytest\.mark\.skip|t\.Skip\(")

    for a in added:
        t = a["text"]
        if SUPPRESSIONS.search(t):
            flag("silenced-checker", a["file"], t)
        if STUBS.search(t):
            flag("unfinished-work", a["file"], t)
        if SKIPS.search(t):
            flag("test-made-easier", a["file"], t)
        if is_constraints(a["file"]) and re.match(r"^\| *(W|E)\d+ *\|", t):
            flag("new-exception", a["file"], t)

    # 2b. A test file deleted, or an assertion removed from a test that stayed.
    for f in deleted:
        if is_test(f):
            flag("test-deleted", f, "file deleted")
    for r in removed:
        if (is_test(r["file"]) and r["file"] not in deleted
                and re.search(r"\b(expect|assert|should)\b", r["text"])):
            flag("assertion-removed", r["file"], r["text"])

    # 1b/2c. A rule in CONSTRAINTS.md weakened or removed. A rule is a floor
    # bullet or a table row keyed by its first cell / pre-colon text. Numbers
    # carry a direction read from surrounding words; directionless numbers are
    # reported on any change (silence is the wrong default). Numbers pair
    # within their direction.
    def rule_key(t):
        s = t.strip()
        if s.startswith("|"):
            cells = [c.strip() for c in s.split("|") if c.strip()]
            return cells[0] if cells else ""
        if re.match(r"^[-*] ", s):
            return re.split(r":", s[2:], 1)[0].strip()
        return None  # prose, headings, dates: not a rule

    is_exception = lambda t: re.match(r"^\| *(W|E)\d+ *\|", t.strip()) is not None
    MIN_BEFORE = re.compile(r"(>=|>|≥|at least|minimum|\bmin\b|no less than|not fall|not drop)\s*$")
    MAX_BEFORE = re.compile(r"(<=|<|≤|at most|maximum|\bmax\b|no more than|under|below|not grow|not exceed)\s*$")
    MIN_AFTER = re.compile(r"^\s*\S*\s*(or more|or higher|must not fall|must not drop)")
    MAX_AFTER = re.compile(r"^\s*\S*\s*(or less|or lower|must not grow|must not exceed)")

    def thresholds(t):
        out = []
        for m in re.finditer(r"\d+(?:\.\d+)?", t):
            before = t[max(0, m.start() - 24):m.start()].lower()
            after = t[m.end():m.end() + 40].lower()
            if MIN_BEFORE.search(before) or MIN_AFTER.match(after):
                d = "min"
            elif MAX_BEFORE.search(before) or MAX_AFTER.match(after):
                d = "max"
            else:
                d = None
            out.append({"n": float(m.group(0)), "dir": d})
        return out

    removed_rules = [r for r in removed
                     if is_constraints(r["file"]) and rule_key(r["text"]) is not None]
    added_rules = [a for a in added
                   if is_constraints(a["file"]) and rule_key(a["text"]) is not None]
    for r in removed_rules:
        match = next((x for x in added_rules
                      if rule_key(x["text"]) == rule_key(r["text"])), None)
        if match is None:
            if not is_exception(r["text"]):
                flag("rule-removed", r["file"], r["text"])  # dropping an exception tightens: silent
            continue
        before, after = thresholds(r["text"]), thresholds(match["text"])
        verdict = None
        for d in ("min", "max", None):
            was = [x for x in before if x["dir"] == d]
            now = [x for x in after if x["dir"] == d]
            for i, b in enumerate(was):
                if verdict is not None:
                    break
                n = now[i] if i < len(now) else None
                if n is None:
                    verdict = "threshold-removed"
                elif n["n"] == b["n"]:
                    continue
                elif (n["n"] < b["n"]) if d == "min" else ((n["n"] > b["n"]) if d == "max" else True):
                    verdict = "threshold-loosened" if d else "threshold-changed"
        if verdict:
            flag(verdict, r["file"], r["text"] + "  ->  " + match["text"])

    if not findings:
        print("floor-guard: clean")
        sys.exit(0)
    print("floor-guard: %d floor violation(s):" % len(findings), file=sys.stderr)
    for f in findings:
        print("  [%s] %s: %s" % (f["rule"], f["file"], f["text"]), file=sys.stderr)
    if any(f["rule"] == "rule-removed" for f in findings):
        print("\nA rule-removed finding can also mean the rule's label changed: "
              "rename a rule in one commit and change its thresholds in another.",
              file=sys.stderr)
    if any(f["rule"] == "threshold-removed" for f in findings):
        print("\nA threshold-removed finding can also mean a number gained or lost "
              "its direction words (\">= 80%\" becoming \"80%\", or the reverse): "
              "compare the two lines before assuming a threshold was deleted.",
              file=sys.stderr)
    print("\nEach is a move that lowers the bar. Fix the code, or route it "
          "through a tracked exception.", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
