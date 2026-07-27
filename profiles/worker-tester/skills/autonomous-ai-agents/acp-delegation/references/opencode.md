# OpenCode CLI — Setup and Flags

*Reference for OpenCode CLI (open-source, provider-agnostic coding agent).*

## Prerequisites

- Install: `npm i -g opencode-ai@latest` or `brew install anomalyco/tap/opencode`
- Auth: `opencode auth login` or set provider env vars (`OPENROUTER_API_KEY`, etc.)
- Verify: `opencode auth list`
- `pty=true` for interactive TUI sessions (not needed for `opencode run`)

## Binary Resolution

```bash
# Check which binary is resolved
terminal(command="which -a opencode")
terminal(command="opencode --version")

# Pin explicit path if needed
terminal(command="$HOME/.opencode/bin/opencode run '...'", pty=true)
```

## Key Flags

| Flag | Effect |
|------|--------|
| `run 'prompt'` | One-shot execution and exit |
| `-c, --continue` | Continue the last OpenCode session |
| `-s, --session <id>` | Continue a specific session |
| `--agent <name>` | Choose agent (build or plan) |
| `--model provider/model` | Force specific model |
| `--format json` | Machine-readable output |
| `-f, --file <path>` | Attach file(s) to the message |
| `--thinking` | Show model thinking blocks |
| `--variant <level>` | Reasoning effort (high, max, minimal) |
| `--title <name>` | Name the session |
| `--attach <url>` | Connect to a running opencode server |

## One-Shot Tasks

```bash
# Basic
terminal(command="opencode run 'Add retry logic to API calls'", workdir="~/project")

# With context files
terminal(command="opencode run 'Review this config' -f config.yaml -f .env.example", workdir="~/project")

# With thinking
terminal(command="opencode run 'Debug CI failure' --thinking", workdir="~/project")

# Force specific model
terminal(command="opencode run 'Refactor auth' --model openrouter/anthropic/claude-sonnet-4", workdir="~/project")
```

## Interactive Sessions (Background)

```bash
# Start TUI in background
terminal(command="opencode", workdir="~/project", background=true, pty=true)

# Send a prompt
process(action="submit", session_id="<id>", data="Implement OAuth refresh flow")

# Send follow-up
process(action="submit", session_id="<id>", data="Now add error handling")

# Exit — Ctrl+C
process(action="write", session_id="<id>", data="\x03")
```

**Important:** Do NOT use `/exit` — it opens an agent selector, not an exit command. Use Ctrl+C.

### TUI Keybindings

| Key | Action |
|-----|--------|
| `Enter` | Submit message (press twice if needed) |
| `Tab` | Switch agents (build/plan) |
| `Ctrl+P` | Open command palette |
| `Ctrl+X L` | Switch session |
| `Ctrl+X M` | Switch model |
| `Ctrl+X N` | New session |
| `Ctrl+C` | Exit OpenCode |

### Resuming Sessions

```bash
opencode -c              # Continue last session
opencode -s ses_abc123   # Specific session
```

## PR Review

```bash
# Built-in PR command
terminal(command="opencode pr 42", workdir="~/project", pty=true)

# Or in temp directory
terminal(command="REVIEW=$(mktemp -d) && git clone https://github.com/user/repo.git $REVIEW && cd $REVIEW && opencode run 'Review PR vs main'", pty=true)
```

## Session & Cost Management

```bash
opencode session list    # List past sessions
opencode stats            # Token usage and costs
opencode stats --days 7 --models anthropic/claude-sonnet-4
```

## Verification

```bash
terminal(command="opencode run 'Respond with exactly: OPENCODE_SMOKE_OK'")
# Expected: output includes OPENCODE_SMOKE_OK
```
