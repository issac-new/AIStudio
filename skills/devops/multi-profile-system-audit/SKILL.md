---
name: multi-profile-system-audit
description: >-
  Audit the STRUCTURAL HEALTH of a multi-profile, multi-board Hermes
  deployment — not one profile's context files, but the whole system:
  cross-profile duplication, routing-table-vs-filesystem drift, SOUL↔config
  contradictions, boilerplate noun-swap clones, and board liveness. Use
  when the user asks "is this structure solving real problems or just
  filling directories", when a config change needs regression proof, or
  as the 10-question health check before a major restructure.
version: 1.0.0
metadata:
  hermes:
    tags: [context-engineering, audit, multi-agent, structural-health, regression]
    related_skills: [context-engineering-audit, harness-entropy-management, agent-soul-patching]
---

# Multi-Profile System Audit

Audit the **structural health** of a multi-profile Hermes deployment:
29 profiles × 5 boards × 587 skills × N强制规则 blocks. This is
NOT the same as `context-engineering-audit` (which applies Anthropic's
six-rule framework to ONE profile's SOUL/rules/memory). This skill audits
the SYSTEM — the cross-profile duplication, the routing table that
drifted from the filesystem, the board DBs that are all empty, the
profiles that are 88% identical noun-swaps.

## When to Use

- User asks whether the agent structure is "solving real problems or just
  filling directories" (the 10-question health check)
- Before a major restructure (merge [已移除] profiles, extract shared blocks,
  regenerate routing tables) — establish the baseline first
- After a restructure — prove the fix held and catch regressions
- When a routing threshold or board assignment is changed — verify no
  downstream breakage (you need a before/after number, not a guess)
- Quarterly health check of a multi-board deployment

## The 10-Question Health Check

Run this checklist against any multi-profile Hermes deployment. Each
question maps to a runnable probe in `references/multi-profile-audit-scripts.md`.

| # | Question | What it catches | Probe |
|---|----------|-----------------|-------|
| 1 | Which knowledge does THIS task actually need? | Over-loading unrelated files | Per-task tool-call count vs file reads |
| 2 | Does a simple question load heavy governance? | 7 🔴 blocks on a routing-only profile | Count 🔴 blocks per profile; orchestrator should have fewer than workers |
| 3 | Is the same fact defined in multiple files? | Verbatim OR paraphrase duplication | 6-gram Jaccard matrix across profiles |
| 4 | Are stable definitions mixed with temp strategy? | Thresholds(≤2/3-5/≥6) in SOUL not in config | Concept-location audit |
| 5 | Does routing make the model guess among 10+ options? | 5 overlapping routing tables | Count distinct decision tables in rules.md |
| 6 | Are output templates just reworded skeletons? | Noun-swap profile clones ([已移除] 6×) | Pairwise Jaccard >40% → boilerplate |
| 7 | Can you list all affected locations before editing? | No single source of truth | `search_files` per concept, count definition sites |
| 8 | Is there a regression test set? | Blind edits, no before/after | This skill's scripts ARE the eval suite |
| 9 | Does user feedback get confirmed before entering knowledge? | Unverified "样板" in batch-generated profiles | TODO/待补充 marker count + command-manual coverage |
| 10 | Is the structure solving real problems or filling directories? | Empty boards, stale logs, unused capacity | Board liveness + dispatch staleness probe |

## Audit Procedure

### Phase 1: Baseline measurement (before any change)

Run all 5 probes from `references/multi-profile-audit-scripts.md` and
record the numbers. This is your **before** snapshot. Without it, you
cannot prove a fix worked.

Key metrics to capture:
- Cross-profile duplication: Jaccard per block, classify as
  verbatim-copy (>90%) / paraphrase (5-20%) / distinct (<5%)
- Routing drift: count of mentioned-but-missing + exists-but-unmentioned profiles
- SOUL↔config contradictions: count per profile
- Boilerplate clones: pairwise Jaccard matrix per team
- Board liveness: task count per board + newest dispatch log age

### Phase 2: Diagnosis (root-cause, not symptom)

For each metric that's off, find the STRUCTURAL cause:

| Symptom | Likely root cause |
|---------|-------------------|
| Paraphrase duplication (Jaccard 5-20%) | Same logic written independently in SOUL + rules + system-prompt injection; no single-source rule |
| Routing table mentions 8 non-existent profiles | Hand-maintained table, regex extraction picks up partial names (e.g. "hack-c2" → "hack-c") |
| SOUL claims capabilities toolsets lack | SOUL copied from a template profile that had those tools; config not updated |
| 6 [已移除] profiles 88% identical | Batch-generated from a template with only domain nouns swapped; never collapsed to base+config |
| 5 boards all 0 tasks | System deployed but never exercised; routing layer is unvalidated |

### Phase 3: Fix (structural, not cosmetic)

Priority order (P0 = highest impact, do first):

| P | Fix | Mechanical guarantee |
|---|-----|---------------------|
| P0 | Merge boilerplate clones into base+config | Post-merge Jaccard <30% |
| P0 | Convert verbatim-copied blocks to `_shared/` import | `search_files` hits 1 definition site, not 29 |
| P1 | Auto-generate routing table from `os.listdir()` | No hand-maintained table to drift |
| P1 | Move orchestrator's theory blocks (PUA/Harness/Skill-evolution) to skills | SOUL <150 lines |
| P2 | Run at least 1 end-to-end task per board | Board task count ≥1, dispatch log fresh |
| P2 | Fill missing command-manual sections | `search_files` coverage = 100% |
| P3 | Reconcile SOUL prose with config toolsets | Contradiction count = 0 |

### Phase 4: Regression proof (after the change)

Re-run the SAME probes from Phase 1. Compare before vs after. If the
metric didn't move the right direction, the fix didn't land — go back
to Phase 2 and find the real root cause.

**A fix without a before/after number is an unverified claim.** This is
the core discipline: every structural change must have a measured
baseline and a measured result.

## Critical Pitfalls

### Paraphrase duplication is invisible to grep

The most dangerous duplication is NOT verbatim copy (Jaccard >90%,
grep catches it). It's **paraphrase** — same logic, different wording,
Jaccard 5-20%. grep misses it, so you change one copy and the other
two silently drift. ALWAYS use 6-gram Jaccard, not just `search_files`.

Detected example: smart-routing threshold table (≤2/3-5/≥6) defined in
three places with three column layouts — SOUL
`触发条件|复杂度|留痕方式` vs rules `复杂度|判定标准|处理方式`.
Jaccard 7.7%. `search_files("≤2")` hit all three, but a human couldn't
tell they were "the same rule" from the grep output alone.

### Empty boards mean blind edits

A board DB with 0 tasks and stale dispatch logs means the routing layer
is **unvalidated**. You cannot prove a threshold change didn't break
routing, because no task ever exercised it. Before trusting any
routing-rule edit, run at least one end-to-end task through each board
and confirm the assignee received it.

### Hand-maintained tables always drift

The `rules.md §0.5` board-routing table is hand-typed and WILL drift
from the actual `profiles/` directory. Detected in audit: 8 mentioned
profiles didn't exist (regex parsed "hack-c2" as "hack-c"), 8 actual
profiles weren't mentioned ([已移除] team entirely missing from the table
despite having a board DB and routing rules). Fix: generate the table
from `os.listdir()` at audit time, don't hand-maintain it.

### Toolsets list ≠ SOUL prose

SOUL.md prose often promises capabilities the `config.yaml toolsets:`
list doesn't grant. Example: orchestrator SOUL says "TUI/CLI 直接执行
——写代码/跑测试/用工具" but `toolsets: ['hermes-cli','kanban','memory',
'messaging']` has no `terminal/file/web/acp`. At runtime the global
default bails it out, but the contradiction is a latent bug — if the
global default ever changes, the profile silently breaks. Always
cross-check SOUL prose against config toolsets.

### Boilerplate clones inflate storage 6×

6 [已移除] profiles at 88% similarity = 6×12KB = 64KB of storage for what
should be 1 base SOUL (12KB) + 6 noun-configs (~1KB each) = 18KB. The
redundancy isn't just token cost — it's maintenance cost: change the
"实现者不是决策者" wording and you must sync 6 files.

## Reference Files

- `references/multi-profile-audit-scripts.md` — Five runnable
  `execute_code` probes: (1) cross-profile duplication matrix with
  paraphrase classification, (2) routing-table-vs-filesystem drift
  detector, (3) SOUL↔config contradiction checker, (4) boilerplate
  noun-swap clone detector, (5) board liveness/dispatch staleness probe.
  These are the eval suite — run them before AND after any structural
  change to prove the fix held.

## Related Skills

- **context-engineering-audit** — (default profile) Anthropic's six-rule
  framework applied to ONE profile's SOUL/rules/memory. This skill
  extends it to the SYSTEM level: cross-profile, cross-board,
  cross-config. Overlaps on duplication detection (§Step 3) — that skill
  covers single-profile dedup; this skill covers cross-profile paraphrase drift.
- **harness-entropy-management** — (orchestrator profile) Ongoing
  cleanup workflow (freshness scan, tool inventory, tech-debt tracking).
  This skill is the one-shot structural audit that identifies WHAT to
  clean; entropy-management is the recurring process that keeps it clean.
- **agent-soul-patching** — (default profile) Batch SOUL.md patching
  mechanics. After this audit identifies boilerplate clones to merge,
  agent-soul-patching executes the merge.
