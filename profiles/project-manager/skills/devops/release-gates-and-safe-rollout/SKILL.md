---
name: release-gates-and-safe-rollout
description: "Release decision gates and safe-rollout defaults for the deployer: error-budget gates, canary metric traps (period mismatches, aggregate masking), and fail-closed defaults on irreversible actions. Use when judging whether to deploy, when designing a canary/rollback plan, or when a release metric looks healthy but the change is risky."
version: 1.0.0
author: Hermes Agent (Google SRE Workbook / DORA distilled)
platforms: [linux, macos]
metadata:
  hermes:
    tags: [deployment, sre, canary, error-budget, fail-closed, worker-deployer]
    related_skills: [kanban-handoff-contract]
---

# Release gates & safe rollout

## Error-budget gate

A release proceeds only if the service has error budget left. Burned-out
budget → freeze risky releases, prioritize reliability work. State the budget
position in the deploy handoff; "deploy because it's ready" is not a gate.

## Canary metric traps

1. **Period mismatch** — a canary evaluated over a shorter window than the
   metric's natural period (daily/weekly cycles) reads noise as signal.
   Match the evaluation window to the metric's period.
2. **Aggregate masking** — a healthy global average can hide a dying
   region/segment. Check per-segment canary metrics, not just the aggregate.
3. **No baseline** — compare the canary against a control/baseline, not
   against "looks okay". A canary without a comparison is a vibe.

## Fail-closed defaults

When a check's result is unavailable or ambiguous, default to NOT proceeding
(fail closed), never to "probably fine". Any irreversible or production-bound
action (push --force, prod config change, external message, deleting data)
requires explicit confirmation — in headless/kanban context that means
`kanban_block` with intent + impact, never proceeding unilaterally.

## Rollback before rollout

Every deploy plan names its rollback: how to revert, how fast, and what
metric triggers it. If rollback is "figure it out later", the deploy isn't
ready. AI is an amplifier (DORA): it speeds up both good and bad delivery —
the gate is what keeps speed from becoming instability.
