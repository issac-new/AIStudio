# CC Switch Proxy Auth for Claude Agent ACP

This session documented how to authenticate `@agentclientprotocol/claude-agent-acp` when the user runs Claude Code through a **CC Switch** proxy (a local proxy that intercepts Anthropic API calls and routes them to alternative backends like Kimi-for-coding).

## Env Vars

| Variable | Value | Purpose |
|----------|-------|---------|
| `ANTHROPIC_AUTH_TOKEN` | `PROXY_MANAGED` | Signals the proxy to handle auth internally (not a real credential) |
| `ANTHROPIC_BASE_URL` | `http://127.0.0.1:15721` | Routes all Anthropic API calls through the local proxy |

## How It Works

1. The CC Switch proxy runs as a local macOS app (`/Applications/CC Switch.app/Contents/MacOS/cc-switch`) on port 15721
2. Claude Code is configured via `~/.claude/settings.json` with the env overrides above
3. When `claude-agent-acp` starts with these env vars, the Claude Agent SDK sends API requests to `http://127.0.0.1:15721` instead of the real Anthropic API
4. The proxy intercepts and routes to the configured backend (e.g. Kimi-for-coding)

## Verification

The ACP initialize handshake works through the proxy:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}' | \
timeout 10 claude-agent-acp 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin))"
```

Returns agent info `@agentclientprotocol/claude-agent-acp v0.44.0` — the proxy translates the API calls transparently.

## Docker Container Access

When running Claude Code (or `claude-agent-acp`) **inside a Docker container**, the proxy at `127.0.0.1:15721` points to the container's own localhost, not the host. Use `host.docker.internal:15721` instead:

```bash
ANTHROPIC_AUTH_TOKEN=PROXY_MANAGED
ANTHROPIC_BASE_URL=http://host.docker.internal:15721
```

This works automatically on macOS Docker Desktop. For Linux, add `extra_hosts: - "host.docker.internal:host-gateway"` to the docker-compose service.

Also copy the host's `~/.claude.json` and `~/.claude/settings.json` into the container at `/root/.claude/` to share model mappings and plugin config:

```bash
docker compose cp ~/.claude.json container_name:/root/.claude.json
docker compose cp ~/.claude/settings.json container_name:/root/.claude/settings.json
```

## Note

This setup is specific to users who run Claude Code through CC Switch or similar proxies. For direct Anthropic API access, use `ANTHROPIC_API_KEY` instead.
