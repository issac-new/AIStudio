#!/usr/bin/env python3
"""selftest.py — offline self-test for the skill-market-index trio.

Run: python3 selftest.py
Exit 0 iff all assertions pass. Uses mkdtemp fixtures only; no network, no
writes outside the temp tree. Mirrors the eval-calibration selftest
convention (frozen acceptance item: script must actually run).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(HERE, "skillindexlib.py")
BUILD = os.path.join(HERE, "build_skill_index.py")
QUERY = os.path.join(HERE, "query_skill_index.py")

sys.path.insert(0, HERE)
import skillindexlib as lib  # noqa: E402

_failures: list[str] = []


def check(label: str, cond: bool, extra: str = "") -> None:
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}" + (f" — {extra}" if extra and not cond else ""))
    if not cond:
        _failures.append(label)


def test_tokenizer() -> None:
    # CJK bigram: 微信排障 -> 微信 信排 排障 障
    got = lib.search_terms("微信排障")
    check("cjk bigram", got == ["微信", "信排", "排障", "障"], f"got {got}")
    # mixed run: han run + ascii words yield separate terms; a 2-char han run
    # yields its bigram plus its last char (upstream design: every character
    # of the run starts some term)
    got = lib.search_terms("微信 db-decrypt")
    check("mixed split", got == ["微信", "信", "db", "decrypt"], f"got {got}")
    # single CJK char -> itself
    check("single cjk", lib.search_terms("库") == ["库"])
    # NFKC folds full-width to ascii but keeps case; lowercasing happens in
    # processTerm (upstream) i.e. at query/doc term level, not in the tokenizer
    got = lib.search_terms("ＦＬＵＳＳ")
    check("nfkc fold", got == ["FLUSS"], f"got {got}")
    # fuzzy tiers: prefix outranks fuzzy for 'skil'->'skill'
    check("fuzzy via prefix", lib.term_match_score("skil", "skill") == 0.85)
    # real fuzzy (edit distance 1, no prefix relation): 'skll' vs 'skill'
    check("fuzzy hit", lib.term_match_score("skll", "skill") == 0.6)
    check("exact", lib.term_match_score("skill", "skill") == 1.0)
    check("prefix", lib.term_match_score("ski", "skill") == 0.85)
    check("no fuzzy short", lib.term_match_score("ab", "ac") == 0.0)
    # lowercase tiering is applied at match time, not tokenize time
    q = [t.lower() for t in lib.search_terms("Ｆｌｕｓｓ")]
    check("lower after nfkc", q == ["fluss"], f"got {q}")


def test_frontmatter() -> None:
    flat = """---
name: hermes-skill-installation
version: 1.0.0
description: Install skills from hub or taps.
---
body
"""
    f = lib.extract_fields(flat)
    check("fm name", f.get("name") == "hermes-skill-installation")
    check("fm version", f.get("version") == "1.0.0")
    check("fm desc", f.get("description") == "Install skills from hub or taps.")

    nested = """---
name: skill-library-slimming
version: 1.0.0
description: "Slim bloated skill libraries via team-scoped link boards."
metadata:
  hermes:
    tags: [skills, maintenance, slimming]
---
"""
    f = lib.extract_fields(nested)
    check("fm nested tags", f.get("tags") == ["skills", "maintenance", "slimming"],
          f"got {f.get('tags')}")

    folded = """---
name: eval-calibration
description: >
  需要离线评估决策/分类质量与置信度校准时用：ECE/Brier。
metadata:
  hermes:
    tags:
      - eval
      - calibration
---
"""
    f = lib.extract_fields(folded)
    check("fm folded desc", "ECE" in (f.get("description") or ""))
    check("fm block list tags", f.get("tags") == ["eval", "calibration"],
          f"got {f.get('tags')}")

    engines = """---
name: x
engines:
  hermes: ">=0.22.0 <0.23.0"
---
"""
    f = lib.extract_fields(engines)
    check("fm engines nested", f.get("engines_hermes") == ">=0.22.0 <0.23.0",
          f"got {f.get('engines_hermes')}")

    dotted = """---
name: y
metadata.hermes.tags: [a, b]
engines.hermes: ^0.22
---
"""
    f = lib.extract_fields(dotted)
    check("fm dotted tags", f.get("tags") == ["a", "b"], f"got {f.get('tags')}")
    check("fm dotted engines", f.get("engines_hermes") == "^0.22")

    try:
        lib.extract_fields("no frontmatter here")
        check("fm missing raises", False)
    except lib.FrontmatterError:
        check("fm missing raises", True)


def test_ranges() -> None:
    check("range exact", lib.range_satisfied("=0.22.2", "0.22.2") is True)
    check("range gt fail", lib.range_satisfied(">0.23.0", "0.22.2") is False)
    check("range and", lib.range_satisfied(">=0.22.0 <0.23.0", "0.22.2") is True)
    check("range caret", lib.range_satisfied("^0.22.0", "0.22.5") is True)
    check("range caret upper", lib.range_satisfied("^0.22.0", "0.23.0") is False)
    check("range tilde", lib.range_satisfied("~0.22.1", "0.22.9") is True)
    check("range tilde upper", lib.range_satisfied("~0.22.1", "0.23.0") is False)
    check("range or", lib.range_satisfied("^0.21 || ^0.22", "0.22.2") is True)
    check("range star", lib.range_satisfied("*", "0.22.2") is True)
    check("range invalid", lib.range_satisfied("workspace:*", "0.22.2") is None)
    check("range empty", lib.range_satisfied("", "0.22.2") is None)


def test_gate() -> None:
    ok_entry = {"name": "x", "compat": {"engines": {"hermes": ">=0.1"}}}
    code, msg = lib.check_engines(ok_entry, "0.22.2")
    check("gate ok", code == 0 and msg.startswith("ok"), msg)
    undec = {"name": "x", "compat": None}
    code, msg = lib.check_engines(undec, "0.22.2")
    check("gate undeclared warns", code == 0 and msg.startswith("warning"), msg)
    bad = {"name": "x", "compat": {"engines": {"hermes": ">9.9"}}}
    code, msg = lib.check_engines(bad, "0.22.2")
    check("gate refuse", code == 1 and msg.startswith("refuse"), msg)


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120)


def test_e2e() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        # fixture tree: two skills + one broken + a symlink loop guard case
        a = os.path.join(tmp, "devops", "alpha")
        b = os.path.join(tmp, "[已移除]", "beta")
        c = os.path.join(tmp, "devops", "broken")
        os.makedirs(a), os.makedirs(b), os.makedirs(c)
        with open(os.path.join(a, "SKILL.md"), "w") as fh:
            fh.write("---\nname: alpha-skill\nversion: 0.1.0\n"
                     "description: 微信排障与 db 解密\ntags: [wechat, db]\n---\nbody\n")
        with open(os.path.join(b, "SKILL.md"), "w") as fh:
            fh.write("---\nname: beta-skill\nversion: 1.2.3\n"
                     "description: child reports\nmetadata:\n  hermes:\n    tags: [[已移除], report]\n"
                     "engines:\n  hermes: \"^1.0\"\n---\nbody\n")
        with open(os.path.join(c, "SKILL.md"), "w") as fh:
            fh.write("no frontmatter at all\n")
        os.symlink(tmp, os.path.join(tmp, "selfloop"))  # symlink loop guard

        out = os.path.join(tmp, "index.json")
        r = _run([sys.executable, BUILD, "--root", tmp, "-o", out,
                  "--title", "Selftest Market"])
        check("build exit 0", r.returncode == 0, r.stderr)
        idx = json.load(open(out))
        check("build format 1", idx.get("format") == 1)
        check("build count 2", idx["stats"]["total"] == 2,
              f"got {idx['stats']['total']}")
        check("build warns 1", idx["stats"]["warnings"] == 1,
              f"got {idx['stats']}")
        check("build categories", {s["category"] for s in idx["skills"]} == {"devops", "[已移除]"})
        beta = next(s for s in idx["skills"] if s["name"] == "beta-skill")
        check("build engines carried", beta["compat"] == {"engines": {"hermes": "^1.0"}})
        alpha = next(s for s in idx["skills"] if s["name"] == "alpha-skill")
        check("build trust L1", alpha["trust"]["level"] == "L1-Reviewed")
        # deterministic rewrite: run again, file untouched
        before = os.stat(out).st_mtime_ns
        r2 = _run([sys.executable, BUILD, "--root", tmp, "-o", out,
                   "--title", "Selftest Market"])
        check("build rerun exit 0", r2.returncode == 0, r2.stderr)
        check("build deterministic", os.stat(out).st_mtime_ns == before,
              "second run rewrote the file")

        # query: cjk fuzzy
        r = _run([sys.executable, QUERY, "--index", out, "--text", "微信",
                  "--limit", "10"])
        check("query cjk hit", r.returncode == 0 and "alpha-skill" in r.stdout,
              r.stdout + r.stderr)
        r = _run([sys.executable, QUERY, "--index", out, "--tag", "[已移除]"])
        check("query tag filter", "beta-skill" in r.stdout and "alpha-skill" not in r.stdout,
              r.stdout)
        r = _run([sys.executable, QUERY, "--index", out, "--text", "reportt",
                  "--limit", "10"])  # fuzzy (dist 1) on len-6 term
        check("query ascii fuzzy", "beta-skill" in r.stdout, r.stdout)
        r = _run([sys.executable, QUERY, "--index", out, "--category", "devops",
                  "--text", "db"])
        check("query category+text", "alpha-skill" in r.stdout and "beta-skill" not in r.stdout,
              r.stdout)
        # engines gate: beta requires ^1.0, runtime fake 0.22.2 -> refuse (rc 1)
        r = _run([sys.executable, QUERY, "--index", out, "--check-engines",
                  "beta-skill"])
        check("gate refuse rc1", r.returncode == 1 and "refuse" in r.stdout, r.stdout)
        r = _run([sys.executable, QUERY, "--index", out, "--check-engines",
                  "alpha-skill"])
        check("gate undeclared rc0", r.returncode == 0 and "warning" in r.stdout,
              r.stdout)
        r = _run([sys.executable, QUERY, "--index", out, "--check-engines",
                  "nope"])
        check("gate unknown rc1", r.returncode == 1 and "not found" in r.stderr,
              r.stderr)


def main() -> int:
    test_tokenizer()
    test_frontmatter()
    test_ranges()
    test_gate()
    test_e2e()
    print(f"\n{'ALL PASS' if not _failures else 'FAILURES: ' + ', '.join(_failures)}")
    return 0 if not _failures else 1


if __name__ == "__main__":
    sys.exit(main())
