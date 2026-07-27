# cc switch: Codex CLI Model Switching

`cc switch` is a **built-in subcommand of Codex CLI**, not a separate script or tool. The `cc` in the name refers to Codex CLI's command-line binary, not the C compiler.

## What It Does

`cc switch` manages which model/provider the Codex CLI uses for coding tasks. It maintains a model catalog (`~/.codex/cc-switch-model-catalog.json`) that describes available models, their capabilities, and routing rules.

## Integration with Claude Code in Containers

When deploying Hermes Agent containers with Claude Code, the containers use the **same proxy** that `cc switch` manages. The key config:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "PROXY_MANAGED",
    "ANTHROPIC_BASE_URL": "http://host.docker.internal:15721"
  }
}
```

This routes Claude Code's API calls through the `cc switch` proxy on the host, which handles:
- Model selection/routing (e.g., `deepseek-v4-flash`)
- API key management
- Request forwarding

## Configuration Files

| File | Purpose |
|------|---------|
| `~/.codex/config.toml` | Codex CLI config (proxy URL, etc.) |
| `~/.codex/auth.json` | Auth tokens for Codex CLI |
| `~/.codex/cc-switch-model-catalog.json` | Available model definitions |

## Container Proxy Address

Inside Docker containers, the proxy must use `host.docker.internal` instead of `127.0.0.1`:

```
❌ http://127.0.0.1:15721   → points to container's loopback
✅ http://host.docker.internal:15721 → points to Docker host
```

`host.docker.internal` is automatically available on macOS Docker Desktop. For Linux, add `extra_hosts: - "host.docker.internal:host-gateway"` to docker-compose.yml.
