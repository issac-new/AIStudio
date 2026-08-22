# hermes-plugin-acp-client

Connect Hermes to [ACP (Agent Client Protocol)](https://agentclientprotocol.com/) agents via stdio transport. Supports multiple providers — any ACP server that speaks NDJSON over stdin/stdout.

## Providers

| Provider | Command | Description |
|----------|---------|-------------|
| **opencode** | `opencode acp` | [OpenCode](https://github.com/opencode-ai/opencode) agents — discovers configured modes automatically |
| **codex** | `npx @zed-industries/codex-acp` | [Codex](https://github.com/openai/codex) — OpenAI's coding agent (read-only, auto, full-access modes) |

## Tools

| Tool | Description |
|------|-------------|
| `acp_agents` | List available agents/modes and models for a provider |
| `acp_send` | Send a prompt to an agent, get response with tool calls and usage |
| `acp_sessions` | List active sessions for multi-turn conversations |

All tools accept a `provider` parameter (`"opencode"` or `"codex"`). Defaults to `default_provider` in config.

## Install

```bash
hermes plugins install anpicasso/hermes-plugin-acp-client
```

Then copy and edit the config:

```bash
cd ~/.hermes/plugins/acp-client
cp config.yaml.example config.yaml
# Edit config.yaml — set default_cwd to your workspace
```

Restart the gateway.

## Configuration

`config.yaml`:

```yaml
# Default provider when none specified
default_provider: opencode

# Default workspace directory for new sessions
default_cwd: ~/projects

# Auto-approve permission requests for autonomous operation
auto_approve: true

# Provider-specific overrides
providers:
  opencode:
    binary: ~/.opencode/bin/opencode
  codex:
    npx: npx
    package: "@zed-industries/codex-acp"
```

## How it works

1. On first tool call, spawns the provider's ACP subprocess
2. Performs the ACP initialize handshake (protocol version 1)
3. Creates sessions per workspace with full agent/mode discovery
4. Sends prompts, collects streaming responses (thoughts, messages, tool calls, plans)
5. Handles agent→client requests automatically:
   - **Permissions** — auto-approved (configurable)
   - **File I/O** — reads/writes files on the local filesystem
   - **Terminal** — executes commands in subprocesses
6. Returns assembled response with text, tool call summary, execution plan, and usage

Each provider gets its own subprocess. Both stay alive between calls for session continuity.

## Multi-turn conversations

Pass `session_id` from a previous response to continue the conversation:

```
# First call — creates a new session
acp_send(prompt="Create a FastAPI app with auth", provider="opencode")
# → returns session_id: "ses_abc123"

# Follow-up — continues the same session
acp_send(prompt="Add rate limiting to the auth endpoints", session_id="ses_abc123")
```

## Cross-provider orchestration

The real power is combining providers — use one agent's output as another's input:

```
┌─────────────────────────────────────────────────────────────┐
│                    Hermes (orchestrator)                     │
│                                                             │
│  1. acp_send(provider="codex", agent="read-only", ...)     │
│     ┌─────────────────────────────────────────────┐         │
│     │  Codex (gpt-5.4, read-only)                 │         │
│     │  • Reads codebase (23 tool calls)           │         │
│     │  • Returns structured code review           │         │
│     │  • 7 issues: 2 high, 5 medium               │         │
│     └──────────────────┬──────────────────────────┘         │
│                        │ review findings                    │
│                        ▼                                    │
│  2. acp_send(provider="opencode", prompt=review, ...)      │
│     ┌─────────────────────────────────────────────┐         │
│     │  OpenCode / Sisyphus (ultrawork)            │         │
│     │  • Reads review findings                    │         │
│     │  • Plans fixes (8 plan items)               │         │
│     │  • Edits files (67 tool calls)              │         │
│     │  • Verifies app starts clean                │         │
│     └─────────────────────────────────────────────┘         │
│                                                             │
│  Result: All 7 issues fixed across 4 files                  │
└─────────────────────────────────────────────────────────────┘
```

### Example: Codex reviews, Sisyphus fixes

```python
# Step 1 — Codex reviews the codebase (read-only, won't modify anything)
review = acp_send(
    provider="codex",
    agent="read-only",
    prompt="Do a thorough code review. List issues with severity.",
    cwd="~/myproject"
)

# Step 2 — Feed review findings to Sisyphus for fixes
acp_send(
    provider="opencode",
    prompt=f"ultrawork: Fix all issues from this code review:\n{review.response}",
    cwd="~/myproject"
)
```

This pattern works because:
- **Codex** (read-only) is a fresh pair of eyes with no write access — safe for auditing
- **Sisyphus** (ultrawork) has full write access and can autonomously fix, test, and verify
- **Hermes** orchestrates the handoff without either agent knowing about the other

## Available agents

Agents depend entirely on your provider configuration:

- **OpenCode**: Use `acp_agents(provider="opencode")` — surfaces whatever modes are configured (e.g. via oh-my-opencode)
- **Codex**: Use `acp_agents(provider="codex")` — exposes `read-only`, `auto`, and `full-access` modes with multiple model variants

## Requirements

| Provider | Requires |
|----------|----------|
| opencode | [OpenCode](https://github.com/opencode-ai/opencode) v1.2.27+, authenticated providers |
| codex | Node.js/npm (for npx), `OPENAI_API_KEY` or `CODEX_API_KEY` set |

PyYAML is included with Hermes.

## Protocol reference

This plugin implements the ACP stdio transport:
- **Wire format**: NDJSON (newline-delimited JSON) over stdin/stdout
- **Protocol**: JSON-RPC 2.0, protocol version 1
- **Bidirectional**: client sends requests to agent, agent sends requests back (permissions, file I/O, terminal)
- **Streaming**: `session/update` notifications carry thoughts, message chunks, tool calls, and plans during prompt processing

See [agentclientprotocol.com](https://agentclientprotocol.com/protocol/overview) for the full spec.
