# Gateway vs API Server Architecture

**Session:** 2026-06-30
**Context:** User asked about Gateway port allocation across profiles and how to disable external message listening for worker profiles.

## Architecture Summary

Each Hermes profile runs an independent Gateway process. Gateway is a monolithic process that bundles multiple internal modules:

| Module | Function | Config |
|--------|----------|--------|
| **Messenger** | Platform adapters (Matrix, Telegram, Discord, Email) | `platforms.matrix.enabled: true` |
| **API Server** | HTTP REST API for external calls | `platforms.api_server.enabled: true` |
| **Kanban Dispatcher** | Task routing across profiles | `kanban.dispatch_in_gateway: true` |

The Gateway process itself always runs (required for Kanban dispatcher and profile isolation). The **listening port** is opened only by the API Server module.

## Port Allocation (per profile)

| Profile | PID | Port | API Server Status |
|---------|-----|------|-------------------|
| orchestrator | 61356 | 8650 | ✅ enabled (default) |
| worker-coder | 61344 | 8651 | ❌ disabled (no listen) |
| worker-researcher | 69143 | 8652 | ❌ disabled (no listen) |
| architect | 68248 | - | ❌ disabled (no listen) |
| others | ... | - | ❌ disabled (no listen) |

**Key insight:** Only profiles with `platforms.api_server.enabled: true` open a listening port. Profiles without API Server still run a Gateway process (for Kanban integration, Matrix client, profile isolation), but do NOT accept HTTP API calls from external tools.

## Disable API Server Listening (keep Gateway running)

To remove the listening port while keeping Gateway active for internal message routing:

```yaml
# ~/.hermes/profiles/worker-coder/config.yaml
platforms:
  api_server:
    enabled: false  # ← Disable HTTP API listener
  matrix:
    enabled: true   # ← Keep Matrix client (optional)
```

**Effect:**
- Gateway process continues running
- Kanban dispatcher works (task routing from orchestrator)
- Matrix messages still received (if enabled)
- Port 8651 no longer opened → no HTTP API access from external callers

**Restart required:**
- Gateway config is read at process start
- In TUI: use `/restart` command
- In terminal: `hermes gateway restart` (must run from separate shell outside the running Gateway)

## Disabling Matrix for Worker Profiles

In addition to disabling the API Server, worker profiles should also disable
Matrix message reception. This ensures **only the orchestrator** receives
external messages and routes them through Kanban — workers get tasks exclusively
via dispatcher assignment, never directly from Matrix.

```yaml
# worker-coder/config.yaml — full isolation
platforms:
  api_server:
    enabled: false    # No HTTP port listener
  matrix:
    enabled: false    # No direct Matrix message reception
```

**Effect:** Worker profiles still run their own Gateway process (required for
Kanban dispatcher integration), but:
- ❌ No listening port (no external HTTP API access)
- ❌ No Matrix message reception (no direct user messages)
- ✅ Gateway process runs (Kanban dispatcher, profile isolation)
- ✅ Receives tasks only via orchestrator's Kanban dispatch

**Restart required:** Config changes need `hermes gateway restart` from a
separate shell (cannot restart from inside the gateway process).

## Full Agent Collaboration Architecture

```
Matrix 群聊消息
  │
  ▼
orchestrator (port 8650)          ← ONLY profile with api_server + matrix enabled
  │ - Matrix Adapter receives message
  │ - Agent calls kanban_create(triage=true)
  ▼
Kanban Board (shared SQLite DB)
  │ - Task in triage status
  │ - Human reviews and assigns
  ▼
Dispatcher (every 60s, runs inside orchestrator's Gateway)
  │ - Scans ready tasks
  │ - Checks max_in_progress_per_profile limit
  ▼
worker-coder / worker-researcher / etc.
  │ - No port listener, no Matrix
  │ - Receives task via dispatcher spawn
  │ - Executes in isolated workspace
  ▼
kanban_complete() or kanban_block()
  │
  ▼
Gateway Notifier → Matrix room (auto-delivery to subscribed chat)
```

### max_in_progress_per_profile

```yaml
kanban:
  max_in_progress_per_profile: 2  # default
```

Limits concurrent running tasks per profile. When a profile has 2 tasks running,
the dispatcher skips it for new assignments until one completes. Reasons:
- **Resource control**: each worker process uses 100-150MB RAM
- **API rate limits**: LLM providers have concurrency caps
- **Stability**: too many concurrent tasks risk crashes/timeouts
- **Fair scheduling**: prevents one profile from monopolizing dispatch

To increase: `hermes config set kanban.max_in_progress_per_profile 3 --profile worker-coder`

## Use Cases

### Why disable API Server AND Matrix for worker profiles?

Worker profiles (coder, researcher, tester) receive tasks from the orchestrator
via Kanban dispatch. They don't need:
- Direct HTTP API access (no external callers)
- Direct Matrix message reception (no user messages)

Disabling both:
- Reduces port footprint (no 8651/8652/... sockets)
- Prevents accidental direct API calls that bypass Kanban routing
- Prevents workers from receiving Matrix messages directly (bypassing orchestrator)
- Keeps multi-instance parallelism (each profile runs its own Gateway)
- Ensures clean task flow: Matrix → orchestrator → Kanban → worker

### When to keep API Server enabled?

- **orchestrator profile** - central entry point for external API calls
- **Testing/debugging** - direct HTTP calls to specific profile's agent
- **Web UI integration** - Open WebUI connects via API Server adapter

### When to keep Matrix enabled?

- **orchestrator profile** - MUST have Matrix enabled to receive user messages
- **Worker profiles** - disable Matrix to ensure tasks flow through Kanban only

## Verification Commands

```bash
# Check which profiles have listening ports
lsof -iTCP -sTCP:LISTEN -nP | grep python

# Test API Server endpoint
curl -s http://localhost:8650/health
# → {"status":"ok","platform":"hermes-agent","version":"0.17.0"}

# Check Gateway process status
hermes gateway status
# → Shows all profile PIDs and which have Gateway running
```

## Related Config

```yaml
# orchestrator/config.yaml - central entry point
platforms:
  api_server:
    enabled: true
    extra:
      host: 127.0.0.1
      port: 8650
  matrix:
    enabled: true

# worker-coder/config.yaml - full isolation (no ports, no Matrix)
# Same pattern for worker-researcher and all other worker profiles
platforms:
  api_server:
    enabled: false  # No HTTP port listener
  matrix:
    enabled: false  # No direct Matrix message reception
```

## Pitfalls

### ❌ "Disable Gateway" ≠ "Disable API Server"

Gateway is the process container. API Server is a module inside it. Disabling API Server (`enabled: false`) keeps the Gateway process running (required for Kanban). Disabling Gateway entirely (killing the process) breaks Kanban dispatch entirely.

### ❌ Config change requires restart

Gateway reads `platforms.api_server` at startup. Changing `enabled: true → false` in config.yaml does NOT immediately close the port. Must restart the Gateway process.

### ❌ Cannot restart Gateway from inside itself

Running `hermes gateway restart` from inside a running Gateway session is blocked (SIGTERM would kill the calling process before completion). Run restart from a separate terminal shell.

### ❌ `pkill` from inside Gateway is also blocked

The terminal tool's command guard blocks `pkill -f "hermes gateway"` and similar
stop/restart commands when run from inside a Gateway process. The guard message:
```
Blocked: cannot restart or stop the gateway from inside the gateway process.
The gateway would kill this command before it could complete (SIGTERM propagates
to child processes). Run `hermes gateway restart` from a separate shell outside
the running gateway.
```

**Workaround**: Tell the user to run the restart command in a **new terminal
window** — do not attempt to restart from within the current Hermes TUI session.