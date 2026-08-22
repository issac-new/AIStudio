---
name: skill-board-scoping
description: "Use when creating profiles or fixing skill-link bloat."
version: 1.0.0
metadata:
  hermes:
    tags: [skills, profiles, context-optimization, entropy, link-board]
    related_skills: [skill-library-maintenance, harness-entropy-management, multi-agent-orchestration-design, hermes-redundancy-cleanup]
---

# Skill Board Scoping

Every profile's `skills/` directory is a **curated set of symlinks** into the
shared layer `~/.hermes/skills/`. The rule: **a profile links only what its
team's workflows actually use.** The historical failure mode is the "全家桶
board" — every profile linking all 38 shared categories, indexing ~1000 skills
into every system prompt (~70% waste).

## When to Use

- Creating a new profile (set its board from the mapping below, don't copy another profile blindly)
- After `hermes` update or `clawskills` install re-populates a profile's links
- Quarterly entropy scan (pair with `skill-library-maintenance` verification)
- A profile's indexed-skill count drifts far above its team's baseline

## The Mapping (canonical, 2026-08-05)

Shared categories live in `~/.hermes/skills/`. Profiles symlink subsets:

| Team / profile | Linked categories |
|----------------|-------------------|
| **orchestrator** | agently-mail apikey-image-gen autonomous-ai-agents cognition-lattice computer-use devops devops-worker github grok-image-to-video hack-team* hermes-themes markdown-viewer mcp media mlops productivity research software-development wechat-article-extractor wechat-article-search (+ its 52 real single-skill dirs) |
| **hack-*** (recon/exploit/auditor) | cognition-lattice computer-use cybersecurity devops-worker github mcp red-teaming research software-development wechat-article-extractor wechat-article-search |

NOTE: `dogfood` ships inside `software-development/dogfood` — do NOT also link the top-level `dogfood` category into a profile that already links `software-development` (duplicate index entry, removed 2026-08-05). Same for `computer-use` vs `autonomous-ai-agents/computer-use`: link ONE of the two.
| **hack-forensics** | above + cybersecurity-forensics + cybersecurity-detection |
| **worker-*** (coder/researcher/tester) | autonomous-ai-agents data-science devops-worker github mlops productivity research software-development |
| **[已移除]-*** + [已移除]-orchestrator | apikey-image-gen creative github grok-image-to-video [已移除]* markdown-viewer media productivity research software-development |
| **[已移除]-*** | github mlops productivity research software-development |
| **ops-*** | github mcp productivity research software-development |
| **product-*** | github productivity research software-development |
| **platform-*** | devops github productivity software-development |

`*` = real directory in that profile, not a shared symlink.

**Unlinked shared categories** (deliberately no profile links; recover by
adding one symlink if ever needed): `cybersecurity-defense`,
`cybersecurity-compliance`, `gaming`, `smart-home`, `social-media`, `leisure`,
`apple`, `email`, `note-taking`, `creative` (except [已移除]), `yuanbao`, `gifs`,
`feeds`, `diagramming`, `red-teaming` (hack only).

## Category Splits (structural, don't merge back)

- `cybersecurity` = 59 offensive/red-team only
- `cybersecurity-forensics` = 60 disk/memory/malware/IR
- `cybersecurity-detection` = 129 detecting-/hunting-
- `cybersecurity-defense` = 156 hardening/building/auditing (unlinked)
- `cybersecurity-compliance` = 7 CMMC/NIST/RMF (unlinked)
- `devops` = 139 orchestrator-only cluster-governance meta-skills
- `devops-worker` = 12 genuine worker skills (kanban-worker, pua-*, cognition-self-check, scope-discipline, report-data-verification, agent-harness-best-practices, release-gates)

## Apply / Repair Procedure

```bash
S=$HOME/.hermes/skills

apply_board() {
  local prof="$1"; shift
  local P=$HOME/.hermes/profiles/$prof/skills
  mkdir -p "$P"
  find "$P" -maxdepth 1 -type l -delete          # clear stale links, keep real dirs
  for cat in "$@"; do
    [ -e "$P/$cat" ] && continue                  # don't overwrite real dirs
    [ -e "$S/$cat" ] && ln -s "$S/$cat" "$P/$cat" || echo "MISSING: $cat"
  done
}

# example: reset the [已移除] team
[已移除]="apikey-image-gen creative github grok-image-to-video markdown-viewer media productivity research software-development"
for p in [已移除] [已移除] [已移除] [已移除] [已移除] [已移除]; do
  apply_board $p $[已移除]
done
```

**Safety**: `find -type l -delete` only removes symlinks — real dirs
(`[已移除]`, orchestrator's 52 singles, `hack-team`) are untouched.
Back up the board first: `ls $P > /tmp/$prof.before.txt`.

## Verification

```bash
# per-profile indexed count — compare against baselines below
for p in $HOME/.hermes/profiles/*/skills; do
  prof=$(basename $(dirname "$p")); case "$prof" in *.archived|_shared) continue;; esac
  echo "$prof: $(find -L "$p" -maxdepth 3 -name SKILL.md 2>/dev/null | wc -l | tr -d ' ')"
done

# broken links (must be 0)
for base in $HOME/.hermes/skills $HOME/.hermes/profiles/*/skills; do
  for l in $(find "$base" -maxdepth 1 -type l 2>/dev/null); do
    [ -e "$l" ] || echo "BROKEN: $l"
  done
done
```

**Baselines (2026-08-05, post round-7)**: orchestrator 311, hack-forensics 325, hack-* 136,
worker-* 103, [已移除]-* ~104, [已移除]/ops 84, product 82, platform 192. A profile
suddenly showing ~1000 means the 全家桶 regression — re-apply its board.

## Structural fixes applied 2026-08-05 (round 7)

- Archived 3 zero-skill stub categories from shared (`diagramming`, `feeds`,
  `gifs` — DESCRIPTION.md only) → `skills-archive/_backup_20260805_221413/shared-stubs/`.
- Removed duplicate `dogfood` top-level links from hack-* (already nested in
  `software-development`). Top-level `dogfood`/`computer-use` categories remain
  in shared as canonical redirect targets for profiles that do NOT link the
  parent category.

## Watchdog cron (round 8, 2026-08-05; merged tools round 2026-08-05)

`inventory-drift-watchdog` (job_id `3c7e6d674e77`) runs
`~/.hermes/profiles/orchestrator/scripts/inventory_watchdog.py` every Monday
09:00, `no_agent=True`, `deliver=local`. Silent when healthy (exit 0, empty
stdout); on drift it prints the offending profiles/links/tools and exits 1 so
the scheduler logs an alert. Checks TWO inventories in one pass:
(1) skill boards — per-profile indexed-count drift vs baselines (±25%),
    unscoped new profiles, broken symlinks, zero-skill stub categories;
(2) tool inventory — brew leaves/npm global/pipx/uv/conda count drift vs
    baselines (±20–50%), banned re-installs (competing agent CLIs).
Re-verify after any hermes update: `python3 .../inventory_watchdog.py; echo $?`.

## Update-time self-healing (2026-08-06)

`hermes update` is git-pull-driven from `~/.hermes/hermes-agent/` and has no
official post-update hook — so a git `post-merge` hook is installed at
`~/.hermes/hermes-agent/.git/hooks/post-merge`. Every `git pull` that brings
new commits (i.e. every update) automatically:

1. Runs `inventory_watchdog.py` (skills + tools drift check)
2. On drift → re-applies all 24 canonical link boards (the `apply_board`
   function from this skill) and prunes broken links
3. Re-runs the watchdog; logs to `~/.hermes/logs/post-merge-inventory.log`
4. Never blocks the merge (always exit 0)

Verified end-to-end 2026-08-06: injected 2 drifts → watchdog flagged → hook
re-applied 24 boards → re-check healthy.

**Note**: `sync_skills()` is symlink-safe (`dest.exists()` short-circuits), so
update never destroys link boards directly. The real drift vectors it guards
against: upstream skill renames/recategorization leaving stale links, new
bundled categories appearing unscoped, and tools installed during update.
The weekly Monday cron remains as the backstop for non-update drift
(manual `brew install`, `ln -s` experiments, new profile creation).

## Source-patch self-healing (2026-08-06)

The same post-merge hook also restores **local source patches** that
`hermes update` wipes via `git stash` + `git reset --hard`:

- `~/.hermes/patches/apply-source-patches.sh` — idempotent applier with
  per-patch signature checks (skip if present, `git apply`, fallback `--3way`,
  detect already-applied via `--reverse --check`). Covers: bigmodel-401-fix
  (anthropic_adapter + auxiliary_client), weixin-local, main-local,
  tui-widgets-doc, plus delegation to the 3 existing apply scripts
  (tui-patches, kanban-worktree-default, acp-client-codex-fix).
- TUI dist auto-rebuilds when any `.tsx` patch re-applies.
- Untracked files (`git status ??`) need no patch — update's stash/reset
  doesn't touch them.
- Verified end-to-end: wipe simulation → hook → 11 modified files restored
  byte-identical to pre-wipe state (0 diffs), test stash dropped.

Logs: `~/.hermes/logs/post-merge-inventory.log` +
`~/.hermes/logs/apply-source-patches.log`. To add a new protected edit:
modify source → `git diff <files> > ~/.hermes/patches/<name>.patch` → add a
SPECS line to apply-source-patches.sh.

## Pitfalls

1. **Never copy another profile's board when creating a new profile** — that's
   how the 全家桶 spread. Pick the team row from the mapping.
2. **`find -delete` on links only** — running `rm -rf` on the skills dir
   deletes real custom dirs (hack-team, [已移除]) permanently.
3. **hermes updates may re-link** shared categories into profiles — re-run this
   skill's verification after any `hermes` self-update.
4. **orchestrator is the only profile that links full `devops`** — workers get
   `devops-worker` (12 skills), never the 139-skill governance catalog.
5. **Unlinked ≠ deleted** — defense/compliance/gaming etc. stay in the shared
   layer. Adding one symlink restores them; nothing was moved to archive.

## Related Skills

- **skill-library-maintenance** — physical-copy dedup + symlink-loop repair
  (structural health); this skill is the link-board policy (what SHOULD be linked).
- **harness-entropy-management** — cron the verification script quarterly.
- **multi-agent-orchestration-design** — profile/skill-category gap analysis.
