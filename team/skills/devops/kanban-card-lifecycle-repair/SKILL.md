---
name: kanban-card-lifecycle-repair
description: "Fix stalled kanban cards: ghost skills, parent cycles."
version: 1.0.0
metadata:
  hermes:
    tags: [kanban, dispatcher, orchestration, troubleshooting]
    related_skills: [kanban-orchestrator, kanban-db-guarded-writes]
---

# Kanban Card Lifecycle Repair

Repair patterns for cards that cannot progress for reasons OTHER than provider
outages (those live in kanban-triage-stall-recovery / cc-switch-failover-ops).
Each section: symptom → mechanism → fix → prevention.

## Ghost skill reference: spawn dies with `Unknown skill(s): <name>`

**Symptom**: worker crashes before its first LLM call; run outcome=`crashed`
(not protocol_violation); last output is `Error: Unknown skill(s): <name>`;
crash repeats identically on every retry.

**Mechanism**: `kanban_create(skills=[...])` resolves each name against the
ASSIGNEE's own skill library at spawn time. A skill visible in the
orchestrator's library (e.g. a devops-rd skill) may not exist in the worker
profile's library — resolution failure kills the process before any work.

**Fix order**:
1. Clear the card's skills: `UPDATE tasks SET skills='[]' WHERE id='<tid>'`
   (sanctioned API via `hermes_cli.kanban_db_connect.connect`, not raw CLI).
2. Reset `consecutive_failures=0` — crashes also increment it and hitting
   `failure_limit` (default 2) auto-blocks the card.
3. Unblock/promote, then verify `status=running` + live PID within one
   dispatcher tick (~75s), same as any respawn.

**Prevention**: before passing `skills=[...]` on kanban_create, check
`ls ~/.hermes/profiles/<assignee>/skills/` for the actual directory. When in
doubt, omit skills — the card body's frozen acceptance criteria already
govern quality; skills are a convenience, not the gate.

## Root-card orchestration deadlock: goal-mode root ↔ first child parent cycle

**Symptom**: root (goal-mode coordinator) card blocked with a reason like
"child was created with parents=[root], but root completion requires all
children done" — an unsolvable cycle; the goal judge also rejects an
orchestration-only completion because real deliverables don't exist yet.

**Mechanism**: parents edges mean "child waits for parent done". A root card
that is merely the decomposer/reviewer is not an input to its first child —
making it one creates a cycle the scheduler can never resolve.

**Fix**: remove the root↔first-child DB edge (keep child→child edges for the
real pipeline, e.g. research→implementation→verification). Record the
 derivation in the child body text instead. Then unblock the root.

**Prevention**: only create a `parents` edge when the parent's DELIVERABLE is
an input to the child. Root↔first-child relationships are provenance, not
gating — express those in the body.

## Goal-mode judge rejects "orchestration-only" completion

A goal-mode root card whose acceptance criteria demand real deliverables
(implementation + verification) cannot be completed by summarizing child
progress. Either wait for the full chain to finish, or — if the root was
only ever meant to coordinate — write its acceptance criteria as
coordination outcomes ("child chain created and progressing"), not as
deliverables it doesn't produce. Don't fight the judge; fix the card contract.

## Related

- **kanban-triage-stall-recovery** — triage stalls, provider-circuit rc=0
  protocol violations, ghost duplicate spawns, polling windows.
- **cc-switch-failover-ops** — the provider-side cascade behind many
  "spawn then immediately die" symptoms.
- **kanban-db-guarded-writes** — sanctioned write API for the UPDATEs above.
