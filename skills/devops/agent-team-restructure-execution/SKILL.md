---
name: agent-team-restructure-execution
description: "Execute approved team restructure after deep audit."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [multi-agent, restructure, execution, batch-operations, verification]
    related_skills:
      - agent-team-deep-audit
      - system-improvement-execution
      - hermes-worker-lifecycle
---

# Agent Team Restructure Execution

The implementation phase AFTER `agent-team-deep-audit` has produced a
restructure proposal and the user has approved it ("接受 继续"). This
skill covers the 5-phase execution pipeline and the mechanical
verification at each phase boundary.

## When to Use

- User approved a restructure proposal (e.g. 33→20 profiles, merge
  overlapping roles, downgrade single-deliverable profiles to skills)
- After `agent-team-deep-audit` identified the 7 defect classes
- User says "接受 继续" / "执行重构" / "implement the restructure"

## Prerequisites

- A completed `agent-team-deep-audit` report with evidence-backed defect
  findings and a restructure proposal (team×profile before/after table)
- User has approved all decision points (which profiles to merge, delete,
  or downgrade to skills)
- `_shared/shared-rules-reference.md` exists (or will be created in Phase 2)

## The 5-Phase Pipeline

### Phase 1: Fix Copy-Paste Board Reference Errors

**Defect**: profiles cloned from another team's template retain the
original team's board name in SOUL.md prose (e.g. 6 [已移除] profiles all say
"当 **swarm** 把一张任务卡派给你时" — they think they're on swarm).

**Execution**: For each affected profile, string-replace the wrong board
name with the correct one, plus fix upstream role references that don't
exist on the target board:

```python
content = content.replace("当 swarm 把一张任务卡派给你时",
                          "当 [已移除] 看板把一张任务卡派给你时")
content = content.replace("上游（架构师/需求分析师）的",
                          "上游任务定义中的")
# Also fix collaboration refs: "swarm architect" → "[已移除] 协调者（orchestrator）"
```

**Verification**: `grep -r "swarm" ~/.hermes/profiles/[已移除]-*/SOUL.md`
should return 0 hits.

### Phase 2: Externalize Shared Rule Blocks

**Defect**: every SOUL.md has 4-6 inline shared rule blocks (ACP,
前线侦察清单, Loop Engineering, Ontology, 隐私保护) that are
identical across all profiles — a rule change requires editing 33 files.

**Execution**: two approaches, used in sequence:

1. **Subagent batch** (for large profile counts): dispatch 3 parallel
   `delegate_task` subagents, each handling one team group. Each
   subagent uses `patch(mode='replace')` to remove 3 block locations
   (head ACP, mid recon checklist, tail triad) and append a 1-line
   import reference to `_shared/shared-rules-reference.md`.

2. **Regex recovery** (for subagent failures): when a subagent crashes
   mid-batch (API error, empty stream, timeout), recover with a single
   `execute_code` call processing all remaining profiles at once:

```python
import re

SHARED_BLOCK_PATTERNS = [
    r'## 🔴 强制规则：编码开发必须通过 ACP.*?(?=\n## |\n# |\Z)',
    r'## 前线侦察清单.*?(?=\n## |\n# |\Z)',
    r'### 前线侦察清单.*?(?=\n## |\n# |\Z)',  # h3 variant!
    r'## Loop Engineering 验证门.*?(?=\n## |\n# |\Z)',
    r'## 隐私保护规则.*?(?=\n## |\n# |\Z)',
]

IMPORT_LINE = '> **共享规则**：所有共享强制规则块见 `~/.hermes/profiles/_shared/shared-rules-reference.md`。'

for profile in needs_fix:
    content = open(f"{path}/SOUL.md").read()
    for pat in SHARED_BLOCK_PATTERNS:
        content = re.sub(pat, '', content, flags=re.DOTALL)
    content = re.sub(r'\n{4,}', '\n\n\n', content)
    content = add_import_line(content, IMPORT_LINE)
    open(f"{path}/SOUL.md", 'w').write(content)
```

**Key pitfall — `###` vs `##` header variant**: some profiles use
`### 前线侦察清单（步骤 2，强制）` (h3) instead of
`## 前线侦察清单（执行任务前必须完成）` (h2). The regex AND the
verification grep must check for BOTH header levels or the h3 version
survives removal and the profile "passes" verification falsely.

**Verification**: for each profile, check 6 conditions —
`shared-rules-reference.md` reference present (1), and 5 inline block
markers absent (0 each: ACP, 前线侦察清单 ##, 前线侦察清单 ###,
Loop Engineering, 隐私保护). All profiles must pass ALL 6.

### Phase 3: Merge Overlapping Profiles (Archive-Don't-Delete)

**Defect**: multiple profiles cover >60% of the same capability domains
(e.g. hack-c2 / hack-exploit / hack-weapons all do exploit+post-exploit).

**Execution**: archive — don't delete — to preserve SOUL.md content for
Phase 5 skill extraction:

```python
merges = {
    "swarm": {"delete": ["requirement-analyst","architect","project-manager",
                          "worker-deployer","worker-reviewer"],
              "keep": ["orchestrator","worker-coder","worker-tester","worker-researcher"]},
    # ... per team
}

for team, plan in merges.items():
    for p in plan["delete"]:
        src = f"{profiles_dir}/{p}"
        dst = f"{profiles_dir}/{p}.archived"
        if os.path.exists(src) and not os.path.exists(dst):
            os.rename(src, dst)
```

Then update `board.json` `profile_scope` for each board to remove
archived profiles and keep only the surviving ones. Also update
`default_assignee` in each remaining profile's config.yaml if it
pointed to a deleted profile.

**Verification**:
- `ls ~/.hermes/profiles/*.archived | wc -l` matches expected count
- Each `board.json` `profile_scope` contains only existing active profiles
- No `.archived` profile appears in any board's `profile_scope`

### Phase 4: Toolset Differentiation

**Defect**: all profiles have identical toolsets
(`hermes-cli,acp,kanban,memory`) with no domain-specific tools.

**Execution**: update `config.yaml` `toolsets:` section per profile
based on its actual role:

| Role category | Toolset | Rationale |
|---------------|---------|-----------|
| Router (orchestrator) | hermes-cli, kanban, memory, messaging | No ACP (doesn't code), needs messaging |
| Coder workers | hermes-cli, acp, kanban, memory | ACP for Claude Code delegation |
| Research workers | hermes-cli, kanban, memory, web | Web search, no ACP |
| Non-coding managers | hermes-cli, kanban, memory | No ACP (doesn't code) |
| Skill curator (platform-miner) | hermes-cli, acp, kanban, memory, skills | Needs skill_manage tool |

**YAML editing pitfall**: the `toolsets:` section uses inconsistent
indentation across profiles. Regex replacement
(`r'toolsets:\n(?:  - \w+\n)+'`) may not match. Fallback: line-by-line
rebuild of the toolsets section inside `execute_code`.

**Verification**: `sed -n '/^toolsets:/,/^[a-z]/p' <config.yaml>` for
each profile shows the expected toolset list.

### Phase 5: Create Skills from Archived Profiles

**Defect**: archived profiles contain domain methodology worth
preserving as on-demand skills.

**Execution**: for each archived profile, extract SOUL.md content and
package as a skill under `orchestrator/skills/productivity/`:

```python
skills_meta = [
    {"name": "requirement-analysis", "source": "requirement-analyst",
     "desc": "需求澄清、补充、验证。输出结构化需求规格文档。"},
    {"name": "architecture-design", "source": "architect",
     "desc": "将需求转化为技术方案：技术选型、模块划分、接口规范。"},
    # ... 10 skills total
]

for skill in skills_meta:
    source_path = f"{profiles_dir}/{skill['source']}.archived/SOUL.md"
    source_content = open(source_path).read()

    skill_md = f"""---
name: {skill['name']}
description: "{skill['desc']}"
metadata:
  hermes:
    tags: [productivity, workflow]
    source_profile: {skill['source']}
---

# {skill['name'].replace('-', ' ').title()}

> 本 skill 从 `{skill['source']}` profile 降级而来。

{source_content[source_content.find('# '):]}
"""
    skill_dir = f"{profiles_dir}/orchestrator/skills/productivity/{skill['name']}"
    os.makedirs(skill_dir, exist_ok=True)
    open(f"{skill_dir}/SKILL.md", 'w').write(skill_md)
```

**Verification**: `ls ~/.hermes/profiles/orchestrator/skills/productivity/`
shows all new skill directories with non-empty SKILL.md files.

## Post-Restructure: Update Routing Tables

After all 5 phases, the orchestrator's routing rules still reference
deleted profiles. Update:

1. **orchestrator_rules.md §看板路由表**: replace old profile_scope
   lists with new ones; add note "（重构后 N→M profile）"
2. **orchestrator_rules.md §可用 Workers**: replace deleted profile
   descriptions with the merged/downgraded version; add
   "已降级为 skill: <skill-name>" lines
3. **orchestrator SOUL.md**: grep for deleted profile names — any hit
   that isn't in a "已降级/已合并/吸收" context is a stale reference

**Verification**: grep all deleted profile names in orchestrator_rules.md
and SOUL.md; every hit must be in a migration-context line.

## Pitfalls

### Subagent partial failure on shared-block externalization

When dispatching 3 parallel subagents for Phase 2, one may crash mid-batch
(API error, empty stream). Recovery: run a verification grep across ALL
profiles, identify which still have inline blocks, then process the
remaining ones with a single `execute_code` regex call. The regex
approach is more reliable for bulk recovery than precision patching.
This session: 15 profiles fixed in one `execute_code` call after
subagent 3 failed with "Provider returned an empty stream".

### `###` vs `##` header variant

Some profiles use h3 (`### 前线侦察清单`) instead of h2
(`## 前线侦察清单`). Both the removal regex AND the verification grep
must check for both header levels. A profile that "passes" verification
on h2 may still have an h3 block hiding.

### skill_manage cannot patch symlinked skills

Devops skills (`system-improvement-execution`, `hermes-worker-lifecycle`,
etc.) are symlinked from `default` into `orchestrator`.
`skill_manage(cross_profile=True)` reports "not found in active
profile" even though the file physically exists under
`~/.hermes/profiles/orchestrator/skills/devops/`. This is why this
skill is created as a NEW orchestrator-native skill rather than appended
to `system-improvement-execution`.

### Memory budget overflow after restructure

A full restructure produces too much state for the 2200-char memory
budget. Use `hindsight_retain` for the detailed record, and keep
memory entries to 1-2 lines summarizing the outcome.

## Session Record (2026-07-31)

- **Audit**: 33 profiles across 6 teams, all 7 defect classes detected
- **User approval**: "接受 继续" — all 8 decision points approved
- **Phase 1**: 6 [已移除] SOUL.md board refs fixed (swarm→[已移除])
- **Phase 2**: 33/33 profiles externalized (18 via subagents, 15 via regex recovery)
- **Phase 3**: 13 profiles archived, 6 board.json profile_scope updated
- **Phase 4**: 20 profiles toolset-differentiated and verified
- **Phase 5**: 10 skills created from archived profiles
- **Post**: orchestrator_rules.md routing table + worker list updated
- **Result**: 33→20 active profiles, 443KB→256KB SOUL.md total (-42%)

## Related Skills

- **agent-team-deep-audit** — the AUDIT that produces the proposal
  this skill executes. Run it first to identify the 7 defect classes.
- **system-improvement-execution** — the more general improvement
  execution skill. This skill is the specialized restructure version.
- **hermes-worker-lifecycle** — covers adding/removing individual
  profiles. Uses the archive-don't-delete pattern for Phase 3.
- **soul-shared-block-externalization** — covers Phase 2 in detail
  (regex batch removal). OVERLAPS with soul-shared-rule-externalization.
- **soul-shared-rule-externalization** — also covers Phase 2 (patch
  approach). OVERLAPS with soul-shared-block-externalization — curator
  should consolidate these two into one.
