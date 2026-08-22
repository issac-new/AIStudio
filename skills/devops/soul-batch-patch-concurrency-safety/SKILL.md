---
name: soul-batch-patch-concurrency-safety
description: Batch-patch SOUL.md when a cron edits the same files.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, patch-techniques, concurrency, verification]
    related_skills: [agent-soul-patching, soul-enrichment-command-manual, soul-enrichment-pipeline]
---

# SOUL.md Batch-Patch Concurrency Safety

When you batch-patch multiple agent SOUL.md files, a **background cron job or
sibling agent** (commonly a `soul-enrichment-*` cron, or a parallel
`delegate_task` worker) may edit the same files in the same time window. The
`patch` tool's separate read → fuzzy-match → write phases race against the
concurrent writer, producing silent corruption that a single-file re-read
won't catch. This skill is the mitigation + verification layer that sits on
top of the patching techniques in `agent-soul-patching` and
`soul-enrichment-command-manual`.

## When to Use

- Batch-patching 2+ SOUL.md files in one session (enrichment, tool-fix, rule insertion)
- A `soul-enrichment-*` cron is scheduled (check: `hermes cron list | grep -iE 'soul|enrich'`)
- You saw a `patch` warning: `modified since you last read it on disk`
- After any multi-file patch batch, before declaring done

## The Three Collision Symptoms

### 1. Modified-since-last-read warning

`patch` returns:
```
_warning: <file> was modified since you last read it on disk
(external edit or unrecorded writer). Re-read the file before writing.
```

**Meaning**: another writer touched the file between your `read_file` and the
patch write. The patch MAY still apply, but against stale content.

### 2. Garbled single-line merge

The patch tool glues `old_string` + `new_string` onto ONE physical line:
```
```+> **共享规则**：所有共享强制规则块见 ...
```
(instead of two separate lines). Happens because the file shifted between the
fuzzy-match phase and the write phase, so the replacement boundary landed
mid-line.

### 3. Duplicate sections

The concurrent process appends the SAME section at the file tail (e.g.
`## 具体操作命令手册`) while your patch inserts it mid-file. Result: two
copies. `grep -c "^## 具体操作命令手册"` returns 2 instead of 1.

A subtle variant: the concurrent process may also CLEAN UP duplicates it
created, so the section count can fluctuate (2 → 1 → 2) across re-reads. Do
not assume the first re-read is stable.

## Mitigation

### Prefer atomic Python writes during concurrent windows

When concurrent editors are active, prefer Python `str.replace()` over the
`patch` tool. A single `read → replace → write` in one `execute_code` call
has a smaller race window than `patch`'s three phases.

```python
from hermes_tools import read_file
import os

path = os.path.expanduser('~/.hermes/profiles/<profile>/SOUL.md')
r = read_file(path)
content = r['content']

ANCHOR = '> **共享规则**：所有共享强制规则块见'
NEW_SECTION = '\n\n---\n\n## 具体操作命令手册\n\n```bash\n...\n```\n'

assert content.count(ANCHOR) == 1, f"anchor count {content.count(ANCHOR)} ≠ 1, abort"
# also guard against double-insertion
assert '## 具体操作命令手册' not in content, "section already exists, abort"

new_content = content.replace(ANCHOR, NEW_SECTION + ANCHOR, 1)
```

The `assert` guards are critical: they make the operation idempotent and
fail-closed if the concurrent writer already added the section.

### Re-read before every chained edit

If a `patch` returns the "modified since last read" warning, **re-read the
full file** before the next edit. Never chain a second patch on content from
a stale read — the line numbers and anchor positions have moved.

### Deduplicate with a content-anchored patch, not a moving-target grep

If duplicates are found, do NOT chase the file with repeated best-effort
patches. Instead:
1. Read the full current file once.
2. Identify the canonical copy (usually the one in the correct structural
   position — e.g. before `## 退出协议`, not stranded after it).
3. Delete the duplicate by matching its FULL block content (anchor on the
   `---\n\n## 具体操作命令手册\n\n```bash\n...exact commands...\n```\n`
   text), replacing with empty string.
4. Re-verify.

## Batch Verification (run before declaring done)

After patching N files, run ONE verification pass checking all three failure
modes. This is the single most valuable step — it catches corruption that
per-file re-reads miss.

```bash
for p in <profile1> <profile2> <profile3>; do
  f=~/.hermes/profiles/$p/SOUL.md
  hdr=$(grep -c "^## 具体操作命令手册" "$f")   # expect 1
  opens=$(grep -c '```bash' "$f")              # fence opens
  closes=$(grep -c '```$' "$f")                # fence closes
  echo "$p: headers=$hdr opens=$opens closes=$closes"
done
```

**Pass criteria (all must hold, per file):**
- `headers == 1` (no duplicate sections — catches collision symptom #3)
- `opens == closes` (balanced fences — catches garbled merge, symptom #2)
- No line matches the garbled pattern ```` ```+> ```` (grep for backtick
  immediately followed by `>` or another non-newline char)

For section-name-agnostic use, swap the header grep for whatever section you
inserted. The invariant is: **each inserted header count == 1** and **bash
fence opens == closes**.

## Pitfalls

### First re-read after collision is not stable

After a collision, re-reading once may show duplicates that the concurrent
writer has already cleaned up, or vice-versa. If state keeps changing across
2+ re-reads, wait for the concurrent job to finish (check
`hermes cron list` / process list) before retrying, rather than racing it.

### Don't assume "self-corrected" means done

A concurrent enricher may clean up duplicates IT created, leaving YOUR
duplicate behind. Always run the batch verification yourself — never trust
that the final state is correct just because the file stopped changing.

### skill_manage cannot patch default-profile skills

The natural homes for this learning (`agent-soul-patching`,
`soul-enrichment-command-manual`) are symlinked from the `default` profile and
cannot be patched from `orchestrator` even with `cross_profile=True`. This
skill exists as the orchestrator-profile capture point. If the user wants the
learning merged into the default-profile skills, recommend
`hermes curator adopt soul-batch-patch-concurrency-safety`.

## Related Skills

- **agent-soul-patching** (default profile) — the two-phase patch + append
  technique this skill adds concurrency-safety to
- **soul-enrichment-command-manual** (default profile) — command-manual
  section anatomy and the `**`/`---` patch pitfalls
- **soul-enrichment-pipeline** (default profile) — multi-layer enrichment
  pipeline that frequently triggers concurrent-edit scenarios
