---
name: kanban-goal-mode
description: "Operating rules for kanban goal_mode workers (HERMES_KANBAN_GOAL_MODE=1): the judge sees only your last 4000 chars, so every turn must end with concrete evidence; finalize with evidence in kanban_complete or get blocked. Use when spawned on a goal_mode card, when the goal judge rejects a turn, or when deciding whether a task fits goal_mode vs single-shot."
version: 1.0.0
author: Hermes Agent (distilled from worker SOUL/rules + goals.py contract)
platforms: [linux, macos]
metadata:
  hermes:
    tags: [kanban, goal-mode, judge, worker, evidence]
    related_skills: [kanban-handoff-contract, kanban-acp-delegation]
---

# Kanban goal_mode

`kanban_create(..., goal_mode=True, goal_max_turns=N)` spawns the worker into
a Ralph-style loop: after each turn an auxiliary judge compares your latest
response against the card's title+body; not done and budget left → you get a
continuation prompt in the SAME session; judge agrees → you finalize; budget
exhausted → the card is sticky-blocked for human review.

## The judge contract (what it can see)

**The judge only reads the last ~4000 characters of your latest response
text.** Tool outputs, files you wrote, tests you ran are invisible unless you
quote them in your response.

So every turn must end with concrete evidence in the response body:
- real command output excerpts (pass/fail counts, exit codes),
- file excerpts or paths with what changed,
- test results.

A vague "all done" / "fixed it" gets judged not-done and burns a turn.

## Finalizing

When the judge says done, call `kanban_complete` with the acceptance evidence
in the summary. If you don't finalize after one nudge, the loop blocks the
card for review. Evidence belongs in the summary, not just the response.

## Block restrictions

goal_mode workers may only `kanban_block` with "true external" kinds:
`dependency` / `needs_input`. `capability`/`transient` are rejected — the
loop treats any other block as the worker giving up on a solvable task.

## When goal_mode fits (for the card creator)

Use it for open-ended research, multi-file implementations, or trial-and-error
tasks where "done" needs judgement. Skip it for tasks with crisp acceptance
criteria achievable in one shot — the judge loop adds latency and a model
dependency for no benefit there.
