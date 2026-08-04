---
name: local-resource-soul-enrichment
description: "When user points to local path, enrich team SOULs."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-enrichment, resource-indexing, gap-analysis, dry-pattern]
    related_skills:
      - research-article-soul-enrichment
      - agent-soul-patching
      - soul-enrichment-command-manual
---

# Local Resource Directory → Team SOUL.md Enrichment

Enrich a team of agent SOUL.md files with knowledge of a **local filesystem
resource** — a textbook library, code repository, media archive, tool
collection, or any structured directory of knowledge/materials. This is the
**filesystem counterpart** to `research-article-soul-enrichment` (which
extracts knowledge from a web article URL).

## When to Use

- User points to a local directory path and asks to "analyze/enrich
  profiles with knowledge of this resource"
- User has a structured resource library (books, courses, tools, datasets)
  that a team of agents should know about and reference
- User wants a shared knowledge index created from local files, with each
  agent's SOUL.md patched to point to it

## When NOT to Use

- Source is a web article URL → use `research-article-soul-enrichment`
- Source is a GitHub repo to clone → use `agent-soul-patching` (for tools)
  or `deep-research-workflow` (for research)
- User asks for research only, no profile changes → use `scope-discipline`
- User asks to create a brand-new team → use `multi-board-team-deployment`

## Workflow (7 steps)

### Step 1: Traverse the resource directory

Use `terminal` with `ls`, `find`, `wc -l`, and `du -sh` to map the full
structure. For large directories (1000+ files), batch traversal by
subdirectory.

```bash
# Top-level structure
ls -la /path/to/resource/

# File counts per subdirectory
for d in /path/to/resource/*/; do
  echo "$(basename "$d"): $(find "$d" -type f | wc -l) files"
done

# Total scale
find /path/to/resource -type f | wc -l
du -sh /path/to/resource
```

**Key technique**: Iterate two levels deep (subject → publisher/version →
files) before reading individual files. This gives you the structural map
needed for gap analysis without reading thousands of files.

### Step 2: Read README or manifest files

Most resource libraries have a `README.md`, `manifest.json`, or index file.
Read it first — it often contains the project's mission, structure
explanation, and usage instructions (e.g. file-splitting conventions).

### Step 3: Create a shared index file

Create `references/<resource-name>-index.md` in the **orchestrator
profile** (or whichever profile serves as the team's central reference
hub). This is the DRY pattern — one comprehensive index that all SOUL.md
files point to, instead of duplicating the full catalog in every profile.

The index file should contain:

1. **Resource overview** — source, mission, total scale (file count, size)
2. **Age/stage guidance** — if the resource covers multiple levels
   (grades, difficulties), identify the CURRENT appropriate entry point
3. **Subject → agent → filepath mapping table** — the core lookup table
4. **Publisher/version preferences** — when multiple versions exist,
   recommend a default (e.g. 统编版/人教版 for textbooks)
5. **Usage commands** — `ls`, `read_file`, `search_files`, and any
   special handling (e.g. `cat` for split files)
6. **Routing guidance** — for orchestrator profiles, a keyword → agent
   → path routing table

### Step 4: Read all target team SOUL.md files

Batch `read_file` calls for every profile. For each, note:
- Section headers and their line numbers (find insertion points)
- Existing domain sections (gap = what's missing)
- The profile's domain identity (which subsets of the resource apply)
- Common structural anchors (e.g. `## 具体操作命令手册`)

### Step 5: Gap analysis — map resource subsets to profiles

Create a matrix: resource subjects × profiles. For each cell:
- **Owned**: this profile's domain directly maps to this subject
- **Adjacent**: this profile's domain partially overlaps
- **Distant**: minimal overlap — give a lightweight pointer, not full catalog

**Example** (ChinaTextbook, [已移除] team):
- `[已移除]` → 语文/统编版 (12册) + 书法(11版/86册) + 历史/道法
- `[已移除]` → 数学(8版/87册) + 科学(8版/153册) + 中考真题库
- `[已移除]` → 英语(27版/208册) — the richest subject
- `[已移除]` → 美术(12版) + 音乐(14版)
- `[已移除]` → 道德与法治/统编版 + 体育与健康(6版)
- `orchestrator` → routing table + default textbook list per subject

### Step 6: Batch-patch each SOUL.md

Use `patch(mode='replace')` to insert a new `## <Resource> 知识库` section
before a stable anchor (typically `## 具体操作命令手册`). Batch all
independent patches in a single turn — the runtime executes them
concurrently.

**Each profile's section should include**:
- Shared index file path (one-liner pointer — DRY)
- Local resource base path
- A profile-specific resource table (subjects this profile owns)
- Current-stage focus (⭐ marked entry point for the user's current need)
- Usage commands (tailored: `ls`, `read_file`, `search_files`)
- Adaptation/usage principles (e.g. "教材是备课参考，不是让孩子直接读PDF")

**Insertion pattern**:
```
old_string: "## 具体操作命令手册"
new_string: "## 教材资源库（<Name>）\n\n<content>\n\n## 具体操作命令手册"
```

### Step 7: Verify with a coverage script

Run an `execute_code` script that checks:
- Every profile has the new section (grep for section title)
- Every profile references the shared index file path
- Line count increased by expected amount per file
- The index file exists and contains key structural elements

```python
files = {'profile1': '/path/to/SOUL.md', ...}
for name, path in files.items():
    with open(path) as f:
        lines = f.readlines()
    has_section = any('教材资源库' in l or '教材知识库' in l for l in lines)
    has_index_ref = any('references/' in l for l in lines)
    print(f"{'✅' if has_section and has_index_ref else '❌'} {name}: {len(lines)} lines")
```

## Key Patterns

### 1. DRY: shared index file, not per-profile catalog duplication

For a 43GB / 2375-file resource with 100+ publisher versions, do NOT copy
the full catalog into each SOUL.md. Create ONE `references/<name>-index.md`
in the orchestrator profile, and have each teacher's SOUL.md contain only:
- A one-line pointer to the shared index
- A profile-specific subset table (only the subjects this profile owns)
- Current-stage focus (⭐ entry point)

This keeps each SOUL.md lean (~50-60 lines added) while the full catalog
lives in one searchable place.

### 2. Age/stage-aware entry point

When a resource covers all levels (e.g. 小学→高中), don't dump everything.
Identify the CURRENT appropriate entry point based on the user's context
(e.g. child's age → 一年级上册). Mark it with ⭐ in each SOUL.md so the
agent knows where to start. The full catalog remains in the index for
future stages.

### 3. `## 具体操作命令手册` as insertion anchor

In [已移除] and similar profile structures, `## 具体操作命令手册` is a
common section heading. Inserting before it places the new resource section
in the right structural position — after domain sections, before the
operational command reference. This is more reliable than appending at end
(which may collide with footer blocks like Loop Engineering/Privacy).

### 4. Publisher/version preference recommendations

When a subject has many publisher versions (e.g. 小学英语 has 27), the
index should include a "default recommendation" so agents don't have to
guess. Rule of thumb:
- **统编版** (national unified) for 语文/历史/道法 — authoritative
- **人教版** (People's Education Press) for most other subjects — most
  widely used
- **教科版** for science — mainstream version
- Mark exceptions where a specific version is better for a specific stage

## Pitfalls

### read_file dedup in execute_code

When `read_file` is called from `execute_code` on a file that was already
read earlier in the session, it returns `{'status': 'unchanged',
'content_returned': False}` with NO content key. Accessing `r['content']`
raises KeyError. Two workarounds:
1. Use `read_file(path, offset=1, limit=200)` — the offset forces a fresh
   read even if the file was seen before.
2. Use `open(path)` directly in the Python script (bypassing the tool).
   This is more reliable for batch file processing in execute_code.

### skill_manage cannot edit default-profile skills

`research-article-soul-enrichment` and `agent-soul-patching` are
symlinked from the `default` profile. `skill_manage(cross_profile=true)`
does NOT resolve them — the lookup fails. This is why this skill exists
as an orchestrator-native skill rather than a patch to the article-based
sibling.

### Patching SOUL.md files outside the active profile

The `patch` tool can edit SOUL.md files in other profiles ([已移除],
[已移除], etc.) without `cross_profile=true` — these are agent
configuration files, not skills. But if the patch targets a file in a
*different Hermes profile directory* (not the active profile's subdirectory),
the cross-profile write guard may trigger. The [已移除] teacher profiles live
under `~/.hermes/profiles/[已移除]-<name>/` which is a sibling profile
directory, not a subdirectory of orchestrator. The patch tool handled this
without error in the ChinaTextbook session, but if it fails, use
`cross_profile=true` on the patch call.

## Related Skills

- **research-article-soul-enrichment** — (default profile) Article URL
  variant of the same pipeline. This skill is the filesystem counterpart.
- **agent-soul-patching** — (default profile) General SOUL.md batch
  patching techniques, including the pre-footer insertion pattern and
  concurrency batching.
- **soul-enrichment-command-manual** — (default profile) Adding
  `## 具体操作命令手册` sections, the anchor this skill inserts before.
