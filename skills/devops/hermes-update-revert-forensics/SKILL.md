---
name: hermes-update-revert-forensics
description: "Use when hermes update may have reverted skill changes."
version: 1.0.0
metadata:
  hermes:
    tags: [hermes, update, forensics, skills, symlink, drift, copytree]
    related_skills: [skill-board-scoping, update-time-inventory-self-healing, skill-library-slimming, tui-patch-persistence]
---

# Hermes Update-Revert Forensics

Determine whether `hermes update` reverted local skill/profile/TUI changes, and
why — with evidence, never guesses. This class of question recurs after every
slimming round ("是不是又因为 hermes update 被改回来了?").

## When to Use

- User suspects an update reverted skill-board scoping, archived categories,
  symlink structure, or config edits.
- Skills that were archived/suppressed reappear in profiles after an update.
- A profile shows BOTH real-dir copies AND symlinks for the same categories
  ("dual-track" signature).

## CORRECTED core fact (2026-08-06, evidence-based)

`sync_skills()` in `~/.hermes/hermes-agent/tools/skills_sync.py` is **NOT
symlink-safe**. It uses `shutil.copytree(skill_src, dest)` (~L398/826/882);
`dest.exists()` short-circuits only protect paths that ALREADY exist. After a
slimming round archives a category away, the next update's sync sees the
category "missing" and COPIES it back as a REAL DIRECTORY. So:

- Update does NOT delete link boards, but it DOES re-vivify archived/suppressed
  categories as real-dir copies.
- Locally-residual skills (partially removed from a profile's `productivity/`
  or other local dir) are left untouched and re-appear as "mismatched" skills.
- An earlier note in `skill-board-scoping`/`update-time-inventory-self-healing`
  claiming symlink-safety is WRONG — do not re-cite it.

## The 5-step forensic method

1. **Find update instants**: `cd ~/.hermes/hermes-agent && git reflog --date=iso | head`
   — every `merge origin/main: Fast-forward` line is an update moment.
2. **Read file-shape mtimes**: `ls -laT ~/.hermes/profiles/<p>/skills/`
   (BSD `-T` = full timestamps). Batch of REAL DIRS all stamped ~1 min after a
   merge = copytree re-vivification. Distinct symlink batch stamp = post-merge
   hook re-linking. Distinguish `d` (dir) vs `l` (symlink) in column 1.
3. **Correlate logs**: `~/.hermes/logs/post-merge-inventory.log`,
   `apply-source-patches.log`, `hermes-update.log`/`update.log`,
   `bootstrap-installer.log`. A "healthy, no action" watchdog line does NOT
   prove skill shape survived — it may be shape-blind (see below).
4. **Diff against pre-state**: `~/.hermes/skills-archive/_backup_*/` holds
   `profile-replaced/`, `linkboards/*.before.txt`, `removed/` — compare to see
   exactly which categories re-appeared and which residual skills were left.
5. **Verify content identity**: `diff -rq <profile>/skills/<cat>
   ~/.hermes/skills/<cat>` — identical copy = copytree clone, not a link.

## Watchdog shape-blindness (why drift may not fire)

`inventory_watchdog.py` counts SKILL.md files reached via symlink OR real-dir
copy alike, so copytree re-vivification can keep counts inside the ±25%
baseline and never trigger. Fix class: add a SHAPE check (real dir where a
symlink is expected, or a suppressed-category list) to the watchdog, not just
a count check.

## Prevent recurrence

- Delete residual mismatched skills from BOTH profile dirs and
  `skills-archive/` (a backup copy can re-seed a later restore).
- Add suppressed/archived categories to the sync skip list (or a
  `.no-bundled-skills` marker dir in profiles that must not be seeded).
- If patching `skills_sync.py` to link-only, add the patch to
  `~/.hermes/patches/apply-source-patches.sh` so it auto-replays after update
  (same pattern as TUI patches).

## Pitfalls

- `find <profile>/skills -maxdepth 1 -type l -delete` only removes symlinks —
  it does NOT remove copytree real-dir clones. A board re-apply that only
  deletes links will leave the clones behind.
- Do not conclude "update wiped it" from mtimes alone — correlate with
  reflog merge instants first.
- Shared-layer skills (`~/.hermes/skills/devops/...`) resolve to profile
  'default'; `skill_manage` from 'orchestrator' refuses edits to them
  (known quirk). Edit via cross-profile file tools or from the owning profile.

## Support files

- `references/20260806-copytree-revivification.md` — full evidence timeline
  of the 8/5→8/6 round: slimming → post-merge hook → 09:57 merge → 09:58
  batch dirs → 14:55 merge → 14:55:44 symlink batch → dual-track result.
