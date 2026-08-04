---
name: research-then-improve
description: >-
  Research external platforms/methodologies (Palantir, [已移除] tools, open-source
  projects) to improve an existing Hermes multi-agent system. Covers the
  productive-parallel-survey technique: while research subagents investigate
  the external subject, survey the current system's state (profiles, SOUL.md,
  configs) in parallel so gap analysis starts immediately when research
  returns — no dead time, no scope-discipline violation. Use when the user
  says "调研X来完善/改进Y" or "深入调研 X 理念及实现，完善当前设计".
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, multi-agent, team-design, scope-discipline, parallel-work]
    related_skills:
      - deep-research-workflow
      - scope-discipline
      - multi-agent-orchestration-design
---

# Research-Then-Improve

Pattern for tasks that research an external platform/methodology to improve
an existing Hermes multi-agent system. The core insight: the research wait
window is NOT dead time — use it to survey the current system's state,
because that survey is needed regardless of what the research finds.

## When to Use

- User says "调研 X 来完善/改进 Y" (research X to improve Y)
- User says "深入调研 X 理念及实现，完善当前各 team 的设计"
- Task has two independent halves: (1) understand external reference X,
  (2) compare against current system Y and propose improvements
- User provides articles/URLs about an external platform AND has an existing
  agent team that should learn from it

## The Two-Half Structure

```
Half 1: Research external subject X (delegate_task, background)
  → split by DIMENSION (philosophy / implementation / org-patterns)
  → each subagent does multi-source investigation (web, GitHub, docs)
  → output: N focused report files

Half 2: Survey current system Y (do yourself, parallel with Half 1)
  → read all profiles' SOUL.md → extract role, description, sections
  → read all config.yaml → extract model, toolsets
  → read shared rules → extract governance patterns
  → output: current-state table (team → profiles → roles → capabilities)

Merge: Gap analysis (after both halves complete)
  → compare X's patterns against Y's current state
  → identify gaps (missing roles, missing concepts, structural differences)
  → produce improvement proposal
```

## The Productive Parallel Survey (key technique)

`delegate_task` runs in background and returns a consolidated result later.
Do NOT idle-poll the live transcripts. Instead, survey the current system
in parallel — this is safe because the survey output is needed regardless
of what the research finds.

### What to survey (for a Hermes multi-agent system)

```python
from hermes_tools import terminal
import os

profiles_dir = os.path.expanduser("~/.hermes/profiles")
profiles = sorted([d for d in os.listdir(profiles_dir)
                   if os.path.isdir(os.path.join(profiles_dir, d))
                   and d != "_shared"])

for p in profiles:
    soul_path = f"{profiles_dir}/{p}/SOUL.md"
    cfg_path = f"{profiles_dir}/{p}/config.yaml"

    # Read SOUL.md — extract role title, description, section headings
    with open(soul_path) as f:
        content = f.read()
    role_title = ""
    for line in content.split("\n"):
        if line.startswith("# ") and "强制规则" not in line:
            role_title = line.replace("# ","").strip()
            break
    h2_sections = [l.strip() for l in content.split("\n")
                   if l.strip().startswith("## ")]

    # Read config.yaml — extract model, toolsets
    with open(cfg_path) as f:
        cfg = f.read()

    print(f"### {p} ({len(content.split(chr(10)))}L)")
    print(f"  ROLE: {role_title}")
    print(f"  SECTIONS({len(h2_sections)}): "
          f"{' | '.join(h[:35] for h in h2_sections[:10])}")
```

### Survey dimensions

| Dimension | What to extract | Why needed |
|-----------|----------------|------------|
| Role identity | First `# ` heading after mandatory rules | Maps to external platform's roles |
| Capabilities | `## 核心职责` / `## 核心能力域` sections | Identifies functional gaps |
| Workflow | `## 工作流程` / `## 标准作业循环` sections | Compares process maturity |
| Governance | `## 输出契约` / `## 协作协议` sections | Compares coordination patterns |
| Toolsets | config.yaml `toolsets:` line | Identifies tool gaps |
| Model | config.yaml `model:` lines | Identifies allocation patterns |
| Team structure | Profile prefix grouping (swarm-*, hack-*, etc.) | Compares org model |

### Why this does NOT violate scope-discipline

The test: "will I need this output regardless of what the subagents find?"

- Surveying current state: **YES** — you need to know what exists to propose
  changes. Safe parallel work.
- Proposing changes based on incomplete research: **NO** — presupposes a
  research conclusion. Hold until research returns.

## Splitting Research Subagents by Dimension

For deep subjects (Palantir, a full platform), split subagents by
**research dimension** rather than source type:

| Subagent | Dimension | Sources |
|----------|-----------|---------|
| task-0 | Philosophy & positioning (products, concepts, strategy) | Official site, Wikipedia, analyst reports |
| task-1 | Technical implementation (architecture, engine, SDK) | engineering blog, GitHub repos, docs |
| task-2 | Organizational patterns (roles, methodology, feedback loops) | Career pages, interviews, case studies |

Each dimension gets full multi-source investigation. This is more effective
than splitting by source type (one subagent for web, one for GitHub, one for
papers) when the subject is deep enough that each dimension needs its own
multi-source sweep.

For shallower subjects (single article analysis), a single subagent or
source-type split is sufficient.

## Subagent Goal Prompt Template

```
深入调研 <subject> 的<dimension>。需要覆盖：
<numbered list of specific topics>

必须用真实工具查询（web 搜索、官方文档、技术博客、Wikipedia），
每个论断标注来源 URL。输出报告到 <path>。
不要提任何关于 hermes 或 agent 的建议，只产出 <subject> 调研报告。
```

The last line is critical — subagents don't know about Hermes. Telling them
"don't mention hermes" prevents them from inventing irrelevant recommendations.

## Live Transcript Monitoring (optional, not required)

Live transcripts at
`~/.hermes/profiles/orchestrator/cache/delegation/live/<delegation_id>/task-N.log`
can be tailed to check progress, but this is optional — the consolidated
result re-enters the conversation automatically when all subagents finish.

Use transcript checking only if:
- You've finished the parallel survey and have nothing else to do
- You want to verify a subagent isn't stuck (no new log lines for several
  minutes)
- You need to mine partial data from a subagent that might fail

## Gap Analysis (after both halves complete)

Once research reports return AND the current-state survey is complete:

```
1. Extract key patterns/concepts from research reports
2. Map each pattern to current system:
   - EXISTS: current system already has this (note where)
   - GAP: current system lacks this (note which team/profile)
   - PARTIAL: current system has a weaker version (note the delta)
3. Prioritize gaps by impact × effort
4. Produce improvement proposal document
```

## Pitfalls

### Do NOT propose improvements before research returns

Even if the parallel survey reveals obvious gaps, do NOT propose fixes
until the research subagents return. The research may reveal that what
looks like a gap is actually handled differently, or that the external
reference has the same limitation.

### Do NOT survey ONLY profile names

Profile names (worker-coder, hack-recon) tell you the role but not the
depth. Always read SOUL.md section headings and descriptions to understand
actual capabilities — a profile may exist but have a stub SOUL.md.

### read_file dedup blocking on profile files

When surveying many profiles, `read_file` may hit dedup/blocking after
reading the same file 3 times (the tool treats repeated reads as stale
cache hits). Use `execute_code` with Python `open()` to batch-read all
profiles in one tool call, avoiding the per-file dedup limit.

### skill_manage cross-profile patch limitation

devops skills (deep-research-workflow, scope-discipline, etc.) physically
live in the `default` profile. `skill_manage` in the orchestrator profile
cannot patch them — `cross_profile=true` opts out of the write guard but
does not change skill resolution. To patch default-profile skills: either
switch to `hermes -p default`, or use `write_file`/`patch` with
`cross_profile=true` to edit the physical file directly.

## Related Skills

- **deep-research-workflow** — the source workflow this extends with the
  parallel-survey technique (lives in default profile)
- **scope-discipline** — defines the research-then-propose sequence; this
  skill's parallel-survey technique is a compliant refinement (lives in
  default profile)
- **multi-agent-orchestration-design** — orchestrator profile configuration
  and skill-category gap analysis
- **multi-profile-system-audit** — structural health audit of a multi-profile
  deployment; the survey technique here is a lighter, research-focused version
