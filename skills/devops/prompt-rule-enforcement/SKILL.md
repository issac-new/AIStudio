---
name: prompt-rule-enforcement
description: >-
  Enforce mandatory SOUL.md rules that get forgotten during multi-step task
  execution. Three-layer pattern: top-level 🔴 rule block + quantified triggers
  + per-turn memory injection. Use when a prompt-level rule (kanban trace,
  ACP coding, privacy) is being skipped mid-task and the user asks "why did
  you forget X?"
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [prompt-engineering, soul, rules, enforcement, routing, kanban]
    related_skills: [gateway-smart-routing, hermes-agent]
---

# Prompt Rule Enforcement

Mandatory rules written into SOUL.md (🔴 blocks) are sometimes forgotten
during multi-step task execution. This skill captures the three-layer
enforcement pattern that fixes the root causes of forgetting.

## When to Use

- A mandatory SOUL.md rule was skipped during a multi-step task
- User asks "why didn't you do X?" and X was a prompt-level rule
- Setting up a new mandatory rule and want it to stick from day one
- Auditing why an existing rule isn't being followed consistently

## The Three Root Causes of Forgetting

| Root cause | Why it happens | Can it be fixed? |
|-----------|---------------|-----------------|
| **System prompt doesn't hot-reload** | SOUL.md/rules loaded once at session start; mid-session patches don't take effect until next `/reset` | No — architectural constraint. Fix is making rules strong enough for when they DO load |
| **No code-level enforcement** | A §N.N rule has same priority as other rules; task execution inertia deprioritizes meta-steps | Yes — Layer 1 (top-level block) |
| **Subjective classification** | Natural-language criteria ("multi-step", "simple") are ambiguous; LLM judges inconsistently | Yes — Layer 2 (quantified triggers) |

## Three-Layer Enforcement Pattern

All three layers are required. No single layer is sufficient.

### Layer 1: SOUL.md top-level 🔴 rule block

Place the rule at the VERY TOP of SOUL.md, before all other rules. This
gives it the same enforcement weight as other 🔴 blocks (ACP coding, etc.).

Structure:
```markdown
## 🔴 强制规则：<rule name>（最高优先级，不可覆盖）

<what must happen, with hard quantified triggers>

### 执行检查清单（每条消息回复前过一遍）
1. <count metric>
2. <classify by threshold>
3. <action based on classification>
4. <skip condition for non-applicable channels>

> 忘记<action> = 任务未完成。
```

Key elements:
- 🔴 marker and "最高优先级" in the heading
- Quantified triggers (numbers, not adjectives)
- 5-step checklist (the checklist format forces sequential processing)
- Explicit "forgetting = task incomplete" statement

### Layer 2: Quantified triggers in rules file

Replace subjective criteria in the rules file (e.g. orchestrator_rules.md)
with hard numbers:

❌ Before (subjective): "单次工具调用可完成" / "多步编码"
✅ After (quantified): "工具调用 3-5 次 或 文件写入 1-2 个"

Add a cross-reference note linking the rules file section to the SOUL.md
top-level block, so both stay in sync.

### Layer 3: Memory sync

Update MEMORY.md with a compact version of the trigger table. MEMORY.md is
injected every turn, so it serves as a per-turn reinforcement even when the
LLM loses focus mid-task.

Format: keep under ~250 chars to fit the 2200-char budget.
```
<rule name>(date): quantified trigger → action. SOUL.md顶部强制规则块+rules §N量化表,两处同步。
```

## Why Each Layer Alone Is Insufficient

| Layer | What it ensures | Why alone it's insufficient |
|-------|----------------|---------------------------|
| 1 (SOUL top) | Rule seen FIRST in system prompt | Without quantified criteria, still subjective |
| 2 (rules §N) | Criteria are unambiguous (numbers) | Mid-priority; can be deprioritized during multi-step tasks |
| 3 (Memory) | Re-injected every turn | Only a reminder, no enforcement mechanism |

## Case Study: Smart Routing Lightweight Trace (2026-07-25)

### What happened

The orchestrator was configured with smart routing (§0.2 in
orchestrator_rules.md): medium-complexity Gateway messages should get
a `kanban_create` + `kanban_complete` "lightweight trace" after execution.

A user sent "三个一起吧" (build all three modules of a life workbench)
via Weixin. The orchestrator executed 7 subtasks (3 scripts, 3 cron jobs,
1 design doc) but forgot the lightweight trace entirely.

### Why it happened

- **Layer 2 only**: The rule lived in §0.2 at normal priority
- **Subjective criteria**: "single tool call" vs "multi-step" was ambiguous
- **Task inertia**: 7 subtasks created execution momentum; the meta-step
  (create trace card) was naturally deprioritized
- **No per-turn reminder**: MEMORY.md didn't contain the trigger table

### Fix applied

1. Added 🔴 top-level block to SOUL.md with quantified triggers
2. Replaced subjective criteria in §0.2 with hard numbers
3. Updated MEMORY.md with the quantified trigger table

### Verification

After the fix, the next message (a 5-tool-call, 2-file-write task) was
correctly classified as "medium" and the lightweight trace was created
before replying to the user.

## Pitfalls

### Don't use subjective criteria

"Simple", "complex", "multi-step" are all subjective. The LLM will
classify inconsistently. Always use numbers: tool call count, file write
count, or other countable metrics.

### Don't put the rule only in the rules file

A rule in `orchestrator_rules.md §N.N` is mid-priority in the system
prompt. During multi-step tasks, it competes with task execution inertia
and loses. The 🔴 top-level block in SOUL.md is needed for enforcement
priority.

### Don't skip the memory sync

MEMORY.md is injected every turn. Without it, the rule is only seen once
at session start and can fade from attention during long multi-step tasks.

## Related Skills

- **gateway-smart-routing** (default profile) — the smart routing policy
  itself: three-tier classification, lightweight trace mechanism, tenant
  format, files to patch
- **hermes-agent** — SOUL.md structure, config.yaml, system prompt loading
- **kanban-orchestrator** — decomposition playbook for heavy-tier tasks
