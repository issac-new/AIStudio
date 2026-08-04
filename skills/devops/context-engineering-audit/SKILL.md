---
name: context-engineering-audit
description: >-
  Audit and optimize Hermes agent context engineering (SOUL.md, rules.md,
  memory, skills) using Anthropic's 2026-07-24 "new rules" framework.
  Covers the six rule changes (rules→judgement, examples→interfaces,
  upfront→progressive disclosure, repeat→single-source, CLAUDE.md→auto-memory,
  simple-specs→rich-references), duplication detection across profiles,
  prohibition→judgement rewriting, memory staleness diagnosis, and Graph
  Engineering concepts for multi-agent architecture. Use when trimming
  bloated system prompts, eliminating cross-file conflicts, or applying
  Context Engineering best practices to a Hermes deployment.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [context-engineering, token-optimization, soul-design, audit, graph-engineering]
    related_skills: [token-optimization, memory-consolidation, agent-soul-patching, prompt-rule-enforcement]
---

# Context Engineering Audit

Audit and optimize Hermes agent context engineering using Anthropic's
published framework ("The new rules of context engineering for Claude 5
generation models", Thariq Shihipar, 2026-07-24). Anthropic deleted 80%+
of Claude Code's system prompt with no measurable eval loss; the same
principles apply to Hermes SOUL.md, rules.md, memory, and skills.

## When to Use

- User asks to audit/optimize SOUL.md, rules.md, or memory files
- System prompts have grown large and contain duplicated content
- Same concept is defined in multiple files with conflicting versions
- After a bulk SOUL.md enrichment session that inflated files
- Memory files contain stale data (wrong counts, dead references)
- Prohibition-style rules need rewriting to judgement frameworks
- Designing or auditing multi-agent graph architecture

## The Six Rule Changes (Audit Checklist)

For each line/section of SOUL.md or rules.md, apply these tests:

| Old pattern | New pattern | Action |
|---|---|---|
| Give rules (prohibitions) | Let model use judgement | Rewrite `禁止X`→`判断框架` |
| Give examples (few-shot) | Design interfaces | Remove examples; rely on tool schema/enum design |
| Put all upfront | Progressive disclosure | Externalize low-freq sections to `references/` |
| Repeat yourself | Single source of truth | Deduplicate across SOUL↔rules↔email_rules |
| Memory in config files | Auto-memory / indexed recall | Move operational details to skills; keep stable facts in memory |
| Simple text specs | Rich references | Use code/tests/mockups instead of prose descriptions |

### Two Diagnostic Tests (per line of prompt)

1. **"Can the model infer this by reading files?"** — If yes, delete it.
2. **"Is this a judgement framework or a prohibition?"** — Prefer "what to believe" over "what not to do."

### Softening Absolute Statements

Anthropic changed `must verify all frontend changes` → `run local app
for larger UX changes`. The pattern: `always verify` sounds responsible
but isn't always right — the model will execute it literally, producing
unnecessary actions. Replace with conditional judgement.

###善意误读检查 (Benign Misread Check)

For each instruction, ask: "How would a well-intentioned person
misunderstand this?" Not malicious misinterpretation — **benign** misread.
`保持文档简洁` could mean "don't write docs at all" or "write but be
concise." The model has the same ambiguity. Rewrite to eliminate the
benign misread.

## Three Context Engineering Migrations

1. **Content volume → Conflict density**: Context length is secondary;
   whether the same goal is defined at multiple layers with inconsistent
   versions is primary. 1M tokens can't auto-resolve conflicts.
2. **Text control → Environmental affordance**: If tool states have enums,
   tests are runnable, tools return structured errors — the model doesn't
   need SOUL.md prohibitions to guess legal actions. Interface design IS
   prompt design. Move constraints to config defaults (e.g.
   `workspace_kind` default) instead of SOUL.md禁令.
3. **Static documents → Context lifecycle**: Which info is always-loaded,
   which is on-demand, which enters memory, which expires, which needs
   verification — these are engineering questions, not prompt-writing
   questions.

## Context Stack — Six Layers with Clear Responsibilities

| Layer | Content | Control principle |
|---|---|---|
| System prompt (SOUL.md) | Product identity, stable behavior, global hard boundaries | High investment; avoid project details |
| rules.md | Repo purpose, key gotchas, spec entry points | Lightweight; don't restate what file system shows |
| Skills | Specialized workflows, domain judgement, on-demand review | Discoverable, splittable, avoid encyclopedia |
| Tool schema | Parameters, states, legal actions, invariants | Let the environment express constraints |
| Memory | Long-term preferences, reusable discoveries | Has source, lifecycle, and permissions |
| References | Code, tests, specs, mockups, rubrics | Closer to final product = better |

**Maturity signal**: Each piece of info has an appropriate location, each
location has clear responsibility, each load has a reason, each key result
has verification.

## Audit Procedure

### Step 1: Measure current state

```python
# In execute_code — measure all always-loaded context
import os

profile_base = os.path.expanduser('~/.hermes/profiles')
for root, dirs, files in os.walk(profile_base):
    for f in files:
        if f == 'SOUL.md':
            fp = os.path.join(root, f)
            with open(fp, 'r') as fh:
                content = fh.read()
            rel = fp.replace(profile_base + '/', '').replace('/SOUL.md', '')
            tokens = int(len(content) / 2.2)
            prohibitions = len(re.findall(r'禁止|不要|不能|不许', content))
            absolutes = len(re.findall(r'必须|永远|始终|always', content))
            print(f"{rel}: {len(content)}B ~{tokens}tok 🔴{content.count('🔴')} 禁{prohibitions} 必{absolutes}")
```

### Step 2: Detect duplication

Check for the same concept defined in multiple files:

```python
duplicated_concepts = [
    'ACP', '智能路由', 'Tenant', '六段式', 'workspace_kind',
    'TUI/CLI', '轻量留痕', '隐私保护',
]
for concept in duplicated_concepts:
    in_soul = concept in soul_content
    in_rules = concept in rules_content
    if in_soul and in_rules:
        print(f"❌ DUPLICATED: '{concept}' in BOTH SOUL.md and rules.md")
```

### Step 3: Identify cross-profile common blocks

Extract repeated blocks (ACP enforcement, privacy rules) and check if
they're identical across all 29 profiles. If nearly identical, extract
to a shared file.

### Step 4: Check memory staleness

- Profile count matches actual?
- Referenced files actually exist?
- Model version table current?
- Memory at capacity (>90%)?

### Step 5: Rewrite prohibitions as judgements

| Current (prohibition) | Rewritten (judgement framework) |
|---|---|
| `禁止访问 ~/.hermes/` | `仅操作 workspace 内文件；workspace 外路径访问前确认是否在例外清单` |
| `禁止 workspace_kind="scratch"` | Move to config default (environmental affordance) |
| `禁止用 write_file 写产线代码` | Keep ACP flow description; delete redundant禁令 |
| `禁止编造示例数据` | `输出的数据必须来自真实工具调用结果——自检：我能追溯每个数字的来源吗？` |

## Graph Engineering for Multi-Agent Architecture

When auditing or designing multi-agent workflows (kanban boards,
delegate_task patterns), apply these concepts:

### Single-Loop Failure Modes
1. **Metric optimized, intent lost** (Goodhart effect)
2. **Loop can't see upper-level goals** (can shrink error, can't question target)
3. **Multiple loops conflict** (quality loop vs latency loop)
4. **Measurement system decays** (tests/judge age; LLM-as-judge biases)

### Graph Fixes
1. **Pairing**: Add counter-metric to every primary metric
2. **Hierarchy**: Slow loops manage goals; fast loops execute tasks
3. **Arbitration**: Make conflicts explicit with priority rules
4. **Audit**: Measure the measurement system with independent evidence

### Machina's Graph Playbook
- **Fake Edge**: Does the next task truly need the previous result? If not, parallelize.
- **Diamond**: Split → parallel → independent verify → merge survivors (not self-grading)
- **Stop Rule**: If work doesn't fork, don't arrange an agent team
- **Human Gate**: Place before the most irreversible action, not at every step

### Grounding Test
The graph must periodically leave its own reports and touch reality:
does code compile, did tests run, did the user get results?

## Optimization Priority

| Priority | Action | Expected impact |
|---|---|---|
| P0 | Fix stale memory data | Eliminate "bad data" (wrong counts, dead refs) |
| P1 | SOUL↔rules dedup | Eliminate conflict instructions |
| P1 | Cross-profile common block extraction | -28K tokens system-wide (measured) |
| P2 | Prohibition→judgement rewrite | Fewer overconstraints |
| P2 | rules.md progressive disclosure split | -6K tokens per profile |
| P3 | Diamond structure for parallel research | Quality improvement |
| P3 | Counter-metrics + audit layer | System reliability |

## Pitfalls

### Don't delete authorization context
Hack profile SOUL.md authorization blocks at the top must stay inline —
they prevent LLM refusal on every turn, not just at execution time.

### Don't externalize without improving routing
Progressive disclosure requires good routing: clear names, clear trigger
conditions, clear indexes. If the model can't find the externalized
content, it's worse than having it inline.

### Config constraints > SOUL.md prohibitions
`workspace_kind` default is better enforced via config.yaml default than
via a SOUL.md禁令. The environment should express the constraint, not
the prompt.

### Memory lifecycle matters
Auto-memory is not "set and forget." Memories need source tracking,
expiration dates, and conflict resolution rules. A 92%-full MEMORY.md
with stale data is worse than no memory.

### Graph Engineering ≠ multi-agent
Multiple agents messaging each other is NOT Graph Engineering. Only
when evidence sources, supervision responsibilities, target permissions,
and failure handling are explicitly designed does communication become
an improvement architecture.

## Reference Files

- `references/context-engineering-new-rules.md` — Full research findings
  from Anthropic's official article + three WeChat analysis articles,
  including the six rule changes, three migrations, Graph Engineering
  concepts, and the measured Hermes audit (2026-07-26).

## Related Skills

- **token-optimization** — (default profile) The base skill for
  progressive disclosure, config tuning, MCP pruning. This skill
  extends it with the Anthropic Context Engineering audit framework.
- **memory-consolidation** — (orchestrator profile) Pruning stale
  MEMORY.md/USER.md; the context audit often reveals memory staleness.
- **agent-soul-patching** — (default profile) Batch SOUL.md patching;
  the audit identifies what to patch.
- **prompt-rule-enforcement** — (orchestrator profile) Three-layer
  rule enforcement pattern; the audit may identify rules that should
  be softened from prohibitions to judgements.
- **scope-discipline** — (orchestrator profile) Research-then-propose
  sequence; Graph Engineering's Stop Rule and Human Gate concepts
  extend scope discipline to multi-agent workflows.
