# Hermes API Server Port Conflict with Docker Desktop (macOS)

## The Problem

After changing Hermes model configuration and restarting the gateway, the API
server platform fails to connect. Gateway log shows:

```
ERROR gateway.platforms.api_server: [Api_Server] Port 8644 already in use.
Set a different port in config.yaml: platforms.api_server.port
```

The gateway retries indefinitely but never connects — the port stays "in use."

## Reproduction

1. Have a Docker container mapping port 8643 (e.g., `hermes-design: 8643→8642`)
2. Hermes api_server configured on port 8644 (or any port adjacent to Docker mappings)
3. Restart gateway: `hermes gateway restart`
4. api_server fails repeatedly with "Port already in use"

## Root Cause

Docker Desktop on macOS (`com.docker` process) pre-allocates a range of ports
**adjacent** to each mapped container port, for internal Hypervisor/network
routing. This means:

```
Container maps:    8643 (host) → 8642 (container)
Docker reserves:   8644, 8645  (no container, just com.docker process)
Container maps:    9123 (host) → 9119 (container)
Docker reserves:   9124, 9125  (no container, just com.docker process)
```

These reserved ports are visible via `lsof -i :PORT` showing `com.docker` as
the owning process, but `docker port <container>` does NOT show them — they
are not container port mappings, they are Docker Desktop infrastructure.

## Diagnostic Flow

```bash
# 1. Check gateway logs
grep "api_server" ~/.hermes/profiles/orchestrator/logs/gateway.log | tail -10
# → "Port 8644 already in use"

# 2. Check what Docker containers claim the port
docker port hermes-design
# → 8642/tcp -> 0.0.0.0:8643  (only 8643, not 8644)

# 3. See what's actually on the port
lsof -i :8644
# → COMMAND      PID    USER   ... NODE NAME
#   com.docke   10350  cuishi ...      *:8644 (LISTEN)

# 4. Check the full range Docker Desktop reserves
lsof -i -P | grep "com.docke.*LISTEN" | awk '{print $9}' | sort -u
# → *:8643
#   *:8644
#   *:8645
#   *:9123
#   *:9124
#   *:9125

# 5. Find a truly free port
for port in 8650 8660 8670 8680 8690 8700; do
  if ! lsof -i :$port >/dev/null 2>&1; then
    echo "$port is free"
    break
  fi
done
# → 8650 is free
```

## Fix

Change the api_server port in all Hermes profile configs to a port well outside
Docker Desktop's reserved range:

```bash
# Update all 3 profiles
for prof in orchestrator worker-coder worker-researcher; do
  config="$HOME/.hermes/profiles/$prof/config.yaml"
  sed -i '' 's/port: 8644/port: 8650/' "$config"
  echo "$prof -> 8650"
done

# Restart gateway
hermes gateway restart
```

Verify:
```bash
sleep 3 && grep "api_server" ~/.hermes/profiles/orchestrator/logs/gateway.log | tail -3
# → "API server listening on http://127.0.0.1:8650 (model: orchestrator)"
# → "✓ api_server connected"
```

## Prevention

When configuring Hermes API server port for profile configs:

- **Don't use ports adjacent to Docker mappings.** If your compose file maps
  8643→8642, avoid 8644 and 8645.
- **Pick ports at least 5-10 numbers away** from the nearest Docker container
  port mapping. Docker Desktop reserves about a 2-3 port window.
- **Check before configuring:** run `lsof -i :<candidate-port>` to confirm it's
  truly free from both Docker and other processes.
- **Update all profiles** — each profile runs its own api_server platform
  instance, so the port must be consistent (or distinct) across profiles.
