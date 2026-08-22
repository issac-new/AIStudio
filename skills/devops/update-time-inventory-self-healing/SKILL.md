---
name: update-time-inventory-self-healing
description: "Use when hermes updates drift skills or tools."
version: 1.0.0
metadata:
  hermes:
    tags: [skills, tools, update, drift, self-healing, entropy, watchdog]
    related_skills: [skill-library-slimming, skill-board-scoping, tool-inventory-baseline, harness-entropy-management]
---

# Update-Time Inventory Self-Healing

Prevent `hermes update` (and everyday entropy) from silently drifting a curated
skill library and CLI toolset. Three layers: a git post-merge hook that fires
at update time, a merged weekly watchdog cron, and the verified facts about
what update does and does not touch.

## Layer 1 — git post-merge hook (update-time)

`hermes update` = `git pull` inside `~/.hermes/hermes-agent/` — there is **no
official post-update hook** (`hermes hooks` events are tool-call lifecycle
only). So install a git hook at
`~/.hermes/hermes-agent/.git/hooks/post-merge` (chmod +x):

1. run the inventory watchdog (skills + tools)
2. on drift → re-apply all canonical team link boards (`apply_board`:
   `find <profile>/skills -maxdepth 1 -type l -delete`, then `ln -s` the team
   row from skill-board-scoping) and prune broken links
3. re-run the watchdog; log to `~/.hermes/logs/post-merge-inventory.log`
4. **always exit 0** — never block the merge

Hook pitfalls:

- `for l in $(find ...)` trips shellcheck SC2044. Select broken symlinks
  directly instead:
  `find "$base" -maxdepth 1 -type l ! -exec test -e {} \; -print | while IFS= read -r l`
- The hook lives in `.git/hooks/` — untracked, so it survives `git pull` but
  NOT a fresh `git clone` reinstall. After a reinstall, rewrite it.

## Layer 2 — merged weekly watchdog cron

One script `~/.hermes/profiles/orchestrator/scripts/inventory_watchdog.py`
checks BOTH inventories; cron `no_agent=True` (zero tokens), silent when
healthy, exit 1 + issue list on drift. Checks:

- **Skills**: per-profile indexed SKILL.md count vs baseline (±25%), unscoped
  new profiles, broken symlinks, zero-skill stub categories (skip dot-dirs).
- **Tools**: brew leaves / npm -g / pipx / uv / conda counts vs baseline,
  plus a banned-reinstall list (competing agent CLIs).

conda pitfall: count only `conda env list` lines containing `/envs/` and not
starting with `#` — plain `wc -l` miscounts comments, `base`, micromamba.

## What hermes update does and does NOT touch (verified in source)

- `sync_skills()` (`tools/skills_sync.py`) is **symlink-safe** —
  `dest.exists()` short-circuits; it never overwrites a link board.
- Real drift vectors: upstream skill renames/recategorization leaving stale
  links; `seed_profile_skills()` copying NEW bundled skills into every profile
  after update (`hermes_cli/update_cmd.py` ~L4377).
- Opt-out: a profile dir containing `.no-bundled-skills` gets zero bundled
  seeding (honored by both functions).

## Tool-pruning playbook (~12 GB freed 2026-08-05)

Bloat vectors, highest-yield first:

| Vector | Detection | Examples pruned |
|--------|-----------|-----------------|
| Duplicate runtimes | `brew uses --installed <t>` = none AND 0 SOUL.md grep hits | node@22/24/25/26, python@3.10, scala×2, llvm@16 |
| Competing agent CLIs | "is hermes the only agent runtime?" | gemini-cli, ironclaw, zeroclaw, flowise, n8n, agy (138MB Go bin), nanobot |
| Global npm libraries | `npm ls -g --depth=0` — libs are never CLIs | cheerio, react*, @babel/*, dotenv |
| Fossil conda envs | `ls -lt /opt/anaconda3/envs/` (>1yr) | kotaemon, dbgpt_env, dra, py310, xinference |
| Desktop toys | 0 SOUL.md references | mpv, autojump, himalaya, cliclick |

Rules:

1. **Backup before every round** — snapshot `brew leaves`, `npm ls -g`,
   `pipx list --short`, `uv tool list`, `conda env list` to a timestamped dir.
2. **Verify after** — `which` every workflow-critical tool; expect false
   alarms like `graphviz` (binary is `dot`).
3. **Archive, never delete** for skills (`mv` to skills-archive); brew/npm
   uninstalls are recoverable from the before-lists.

## Memory budget-full add: the 4-failure signature

When memory >90% and `add` is rejected:

1. batch `old_text` = full entry paragraph → "no entry matched"
   (must be a 6–12 word unique substring)
2. batch removals free less than the add needs → "over the limit"
   (over-provision ~1.5×)
3. repeated near-identical retries → runtime stops you; leave memory unchanged

Correct move: ONE `operations` batch, short-substring old_text, over-freed
budget; after 3 materially different rejections, put the fact in a skill or
hindsight instead.

## Verification

- `bash -n` + `shellcheck -S warning` on the hook (no pytest exists for hooks;
  inject-then-heal is the functional test: plant a broken link + a board
  drift, run the hook, assert both gone and watchdog exits 0).
- `python3 inventory_watchdog.py; echo $?` → 0 and silent when healthy.

## Related Skills

- **skill-library-slimming** — the slimming rounds this defends
- **skill-board-scoping** — canonical per-team link boards (apply_board source)
- **tool-inventory-baseline** — canonical toolset + banned list
- **harness-entropy-management** — the quarterly cron family this joins
