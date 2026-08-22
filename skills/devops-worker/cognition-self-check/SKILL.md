---
name: cognition-self-check
description: >-
  Prevent low-level errors (fabricated data, unverified claims, wrong
  routing) by enforcing a pre-execution cognitive self-check. Use when
  an agent repeatedly makes "stupid" mistakes that a 5-second check
  would have caught, when the user says "why do you keep making basic
  errors", or when setting up a new SOUL.md and wanting error-prevention
  baked in from day one.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [cognition, quality, error-prevention, soul, rules]
    related_skills: [prompt-rule-enforcement, cognition-lattice]
---

# Cognition Self-Check

A mandatory pre-execution and pre-output self-check protocol that
prevents the most common low-level agent errors: presenting fabricated
data as real, claiming completion without verification, and routing
based on the first word instead of the full message.

## When to Use

- Agent presented fabricated/test data as real user data
- Agent claimed "done" without actually verifying the output
- Agent made routing/classification errors from anchoring on first word
- User says "why do you keep making basic errors" or similar
- Setting up a new SOUL.md and wanting error-prevention built in
- After loading cognition-lattice but still making errors (rule wasn't
  enforced)

## The Problem

cognition-lattice (1969 knowledge entries) is installed as a skill but
SOUL.md only said "should load" it — a suggestion, not a trigger. In
practice the agent never loads it during multi-step tasks, and makes
errors that the cognitive frameworks would have prevented:

1. **Fabricated data as real**: Inserted test records into a DB,
   then presented stats including those records as the user's real data
2. **Unverified completion**: Claimed a task was "done" without running
   tests or checking output files
3. **Anchoring**: Routed based on the first keyword, ignoring context
4. **Forgot meta-rules**: Skipped mandatory steps (kanban trace, ACP
   coding) because task execution inertia overwhelmed mid-priority rules

## Solution: Two-Block SOUL.md Enforcement

### Block 1: Pre-execution self-check (5-item checklist)

Place at the TOP of SOUL.md as a 🔴 rule block:

```markdown
## 🔴 强制规则：认知自检（防低级错误，不可覆盖）

### 执行前自检清单（5秒快速过一遍）

| # | 认知原则 | 自检问题 | 如果回答"否" |
|---|---------|---------|-------------|
| 1 | 事实vs虚构 | "我即将输出的数据/内容，是否来自真实工具调用结果？" | 停止，用工具验证后再输出 |
| 2 | 第一性原理 | "我是否在用类比/经验猜测，而非基于事实？" | 拆解到基本要素，用工具验证 |
| 3 | 逆向思维 | "如果这个输出是错的，会造成什么后果？" | 先验证再输出 |
| 4 | 确认偏误 | "我是否只找支持我判断的证据？" | 主动寻找反驳证据 |
| 5 | 规划谬误 | "我是否低估了任务复杂度？" | 预留 buffer，复杂任务拆子任务 |
```

Key design choices:
- **Quantified**: Each item has a yes/no question, not subjective
- **Consequential**: Each "no" answer has a specific action (stop, verify)
- **5 items only**: Long enough to cover the main failure modes, short
  enough to actually run in 5 seconds

### Block 2: High-frequency error scenarios

Below the checklist, list the specific scenarios that have caused
problems:

```markdown
### 高频错误场景（必须检查）

- **输出统计数据/报表** → 必须先用工具查询真实数据，禁止编造示例数据
- **声称"已完成"** → 必须用工具验证产出（跑测试/linter/read_file），不信任自述
- **创建文件/代码** → 必须验证文件存在且内容正确
- **路由判定** → 必须看完整条消息再判定，不被第一个词锚定
- **复杂度判定** → 量化触发条件优先于主观判断
```

### Block 3: Cognition-lattice loading trigger

The cognition-lattice skill must have a FORCED loading trigger, not a
suggestion:

```markdown
## 认知增强决策框架

> **强制规则**: 本节不是"建议"，是**必经步骤**。

### 强制加载触发条件

当遇到以下场景时，**必须先** skill_view('cognition-lattice'):
- 任何 Gateway 消息执行前
- 任务路由、分解、Worker 分配、优先级判定、跨看板协调决策
```

### Block 4: 8-item post-decision bias checklist

After making any routing/classification decision:

```
1. 确认偏误 — 是否只关注支持当前判断的证据？
2. 锚定效应 — 是否被消息第一个词或初始印象锚定？
3. 可得性启发 — 是否因最近处理过类似任务而偏向某路由？
4. 规划谬误 — 是否低估了任务复杂度？
5. 沉没成本 — 是否因已投入而坚持错误方向？
6. 框架效应 — 消息措辞是否影响了客观判定？
7. 代表性启发 — 是否忽略了基率？
8. 过度自信 — 是否需要设置 triage 而非直接路由？
```

## Why This Is Needed (Not Just Memory)

The cognition-lattice skill was installed and the SOUL.md mentioned it.
But the mention was a suggestion ("should load"), not a trigger. The
result: the agent never loaded it during a 7-step task and made three
low-level errors in sequence:

1. Forgot to create a kanban trace card (rule enforcement failure)
2. Presented fabricated test data as real user activity stats
3. Didn't verify cron job script paths before claiming completion

Each of these would have been caught by the 5-item checklist:
- Error 1: Item 5 (planning fallacy — underestimated complexity)
- Error 2: Item 1 (facts vs fabrication — data wasn't from real queries)
- Error 3: Item 3 (inversion — what if the paths are wrong?)

Memory alone can't fix this because MEMORY.md is a reminder, not an
enforcement mechanism. The SOUL.md 🔴 block + checklist forces the
agent to actively run through the items before outputting.

## Relationship to prompt-rule-enforcement

This skill is complementary to `prompt-rule-enforcement`:

| Skill | What it enforces |
|-------|-----------------|
| prompt-rule-enforcement | Rules get executed at all (kanban trace, ACP, privacy) |
| cognition-self-check | Output is correct before it's delivered (no fabricated data, no unverified claims) |

Use both together. prompt-rule-enforcement handles "did you do the
meta-step?" (Layer 1-3 enforcement). cognition-self-check handles "is
the output of the step actually correct?" (quality gate).

## Case Study: Life Workbench Stats (2026-07-25)

### What happened

The agent built a life-tracking workbench and inserted 5 test activities
(running, reading, gaming, socializing, coding) to verify the pipeline.
It then showed the user a stats report with these 5 activities as if
they were the user's real daily activities.

### Why the checklist would have caught it

- Item 1 (事实vs虚构): "Is this data from real tool calls?" → The data
  was from the agent's own test inserts, not from user-reported activities
- Item 3 (逆向思维): "If this output is wrong, what happens?" → User
  loses trust in the entire tracking system

### Fix applied

1. Added the 5-item checklist as a 🔴 SOUL.md block
2. Added "输出统计数据/报表 → 必须先用工具查询真实数据，禁止编造示例数据"
   to high-frequency error scenarios
3. Made cognition-lattice loading mandatory (not suggestive)
4. Added 8-item post-decision bias checklist

## Pitfalls

### Don't make the checklist too long

A 10+ item checklist won't be run — the agent will skip it to save
tokens. 5 items is the sweet spot: covers the main failure modes,
completable in 5 seconds.

### Don't make the questions subjective

"Is this output good?" is useless. "Is this data from a real tool call?"
is answerable with yes/no and has a specific corrective action.

### Don't forget the high-frequency error scenarios

The 5-item checklist is general; the error scenarios are specific to
the agent's actual failure patterns. Update them when new error types
are discovered.

### cognition-lattice loading must be a trigger not a suggestion

"Should load" → never loads. "Must load before any Gateway message
execution" → loads. The wording matters.

## Related Skills

- **prompt-rule-enforcement** — ensures rules are executed at all
  (complementary: this skill ensures the output is correct)
- **cognition-lattice** — the knowledge base (1969 entries) that
  provides the cognitive frameworks referenced in the checklist
- **gateway-smart-routing** — routing rules that benefit from the
  post-decision bias checklist
