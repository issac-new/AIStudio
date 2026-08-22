---
name: skill-library-slimming
description: "Slim bloated skill libraries via team-scoped link boards."
metadata:
  hermes:
    tags: [skills, maintenance, slimming, context-tax, symlinks, link-boards]
    related_skills: [skill-library-maintenance, hermes-redundancy-cleanup, token-optimization, harness-entropy-management]
---

# Skill Library Slimming (Iterative)

Reduce the per-turn context tax of a multi-profile skill library. Every category
linked into a profile's `skills/` dir injects ALL its skills into that profile's
`available_skills` system-prompt block on EVERY turn — a rotten library makes a
[已移除] teacher index smart-home skills and a hack profile index gaming skills.

Validated 2026-08-05 on a 41-profile deployment: ~70% per-profile index
reduction, zero data loss, 0 broken links. Detailed playbook with commands and
pitfalls: [references/iterative-slimming-and-team-link-boards.md](references/iterative-slimming-and-team-link-boards.md).

## When to Use

- Profiles link every shared category ("全家桶" link boards)
- `available_skills` system-prompt block is bloated (measure first, below)
- After clawskills/bulk installs added many narrow domain skills nobody uses
- Periodic hygiene (entropy accumulates silently)

## Method per round: measure → classify → archive → verify

1. **Measure** indexed skills per profile (context-tax proxy):
   `find -L <profile>/skills -maxdepth 3 -name SKILL.md | wc -l`, sort desc.
2. **Classify by reading descriptions** (`grep -m1 '^description:'`), never by
   name alone. KEEP = aligned with the profile's real workflows; ARCHIVE =
   fringe domains or functional duplicates a kept skill already covers
   (e.g. vaex/dask when polars is kept; shap/umap-learn when scikit-learn is).
3. **Archive, never delete**: record `ls > backup/<profile>.before.txt` BEFORE
   mutating, then `mv` pruned dirs to `~/.hermes/skills-archive/<date>/`.
   Recovery = one `mv` back. Backups are what make aggressive pruning safe.
4. **Verify after EVERY round**: global broken-symlink scan across shared + all
   profiles, plus `skill_view` spot-checks of 2–3 kept skills.

## Three structural moves

**Team-scoped link boards.** Delete all top-level links in a profile, re-link
only the categories its team actually uses (see references for the validated
per-team boards). Biggest single win: ~70% index reduction.

**Split oversized mixed categories.** A shared category mixing unrelated
subdomains (e.g. cybersecurity holding red-team + blue-team + forensics +
compliance) forces every linker to index all of it. Split by name-prefix
buckets into `<cat>-offensive` / `-forensics` / `-detection` / `-compliance`
real dirs in shared, then link each profile only to its bucket. Unlinked
categories keep their content but cost zero context tax.

**Resolve name collisions.** `skill_view` refuses ambiguous bare names. When a
standalone top-level skill collides with a categorized one (`pdf` vs
`productivity/pdf`), archive the standalone — the categorized package usually
has the fuller support files.

## Pitfalls

1. **Check whether a profile's `skills/` dir is itself a symlink before
   mutating** (`ls -ld`). `find <dir> -maxdepth 1 -type l -delete` through a
   symlink chain can remove the dir itself; recovery = `mkdir -p` + re-link.
2. **Archiving a shared category breaks every profile linking it** — remove
   those links in the same pass; one global scan catches any missed.
3. **Differing duplicates are not safe to delete blindly** — diff first; if the
   profile copy is newer or has extra files, merge into shared, then archive
   the profile copy.
4. **cd out of a directory before rmdir-ing it** — a shell sitting in a deleted
   cwd breaks subsequent commands with getcwd errors.
