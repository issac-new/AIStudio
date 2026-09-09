---
name: orchestrator-kanban-tracing
description: Lifecycle rules for the Gateway orchestrator's mandatory routing-trace cards (triage self-cards + kanban_complete). Covers the triage/initial_status conflict, created_cards attribution failures, and why hand-editing SQLite is forbidden. Use whenever an orchestrator profile must open a triage card for an inbound message and then complete that same card itself after fan-out.
version: 1.0.0
platforms: [linux, macos]
environments: [kanban]
metadata:
  hermes:
    tags: [kanban, orchestration, routing, audit-trail]
    related_skills: [kanban-orchestrator, kanban-worker]
---

# Orchestrator Kanban Tracing — self-card lifecycle

> Companion to `kanban-orchestrator` (which covers decomposition). This skill covers the **audit-trail self-card** an orchestrator opens for an inbound Gateway message and must then complete itself. Learned from a real session where two kernel constraints collided and the completion failed twice.

## The trap

Profile rules may require: heavy Gateway message → `kanban_create(triage=True)` first → execute/fan out → `kanban_complete` as the last step before replying. Two kernel behaviors break the naive version of this flow:

1. **`triage=True` overrides `initial_status="running"`.** The card lands in `triage`. `kanban_complete` on a `triage` card fails with `unknown id or already terminal` — complete only accepts `running`/`ready`-family states.
2. **`created_cards=[...]` is attribution-checked.** The kernel verifies each id exists AND was created by this worker's profile in this run. A self-assigned triage card id, or child ids the kernel can't attribute, blocks completion with `created_cards do not exist or were not created by this worker`. The card stays in-flight; retrying with the same ids fails identically.

## Safe pattern

```python
# 1. Open the trace card (triage per routing rules; accept it stays in triage)
t0 = kanban_create(title="<msg summary> — 编排任务",
                   assignee="<your-own-profile>",
                   triage=True,
                   body="分解计划: lane1 -> lane2 ...")["task_id"]

# 2. Fan out children with parents=[t0]; capture each returned id
t1 = kanban_create(..., parents=[t0])["task_id"]
t2 = kanban_create(..., parents=[t1])["task_id"]

# 3. Complete the trace card WITHOUT created_cards.
#    Children are already linked via parents= on their own rows;
#    list ids in metadata instead (advisory, not kernel-verified).
kanban_complete(task_id=t0,
                summary="decomposed into t1(research)->t2(synthesize)",
                metadata={"children": [t1, t2]})
```

If step 3 still refuses because the card is in `triage`:

- `kanban_show(task_id=t0)` first to confirm the actual status.
- `kanban_comment(task_id=t0, body=<decomposition summary + child ids>)` so the audit trail exists.
- Leave the card for the operator / specifier profile to move out of triage — that is what the triage queue is for.

## Post-completion correction path (defects found after kanban_complete)

Acceptance review may find defects only after the worker already completed the card. Two kernel behaviors block the naive correction flow:

- `kanban_request_changes` is refused for terminal (`done`) cards — it only applies to cards in the review lane / non-terminal states. The error surfaces as `task not found` even though the id still resolves in SQL.
- `kanban_create(parents=[<done card>])` is refused with `unknown parent task(s)` — terminal cards cannot anchor new children at create time.

Working pattern:

1. `kanban_comment` on the done card: the full correction task-book — per-finding fix instructions, the boundary of what must NOT change (already-verified parts), acceptance criteria, and a hardened closing contract ("留逐项对照 comment 后等待复核，勿自行 complete"). This preserves the audit trail on the original card.
2. `kanban_create` a fresh correction card with NO `parents=`; duplicate the task-book in the body (workers cannot be assumed to read the old card), same `assignee` and same `workspace_path` so artifacts are corrected in place.
3. Harden the closing contract on the correction card — require per-item response and explicit wait-for-review — because the original card failed exactly that gate.
4. Re-verify the correction with the same independent mechanical checks as the first review; do not accept the fix on self-report.

## What NOT to do

- **Do NOT `sqlite3 ... UPDATE tasks SET status='done'`** to force-complete a stuck card. It bypasses the kernel's run-row accounting, heartbeat/reclaim bookkeeping, and event log. A direct SQL write makes the dashboard lie about how the card finished. (Done once under time pressure; recorded here so it isn't repeated.)
- **Do NOT pass `initial_status="running"` together with `triage=True`** expecting running to win — triage wins.
- **Do NOT retry `kanban_complete(created_cards=[...])` with the same rejected ids** — the attribution check is deterministic; drop the field or pass `created_cards=[]`.

## Quick verification

```bash
sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db \
  "SELECT id, status, assignee FROM tasks WHERE id IN ('<t0>','<t1>','<t2>');"
```

Expected after a clean run: trace card `done` (or `triage` + explanatory comment), children `todo`/`ready` with correct `parents`.
