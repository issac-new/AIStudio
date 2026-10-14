---
name: skill-library-maintenance
description: "Audit, deduplicate, and repair a multi-profile Hermes skill library. Detect physical-copy redundancy across profiles, convert to symlinks, repair self-referencing symlink loops in shared, and restore lost content from GitHub distribution repo. Use when ~/.hermes/skills has broken loops, profiles have stale physical copies, or after a fusion/clawskills install leaves duplicates."
version: 1.2.0
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
- When one domain has accumulated 2+ separate skills that are cross-linked by a
  分工表 instead of being one entrance (see Mode 5)
- When `skill_manage` refuses a patch on a skill that IS listed/loaded —
  "not found in active profile" or "not found" on the qualified name, flip-flopping
  between the bare and categorized name — while `skill_view` shows both names
  resolve (bare name returns `dedup: true` or an ambiguous-lock message).
  Same-name dual directory inside ONE profile (see Mode 6)
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

## Mode 4: Tool-Bindability Audit（换工具可迁移性，2026-09-06 FDE 文18 融合）

> 来源：FDE 文18「验证三问」之三：换工具带不走 = 只是从一个供应商换到另一个供应商，锁定问题没解决。
> Hermes 等价问句：**换掉 ACP provider（claude/codex/zcode）、TUI 或 Gateway，本体层沉淀能否原样带走？**

Run quarterly or before provider changes — audit steps:

```bash
# 1. 找出「工具绑定」型 skill/配置——内容里硬编码了特定 provider/端口/路径
grep -rln "GLM-5.3-Flash\|127.0.0.1:15721\|claude.*bypassPermissions" \
  ~/.hermes/skills/devops/ 2>/dev/null | head -20
# 2. 判定：硬编码应集中在「路由/配置层文件」（config.yaml、fallback chain），
#    skill 本体应写「协议语义」（如「夜间免费通道」「本地代理」）而非具体端点。
#    命中的 skill 若属方法论本体（应可迁移）→ 记 hotspot，改写为环境无关表述+引用配置层。
# 3. 快照完整性：skills/ + profiles/*/SOUL.md + profiles/_shared/ 三处
#    tar 快照后，在 ~/hermes-docker-sandbox/workspace 等非 ~/.hermes 路径可解包即视为可迁移。
```

判定纪律（对齐文18 验证三问）：①企业认不认 → 用户是否持续使用该 skill（引用面）；②沉淀了多少 →
reusable_pattern/derived_from 标记密度（asset-compound-metrics.py 复用率代理）；③带不带得走 → 本 Mode。

## Mode 5: Same-Domain Semantic Consolidation (合并同类技能，一域一入口)

Mode 1 removes byte-identical copies. A different failure shape: N skills in the
SAME domain kept as separate top-level entrances cross-linked by a 分工表.
User ruling: 合一>散落 — merge into ONE entrance skill; do not keep a per-layer
skill zoo (N entrances = N loads + N version-drift points).

Procedure (validated on a 3→1 writing-skill merge):

1. **Inventory each candidate's REAL disk assets** (`find <skill> -type f`), never
   its self-description — zombie skills cite scripts/references that do not exist
   on disk; drop those citations, do not absorb them.
2. **Survivor = broadest trigger surface + deepest content.** Absorb the dying
   skills' unique increments FIRST: keyword-diff each dying body against the
   survivor (mechanical `in` checks, not eyeball), port deltas into the survivor's
   matching section, and merge all trigger keywords into the survivor's frontmatter
   description so one entrance covers the whole domain's trigger surface.
3. **Downgrade the richest runtime asset tree** to `<survivor>/references/<name>/`
   via `shutil.move` (preserves LICENSE/NOTICE copyright chain). Archive dying
   originals to workspace `merged-away/`, then delete (先存档再删).
4. **Rewrite survivor**: version bump; layer/topic table at top mapping old
   entrances to sections; grep-fix every path that pointed at deleted dirs.
5. **Verify 4-way**: ghost-reference grep for every deleted skill name across
   `~/.hermes/skills` + `profiles/*/SOUL.md` + bin + cron; re-run runtime assets
   (selftest/fixture/fail-closed) FROM THE NEW PATH; invoke once via a profile
   symlink path; `skill_view` loads with the merged description.

## Mode 6: Same-Name Dual Directory Inside One Profile (同名双目录冲突)

A skill exists twice in one profile: a root-level `<name>/` (uncategorized) and
a categorized `<cat>/<name>/`. Symptoms: `skill_view('name')` resolves/locks
against one copy while `skill_manage` writes target the other (or refuses with
"not found" errors that misname the profile); `grep -rh '^name:'
<profile>/skills/ --include=SKILL.md | sort | uniq -d` lists the duplicated
frontmatter name. Likely origin: a tooling pass wrote a copy at the wrong level
while the categorized original already existed; the two copies then drift.

**Resolution order** (validated):

1. **Survivor = the categorized canonical** — the path `skill_view` reports in
   `skill_dir`. Never keep the uncategorized root copy.
2. **Diff before delete**: the orphan copy is often NEWER (a prior session
   patched whichever copy its resolution picked). Fold unique increments into
   the survivor first — diff both SKILL.md bodies, port deltas into matching
   sections, bump the survivor's version. Then archive-then-delete the orphan
   (P3 祖训): `cp -RL` to the archive, `rm -rf` only after SHA256 verification.
3. **skill_manage writes fail while the duplicate exists** — its name
   resolution cannot disambiguate the two directories, and error messages
   misattribute the copy to another profile. Fall back to file tools (python
   text edit) aimed at the survivor's absolute `skill_dir` from skill_view
   output; name resolution clears once the orphan is gone.
4. **Unlock verification**: the detection grep returns empty; bare-name
   `skill_view` resolves unambiguously and a re-view returns `dedup: true`.
5. `cp -RL` (dereference) when archiving — skill dirs often contain symlinks
   into shared; a plain `cp -R` archives broken relative links.

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
    check) before creating. Farm-linked categories extend this across
    profiles: `profiles/*/skills/<cat>` can resolve to the same physical dir
    (same inode, `links=1`), so ONE write under the owning profile is already
    visible from worker profiles' paths. `cp` between such paths reporting
    `identical (not copied)` is the tell the farm link exists, not a cp
    failure — verify propagation with cross-profile `shasum`, never by
    whether cp copied.

12. **`extra.skills_enabled_by_category` in config.yaml is DORMANT — never use
    it as evidence of what loads** (proven 2026-08-27, t_2f7729e4). The runtime
    skill switch is the `<profile>/skills/<category>` symlink (or real dir).
    hack-forensics has `cybersecurity` listed in that config key yet loads ZERO
    cybersecurity skills (no symlink); a stray symlink loads a category the
    config never mentions. **Default keep policy for dedup: keep the variant
    under the category the profile ACTUALLY loads, verified with
    `hermes --profile <p> prompt-size --json` → `skills_breakdown` paths —
    config keys are documentation, not switches.**

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

## Cleanup Log (dedup outcomes)

> Each entry records a real dedup pass: trigger, what was removed, what was
> kept, and the pre/post `skill-health-audit.sh` Phase-3 duplicate count.

### 2026-08-26 — t_7d6e4cbd (11 dup pairs, P1-4)
- **Trigger**: `skill-health-audit.sh` reported 11 name-duplicated skill pairs.
- **Strategy discovery**: task brief favored `cybersecurity-defense/` as the
  keep path, but the harness actually loads skills for hack profiles from the
  `cybersecurity/` tree (symlinked into profiles; `cybersecurity-defense/` is
  NOT enabled in any `config.yaml` `skills_enabled_by_category` and is absent
  from hack profile prompt snapshots). To avoid mutating runtime behavior and
  breaking skill loads, we kept the **runtime-loaded** variant and removed the
  redundant physical copy.
- **Keep (11)**: `cybersecurity/...` (9 skills across subdomains:
  identity-access-management, vulnerability-management, supply-chain-security,
  root) + `cybersecurity-compliance/conducting-cyber-risk-assessment-…` +
  `cybersecurity/identity-access-management/building-identity-governance-…`.
- **Removed (11 physical dup dirs)** from `~/.hermes/skills`:
  `cybersecurity-defense/` (9 skills), `cybersecurity/compliance-governance/
  conducting-cyber-risk-assessment-with-nist-800-30`, and
  `cybersecurity-compliance/building-identity-governance-lifecycle-process`.
- **Content note**: 10/11 pairs differed in frontmatter only (richer desc kept),
  1/11 (`conducting-cyber-risk-assessment-with-nist-800-30`) was byte-identical
  — restored the within-`cybersecurity/compliance-governance/` copy after an
  initial mis-keep so the count stayed 0 AND hack-recon retained visibility.
- **Safety**: `scan_soul.py` + grep of `SOUL.md`/`config.yaml` showed no removal
  would drop a skill from any profile's loaded set — the kept path is the one
  that loads.
- **Backup (P3 祖训)**: 22 dirs + category inventories →
  `~/.hermes/profiles-archive/2026-08-26-235428-t_7d6e4cbd-skill-dedup/`.
- **Verification**: re-ran `bash bin/skill-health-audit.sh`; Phase-3 dupe count
  **11 → 0**; total skills 713 → 702; all 11 kept copies resolve via the
  `cybersecurity` symlink into hack profiles.
- **Open flags**:
  1. `hack-exploit/SOUL.md` (L254, L262) references kept paths — no break, but
     doc should be reconciled if category layout changes.
  2. `cybersecurity-defense/` category itself remains (147 skills) and NOT
     loaded by any profile — larger orphan-category cleanup is a separate
     task, not this dedup.
  3. **Doc↔runtime conflict — RESOLVED 2026-08-27 (t_2f7729e4, Direction B)**:
     mechanical evidence showed `extra.skills_enabled_by_category` in
     config.yaml is a **dormant key** (0% correlation with what loads —
     hack-forensics has `cybersecurity` enabled in config yet loads ZERO
     cybersecurity skills because no `skills/cybersecurity` symlink exists).
     The actual runtime switch is the `<profile>/skills/<category>` symlink.
     **Default keep policy: keep the category the profile ACTUALLY loads**,
     verified via `hermes --profile <p> prompt-size --json` → skills_breakdown.
     Direction A (editing the dormant config key) would be a no-op. A stray
     `cybersecurity-defense` symlink (created 2026-08-27 18:59 by an unknown
     session) silently added 147 skills to hack-exploit's prompt; removed with
     restore instructions in the t_2f7729e4 card. Lesson: dedup keep-decisions
     MUST be made against prompt-size evidence, not config keys.
