---
name: hermes-gateway-operations
description: >-
  Gateway + Dashboard unified startup, multi-board Kanban architecture,
  worker parallelism without independent gateways, and bulk session/task
  cleanup. Covers launchd plist setup, the start-gateway-with-dashboard.sh
  script, dispatcher multi-board enumeration, and SQLite-based pruning.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [gateway, dashboard, kanban, launchd, multi-board, session-pruning]
    related_skills: [hermes-profile-config, kanban-orchestrator]
---

# Hermes Gateway Operations

Operational procedures for running a single-gateway multi-profile Hermes
deployment with dashboard, multi-board Kanban, and bulk cleanup.

## When to Use

- Starting gateway + dashboard together under launchd
- Understanding worker parallelism without independent gateways
- Creating and managing multiple Kanban boards for different teams
- Bulk-deleting sessions or tasks

## Gateway + Dashboard Unified Startup (macOS launchd)

### Architecture

```
launchd (ai.hermes.gateway-<profile>)
  └─ start-gateway-with-dashboard.sh
       ├─ nohup hermes dashboard --host 127.0.0.1 --port 9119 --skip-build
       └─ exec hermes --profile <profile> gateway run --replace
```

The dashboard runs as a **child process** of the gateway (PPID = gateway PID).
`--skip-build` uses the pre-compiled web dist — no npm needed at runtime.
`exec` replaces the shell so launchd directly supervises the gateway process.
Worker profiles do NOT need this script — they have no gateway.

### Setup

1. Add `HERMES_DASHBOARD=1`, `HERMES_DASHBOARD_HOST=127.0.0.1`,
   `HERMES_DASHBOARD_PORT=9119` to `~/.hermes/shared/.env.common`.
2. Copy the start script to `~/.hermes/shared/start-gateway-with-dashboard.sh`.
3. Rewrite launchd plist `ProgramArguments` to call the script:
   ```
   /bin/bash ~/.hermes/shared/start-gateway-with-dashboard.sh <profile> --replace
   ```
4. Add `HERMES_DASHBOARD` env vars to the plist's `EnvironmentVariables`.
5. Reload:
   ```bash
   launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.hermes.gateway-<profile>.plist
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.hermes.gateway-<profile>.plist
   ```
6. Verify:
   ```bash
   lsof -i :8650 -sTCP:LISTEN   # gateway
   lsof -i :9119 -sTCP:LISTEN   # dashboard
   ```

### Reload after config changes

```bash
launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-<profile>
```

Use this after regenerating configs via `generate-configs.py` — it restarts
the gateway process under launchd supervision, picking up new config.yaml
and .env files.

## Worker Parallelism Without Independent Gateways

Workers do NOT need their own gateway process. The Kanban dispatcher's
`_default_spawn()` function (`hermes_cli/kanban_db.py:8169`) spawns each
worker as a fire-and-forget subprocess:

```
hermes -p <assignee> --cli --accept-hooks chat -q "work kanban task <id>"
```

Each worker is an independent OS process with its own Python interpreter,
session context, and terminal. Key env vars injected per worker:
- `HERMES_KANBAN_TASK` — task ID to execute
- `HERMES_KANBAN_DB` — shared SQLite board path
- `HERMES_HOME` — profile-scoped config directory
- `TERMINAL_CWD` — task workspace directory

**Parallelism** = `max_in_progress_per_profile` x number of worker profiles.
E.g. 8 workers x 4 = 32 concurrent tasks. Only the orchestrator profile
runs a gateway (with api_server + matrix + dashboard).

### max_in_progress_per_profile tuning

| Value | Total (8 workers) | Use case |
|-------|-------------------|----------|
| 2 | 16 | Conservative, low API rate limits |
| 3 | 24 | Balanced |
| 4 | 32 | Aggressive, watch API rate limits |
| 5+ | 40+ | Only with high-RPM API or local model |

Consider: M1 Pro 32GB can handle 32 concurrent worker processes (~100-200MB
each = 3-6GB). The bottleneck is usually API RPM/TPM, not local resources.

## Multi-Board Kanban Architecture

The dispatcher (`gateway/kanban_watchers.py:1063-1078`) automatically
enumerates ALL non-archived boards on every 60s tick — no restart needed
when creating new boards:

```python
def _tick_once():
    boards = _kb.list_boards(include_archived=False)
    for b in boards:
        _tick_once_for_board(b["slug"])  # independent dispatch per board
```

Tasks on different boards are dispatched independently. Worker profiles are
isolated by assignee name — a worker assigned to team A will never pick up
tasks from team B's board.

### Board management

```bash
hermes kanban boards list                                    # list all boards
hermes kanban boards create <slug> --name "Name" --icon "X" --color "#hex"
hermes kanban boards rename <slug> "New Name"                # slug is immutable
hermes kanban boards set-default-workdir <slug> <path>       # set workspace root
hermes kanban boards rm <slug>                               # archive/delete
```

**Pitfall**: The `default` board slug is system-reserved and cannot be
deleted, even if empty. Create a separate slug (e.g. `hack`) for specialized
boards instead of trying to repurpose `default`.

### Bulk task deletion

```bash
sqlite3 ~/.hermes/kanban/boards/<slug>/kanban.db "DELETE FROM tasks;"
```

This removes ALL tasks including archived ones. The board itself remains.

## Session Pruning (Bulk Deletion)

`hermes sessions prune --before <date> --include-archived --yes` only deletes
sessions with message records. For thorough cleanup, use direct SQLite:

```bash
TODAY_START=$(python3 -c "import datetime; print(datetime.datetime(2026,7,22).timestamp())")

for p in orchestrator worker-coder worker-researcher; do
    db=~/.hermes/profiles/$p/state.db
    # Delete sessions before today
    sqlite3 "$db" "DELETE FROM sessions WHERE started_at < $TODAY_START;"
    # Delete orphan messages (whose session_id no longer exists)
    sqlite3 "$db" "DELETE FROM messages WHERE session_id NOT IN (SELECT id FROM sessions);"
    # Reclaim disk space
    sqlite3 "$db" "VACUUM;"
done
```

### Pitfall: `hermes sessions prune` leaves some sessions

The CLI prune may leave sessions that lack message records or have
non-standard `started_at` formats. Direct SQLite `DELETE FROM sessions
WHERE started_at < <epoch>` is more reliable for bulk cleanup.

### Pitfall: orphan messages bloat the DB

Deleting sessions without deleting their messages leaves orphan rows in the
`messages` table. Always run the orphan cleanup + VACUUM after bulk session
deletion to reclaim disk space (e.g. 68MB DB with 874 orphan messages →
significant shrinkage after VACUUM).

## Pitfalls

### skill_manage cross_profile=True doesn't work for patched skills

When a skill exists in the `default` profile (symlinked into `orchestrator`),
`skill_manage(action='patch', cross_profile=True)` still reports "not found
in active profile". The `cross_profile` flag is recognized but doesn't
resolve the skill lookup. Workaround: use the `patch` tool with the
absolute file path, or create a new skill in the active profile.

### launchctl kickstart vs bootout/bootstrap

- `launchctl kickstart -k gui/$(id -u)/<label>` — restarts the service
  (kills + respawns). Use for config reloads.
- `launchctl bootout` + `bootstrap` — fully unloads and reloads the plist
  definition. Use when the plist file itself changed (ProgramArguments,
  EnvironmentVariables, etc.).
