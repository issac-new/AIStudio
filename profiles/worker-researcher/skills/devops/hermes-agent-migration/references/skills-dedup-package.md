# Skills-Only Dedup Package (Mode C)

## Use Case

When the user wants to **deduplicate the skill library** across all profiles and
package only the unique skills — no configs, no personality files, no runtime
data. Typical scenario: migrating skills to another machine where the agent
already has its own configs/personality, or sharing a curated skill library
with a teammate.

**Key difference from Mode A/B**: This mode packages ONLY `skills/` directories,
deduplicated. No `.env`, `config.yaml`, `SOUL.md`, `*_rules.md`, `plugins/`,
`memories/`, or `hindsight/`. It is the smallest and simplest package.

## Why Dedup Is Needed

In a multi-profile Hermes deployment (e.g. 9 profiles: orchestrator + 8 workers),
the same skills are copied into every profile's `skills/` directory, PLUS there
is a global `~/.hermes/skills/` directory shared by all profiles. This means:

- ~954 skill directory instances across global + 9 profiles
- Only ~139 unique skills (86% are exact duplicates)
- ~160 MB total → ~10 MB after dedup (94% reduction)

Without dedup, a skills-only zip would contain 8+ copies of most skills.

## The Dedup Algorithm

### Step 0: Scan BOTH global AND per-profile skills directories

**Critical**: Hermes has TWO skill locations:
1. **Global**: `~/.hermes/skills/` — shared skills available to ALL profiles
2. **Per-profile**: `~/.hermes/profiles/<profile>/skills/` — skills specific to one profile

If you only scan per-profile directories, you will miss ~24 skills that exist
only globally (e.g. `social-media/xitter`, `software-development/writing-plans`,
`feeds/`, `leisure/`, `cognition-lattice/`, `wechat-article-extractor/`, etc.).

The global directory is the canonical baseline; per-profile directories contain
overrides and additions. The dedup must scan BOTH and merge them.

### Step 1: Scan all sources

A "skill" is defined as: **any directory containing a `SKILL.md` file**.

```python
import os, hashlib
from collections import defaultdict

HERMES_HOME = os.path.expanduser("~/.hermes")
GLOBAL_SKILLS = os.path.join(HERMES_HOME, "skills")
PROFILES_DIR = os.path.join(HERMES_HOME, "profiles")
SKIP_DIRS = {'.curator_backups', '.hub', '__pycache__', '.curator_state'}

def find_all_skills(skills_dir, source_name):
    """Returns list of dicts: {rel, src, path, size, files, md5}"""
    results = []
    if not os.path.isdir(skills_dir):
        return results
    for root, dirs, files in os.walk(skills_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        if "SKILL.md" in files:
            rel = os.path.relpath(root, skills_dir)
            total_size = 0
            file_count = 0
            for r2, d2, f2 in os.walk(root):
                d2[:] = [d for d in d2 if d not in SKIP_DIRS]
                for ff in f2:
                    try:
                        total_size += os.path.getsize(os.path.join(r2, ff))
                        file_count += 1
                    except: pass
            try:
                with open(os.path.join(root, "SKILL.md"), "rb") as fh:
                    md5 = hashlib.md5(fh.read()).hexdigest()
            except:
                md5 = "ERR"
            results.append({"rel": rel, "src": source_name, "path": root,
                           "size": total_size, "files": file_count, "md5": md5})
    return results

all_skills = defaultdict(list)  # key: rel_path, value: [skill_dict, ...]

# Scan global first
for s in find_all_skills(GLOBAL_SKILLS, "GLOBAL"):
    all_skills[s["rel"]].append(s)

# Then scan each profile
for profile in sorted(os.listdir(PROFILES_DIR)):
    pdir = os.path.join(PROFILES_DIR, profile)
    if not os.path.isdir(pdir): continue
    skills_dir = os.path.join(pdir, "skills")
    for s in find_all_skills(skills_dir, profile):
        all_skills[s["rel"]].append(s)
```

### Step 2: Select the best version of each skill

Selection priority (for skills that appear in multiple sources):

1. **If all instances have identical content** (same MD5): prefer `GLOBAL`,
   then `orchestrator`, else first alphabetically.
2. **If content differs across sources**: prefer `GLOBAL` version; if global
   doesn't have this skill, pick the version with the **most files** (most
   complete), tie-breaking by total size.

**Why "most files" instead of "largest size"**: A skill with 2 files at 21KB
is more complete than 1 file at 24KB — the extra file (e.g. a `references/`
subdirectory) represents additional content that size alone may not capture
if a single large file outweighs it.

```python
selections = {}
diff_details = []

for rel, entries in sorted(all_skills.items()):
    if len(entries) == 1:
        selections[rel] = entries[0]
    else:
        md5s = set(e["md5"] for e in entries)
        if len(md5s) == 1:
            # Identical content — prefer GLOBAL, then orchestrator
            global_e = [e for e in entries if e["src"] == "GLOBAL"]
            orch_e = [e for e in entries if e["src"] == "orchestrator"]
            selections[rel] = global_e[0] if global_e else (orch_e[0] if orch_e else entries[0])
        else:
            # Different content — prefer GLOBAL, else most files
            global_e = [e for e in entries if e["src"] == "GLOBAL"]
            if global_e:
                selections[rel] = global_e[0]
            else:
                best = max(entries, key=lambda e: (e["files"], e["size"]))
                selections[rel] = best
            diff_details.append((rel, selections[rel], entries))
```

### Step 3: Copy to staging, preserving structure

```python
import shutil

STAGING = "/tmp/hermes-skills-dedup"
if os.path.exists(STAGING):
    shutil.rmtree(STAGING)
os.makedirs(STAGING)

for rel in sorted(selections.keys()):
    sel = selections[rel]
    dst = os.path.join(STAGING, "skills", rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    def ignore(d, names):
        return [n for n in names if n in SKIP_DIRS]
    shutil.copytree(sel["path"], dst, ignore=ignore)
```

### Step 4: Generate MANIFEST.md

A manifest documenting the dedup is valuable for the target environment. Include:

- Total sources scanned (global + N profiles), total skill instances, unique skills count
- Duplicate stats: identical vs different-content
- For different-content skills: which source's version was selected and why
- Full skill list with source and size
- Deployment instructions

### Step 5: Clean and zip

```bash
# Remove any residual runtime artifacts
find /tmp/hermes-skills-dedup -name '.DS_Store' -delete
find /tmp/hermes-skills-dedup -name '*.pyc' -delete
find /tmp/hermes-skills-dedup -type d -name '__pycache__' -exec rm -rf {} +

# Zip
cd /tmp
zip -r hermes-skills-dedup.zip hermes-skills-dedup/ \
  -x "*.DS_Store" -x "*__pycache__*" -x "*.pyc"

# Verify
unzip -l /tmp/hermes-skills-dedup.zip | grep -c "SKILL.md"
```

## Proven Results (global + 9-profile environment, 2026-07-21)

| Metric | Value |
|--------|-------|
| Sources scanned | Global + 9 profiles |
| Global skills | 122 |
| Total skill instances (with duplicates) | ~954 |
| Unique skills after dedup | 139 |
| Identical duplicate paths | 78 |
| Different-content paths | 21 |
| Staging dir size | ~10 MB |
| Final zip size | 3.8 MB |
| Files in zip | 1045 |
| Selected from GLOBAL | 104 |
| Selected from orchestrator | 14 |
| Selected from worker-coder | 11 |
| Selected from architect | 7 |
| Selected from worker-researcher | 3 |

### Previous run (profiles-only, 2026-07-21 — INCOMPLETE)

A prior run scanned only per-profile directories, missing the global
`~/.hermes/skills/` directory entirely. This produced a 2.9 MB zip with only
115 skills — 24 skills and 17 profile-only skills were missing. The user
corrected this by asking "不是公共的skill目录么？" ("Isn't there a common
skills directory?"). Always scan global first.

| Metric | Profiles-only (WRONG) | Global + profiles (CORRECT) |
|--------|----------------------|----------------------------|
| Unique skills | 115 | 139 |
| Zip size | 2.9 MB | 3.8 MB |
| Missed skills | 24 global-only + 17 profile-only | 0 |

## Selection Results for Different-Content Skills

When the same skill path exists in multiple sources with **different content**,
the selection rule (prefer GLOBAL, else most files) resolved all 21 cases.

Key examples where GLOBAL was NOT the best choice (profile version selected):

| Skill path | Selected from | Reason |
|------------|--------------|--------|
| `autonomous-ai-agents/hermes-agent` | orchestrator | 86KB/5 files vs GLOBAL 48KB/2 files |
| `devops/kanban-orchestrator` | orchestrator | 145KB/14 files vs GLOBAL 15KB/1 file |
| `autonomous-ai-agents/claude-code` | worker-coder | 43KB/2 files vs GLOBAL 36KB/2 files |
| `software-development/systematic-debugging` | worker-coder | 18KB/3 files vs GLOBAL 10KB/1 file |
| `productivity/hermes-messaging` | orchestrator | 57KB/8 files (not in global) |

**Observation**: The global directory is usually the baseline (oldest) version.
Profiles that actively use a skill tend to have expanded it with `references/`
subdirectories and additional files. When content differs, "most files" is a
better completeness signal than "largest size" alone.

## No Credential Sanitization Needed

Skills-only packages do NOT contain `.env`, `auth.json`, or `config.yaml` files.
Skill documentation (`.md`) may contain **example** API keys (e.g. `sk-xxx` in
tutorials), but these are not real credentials — they're illustrative. No
sanitization pass is required for Mode C.

**Exception**: If a skill was customized with real credentials embedded in its
SKILL.md or reference files (unusual but possible), scan before packaging:

```bash
grep -rl 'sk-[a-zA-Z0-9]\{20,\}' /tmp/hermes-skills-dedup/skills/
```

## Deployment on Target Machine

1. Unzip `hermes-skills-dedup.zip`
2. Copy the `skills/` directory to the target machine's `~/.hermes/skills/`:
   ```
   # Windows example
   Copy-Item -Recurse hermes-skills-dedup\skills\* C:\Users\<user>\.hermes\skills\
   ```
3. Hermes auto-discovers `category/skill-name/SKILL.md` — no config needed
4. Global skills are shared by all profiles — no need to copy per-profile
5. If the target profile needs a specific skill variant, copy it to
   `~/.hermes/profiles/<profile>/skills/` to override the global version

## Pitfalls

### 1. Forgetting to scan the global skills directory

**This is the #1 pitfall.** Hermes has `~/.hermes/skills/` as a global shared
directory IN ADDITION to per-profile `skills/` directories. If you only scan
`~/.hermes/profiles/*/skills/`, you miss ~24 global-only skills and produce an
incomplete package. The user caught this error by asking "不是公共的skill目录么？".

**Fix**: Always scan `~/.hermes/skills/` first (as "GLOBAL" source), then scan
each profile's `skills/` directory. Merge all results before deduplication.

### 2. `.curator_backups` and `.curator_state` inflate size

Each profile's `skills/.curator_backups/` contains timestamped snapshots of the
entire skills directory. These are runtime artifacts, not skill content. Always
skip them during scanning (`SKIP_DIRS = {'.curator_backups', '.hub', ...}`).
Found 5 backup snapshots in orchestrator alone, each ~60MB.

### 3. `.hub/` directory contains quarantine and cache

`skills/.hub/quarantine` and `skills/.hub/index-cache` are runtime state for
the skill hub system. Skip during dedup — they're machine-specific.

### 4. Skills can exist at top level (no category)

Not all skills are under a `category/skill-name` structure. Some are just
`skill-name/SKILL.md` at the top of `skills/`. The algorithm handles both —
the relative path is just `skill-name` instead of `category/skill-name`.

### 5. Different-content skills need manual review

The automatic selection (GLOBAL > most files) is a heuristic. For the 21
different-content skills, the target environment might actually want a specific
profile's version. The MANIFEST.md documents which version was selected and why,
so the user can manually swap if needed.

### 6. `shutil.copytree` fails if dst exists

Use `dirs_exist_ok=True` (Python 3.8+) or clear the staging dir before copying.
The staging dir should always start empty (remove + recreate).

### 7. Tuple unpacking errors when entries have varying field counts

When using dict-based entries (`{"rel": ..., "src": ..., "path": ...}`) instead
of tuples, make sure all code paths consistently access by key (`e["md5"]`)
rather than by index (`e[5]`). Mixed access patterns cause `IndexError` at
runtime. Prefer dicts for any data structure with 5+ fields.
