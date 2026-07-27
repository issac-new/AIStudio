# Sharing Host Claude Code / cc-Switch Proxy Config with Docker Containers

When deploying Hermes + Claude Code containers that need to use the same API routing as the host (e.g., a local proxy like `cc-switch` managing auth and model selection), copy the host's config files into each container and fix the address resolution.

## Files to Share

| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| `~/.claude.json` | `/root/.claude.json` | Claude Code auth tokens, proxy URL, settings |
| `~/.claude/settings.json` | `/root/.claude/settings.json` | Model mapping, effort level, plugins |
| `~/.codex/config.toml` | `/root/.codex/config.toml` | Codex CLI / cc-switch config |
| `~/.codex/auth.json` | `/root/.codex/auth.json` | Codex OAuth tokens |
| `~/.codex/cc-switch-model-catalog.json` | `/root/.codex/cc-switch-model-catalog.json` | Model definitions for cc-switch |

## The `host.docker.internal` Pattern

On macOS (Docker Desktop), containers reach the host via `host.docker.internal`. On Linux with `--add-host host.docker.internal:host-gateway`. This is NOT `127.0.0.1` — inside a container, `127.0.0.1` is the container itself.

**Always rewrite proxy URLs when copying configs:**

```bash
# In ~/.claude.json and ~/.claude/settings.json:
#   "ANTHROPIC_BASE_URL": "http://127.0.0.1:15721"
#   → "ANTHROPIC_BASE_URL": "http://host.docker.internal:15721"

sed -i "s|http://127.0.0.1:15721|http://host.docker.internal:15721|g" /root/.claude.json /root/.claude/settings.json
```

## Full One-Shot Command

Run this after containers are started to copy and fix all configs:

```bash
for c in design generator evaluator; do
  # Claude Code
  docker compose exec -T "$c" mkdir -p /root/.claude
  docker compose cp ~/.claude.json "$c:/root/.claude.json"
  docker compose cp ~/.claude/settings.json "$c:/root/.claude/settings.json"
  docker compose exec -T "$c" chown root:root /root/.claude.json /root/.claude/settings.json

  # Codex / cc-switch
  docker compose exec -T "$c" mkdir -p /root/.codex
  for f in config.toml auth.json cc-switch-model-catalog.json; do
    [ -f ~/.codex/$f ] && docker compose cp ~/.codex/$f "$c:/root/.codex/$f"
  done
  docker compose exec -T "$c" chown -R root:root /root/.codex

  # Fix proxy address
  docker compose exec -T "$c" sh -c '
    sed -i "s|http://127.0.0.1:15721|http://host.docker.internal:15721|g" /root/.claude.json
    sed -i "s|\"ANTHROPIC_BASE_URL\": \"http://127.0.0.1:15721\"|\"ANTHROPIC_BASE_URL\": \"http://host.docker.internal:15721\"|g" /root/.claude/settings.json
    sed -i "s|127.0.0.1:15721|host.docker.internal:15721|g" /root/.codex/config.toml 2>/dev/null
  '
done
```

## Verification

```bash
# Check proxy URL in each container
for c in design generator evaluator; do
  echo "=== $c ==="
  docker compose exec -T "$c" claude auth status --text | grep "base URL"
  docker compose exec -T "$c" curl -s http://host.docker.internal:15721/health
done
```

Expected output:
```
=== design ===
Anthropic base URL: http://host.docker.internal:15721
{"status":"healthy",...}
=== generator ===
...
=== evaluator ===
...
```

## When to Use This

- Your host uses a local proxy (cc-switch, kimi-for-coding bridge, OpenRouter proxy) that manages model selection and API key routing
- You want Claude Code inside containers to use the exact same model/provider as the host's `cc switch` command
- You're running a multi-agent Docker fleet and want consistent API routing across all containers

## Pitfalls

1. **File permissions**: `docker compose cp` preserves the host UID/GID. Always `chown root:root` in the container.
2. **Live proxy reload**: If the host updates `.claude/settings.json` (e.g., `cc switch` changes the active model), the containers won't automatically pick up the change. Re-run the copy script or mount the files as Docker volumes.
3. **Linux Docker Engine**: `host.docker.internal` requires `--add-host host.docker.internal:host-gateway` in `docker compose up` or the docker run command. macOS has it by default.
4. **Proxy must allow container traffic**: Some proxies bind to `127.0.0.1` only. If the proxy rejects `host.docker.internal` connections, rebind it to `0.0.0.0`.
