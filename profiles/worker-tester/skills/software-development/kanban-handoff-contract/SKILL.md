---
name: kanban-handoff-contract
description: "Completion handoff contract for ALL kanban workers: the four-section kanban_comment (变更/验证/实现方式/决策与follow-up), verify-before-cite, exit protocol (last action must be kanban_complete or kanban_block), and provider-failure blocking. Use before every kanban_complete, when writing a handoff comment, or when deciding how to end a run."
version: 1.0.0
author: Hermes Agent (distilled from worker SOUL/rules, kanban001 forensics)
platforms: [linux, macos]
metadata:
  hermes:
    tags: [kanban, handoff, completion, protocol, all-workers]
    related_skills: [kanban-goal-mode, kanban-acp-delegation]
---

# Kanban handoff contract

Applies to every kanban worker (coder/reviewer/tester/deployer/researcher).

## Exit protocol (highest priority)

Every run's LAST action is `kanban_complete` or `kanban_block` — one of the
two, no exceptions. **Your final text panel has no human reader**: asking a
question or saying "I'm done" in plain text counts for nothing (a worker once
asked "which room to reply to?" in final text and exited; nobody read it, the
task was judged gave_up).

- Have a question → `kanban_block(kind="needs_input", reason="<question + what you need>")`.
- Done → `kanban_comment` handoff first, then `kanban_complete`.

Ending on plain text = protocol violation = burns a circuit-breaker slot.

## No completion without a comment (无评论不完成)

Before `kanban_complete`, post a `kanban_comment` with four sections:

1. `## 变更` — changed_files as absolute paths.
2. `## 验证` — real commands + real output summaries + env versions.
3. `## 实现方式` — approach; include the ACP session_id if any.
4. `## 决策与 follow-up` — why A over B; what remains.

Board history: 51% of completions had zero handoff comment, forcing
downstream workers and the root orchestrator to dig through workspaces.

## Verify before you cite

Any task id / card / file path you mention in a comment or summary must be
verified to exist first (`kanban_show` / `ls`). Hallucinated references trip
the board's advisory guard. Never paste secrets/tokens into any kanban field
— a real incident put a QQ-mail authorization code into a `kanban_block`
reason; rows are permanent.

## Provider failure → explicit block, not silent death

Two consecutive API/ACP-level failures (401/429/timeout/connection) → if you
still have an execution window, `kanban_block(kind="dependency",
reason="provider <name> 持续故障: <error>, 非任务本身问题")` then exit. This
converts an infrastructure death into an explainable dependency block.

## Same-failure no-spin rule

After the same URL/API/command fails 3 times with minor variations, a 4th
near-identical retry is forbidden: switch strategy (different tool / source /
smaller scope), or hand off partial results ("verified part + unverified
list") and put the rest in follow-up. When the main acceptance criteria are
met, stop chasing optional extended verification — complete first.
