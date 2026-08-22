---
name: hermes-skills-update-protection
description: "Use when hermes update re-vivifies archived skills."
version: 1.0.0
metadata:
  hermes:
    tags: [hermes, update, skills, symlink, copytree, patch, regression, watchdog]
    related_skills: [hermes-update-revert-forensics, update-time-inventory-self-healing, skill-board-scoping, skill-library-maintenance, agent-profile-skill-audit]
---

# Hermes Skills Update Protection

`hermes update` (git-pull-driven) can silently resurrect archived skills and
materialise real-dir copies inside profiles. This skill is the **permanent
fix + regression discipline** so a curated skill library survives every update.

## Core corrected fact (2026-08-06, evidence-based)

`sync_skills()` in `~/.hermes/hermes-agent/tools/skills_sync.py` is **NOT
symlink-safe**. It uses `shutil.copytree(skill_src, dest)` (~L398/826/882);
`dest.exists()` only short-circuits paths that ALREADY exist. After a slimming
round archives a category away, the next update's
`seed_profile_skills()`→`sync_skills()` (HERMES_HOME=<profile_dir>) sees the
category "missing" and COPIES it back as a REAL DIRECTORY. Three resurrection
vectors, all observed 2026-08-06:

1. copytree of bundled categories into profile skills (real-dir copies)
2. post-merge hook Phase-0 `untracked-skills-snapshot.tar.gz` restoring
   untracked custom skills back into the bundled source, which then diffuses
   to shared + profiles
3. `apply_board`'s `[ -e "$cat" ] && continue` skipping real-dir copies forever

The earlier "symlink-safe" claim in `update-time-inventory-self-healing` and
`skill-board-scoping` (both shared-layer skills, default profile) is WRONG —
do not re-cite it. Those skills live in `~/.hermes/skills/devops/` and cannot
be patched from an orchestrator session (resolve to default profile).

## The permanent fix (all verified, all survive update)

### Layer 1 — skills_sync.py symlink-install patch
`~/.hermes/patches/hermes-skills-symlink-install.patch`, auto-replayed by
`apply-source-patches.sh` (add SPECS line). Named profiles (SKILLS_DIR under
`~/.hermes/profiles/<name>/skills`) install missing categories as SYMLINKS to
`~/.hermes/skills/` instead of copytree real dirs. Helper
`_install_skill_dest(skill_src, rel, quiet=False, raise_on_error=False)`.

### Layer 2 — post-merge hook apply_board v2 (demote)
```bash
if [ -L "$P/$cat" ] || [ -e "$P/$cat" ]; then
  if [ -d "$P/$cat" ] && [ ! -L "$P/$cat" ] && [ -d "$S/$cat" ]; then
    rm -rf "$P/$cat"
    ln -s "$S/$cat" "$P/$cat"
  fi
  continue
fi
[ -e "$S/$cat" ] && ln -s "$S/$cat" "$P/$cat"
```

### Layer 3 — watchdog DIRCOPIES shape check
`inventory_watchdog.py` flags real-dir copies whose category ALSO exists in
shared (orchestrator exempt; custom-only dirs like [已移除] legal).
Update EXPECTED baselines after any shape change (re-count with followlinks).

### Layer 4 — snapshot hygiene
`~/.hermes/patches/untracked-skills-snapshot.tar.gz` +
`untracked-skills-manifest.txt` — rebuild AFTER pruning skills, so deleted
custom skills do not re-seed through the post-merge Phase-0 restore.

## Patches: the three pytest-regression bugs (learned the hard way)

When patching `tools/skills_sync.py`, these three mistakes each cost a pytest
failure (`tests/tools/test_skills_sync.py`):

1. **`_shared_layer_target` absolute-path rebase**: `Path.home()/".hermes"/"skills"/rel`
   with rel an ABSOLUTE dest path discards the prefix (shared target becomes
   dest itself → symlink onto itself). Fix:
   `rel.relative_to(SKILLS_DIR)` fallback `Path(rel.name)`.
2. **`_is_named_profile_home` must key on SKILLS_DIR, not HERMES_HOME**:
   sync tests patch `SKILLS_DIR` to tmp but leave HERMES_HOME real
   (orchestrator → under ~/.hermes/profiles/) → wrongly took symlink branch.
   Fix: derive from `SKILLS_DIR.resolve()` vs `~/.hermes/profiles/skills`.
3. **Update branch must propagate exceptions**: `_install_skill_dest`
   swallowed OSError; the update branch (move dest→.bak, reinstall, restore
   on failure) relies on exception propagation. Pass `raise_on_error=True`
   on the update-branch call.

## Regression discipline (run these, not system python)

- System python (`/opt/homebrew/.../python3.14`) has NO pytest. Always use
  `~/.hermes/hermes-agent/venv/bin/pytest` (pytest 9.1.1).
- Baseline: `git checkout tools/skills_sync.py` → expect `30 passed`.
- After patch: same suite → `30 passed`; full skills suite
  (sync + sync_client + guard + hub) → `185 passed`.
- Patch replay test (proves update auto-recovery):
  `cp tools/skills_sync.py /tmp/x` → `git checkout` →
  `git apply ~/.hermes/patches/hermes-skills-symlink-install.patch` →
  rerun tests → `cp /tmp/x tools/skills_sync.py`.

## Auditing pitfalls (re-verified 2026-08-06)

- `find <dir> -type d` FOLLOWS symlinks → false "real dir" lists. Use
  `find <dir> -maxdepth 1 ! -type l` or `[ -L path ]`.
- Bash glob `"$P/$cat"/*` gives trailing slash; `[ -L "path/" ]` follows the
  link (false). Drop the slash before `-L` checks.
- Naive cycle detection (`p.resolve() == resolved`) flags EVERY normal
  symlink chain (profile → shared → bundled) as a "cycle" (248 false
  positives). True cycle detection = depth-limited realpath with a seen-set
  (~40 hops, path repeats → real cycle). `find -type l ! -exec test -e`
  does NOT flag self-loops — scan with the depth-limited script.
- Real cycles ARE possible: a top-level shared symlink added while the nested
  dir already existed created `skills/[已移除]/[已移除]/[已移除]`
  (self-loop). Delete it; the chain still resolves via the top-level link.

## Domain-skill placement pattern

- Move the skill to a shared SUBcategory (`~/.hermes/skills/[已移除]/`,
  `~/.hermes/skills/[已移除]/`) AND create a TOP-LEVEL shared symlink, because
  `apply_board` does `ln -s "$S/$cat" "$P/$cat"` — slash-containing cats
  (`[已移除]/[已移除]`) make `ln` fail (no parent dir in profile).
  Keep board definitions using the TOP-LEVEL name.
- Link owning team's profiles to the top-level name; update [已移除]/[已移除] board
  rows in post-merge hook + skill-board-scoping mapping.
- orchestrator is NOT exempt from demotion: it had 6 stale partial copies of
  shared categories (apple/creative/email/note-taking/smart-home/social-media).
  Converting to symlinks gained 24 skills (336→360). Rule: orchestrator keeps
  real dirs ONLY for categories shared does NOT have (54 custom singles).

## Support files

- `references/20260806-fix-and-test-lessons.md` — full detail of the three
  pytest bugs, the exact patch helpers, and the audit re-verification.
