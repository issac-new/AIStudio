---
name: agent-team-deep-audit
description: >-
  Deep structural audit of a multi-agent Hermes deployment — detects 7
  defect classes (capability pollution, pipeline overhead, copy-paste
  board refs, toolset uniformity, role overlap, skill-vs-profile
  misclassification, theory-only layers) that surface health checks
  miss. Use when user says "过于抽象" or "深入分析进行重构", or
  before proposing any team restructure.
version: 1.0.0
metadata:
  hermes:
    tags: [audit, multi-agent, restructure, evidence-based, structural-defects]
    related_skills: [multi-profile-system-audit, research-then-improve, system-improvement-execution]
---

# Agent Team Deep Audit

Surface-level audits count profiles, models, and toolsets. They cannot
detect the 7 structural defect classes that make a multi-agent
deployment "look fine" individually but fail collectively. This skill
provides the probes and the output format for a deep audit that produces
evidence-based restructure proposals — not subjective assessments.

## When to Use

- User says the current design is "过于抽象" (too abstract)
- User asks to "深入分析当前各 team 以及 agent profile 进行重构"
- Before proposing any team restructure (merge/delete/downgrade profiles)
- After a major expansion (new team, batch-created profiles) to catch
  copy-paste leftovers and role overlaps

## What Makes This "Deep" vs "Abstract"

| Abstract (rejected by user) | Deep (accepted by user) |
|------------------------------|-------------------------|
| "swarm has 9 profiles doing a waterfall pipeline" | "kanban.db shows RA/architect/PM dispatched 0 times in 30 days while worker-coder got 15 tasks — pipeline is theoretical" |
| "hack team has overlapping roles" | "hack-c2 covers 5/6 hack domains, overlapping with hack-exploit (4/6) and hack-weapons (4/6) — 3 profiles doing work of 1" |
| "product team lacks tools" | "product-feedback SOUL mentions 工单系统/应用商店/NPS API but toolset is hermes-cli,acp,kanban,memory — zero data source access" |

The deep version has a number or grep result behind EVERY claim.

## The 7 Defect Classes

### Defect 1: Capability Domain Pollution

**What**: Shared rule blocks (ACP, 认知自检, 前线侦察) contain keywords
like "编码", "侦察", "审查" in boilerplate text. When injected into every
SOUL.md, ALL profiles look like they do everything (9/12+ capability
domains), making role boundaries invisible to dispatch logic.

**Detection**: For each profile, scan SOUL.md for 12 domain keywords
(编码/测试/部署/审查/调研/架构/需求/侦察/利用/取证/C2/武器). If a
profile hits >7/12, it's polluted.

**Fix**: Move shared blocks to `_shared/*.md`, replace inline copies with
1-line import references. Target: ≤3/12 domains per profile.

### Defect 2: Serial Pipeline Overhead

**What**: A team designed as a 7-step serial pipeline
(RA→architect→PM→coder→reviewer→tester→deployer) forces EVERY task
through 7 handoffs, even simple bug fixes that only need coder→tester.

**Detection**: `SELECT assignee, count(*) FROM tasks GROUP BY assignee`.
If pipeline profiles (RA/architect/PM) have 0-2 tasks while worker-coder
has 10+, the pipeline is theoretical — work bypasses it.

**Fix**: Merge pipeline profiles into orchestrator or downgrade to
skills. Target: 3-step max for simple tasks.

### Defect 3: Copy-Paste Board Reference Errors

**What**: Profiles cloned from another team's template retain the
original team's board name in SOUL.md prose. Example: 6 [已移除] profiles all
say "当 **swarm** 把一张任务卡派给你时" — they think they're on swarm.

**Detection**: For each profile, grep SOUL.md for
`当.*把.*派给你时`, compare referenced team vs actual board (from
board.json `profile_scope`).

**Fix**: Global string replacement in each affected SOUL.md.

### Defect 4: Zero Domain Depth (Toolset Uniformity)

**What**: All profiles in a team have identical toolset
(hermes-cli,acp,kanban,memory) with no domain-specific tools. The team
looks like N identical profiles with different names.

**Detection**: Extract `toolsets:` from each config.yaml in a team. If
all identical → zero domain depth. Cross-check: does SOUL.md prose
mention tools not in the toolset? (e.g. product-feedback mentions
"工单系统/应用商店/NPS API" but has none of those).

**Fix**: Add domain tools per profile (web for researchers, skills for
platform-miner, remove acp for non-coding profiles).

### Defect 5: Role Overlap Within a Team

**What**: 3+ profiles in the same team cover >60% of the same capability
domains. In practice these roles are continuous (post-exploit immediately
follows exploit), and splitting them only adds handoff overhead.

**Detection**: Build a profile×capability matrix per team (same 12 domain
keywords as Defect 1, but scan for ACTUAL duty mentions not shared-block
boilerplate). If 3+ profiles cover >60% same domains → merge candidates.

**Fix**: Merge overlapping profiles. Target: each capability domain
covered by exactly 1 profile.

### Defect 6: Skill-Vs-Profile Misclassification

**What**: A "profile" whose entire job is a single deliverable type
(e.g. ops-exec-summary = "generate executive summaries") is not a role —
it's a skill. It has no continuous duty, no domain tools, no independent
state.

**Detection**: Check all 3: (1) Single deliverable type? (2) No domain
tools (only hermes-cli/acp/kanban/memory)? (3) "Called when needed"
not "continuously running"? If all 3 → it's a skill, not a profile.

**Fix**: Delete the profile, create a skill with the same methodology.
Loaded by whichever profile needs it.

### Defect 7: Theory-Only Platform Layer

**What**: A team created to match an external methodology (e.g. Palantir
Platform/Mission dual helix) but never exercised. Board DB is empty,
cron has never run, no worker output has been processed.

**Detection**: (1) `SELECT count(*) FROM tasks` — 0 = board never used.
(2) Check cron `last_run_at` — null = automation never fired. (3) Check
if any profile's SOUL.md is >10KB but has 0 kanban_complete events.

**Fix**: Either exercise the layer (run a real task through it) or
acknowledge it as aspirational architecture. Don't leave it looking
operational when it isn't.

## Audit Procedure

### Phase 1: Run all 7 probes

For each defect class, run the detection script and record:
- **现象** (what the probe found)
- **实测数据** (count/grep result/kanban.db query — not subjective)
- **影响** (why this matters for the system)

### Phase 2: Produce restructure proposal

| Team | Before | After | Changes | Evidence |
|------|--------|-------|---------|----------|
| Swarm | 9 | 4 | RA/architect/PM→skill, deployer/reviewer→coder | Defect 1+2 |
| Hack | 6 | 4 | C2/weapons→exploit | Defect 5 |
| Product | 4 | 2 | prioritizer/feedback→manager | Defect 4+5 |
| Ops | 5 | 3 | exec-summary→skill, eval→cron | Defect 6 |
| [已移除] | 6 | 4 | multiphysics/optics→physics | Defect 5 |
| Platform | 3 | 2 | tool-builder→miner | Defect 7 |

### Phase 3: List decision points

The user must approve every merge/delete/downgrade. Don't execute
unilaterally — present evidence, let the user decide.

## Key Lesson

The user explicitly rejected abstract design docs this session:
"有些过于抽象，请深入分析当前各team以及agent profile 进行重构"

The fix is NOT more design theory — it's evidence-based defect
identification. Every claim in the restructure proposal must have a
probe result behind it (a count, a grep hit, a kanban.db query). If you
can't query it, don't claim it.

## Related Skills

- **multi-profile-system-audit** — the 10-question surface health check.
  This skill extends it with 7 deep probes for structural defects.
- **research-then-improve** — research external reference → survey current
  system → gap analysis. This skill is the audit that happens AFTER the
  improvement cycle, when the user says "this is still too abstract".
- **system-improvement-execution** — execute approved improvements after
  the audit. This skill produces the evidence that justifies the proposal.
