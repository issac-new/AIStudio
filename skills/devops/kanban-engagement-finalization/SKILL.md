---
name: kanban-engagement-finalization
description: >-
  Finalize a multi-agent Kanban engagement: run a background waiter that
  notifies on completion without blocking, assemble the final merged report
  from worker outputs, and maximize compliant progress on a blocked
  (HumanGate-gated) task while authorization is pending. Use when you have
  dispatched N parallel workers and need (a) to know when they all finish
  without polling, (b) to merge their output files into one report, or (c)
  to advance a blocked pentest/irreversible-action task without touching
  the target. Complements kanban-worker-monitoring (the monitoring window
  BEFORE completion) and security-engagement-decomposition (the dispatch
  pattern).
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [kanban, multi-agent, orchestration, monitoring, compliance]
    related_skills:
      - kanban-worker-monitoring
      - security-engagement-decomposition
      - kanban-orchestrator
---

# Kanban Engagement Finalization

Three orchestrator-side patterns for the **completion phase** of a
multi-agent Kanban engagement — the window after dispatch, when workers
are running or blocked and the orchestrator must (1) detect completion
without blocking, (2) assemble the final report, and (3) keep a blocked
irreversible-action task moving without crossing its gate.

This skill complements:
- **kanban-worker-monitoring** — covers the monitoring window BEFORE
  completion (reading live logs, heartbeat checks, interim merge). This
  skill covers what happens AFTER: the completion signal and final
  assembly.
- **security-engagement-decomposition** — covers the dispatch pattern
  (compliance constraints, Diamond fan-in, HumanGate). This skill covers
  the blocked-task prep pattern that the dispatch skill implies but does
  not spell out.

## When to use

- You dispatched N parallel workers and need to know the moment they all
  finish, without blocking the session on `process(wait)`
- All workers are `done` and you need to assemble their output files into
  one final report
- A task is `blocked` on HumanGate HIGH (e.g. active pentest pending
  written authorization) and the user asks to "推进" / "maximize progress"
  on it

## Pattern 1 — Background waiter (notify-on-complete)

Run the waiter as a background process with
`terminal(background=True, notify_on_complete=True)`. It polls the
per-board Kanban DB every 30s, exits when all target tasks are `done`,
and the `notify_on_complete` delivers one out-of-band ping carrying the
script's last stdout line (`ALL_TASKS_DONE`).

The full script and its pitfalls (set -u + empty heartbeat, macOS bash
3.2, ad-hoc verification) live in
`references/background-waiter-and-final-merge.md`.

Key rules:
- Guard empty `last_heartbeat_at` with `if [ -n "$hb" ]` BEFORE arithmetic
  (`set -u` is active in worker env; a `todo` task has NULL heartbeat).
- macOS default bash is 3.2 — no `wait -n`; use a batch counter.
- Verify the script with a single-iteration ad-hoc copy before relying on
  it (write to /tmp, `bash -n`, run once, clean up).
- Point at the per-board DB
  (`~/.hermes/kanban/boards/<slug>/kanban.db`), not the default DB.

## Pattern 2 — Final merge assembly

Once the waiter fires `ALL_TASKS_DONE`, the final merge is a plain `cat`
of a cover page + each worker's output file. The Diamond Checker already
independently verified findings — the orchestrator packages, it does not
re-verify.

Write `_cover.md` first (executive summary, risk matrix ranked by severity,
P0/P1/P2 remediation, task execution record, reading guide). Then cat
cover + Part 1 (worker A) + Part 2 (worker B) + Part 3 (Checker) into
`final_report.md`.

The assembly script and cover-page structure live in
`references/background-waiter-and-final-merge.md`.

Key rule: do NOT re-verify at the merge step. The Checker's whole purpose
was independent verification; re-verifying either duplicates it or
introduces a weaker second pass that may miss what the Checker caught.

## Pattern 3 — Maximizing progress on a blocked HumanGate-HIGH task

When a task is `blocked` on authorization (active pentest, outbound
disclosure, production deploy) the user may ask to "推进" it. The gate is
absolute — you cannot cross it. But you can maximize compliant progress
WITHOUT touching the target, turning a hard wait into a prepared state.

### What you CAN do before authorization

1. **Write an `attack_plan.md` / `deployment_plan.md`** in the engagement
   workspace:
   - Target asset inventory assembled from already-compliant reports
     (OSINT/audit findings — public data).
   - Per-finding `verification_path` table: for each risk finding, the
     exact command to verify it once authorized, expected outcome, risk
     level.
   - Phased execution plan with time estimates.
   - Compliance bottom lines that survive into authorization (no
     credential use unless explicitly permitted, no DoS/social-engineering
     unless separately authorized, Docker sandbox, evidence-chain logging).
2. **Install/verify the toolchain** so authorization unlocks immediate
   execution, not a setup delay. Probe the tools the worker's SOUL.md
   names. Install missing ones. Re-verify after install.
3. **Write a prep comment on the blocked card** summarizing: (a) the
   attack-surface inference, (b) toolchain readiness, (c) execution plan
   draft, (d) compliance bottom lines. This gives the eventual worker a
   ready-made runbook.

### What you STILL cannot do

- No active probing of the target (no nmap, no port scan, no HTTP fetch
  of the target's services). The gate is absolute.
- No use of known credentials to log in to anything.
- No contacting the target or external parties.

### Why this is worth doing

Authorization often arrives late or never. Maximizing compliant prep
means: if it arrives, execution starts in minutes; if it never arrives,
the plan + Checker report still give the target's team a complete
defensive picture. The blocked card's comment thread carries the prep
state so the engagement is visibly not abandoned.

This is the "orchestrator does prep, not execution" rule applied to the
prep window — same anti-temptation rule as kanban-orchestrator, just
before the gate instead of during execution.

## Anti-patterns

- **Polling the DB in a tight loop.** Heartbeats fire every ~60s. The
  background waiter polls every 30s; that's the right cadence. Faster
  wastes tool calls.
- **Re-verifying findings at merge time.** The Checker verified; the
  orchestrator packages. Re-verification duplicates or weakens.
- **Crossing the HumanGate to "just check one thing."** The gate is
  absolute. No nmap, no credential use, no target HTTP — not even one
  probe. Prep only.
- **Writing the prep plan into the task body instead of a workspace file
  + a card comment.** The body is the dispatch contract; the workspace
  file is the runbook; the comment is the durable trace. Use all three.

## Overlap note

This skill extends two existing skills that could not be patched in the
session that produced it (skill_manage symlink resolution limitation):
- **kanban-worker-monitoring** already covers the monitoring window
  BEFORE completion. Pattern 1 + Pattern 2 here cover the completion
  signal and final assembly — the natural continuation.
- **security-engagement-decomposition** already covers the dispatch
  pattern including the blocked-task creation. Pattern 3 here spells out
  the prep-window behavior that the dispatch skill implies but does not
  detail.

When the background curator consolidates, Pattern 1+2 should fold into
kanban-worker-monitoring (sections 5+6), and Pattern 3 should fold into
security-engagement-decomposition (a "Pre-authorization prep" section).

## Related skills

- **kanban-worker-monitoring** (default profile) — monitoring window
  before completion; this skill's Pattern 1+2 extend it.
- **security-engagement-decomposition** — dispatch pattern + Diamond
  fan-in; this skill's Pattern 3 extends its blocked-task handling.
- **kanban-orchestrator** (default profile) — decomposition playbook;
  this skill's Pattern 3 applies its anti-temptation rule to the prep
  window.
