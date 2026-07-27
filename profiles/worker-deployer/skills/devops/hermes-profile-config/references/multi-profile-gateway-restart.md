# Multi-Profile Gateway Restart Procedure

Session: 2026-07-02 — user requested restarting all 10 profile gateways
(default, architect, orchestrator, project-manager, requirement-analyst,
worker-coder, worker-deployer, worker-researcher, worker-reviewer,
worker-tester).

## When to Use

- You need to restart ALL gateway processes across every profile (not just
  one profile).
- After a global config change that affects all profiles (e.g. model
  provider switch, shared rules file update, plugin reinstall).
- After a crash or manual kill that left gateways in a mixed state.

## Why `hermes gateway restart --all` Is Unreliable for 10+ Profiles

`hermes gateway restart --all` is designed to kill all stale gateway
processes and restart. In practice on macOS with 10 profiles, it **timed
out after 180 seconds** without completing. The command appears to restart
profiles sequentially and the cumulative startup time exceeds the default
timeout.

**Do NOT use `restart --all` for more than ~3 profiles.** Use the manual
stop-and-start procedure below instead.

## Procedure: Manual Stop-All-Then-Start-Each

### Step 1: Survey current state

```bash
hermes gateway list
```

Output shows each profile with `✓` (running, PID shown) or `✗` (not running).

### Step 2: Find the shared parent process

All `hermes gateway run --replace` processes share a common parent. On
macOS, this is typically a node process (the Hermes daemon launcher).

```bash
ps -eo pid,ppid,command | grep "hermes gateway run" | grep -v grep
```

Look at the PPID column — all gateway PIDs will have the same parent.
Verify the parent:

```bash
ps -p <PPID> -o pid,ppid,command
```

### Step 3: Kill the parent (stops all gateways at once)

```bash
kill <PPID>
sleep 1
# If still alive:
kill -9 <PPID>
sleep 2
```

Killing the parent is cleaner than killing each gateway PID individually —
it ensures no orphaned child processes remain.

### Step 4: Verify all stopped

```bash
hermes gateway list
# All profiles should show ✗ not running

ps aux | grep "hermes gateway run" | grep -v grep
# Should return no results
```

### Step 5: Restart each profile individually

Use `terminal(background=true)` for each profile. The `--replace` flag
ensures any stale process is replaced.

**Batch the independent starts** — issue all 10 `terminal(background=true)`
calls in a single assistant turn. The runtime executes them concurrently.

```
terminal(background=true, command="hermes -p default gateway run --replace")
terminal(background=true, command="hermes -p architect gateway run --replace")
terminal(background=true, command="hermes -p orchestrator gateway run --replace")
terminal(background=true, command="hermes -p project-manager gateway run --replace")
terminal(background=true, command="hermes -p requirement-analyst gateway run --replace")
terminal(background=true, command="hermes -p worker-coder gateway run --replace")
terminal(background=true, command="hermes -p worker-deployer gateway run --replace")
terminal(background=true, command="hermes -p worker-researcher gateway run --replace")
terminal(background=true, command="hermes -p worker-reviewer gateway run --replace")
terminal(background=true, command="hermes -p worker-tester gateway run --replace")
```

**Why `run` not `start`:** `gateway start` targets an installed systemd/
launchd background service. If `hermes gateway install` was never run
(common on macOS — no launchd plist exists in `~/Library/LaunchAgents/`),
`start` has nothing to start. `gateway run` starts the process directly
in the background.

**Why background=true:** The terminal tool rejects shell-level background
wrappers (`nohup`, `&`, `disown`) in foreground mode. Use
`background=true` so Hermes tracks the process lifecycle.

### Step 6: Wait and verify

```bash
sleep 5
hermes gateway list
# All 10 profiles should show ✓ with new PIDs
```

### Step 7: Health-check the orchestrator API server

The orchestrator profile runs an API server on port 8650 (configured via
`platforms.api_server.enabled: true`). Worker profiles have
`api_server.enabled: false` and no port.

```bash
curl -s http://localhost:8650/health
# Expected: {"status": "ok", "platform": "hermes-agent", "version": "..."}
```

## Key Facts

- **`hermes gateway run` vs `hermes gateway start`**: `run` = foreground/
  background process; `start` = installed system service (launchd/systemd).
  If no service is installed, use `run`.
- **`hermes gateway install`** creates a launchd plist on macOS
  (`~/Library/LaunchAgents/`) or systemd unit on Linux. After install,
  `start`/`stop`/`restart` manage the service. Without install, only `run`
  works.
- **`--replace` flag**: if a stale gateway process exists for the profile,
  `--replace` kills it before starting the new one. Safe to always pass.
- **Shared parent process**: on macOS, all `hermes gateway run` processes
  are children of a single node daemon. Killing the parent stops all
  gateways atomically — no need to kill 10 PIDs individually.
- **`hermes -p <profile>`**: the `-p` flag selects which profile's gateway
  to manage. Without it, the current profile (orchestrator) is used.
- **Port 8650**: only the orchestrator listens on this port. Worker
  profiles run gateways (for Kanban dispatch, Matrix, etc.) but do NOT
  expose an HTTP API server port.
- **Startup time**: each gateway takes ~3-5 seconds to initialize. With
  10 profiles started in parallel (batched background calls), total
  restart time is ~5-10 seconds. Started sequentially, it would be 30-50
  seconds — which is why `restart --all` (sequential) timed out at 180s
  with overhead.

## Pitfalls

- **`restart --all` timeout**: the built-in `restart --all` command is
  sequential and can exceed the 180s terminal timeout with 10+ profiles.
  Use the manual procedure instead.
- **Foreground background wrappers rejected**: `nohup hermes ... &` in a
  foreground terminal call is rejected by the tool layer. Must use
  `terminal(background=true)`.
- **launchd not installed by default**: on macOS, `hermes gateway install`
  must be run explicitly. Without it, `gateway start`/`stop`/`restart` have
  no service to manage. Check with:
  ```bash
  ls ~/Library/LaunchAgents/ | grep -i hermes
  launchctl list | grep -i hermes
  ```
- **Don't kill individual gateway PIDs**: they share a parent. Killing the
  parent is cleaner and prevents orphaned processes. If you must kill
  individually, kill ALL of them — a partial kill leaves the system in an
  inconsistent state.
