---
name: kanban-worker-monitoring
description: >-
  Monitor running Kanban workers and produce staged interim merge reports
  before the workers finish. Use when the user asks to "merge the reports" /
  "合并报告" while one or more tasks are still `running`, when `kanban_show`
  returns "task not found" for a task you successfully created (per-board DB),
  or when you need to check whether a dispatched worker is alive and what it
  has found so far. Covers per-board Kanban DB discovery in multi-board
  deployments, reading live worker logs for interim findings, the staged
  interim merge report structure, and the heartbeat-based liveness check.
  Complements kanban-orchestrator (decomposition) and security-engagement-
  decomposition (Diamond fan-in) — this skill covers the monitoring window
  BETWEEN dispatch and completion.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [kanban, monitoring, multi-agent, orchestration]
    related_skills:
      - kanban-orchestrator
      - kanban-worker
      - security-engagement-decomposition
---

# Kanban Worker Monitoring & Interim Merge

How to monitor dispatched Kanban workers that are still running and produce a
**staged interim merge report** when the user wants a snapshot before the
workers finish.

## When to use

- User asks to "merge the reports" / "合并给一下" while tasks are still
  `running` (not yet `done`)
- `kanban_show(task_id=...)` returns "task not found" for a task you
  successfully created — the task lives in a per-board DB, not the default one
- You need to check whether a dispatched worker is alive and making progress
  without blocking on it
- You need to brief the user on what workers have found so far, before the
  final Diamond/Checker merge runs

## 1. Per-board Kanban DB discovery

In a multi-board deployment (swarm / hack / product / ops / [已移除]), each board
has its own SQLite DB:

```
~/.hermes/kanban/boards/<board-slug>/kanban.db
```

The default `~/.hermes/kanban.db` may be empty or hold only legacy tasks.
When `kanban_show` / `kanban_list` return nothing for a task you know exists,
query the per-board DB directly via `execute_code` (Python + sqlite3):

```python
import sqlite3
conn = sqlite3.connect('/Users/<user>/.hermes/kanban/boards/hack/kanban.db')
c = conn.cursor()
# tasks(id, title, status, assignee, tenant, started_at,
#   last_heartbeat_at, worker_pid, current_run_id, consecutive_failures, ...)
for r in c.execute("SELECT id,title,status,assignee,tenant FROM tasks ORDER BY created_at DESC LIMIT 20"):
    print(r)
# task_events(id, task_id, run_id, kind, payload, created_at)
#   — 'heartbeat' kind = liveness signal
# task_comments(id, task_id, author, body, created_at)
# task_runs — per-run records
conn.close()
```

Key columns for monitoring:
- `status` — `running` / `ready` / `todo` / `blocked` / `done`
- `last_heartbeat_at` — Unix timestamp; compare to `now` for liveness
- `worker_pid` — OS process id
- `consecutive_failures` — non-zero means the worker has been crashing

## 2. Reading live worker logs

Each worker writes a full execution transcript to:

```
~/.hermes/kanban/boards/<board-slug>/logs/<task_id>.log
```

This is richer than the DB heartbeat events — it contains reasoning blocks,
tool-call summaries (with durations), and tool-result excerpts.

Read with `read_file` (large files — use `offset`/`limit` to page):

```
read_file(path="~/.hermes/kanban/boards/hack/logs/t_6136d358.log", offset=1, limit=80)
```

### What to extract for an interim merge

- **Reasoning blocks** (`┌─ Reasoning ─...`) — the worker's analysis of each
  tool result; findings are stated here ("MAJOR NEW FINDING: ...", "CRITICAL:
  ...", "CONFIRMED: ...")
- **Tool-call lines** (`│ 📖 read ...`, `│ 💻 $ ...`) — evidence of what was
  actually checked (not just claimed)
- **Result excerpts** — raw data behind each finding (DNS output, code
  snippets, grep hits)

### Pitfalls reading worker logs

- The log is a **stream of consciousness**, not a report. Findings appear
  mid-reasoning and may be revised later in the same log. Read the **tail**
  (`tail -120` or high `offset`) for the latest state, not just the head.
- A worker may call a finding "CRITICAL" in reasoning then downgrade it after
  triage (e.g., gitleaks 12172 findings → all false positives after triage).
  Always check whether the worker later walked back an early claim.
- Tool-call durations (`9.9s`, `59.3s`) help spot stuck operations but are
  not findings themselves.

## 3. Heartbeat-based liveness check (no blocking)

```python
import sqlite3, time
conn = sqlite3.connect('.../boards/hack/kanban.db')
now = int(time.time())
for r in conn.execute("SELECT id,status,last_heartbeat_at,worker_pid FROM tasks WHERE status='running'"):
    tid, status, hb, pid = r
    age = now - hb if hb else None
    print(f"{tid} | {status} | hb {age}s ago | pid {pid}")
```

| heartbeat age | interpretation |
|--------------|----------------|
| < 90s | worker actively running |
| 90–300s | may be stuck on a long tool call — check log tail |
| > 300s | likely stuck or dead — consider `hermes kanban reclaim` |

`process(action='list')` in the orchestrator session will NOT show worker
processes — they run in separate dispatcher-spawned sessions.

## 4. Staged interim merge report structure

When workers are still running and the user wants a merged report NOW,
produce a **staged interim merge** — explicitly marked as non-final,
non-verified, sourced from live logs:

1. **"This is staged, not final" header** — the final report comes from the
   Diamond fan-in Checker task after workers complete and independently
   verify findings
2. **Task status table** — which tasks are `running` (with heartbeat age),
   which are `todo`/`blocked`, which produced final files vs. not yet
3. **Staged findings table** — each finding with: risk level, description,
   source task, verification status (e.g., "✅ source code read" vs "⚠️
   worker claim, not yet independently verified")
4. **Findings detail** per source task, extracted from the logs
5. **Pending work** — what each worker still has left (which dimensions,
   which audit steps)
6. **Compliance disclaimer** — repeat engagement boundaries (zero-target-
   traffic / public-data-only / no-credential-use) if this is a security
   engagement

Write the interim report to a **stable path outside the worktrees** (e.g.
`<workspace>/<engagement-name>/INTERIM_MERGED_REPORT.md`) so it isn't lost
when a worktree is cleaned up.

### Interim vs. final — why both exist

- **Interim merge** (this skill): orchestrator reads worker logs, extracts
  staged findings, produces a snapshot NOW. No independent verification —
  findings are worker self-reports. Marked clearly.
- **Final merge** (Diamond Checker): a different-profile Checker task reads
  the workers' **final output files** (not logs), independently verifies
  each finding, discards failures, synthesizes. This is the authoritative
  report.

The interim merge exists because the user may need a snapshot before workers
finish (brief a stakeholder, decide whether to adjust scope). The final merge
exists because worker self-reports cannot be trusted at face value. Do not
let the interim merge substitute for the final merge.

## Anti-patterns

- **Treating the interim merge as the final report.** It is explicitly
  unverified. If the user acts on an interim finding that turns out to be a
  worker fabrication (not caught until the Checker runs), the engagement has
  a problem. Always close the loop with the final merge.
- **Reading only the head of a worker log.** Early findings get revised. Read
  the tail for current state; read the head only for context.
- **Polling the DB in a tight loop.** Heartbeats fire every ~60s. Polling
  faster wastes tool calls. Check `status='done'` once; if not done, read
  the log tail for progress.
- **Forgetting the per-board DB when `kanban_show` says "not found."** In a
  multi-board deployment the default DB is not the whole story. The board
  slug determines which DB file holds the task.
- **Blocking on `process(action='wait')` for a worker.** Worker processes
  are not in the orchestrator's process list; `wait` will not find them. Use
  the heartbeat + log-tail approach instead.

## Related skills

- **kanban-orchestrator** (default profile) — decomposition playbook; this
  skill covers the monitoring window after decomposition.
- **kanban-worker** (default profile) — worker-side lifecycle; this skill is
  the orchestrator-side mirror (monitoring workers, not being one).
- **security-engagement-decomposition** — the Diamond fan-in pattern; this
  skill's interim merge is what you produce BEFORE the Diamond Checker runs.
