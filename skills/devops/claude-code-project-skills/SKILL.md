---
name: claude-code-project-skills
description: >-
  Package Hermes Kanban team/profile knowledge into Claude Code project
  `.claude/skills/` format. Extract domain expertise from profile SOUL.md
  + rules.md, strip Kanban protocol boilerplate, create overview + domain
  sub-skills + reference docs. Use when exporting a Kanban board team's
  knowledge for use in an external Claude Code project.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [claude-code, skills, kanban, packaging, export]
    related_skills:
      - hermes-agent-migration
      - hermes-agent-skill-authoring
---

# Claude Code Project Skill Packaging

Package Hermes Kanban team/profile knowledge into Claude Code project
`.claude/skills/` format so Claude Code can use it when working in that
project directory.

## When to Use

- User asks to "打包" / "package" / "export" a Kanban team's knowledge into
  Claude Code project skills
- User wants Claude Code in an external project to have the same domain
  expertise as a Hermes Kanban profile team
- User references a specific project path (e.g. `~/Downloads/.../repo`)
  and wants [已移除]/hack/ops/etc. skills placed there

## Source Locations

| Source | Path | What to extract |
|--------|------|-----------------|
| Profile SOUL.md | `~/.hermes/profiles/<profile>/SOUL.md` | Domain expertise: 核心职责 sections, algorithms, tools, standards, reference implementations |
| Profile rules.md | `~/.hermes/profiles/<profile>/<profile>_rules.md` | Verification standards, kanban config, collaboration protocol |
| Hermes skills | `~/.hermes/profiles/orchestrator/skills/<category>/<name>/SKILL.md` | Technical depth, module architecture, debugging pitfalls |
| Research reports | `~/hermes-docker-sandbox/workspace/*.md` | Industry analysis, vendor landscape, standards |
| Project CLAUDE.md | `<project>/CLAUDE.md` | Existing project conventions — reference, don't duplicate |

## What to Strip (Kanban Boilerplate)

Each Hermes Kanban SOUL.md contains ~40% protocol boilerplate that is
**irrelevant** to Claude Code project skills. Strip these sections:

- 🔴 ACP 强制规则 block (ACP/Claude Code delegation protocol)
- 标准作业循环 (kanban_show / kanban_complete cycle)
- 用 ACP 委托编码 (acp_send patterns)
- 反模式三件套 (anti-patterns — kanban-specific)
- 可逆性分级 (reversibility grading — kanban-specific)
- goal_mode section
- kanban_create 进阶
- 输出契约 (kanban_comment / kanban_complete handoff)
- 协作协议 (upstream/downstream kanban routing)
- 隐私保护规则 (workspace filesystem restrictions)
- 退出协议 (exit protocol)

**Keep**: 核心职责 (core responsibilities), domain algorithms, tool lists
with star counts, verification standards, debugging pitfalls, open-source
reference implementations.

## Target Structure

```
<project>/.claude/skills/
├── <domain>-overview/SKILL.md           # Index skill, loaded first
├── <domain>-<sub1>/SKILL.md             # Domain-specific skill
├── <domain>-<sub2>/SKILL.md
├── <domain>-debugging-pitfalls/SKILL.md # Common pitfalls
└── <domain>-research-references/
    ├── SKILL.md                          # Index to reference docs
    └── references/
        ├── report1.md                    # Copied research reports
        └── report2.md
```

## SKILL.md Format for Claude Code

Claude Code discovers skills in `.claude/skills/*/SKILL.md`. Use YAML
frontmatter with `name`, `description`, `version`:

```yaml
---
name: <skill-name>
description: >-
  One-line description. Claude Code shows this in its skill index.
  Keep the trigger condition in the first 57 chars for discoverability.
version: 1.0.0
---
```

Body is markdown — no Hermes-specific sections needed. Write in the
language the user prefers (Chinese for this user's [已移除] projects).

## Packaging Workflow (6 Steps)

### 1. Discover team profiles
```bash
# Find all profiles for a board
ls ~/.hermes/profiles/ | grep -E "[已移除]|hack|product|ops|swarm"
# Each profile has SOUL.md + rules.md
```

### 2. Read all SOUL.md + rules.md files
Batch-read all profiles' SOUL.md and rules.md in parallel. Extract:
- Role name and one-line description
- 核心职责 sections (the domain expertise)
- Verification standards from rules.md
- Tool/library references with star counts

### 3. Read related Hermes skills
Check `~/.hermes/profiles/orchestrator/skills/` for skills matching the
domain (e.g. `[已移除]`, `crypto-numerical-pitfalls`).
Read their SKILL.md + `references/` files for module architecture, design
decisions, and debugging pitfalls.

### 4. Read project CLAUDE.md
If the target project has a CLAUDE.md, read it for existing conventions.
The overview skill should reference it, not duplicate it.

### 5. Create skills
Create the overview index skill first, then domain-specific sub-skills.
Strip all Kanban boilerplate. Keep technical depth. Add cross-references
between skills. Copy research reports into `references/`.

### 6. Verify
```bash
find <project>/.claude/skills -name "SKILL.md" | wc -l  # skill count
find <project>/.claude/skills -type f | sort             # full tree
```

## Key Patterns

### Overview skill = routing index
The overview skill (`<domain>-overview`) lists all sub-skills in a table
with their domain and use cases. Claude Code loads it first, then
navigates to the specific sub-skill. Keep it short (<100 lines).

### Debugging pitfalls = separate skill
Common numerical/crypto/infra pitfalls deserve their own skill, not
scattered across domain skills. Source: Hermes `crypto-numerical-pitfalls`
skill or equivalent.

### Research reports = references/ directory
Copy research reports (markdown) into a `<domain>-research-references`
skill's `references/` subdirectory. The SKILL.md is just an index with
file paths and chapter summaries.

### Cross-reference the Python platform
If a Hermes Python [已移除] platform exists at
`~/hermes-docker-sandbox/workspace/[已移除]/`, mention it in the
overview as a "Python 对照平台" for algorithm verification.

## Pitfalls

- **Don't copy SOUL.md verbatim** — 40% is Kanban protocol boilerplate
  (ACP rules, exit protocol, privacy rules) that clutters Claude Code
  context. Extract only the domain expertise.
- **Don't create one skill per profile** — group by domain, not by
  Hermes profile. E.g. one `[已移除]` skill, not separate
  `[已移除]` and `[已移除]` skills (they share FEM/FDTD core).
- **Don't forget the project CLAUDE.md** — it already has build/run
  instructions. Reference it, don't duplicate.
- **Do copy research reports** — they're valuable reference material that
  Claude Code can't access from the Hermes workspace.
- **Do keep star counts and standard references** — they help Claude
  Code suggest the right open-source tool for a task.

## Example: [已移除] Team (6 profiles → 9 skills)

| Hermes Profile | → Claude Code Skill |
|----------------|---------------------|
| [已移除] + [已移除] | [已移除] (merged) |
| [已移除] | [已移除] |
| [已移除] | [已移除] |
| [已移除] | [已移除] |
| [已移除] | [已移除] |
| (all) | [已移除] (from crypto-numerical-pitfalls) |
| (research reports) | [已移除] (+ 3 copied .md files) |
| (index) | [已移除] |

## Related Skills

- **hermes-agent-migration** — packaging Hermes profiles/configs/skills
  for migration to another Hermes instance (not Claude Code)
- **hermes-agent-skill-authoring** — authoring in-repo Hermes SKILL.md
  files (Hermes format, not Claude Code format)
