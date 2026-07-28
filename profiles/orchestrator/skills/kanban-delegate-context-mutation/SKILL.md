---
name: kanban-delegate-context-mutation
description: "How to handle the delegate_task child context kanban mutation block. When kanban_complete/kanban_block are not in your tool namespace, both CLI and MCP API fallbacks are also blocked. Use this skill to avoid wasting 10+ tool calls on doomed retry paths."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [kanban, delegate-task, isolation, mutation-block]
    related_skills: [kanban-handoff-contract, kanban-worker]
---

# Kanban Delegate Task Child Context — Mutation Block

## When to Use

- You are a kanban worker and `kanban_complete` / `kanban_block` / `kanban_comment` are NOT in your tool namespace.
- `hermes kanban complete <id>` returns `"delegate_task child contexts cannot mutate Kanban tasks via the CLI"`.
- `hermes_studio_api_request` to `/api/hermes/kanban/complete` returns `401 Unauthorized`.

## Root Cause

You are running inside a `delegate_task` child context. Hermes enforces a
security boundary: delegate_task children cannot mutate Kanban task state.
This is enforced by `_reject_delegated_child_mutation()` in
`tools/kanban_tools.py` and by `kanban_db.py` / `kanban.py` in the CLI.
It is a deliberate design decision, not a bug.

## What is Blocked

ALL kanban mutation verbs are blocked:
- `kanban_complete`
- `kanban_block`
- `kanban_heartbeat`
- `kanban_comment`
- `kanban_attach`
- `kanban_attach_url`
- `kanban_create`
- `kanban_unblock`
- `kanban_link`

## What Still Works

- `kanban_show` (read-only) — may work via CLI if you need to check task state.
- `hermes kanban show <id>` — read-only, not blocked by the guard.
- All non-kanban tools (write_file, read_file, terminal, execute_code, etc.)

## The Wrong Path (do NOT do this)

1. ❌ Try `hermes kanban complete <id> --summary "..."` → blocked
2. ❌ Try `hermes kanban --board <b> complete <id> --summary "..."` → blocked (same guard)
3. ❌ Try `hermes_studio_api_request` to `/api/hermes/kanban/complete` → 401 Unauthorized
4. ❌ Try `hermes_studio_api_request` with `profile` param → still 401
5. ❌ Read the hermes source code (`kanban_tools.py`, `kanban.py`) to find a workaround → waste of context
6. ❌ Try to directly write to the SQLite DB (`HERMES_KANBAN_DB`) → bypasses event logging, breaks invariants
7. ❌ Try `python3 -c "import hermes_agent..."` → package not on PYTHONPATH

Each of these wastes 2-3 tool calls and significant context. After 10+ calls
you will have burned the task's execution budget without making progress.

## The Right Path

1. ✅ Finish the deliverable (write the file, run the code, produce the artifact).
2. ✅ In your final text message, state clearly:
   - The task is complete
   - The deliverable path (absolute path)
   - A summary of what was done
   - Note: "kanban completion must be done manually by the operator: `hermes kanban complete <id> --summary '...'`"
3. ✅ Stop. Do not attempt further kanban mutations.

## Why This Happens

The kanban dispatcher normally runs workers as direct dispatches (not
delegate_task children). But some orchestrator patterns use `delegate_task`
to spawn workers, which triggers this isolation boundary. The guard exists
to prevent stale or concurrent delegate_task children from corrupting the
kanban state machine (race conditions on task claims, double-completes, etc.).

## Related Skills

- **kanban-handoff-contract** — The general completion protocol (exit with kanban_complete or kanban_block).
- **kanban-worker** — Pitfalls and examples for kanban workers.
