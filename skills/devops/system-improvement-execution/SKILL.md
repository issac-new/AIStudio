---
name: system-improvement-execution
description: >-
  Execute approved improvements to a multi-agent Hermes system after
  research-then-improve has produced proposals and the user has picked
  which ones to implement. Covers batch implementation via parallel
  delegate_task (independent items) vs sequential phases (dependent
  items), post-implementation mechanical verification (grep/ls/sqlite,
  not self-report), and the three common deliverables (design doc,
  complex-task flow example, PPT). Use when the user says "落地" or
  "implement" or "execute the plan" after a research→gap→proposal cycle.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [multi-agent, implementation, batch-execution, verification, deliverables]
    related_skills:
      - research-then-improve
      - multi-agent-orchestration-design
      - deep-research-workflow
---

# System-Improvement-Execution

The phase AFTER `research-then-improve`: proposals are written, the user
has approved specific items, now execute them. This skill covers the
implementation batching, mechanical verification, and deliverable
generation that follow.

## When to Use

- User says "落地" / "implement" / "execute" after a proposal cycle
- User approved N improvement items (new profiles, batch SOUL.md patches,
  config changes, new shared files, cron jobs)
- User asks for a design document / task-flow example / PPT after
  implementation

## Implementation Batching

### Classify each approved item by independence

| Item type | Independence | Execution |
|-----------|-------------|-----------|
| New shared file (ontology.md, rules) | Independent | Create first (other items reference it) |
| New profiles (config+SOUL each) | Independent of each other | Parallel delegate_task (3 per batch) |
| Batch SOUL.md patches (same patch, N profiles) | Independent per profile | Parallel by team group |
| Config changes (config.yaml, board.json) | Independent | Direct execution or batch |
| Cron jobs | Independent | Direct creation |

### Batch shape decision

```
IF items are independent of each other:
  → parallel delegate_task (up to 3 per batch)
  → each subagent gets: context (what exists), goal (what to create/patch),
    shared files to reference

ELIF item B depends on item A's output:
  → sequential phases
  → Phase 1: create shared file → Phase 2: profiles reference it

ELIF same patch applied to N profiles:
  → parallel by team group (swarm 7 / hack+product 10 / ops+[已移除] 10)
  → each subagent handles one team's profiles
```

### Subagent goal prompt structure

```
<context>
  This is [team] team. Reference sibling profile [name] for structure.
  Shared files at ~/.hermes/profiles/_shared/. Config template at
  [path]. Mandatory rules block reference: [file].
</context>

<goal>
  Create/patch [N] items. Each item needs: [specific requirements].
  config.yaml based on [template], changes: [specific field changes].
  SOUL.md must contain: [required sections].
</goal>

<verification>
  After creation: grep for [expected content]. Check [field] exists in
  config. Report file sizes.
</verification>
```

### Post-implementation verification (CRITICAL)

Subagent self-reports are NOT verified facts. A subagent that claims
"file created" may have failed silently. Verify EVERY item mechanically:

```bash
# For "all profiles reference ontology.md":
grep -rl "ontology.md" ~/.hermes/profiles/*/SOUL.md | wc -l
# Expected: 33 (or target count)

# For "all profiles have front-line recon step":
grep -rl "前线侦察" ~/.hermes/profiles/*/SOUL.md | wc -l

# For "platform board exists":
cat ~/.hermes/kanban/boards/platform/board.json | grep "slug"

# For "clearances field configured":
grep -l "clearances" ~/.hermes/profiles/{platform-*,ops-eval}/config.yaml | wc -l

# For "cron jobs configured":
# via cronjob action='list'
```

Run these AFTER subagents report completion. If a count is off, identify
which specific profile is missing and patch it directly (not via subagent).

## Deliverable Generation

After implementation, the user often asks for one or more deliverables.

### 1. Design Document (single .md file)

Structure:
```
一、系统总览 (规模统计 + ASCII 架构图 + 理念映射表)
二、团队设计 (每团队: 定位 + profile 表 + 协作流)
三、共享语义层 (object types + action types + markings + 协议)
四、强制规则体系 (规则块表 + 机械执行点 + 覆盖范围)
五、基础设施 (模型分配 + 看板配置 + Hindsight + Gateway + Cron)
六、数据流 (Gateway 消息流 + Kanban 任务流 + 双螺旋反馈流)
七、安全设计 (三层授权 + 隐私 + Markings 数据级安全)
八、演进路线 (已完成 + 待办)
附录 A: Profile 清单 (含 SOUL 行数/大小/角色)
附录 B: 共享文件清单
附录 C: 验证脚本
```

**Data source rule**: every number in the document must come from a real
tool query (terminal grep, read_file, execute_code), not from memory or
estimates. If you can't query it, don't write it.

### 2. Complex Task Flow Example

A concrete end-to-end walkthrough: "if a Matrix message says X, what
happens at each step?"

Structure:
- Scenario: a specific complex message
- Step 0-N: each step with what mechanism fires
- "每个机制在哪个环节生效" table (mechanism → step → concrete result)
- "如果出问题会怎样" table (failure → trigger → kanban_block kind)

Show each mechanism in action at a SPECIFIC step, not as abstract theory.
The user wants to see "markings 校验 blocks worker-coder at step 7", not
"markings 校验 prevents unauthorized access".

### 3. PPT (via powerpoint skill)

Generate with pptxgenjs. Structure:
1. Title (dark bg, stats row)
2. Agenda
3. Architecture (dark bg, layered diagram)
4. Mapping table (external concept → implementation → coverage)
5. Team cards (6 cards, color-coded)
6. Key team detail (e.g. Mission Coordinator)
7. Platform team (double-helix diagram)
8. Ontology (object types + action types + markings)
9. Markings propagation (rule 1 + rule 2 + clearances config)
10. Forward-deployed protocol (recon steps + staged action)
11. Enforcement table (9 rules with mechanical check points)
12-13. Complex task flow (2 slides: routing+decomposition, markings+report)
14. Roadmap (completed + todo)

**Design palette**: Midnight Executive (navy `1E2761` + ice `CADCFC` +
accent `00A896`). Dark backgrounds for title/architecture/conclusion,
light for content. Every slide needs a visual element.

**pptxgenjs pitfall**: `pres.defineLayoutMode()` does NOT exist. Use
`pres.layout = "LAYOUT_WIDE"` directly for 13.33"×7.5" canvas.

## Pitfalls

### Subagent self-report ≠ verified fact

Subagents that claim "file created" or "patch applied" may be wrong.
Always verify with a mechanical check (grep count, ls, sqlite query)
AFTER subagents return. This is the single most common implementation
failure mode.

### Cross-profile skill_manage limitation

devops skills (research-then-improve, deep-research-workflow, etc.)
physically live in the `default` profile. `skill_manage` in the
orchestrator profile cannot patch them — it reports "not found in
active profile". To patch default-profile skills: switch to
`hermes -p default`, or use `write_file`/`patch` with `cross_profile=true`
to edit the physical file directly.

### write_file blocked in background-review mode

When executing in a background review/restricted environment, only
`memory` and `skill_manage` tools are whitelisted. `write_file`,
`patch`, `terminal`, and `read_file` are blocked. Plan implementation
for a full-tool session, not a restricted one.

### Memory budget for improvement summaries

When implementation produces large amounts of new state (6 new profiles,
33 patched files, 2 cron jobs), the memory tool may reject the summary
entry for exceeding the 2200-char budget. Use `hindsight_retain` to
store the detailed record, and keep memory entries to 1-2 lines
pointing to the hindsight bank.

## Related Skills

- **research-then-improve** — the phase BEFORE this skill: research →
  survey → gap analysis → proposals (lives in default profile)
- **multi-agent-orchestration-design** — orchestrator profile
  configuration and skill-category gap analysis
- **deep-research-workflow** — multi-source deep research workflow
  (lives in default profile)
- **powerpoint** — PPT generation via pptxgenjs (lives in default
  profile; use skill_view to read, can't patch from orchestrator)
