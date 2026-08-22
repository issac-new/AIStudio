---
name: skill-library-maintenance
description: "Audit, deduplicate, and repair a multi-profile Hermes skill library. Detect physical-copy redundancy across profiles, convert to symlinks, repair self-referencing symlink loops in shared, and restore lost content from GitHub distribution repo. Use when ~/.hermes/skills has broken loops, profiles have stale physical copies, or after a fusion/clawskills install leaves duplicates."
version: 1.0.0
metadata:
  hermes:
    tags: [skills, maintenance, deduplication, symlinks, cleanup]
    related_skills: [hermes-redundancy-cleanup, harness-entropy-management, github-profile-distribution, hermes-disk-slimming]
---

# Skill Library Maintenance

Audit, deduplicate, and repair the skill library across a multi-profile Hermes
deployment. Covers three failure modes: physical-copy redundancy, self-referencing
symlink loops, and lost custom skills.

## When to Use

- After installing skills via `clawskills` or fusion sessions (leaves duplicates)
- When `skill_view` returns empty for skills listed in the system prompt
- When profiles have 10+ physical skill dirs that should be symlinks
- When `~/.hermes/skills/<category>` is a self-referencing symlink loop
- After a Hermes update leaves shared skill symlinks broken
- Routine quarterly maintenance (entropy accumulates silently)

## The Three Failure Modes

### Mode 1: Physical-Copy Redundancy

Non-orchestrator profiles (product-*, ops-*, [已移除]-*, hack-*) accumulate **physical
copies** of the same skill categories. Orchestrator uses symlinks correctly; other
profiles don't. Each profile wastes 5–15 MB; 11 profiles = 73–114 MB total.

**Detection**:
```bash
for p in ~/.hermes/profiles/*/skills/; do
  real=$(find "$p" -maxdepth 1 -type d ! -name '.*' ! -path "$p" | wc -l)
  [ "$real" -gt 0 ] && echo "$(basename $(dirname $p)): $real real dirs"
done
```

**Fix**: Replace each physical dir with a symlink to `~/.hermes/skills/<category>`,
but ONLY after verifying shared is a superset (≥ skill count). See
`references/skill-deduplication-and-symlink-repair.md` for the full procedure.

### Mode 2: Self-Referencing Symlink Loops

`~/.hermes/skills/<category>` may be a **self-referencing symlink** (points to
itself). This is a pre-existing issue caused by Hermes curator or prior updates.
ALL profile symlinks pointing to it will be broken. The system prompt's
`available_skills` list will show skills that can't actually be loaded.

**Detection**:
```bash
for d in ~/.hermes/skills/*/; do
  if [ -L "${d%/}" ]; then
    target=$(readlink "${d%/}")
    [ "$target" = "${d%/}" ] && echo "LOOP: ${d%/}"
    [ ! -e "$target" ] && echo "BROKEN: ${d%/} → $target"
  fi
done
```

**Fix**: Restore real content from the GitHub distribution repo
(`issac-new/SwarmTeam`) as a REAL directory. See references for the category
classification (which must be real vs symlink-to-hermes-agent).

### Mode 3: Lost Custom Skills

Custom skills (pua-*, harness-*, fusion-*) created in `~/.hermes/skills/devops/`
can be lost when the directory becomes a symlink loop. The GitHub distribution
repo is the recovery source.

**Fix**:
```bash
gh repo clone issac-new/SwarmTeam /tmp/SwarmTeam -- --depth 1
# Copy each broken category back as a REAL directory
for cat in devops cybersecurity ...; do
  link=~/.hermes/skills/$cat
  [ -L "$link" ] && rm "$link"
  cp -r /tmp/SwarmTeam/profiles/hack-exploit/skills/$cat "$link"
done
```

## Category Classification

### Must be REAL directories (custom skills, not in hermes-agent)

| Category | Skills | Content |
|----------|--------|---------|
| `devops` | 76 | pua-*, harness-*, fusion-*, kanban-*, gateway-* |
| `cybersecurity` | 410 | security audit/forensics playbooks |
| `gaming` | 2 | minecraft, pokemon |
| `mcp` | 2 | mcporter, native-mcp |
| `leisure` | 1 | find-nearby |
| `red-teaming` | 1 | godmode |
| `remotion` | 1 | remotion |
| `hermes-themes` | 1 | theme authoring |
| `apikey-image-gen` | 1 | image generation |
| `data-science` | 2 | jupyter, viz |
| `grok-image-to-video` | 1 | video animation |
| `hermes-desktop-plugins` | 1 | desktop plugins |
| `markdown-viewer` | 1 | markdown diagrams |

### Symlinks to hermes-agent/skills/ (bundled skills)

`apple`, `research`, `creative`, `email`, `media`, `productivity`,
`autonomous-ai-agents`, `software-development`, `mlops`, `github`,
`note-taking`, `smart-home`, `social-media` (20 categories total).

### Symlinks to other locations

- `cognition-lattice` → `~/.cc-switch/skills/cognition-lattice`
- `wechat-article-extractor/search` → `~/.agents/skills/`
- `agently-mail` → `~/.agents/skills/agently-mail` (MUST use absolute path)
- `dogfood` → `hermes-agent/skills/software-development/dogfood`
- `computer-use` → `hermes-agent/skills/autonomous-ai-agents/computer-use`
- `hyperframes` → `hermes-agent/optional-skills/creative/hyperframes`
- `yuanbao` → `hermes-agent/optional-skills/yuanbao`

## Full Verification Script

```python
from pathlib import Path
import os

# Check shared
broken_shared = 0
for item in Path.home().joinpath(".hermes/skills").iterdir():
    if item.is_symlink():
        target = os.readlink(item)
        if not Path(target).exists() or target == str(item):
            broken_shared += 1

# Check all profiles
all_ok = True
for pd in sorted(Path.home().joinpath(".hermes/profiles").iterdir()):
    if not pd.is_dir() or pd.name.startswith(("_", ".")):
        continue
    ps = pd / "skills"
    if not ps.exists():
        continue
    broken = sum(1 for i in ps.iterdir()
                 if i.is_symlink() and not Path(os.readlink(i)).exists())
    if broken > 0:
        all_ok = False
        print(f"❌ {pd.name}: {broken} broken")

print(f"Shared broken: {broken_shared}")
print(f"All profiles OK: {all_ok and broken_shared == 0}")
```

## Pitfalls

1. **Never symlink a profile to shared without verifying shared is a REAL dir** —
   a self-referencing loop in shared breaks ALL profiles pointing to it.

2. **The GitHub distribution repo is the ONLY recovery source** for custom skills
   lost to symlink loops. Clone `issac-new/SwarmTeam` and copy categories back.

3. **hermes-agent/skills/ is the git source repo** — leave it untouched; it's the
   canonical source for bundled skills, not redundant with shared.

4. **Profile-specific skills stay as real dirs** — `hermes-themes`, `hack-team/`,
   `[已移除]`, `kanban-worktree-workspace` etc. don't exist in
   shared and shouldn't be symlinked.

5. **`agently-mail` symlink MUST use absolute path** — relative paths from
   `profiles/orchestrator/skills/` don't resolve correctly across profile spawns.

6. **Content version matters** — shared is usually newest (after clawskills
   installs or fusion patches); profile physical copies are often stale. Always
   prefer shared when it's a superset.

7. **skill_manage can't patch skills in other profiles** — for skills in the
   `default` profile (like `hermes-redundancy-cleanup`), use `write_file` with
   `cross_profile=true` to write to the physical path directly.

8. **Never fabricate a profile/skill name from memory** — before any "delete this
   profile" or "migrate this skill" plan, run:
   ```bash
   ls ~/.hermes/profiles/ | grep -i "<name>"
   grep -l "<name>" ~/.hermes/skills/*/*/SKILL.md 2>/dev/null
   grep "<name>" ~/.hermes/profiles.yaml 2>/dev/null
   ```
   Memory files describe *what was planned* or *what was discussed* without the
   artifact ever being created. A user asking "why does this exist?" or
   "什么时候多了 X" is often the first signal that a prior assistant invented
   the name. See "Verification Before Acting" below for the full discipline.

9. **When extracting a duplicated SOUL.md paragraph into a shared skill, treat
   it as mechanical surgery**:
   - **Backup first** to `~/.hermes/profiles-archive/YYYY-MM-DD-task-name/`
     with timestamp suffix on each file. P3 祖训.
   - **Anchor on unique heading + sentinel next-section heading**, e.g.
     `### 过程性反馈话术...` followed by `### 成长型思维干预` — the regex
     pattern captures the block in between.
   - **Use `re.sub(pattern, replacement, content, count=1, flags=re.DOTALL)`**
     not line-based editing. SOUL.md paragraphs span 5–30 lines and regex
     with DOTALL handles block boundaries cleanly.
   - **Replace ONLY the duplicated paragraph**; preserve everything after
     (per-subject customizations stay where they are — they are
     subject-specific, NOT redundant).
   - **Verify with TWO independent checks** (never trust one alone):
     - `wc -l` line count must equal pre-replacement count (no content loss).
     - Content anchor checks via `python3 -c "...in content..."` for each
       preserved section heading.
   - `wc -c` byte count WILL differ by 14–59 bytes per replaced paragraph
     (1-line table → 6-line blockquote) — that's expected and correct. Don't
     treat byte delta as "content loss" (caught during 2026-08-19 mom-feedback
     extraction; python heredoc indentation produced false `wc -c` reading).
   - **After replacement, run smoke test**:
     `HERMES_PROFILE=<p> hermes prompt-size --json` per affected profile and
     confirm the new skill appears in `skills_breakdown` with non-zero
     `index_line_bytes`.

10. **Heredoc brace escaping**: when using Python `re.sub` with a replacement
    string that contains `{}` placeholder syntax, call `.format(...)` ONLY
    if you want substitution. Otherwise use string concatenation:
    `replacement = "..." + var + "..."`. Forgetting to escape braces inside
    a `.format()` call throws `NameError: name 'X' is not defined` (caught
    during 2026-08-19 mom-feedback extraction, replacing 4 teacher profiles
    in a single Python block).

11. **`write_file` mirrors to `~/.hermes/hermes-agent/skills/`**, not to
    `~/.hermes/profiles/<p>/skills/`. They are the SAME location via
    symlink/canonical-path resolution — do NOT create the file twice in both
    locations; that creates divergent copies that the next session will
    inconsistently pick. Verify with `readlink -f` or `stat -f %i` (inode
    check) before creating.

## Verification Before Acting (事实虚构防线)

> **Incident 2026-08-19**: assistant listed `mom-feedback-coaching` as a
> separate agent profile based on memory alone — `ls ~/.hermes/profiles/`
> proved it never existed. The user's "什么时候多了" question exposed
> the fabrication. This is the **事实虚构红线** — memory captures intent
> / discussion / plan state, NOT artifact state.

**Operating discipline for any "delete X" / "modify Y" / "consolidate Z" plan**:

| Step | Command | Purpose |
|------|---------|---------|
| 1. Confirm artifact exists | `ls ~/.hermes/profiles/<name>/` | profile directory |
| | `grep -l "name: <x>" ~/.hermes/skills/*/*/SKILL.md 2>/dev/null` | skill file |
| | `grep "<name>" ~/.hermes/profiles.yaml 2>/dev/null` | config registration |
| 2. Confirm caller can act | `cat ~/.hermes/profiles/<name>/config.yaml` | perms + assignments |
| 3. Plan, then ask user | surface options as ABC, wait for "执行" | avoid unilateral moves |
| 4. Backup before mutation | `cp ... ~/.hermes/profiles-archive/YYYY-MM-DD-task/` | P3 祖训 |
| 5. Smoke test after mutation | `hermes prompt-size --json` + content anchor checks | regression guard |

**Failure modes to refuse (without disk-level proof)**:
- "Delete profile X because it's redundant"
- "Skill Y is duplicated 5x"
- "Replace section Z in 6 files"
- "Migrate this skill to that profile"

**Memory vs disk resolution rule**: when memory says X exists but disk says
no, memory is wrong. Memory is sticky plan state, not artifact inventory.

## Related Skills

- **hermes-redundancy-cleanup** — (default profile) Broader ~/.hermes cleanup:
  .bak files, logs, sessions, config divergence. This skill complements it by
  focusing specifically on the skills/ directory tree.
- **harness-entropy-management** — Periodic entropy scanning cron job; this
  skill's verification script can be added to the entropy scan.
- **github-profile-distribution** — The GitHub repo serves as recovery source
  for lost custom skills.
- **hermes-disk-slimming** — Broader disk space reclamation; skill
  deduplication (73–114 MB) is a subset.
- **open-source-skill-fusion** — Fusion sessions create new custom skills that
  must be preserved in shared as real directories.
- **mom-feedback-coaching** — Worked example (2026-08-19) of the
  "Mechanical Surgery" pattern: 6 teacher profiles shared one duplicated
  SOUL.md paragraph; extracted to a single shared skill, replaced 5 with
  1-line references + 2-line subject-variant hints, kept [已移除] full
  (it carries the P0 投壶事件 case study). Smoke test: 6/6 profiles load the
  new skill, SOUL.md line count unchanged.
