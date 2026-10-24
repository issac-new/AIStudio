---
name: update-skill-library-repair
description: "Use when hermes update empties skill dirs or counts drop."
version: 1.0.0
platforms: [macos, linux]
---

# Skills Library Repair (post-update)

## When to Use

- After `hermes update`: skill directories exist but are empty (no SKILL.md), or skill counts drop unexpectedly
- A worker-written skill disappeared shortly after being written
- Post-update verification of the skills library

## Verify First (always)

```bash
find -L ~/.hermes/skills -name SKILL.md | grep -v /archive/ | wc -l
```

Compare against the known-good count BEFORE deciding anything is wrong. Also check the post-merge log for `snapshot refreshed (0 skills)` — zero is an anomaly signal. An empty directory that once held content = sync damage, not deletion; the bytes are almost always recoverable.

## Recovery Sources (in order of preference)

### 1. Skills-archive snapshots
`~/.hermes/skills-archive/` contains per-profile mount snapshots and a `global/` tree. Find an intact copy (`skills-archive/<profile>/<category>/<name>/SKILL.md`; prefer `global/`) and copytree it back over the empty shell after rmtree.

### 2. Patch files
`~/.hermes/patches/*.patch` contain full new-file text for bundled skills. Parse the unified diff: split on `diff --git`, keep blocks with `--- /dev/null` (new files), reconstruct content from `+` lines. This recovers skills that were never in any snapshot.

### 3. Worker state.db
If a kanban worker wrote the file, its `state.db` FTS table stores the complete write_file arguments:
```sql
SELECT rowid FROM messages_fts_trigram WHERE messages_fts_trigram MATCH '"<unique string from the file>"'
```
Then extract the arguments JSON, json.loads twice (outer string escape, then the object), take `['content']`.

## Pitfalls

- **Verify counts after every `hermes update`** — post-merge can silently replace skill directories with empty shells; a count comparison is the only reliable detector.
- **Mine recovery sources before re-dispatching a worker to rewrite lost content** — the write already exists in state.db or a snapshot; re-dispatching costs a full run.
- **Restore only the empty shells** — rmtree the empty dir then copytree; do not touch directories that still have SKILL.md.
- **Compare on `<category>/<name>` paths, never basenames** — the same skill name can exist in multiple categories; basename-only audits miscount both losses and recoveries.
- **Check running kanban cards before mass-restoring** — repairing a file a live worker is mid-patching creates a double-write conflict.

## Reference Scripts

Working recovery scripts from a completed repair: `~/.hermes/bin/repair-20260908/` (restore_empty_shells.py, restore_from_patch.py, restore_shidianguji.py) — read as templates before writing new ones.
