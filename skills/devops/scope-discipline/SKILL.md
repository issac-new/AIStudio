---
name: scope-discipline
description: >-
  Enforce user-specified scope boundaries and prevent premature solution
  proposals during research tasks. Use when a user says "只调研不开发",
  "先调研", "只作调研", or otherwise constrains the task to
  investigation-only — and the agent must NOT include proposals, team
  plans, or "是否现在开始创建?" follow-up prompts. Also covers the
  research-then-propose sequence: dispatch research subagent → wait for
  results → present findings → THEN propose, never proposing before
  research returns.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [scope-discipline, research, cognition, quality, enforcement]
    related_skills:
      - cognition-self-check
      - prompt-rule-enforcement
      - evidence-based-research
---

# Scope Discipline

Enforce user-specified scope boundaries during research and complex
tasks. The core failure mode: user says "调研" (research only), agent
fetches some initial data, then immediately outputs concrete proposals
(team size, profile names, architecture) before the deep research has
even been dispatched — violating facts-vs-fabrication and causing user
frustration.

## When to Use

- User says "只调研不开发" / "只作调研" / "先不开发" / "先调研"
- User provides URLs/articles and asks for "深入调研分析"
- User constrains task scope explicitly ("只", "仅", "先...再...")
- Agent is about to propose a solution/team/architecture during a
  research-only task
- After dispatching a research subagent, before it returns

## The Problem

Two recurring failure patterns:

### Pattern A: Premature solution proposal

User asks for deep research on 3 articles. The agent:
1. Fetches the 3 articles (curl + regex) ✓
2. Writes a quick summary ✓
3. **Immediately proposes a 7-profile team with role assignments** ✗

The deep research subagent (web_search for international standards, GitHub
projects, industry analysis) hasn't been dispatched yet. The proposal is
based on 3 article summaries, not industry research. This violates:

- **cognition-self-check #1** (facts vs fabrication): proposal not based
  on real research data
- **cognition-self-check #3** (inversion): what if the proposal is wrong
  after actual research?
- **User trust**: user said "调研", got an unrequested proposal

### Pattern B: Ignoring explicit scope constraints

User says "1. 设置default_workdir 2. 先不开发 3. 只作调研". The agent:
1. Sets default_workdir ✓
2. Says "不开发" ✓
3. But then adds "需要你确认：是否现在就开始创建看板+profile+任务分解？" ✗

The user explicitly said "先不开发". Asking "是否现在开始创建" is
pushing scope, not respecting the boundary.

## Solution: The Research-Then-Propose Sequence

### Rule 1: Research tasks produce research output only

When user says "调研" / "research" / "investigate":
- DO: fetch sources, dispatch research subagents, write analysis reports
- DON'T: propose teams, architectures, profile counts, or ask "是否开始创建?"

### Rule 2: Wait for subagent results before proposing

The correct sequence:
```
1. Dispatch research subagent (delegate_task with web_search)
2. Tell user "调研子agent后台运行中，完成后通知"
3. WAIT — do NOT propose solutions in the meantime
4. When subagent returns → present findings
5. THEN propose a plan based on the findings
6. If user constrained scope ("只调研") → present findings only, no proposal
```

### Rule 3: Respect explicit scope words literally

| User says | What to do | What NOT to do |
|-----------|-----------|----------------|
| "只调研不开发" | Research only, present findings | Propose team/plan, ask "是否开始创建?" |
| "先不开发" | Do the current step, don't plan ahead | Ask "要不要现在开始?" |
| "先调研再决定" | Research, present, wait for decision | Propose decision in same turn |
| "只作调研" | Research output only | Include any development/creation steps |

### Rule 4: When in doubt, under-deliver scope

If unsure whether the user wants research-only or research+proposal:
- Present research findings
- Ask "需要我基于这些发现进一步制定方案吗？"
- Do NOT assume they want the proposal

## SOUL.md Integration

Add to the cognition-self-check high-frequency error scenarios:

```markdown
- **提出方案/团队/架构建议** → 必须先完成调研（web_search/delegate_task
  返回结果后），调研未完成不得提出具体方案
- **遵守用户明确的范围约束** → 用户说"只调研不开发"时不得在回复中
  包含开发计划/团队创建/任务分解。用户说"先不开发"时不得给出
  "是否现在开始创建？"的追问
```

## Case Study: [已移除] Platform Research (2026-07-25)

### What happened

User provided 3 WeChat article URLs and asked "深入调研分析". The agent:
1. Fetched articles via curl ✓
2. Wrote analysis to [已移除].md ✓
3. Immediately proposed a 7-profile [已移除] team with role table ✗
4. Asked "是否现在就开始创建看板+profile+任务分解？" ✗

User corrected: "为什么会违反之前设置的全局规则！！，必须修正该问题"

### Root cause

- cognition-self-check was loaded but the "high-frequency error scenarios"
  list didn't include "proposing solutions before research completes"
- The agent treated article fetching as sufficient research, when the user
  asked for deep industry investigation (standards, GitHub, forums, etc.)
- No scope-discipline rule existed to enforce the research-then-propose
  sequence

### Fix

1. Created this skill to codify scope discipline
2. Added two new items to cognition-self-check high-frequency scenarios:
   - "提出方案/团队/架构建议 → 必须先完成调研"
   - "遵守用户明确的范围约束 → 用户说'只调研不开发'时不得包含开发计划"
3. The correct sequence for this case would have been:
   - Fetch articles ✓
   - Dispatch deep research subagent (web_search for standards/GitHub/forums) ✓
   - Tell user "调研子agent后台运行中" ✓
   - WAIT for results
   - Present comprehensive findings
   - Ask "需要基于这些发现制定方案吗？" (not "是否现在开始创建?")

## Pitfalls

### "But I already have some data" is not "research complete"

Fetching 3 article URLs and writing summaries is preliminary data
collection, not deep research. When user says "深入调研", they expect
web_search across multiple sources (standards, GitHub, forums, academic
papers), not just parsing the URLs they provided.

### Don't ask "是否现在开始创建?" when user said "先不开发"

"先不开发" means "don't develop yet". Asking "是否现在开始?" is trying
to expand scope within the same turn. The correct response is to complete
the current step (e.g., set default_workdir) and state what's pending
(research subagent running), without any forward-pushing questions.

### Scope words are literal, not suggestive

"只调研" = only research. "先不开发" = don't develop yet. These are
hard constraints, not soft preferences. Don't interpret them as "research
first, then maybe develop" — interpret as "research only, development
is off the table until I explicitly say otherwise".

## Related Skills

- **cognition-self-check** — the 5-item checklist that catches fabricated
  data; this skill extends it with scope-discipline scenarios
- **prompt-rule-enforcement** — 3-layer pattern for enforcing mandatory
  rules; scope discipline should be enforced the same way (🔴 block +
  quantified triggers)
- **evidence-based-research** — anti-hallucination research method;
  this skill adds the scope-boundary layer on top
- **gateway-smart-routing** — the kanban board default_workdir pitfall
  was discovered in the same session; it's a related operational fix
