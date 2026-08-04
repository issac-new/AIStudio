---
name: swarmstudio-gateway-management
description: >-
  Configure SwarmStudio desktop app's gateway management mode (unified vs
  per_profile), fix dashboard "Gateway Status: Stopped" and "Active Agents: 0"
  issues, and migrate from launchd to SwarmStudio-managed gateway. Use when
  SwarmStudio spawns too many gateway processes or dashboard shows wrong state.
version: 1.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [gateway, swarmstudio, multiplex, dashboard, launchd, troubleshooting]
    related_skills: [gateway-crash-loop-troubleshooting, hermes-gateway-operations]
---

# SwarmStudio Gateway Management

Configure SwarmStudio's gateway lifecycle to avoid 22 duplicate processes,
dashboard state mismatches, and launchd conflicts.

## When to Use

- SwarmStudio spawns 20+ gateway processes (one per profile)
- Dashboard shows "Gateway Status: Stopped" but gateway IS running
- Dashboard shows "Active Agents: 0" and you need to know if it's broken
- Migrating from launchd plist to SwarmStudio-managed gateway
- Port 8650 conflicts between launchd and SwarmStudio

## multiplex_profiles: The Key Config

SwarmStudio's `M4I()` function reads `~/.hermes/config.yaml` on startup:

```javascript
function M4I(I){
  return Ske(I.multiplex_profiles) || Ske(I.gateway?.multiplex_profiles)
    ? "unified" : "per_profile"
}
```

- **`per_profile` (default)** — spawns one gateway process per profile (22+).
  Worker profiles have `api_server.enabled: false` so they don't bind ports,
  but they still waste ~100-200MB RAM each and race for the dispatcher lock.
- **`unified` (`multiplex_profiles: true`)** — spawns exactly 1 gateway using
  `HERMES_HOME=~/.hermes`. Hermes reads `~/.hermes/active_profile` to resolve
  which profile config/SOUL/rules to load.

### Setting unified mode

```yaml
# ~/.hermes/config.yaml  (global, not profile-specific)
gateway:
  multiplex_profiles: true
```

Then **restart SwarmStudio** (quit + `open -a SwarmStudio`). Config is only
read on startup. After restart:

```bash
ps -eo pid,command | grep "gateway run" | grep -v grep | wc -l  # should be 1
```

### Killing processes without the config fix is futile

SwarmStudio respawns worker gateways within ~7 seconds. The config change
is the only durable fix. To apply it:

```bash
# Kill all gateway processes
ps -eo pid,command | grep "gateway run" | grep -v grep | awk '{print $1}' | xargs kill -9
# Quit SwarmStudio before it respawns
kill <SwarmStudio-main-PID>
# Apply the config fix, then reopen
open -a SwarmStudio
```

## How active_profile resolution works in unified mode

1. SwarmStudio starts: `python3 -m hermes_cli.main gateway run --replace`
   with `HERMES_HOME=/Users/<user>/.hermes`
2. Hermes reads `~/.hermes/active_profile` → e.g. `orchestrator`
3. Hermes loads `~/.hermes/profiles/orchestrator/config.yaml`
4. Hermes loads `~/.hermes/profiles/orchestrator/SOUL.md` + rules
5. Gateway writes state to `~/.hermes/profiles/orchestrator/gateway_state.json`

So even though `HERMES_HOME` points to global `~/.hermes`, the actual profile
config/SOUL/rules come from the orchestrator profile directory.

### Implication: global config needs platforms + credentials

The unified gateway reads `~/.hermes/config.yaml` and `~/.hermes/.env` for
initial platform setup. If these lack `platforms:` section or platform
credentials, the gateway starts with 0 platforms connected.

Required in global `~/.hermes/config.yaml`:
```yaml
platforms:
  api_server:
    enabled: true
    extra:
      host: 127.0.0.1
      port: 8650
  matrix:
    enabled: true
  email:
    enabled: true
```

Required in global `~/.hermes/.env`: `MATRIX_*`, `EMAIL_*`, `API_SERVER_*`
vars (copy from `~/.hermes/shared/.env.common` if missing).

## Dashboard "Gateway Status: Stopped" — stale state file

### Cause

SwarmStudio dashboard reads `~/.hermes/gateway_state.json` (global path).
But the unified gateway writes state to
`~/.hermes/profiles/orchestrator/gateway_state.json` (profile path).
The global file is stale → dashboard shows "Stopped".

### Fix

Symlink the global state files to the orchestrator profile's files:

```bash
rm -f ~/.hermes/gateway_state.json
ln -s ~/.hermes/profiles/orchestrator/gateway_state.json ~/.hermes/gateway_state.json
ln -s ~/.hermes/profiles/orchestrator/gateway.pid ~/.hermes/gateway.pid
```

### Verify

```bash
cat ~/.hermes/gateway_state.json | python3 -c "
import sys,json; s=json.load(sys.stdin)
print(f'PID: {s[\"pid\"]}  State: {s[\"gateway_state\"]}')
for k,v in s.get('platforms',{}).items():
    print(f'  {k}: {v[\"state\"]}')
"
```

Dashboard refresh shows "Running" with 3 platforms connected.

## Dashboard "Active Agents: 0" — this is NORMAL

`active_agents` in `gateway_state.json` counts **in-flight LLM runs**
(messages currently being processed), not registered profiles or sessions.

- No message being processed → `0` (correct)
- User sends Matrix message → `1` during LLM generation
- After response delivered → back to `0`

Send a test message to verify the counter briefly shows 1.

## Migrating from launchd to SwarmStudio management

1. **Uninstall launchd plist**:
   ```bash
   hermes gateway stop
   hermes gateway uninstall
   ```

2. **Set `multiplex_profiles: true`** in global config (see above).

3. **Add platforms + credentials** to global config and `.env` (see above).

4. **Symlink state files** (see Dashboard fix above).

5. **Restart SwarmStudio** — reads new config, starts 1 unified gateway.

### Backups preserved

- Custom plist: `~/Library/LaunchAgents/ai.hermes.gateway-<profile>.plist.custom.bak`
- Start script: `~/.hermes/shared/start-gateway-with-dashboard.sh`

## SwarmStudio port discovery

SwarmStudio's HTTP API is NOT on port 9119 (dashboard) or 8650 (gateway).
To find it:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -i swarm
# DevTools port: ~9251 (ignore)
# HTTP API port: ~8748 (requires auth — curl returns {"error":"Unauthorized"})
```

## Related Skills

- `gateway-crash-loop-troubleshooting` — crash loops, port conflicts, dispatcher
  lock issues (the "how to fix when broken" companion to this skill)
- `hermes-gateway-operations` — launchd plist setup, multi-board Kanban,
  worker parallelism, session pruning
