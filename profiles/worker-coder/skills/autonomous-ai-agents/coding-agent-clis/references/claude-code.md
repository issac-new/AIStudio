# Claude Code CLI Reference

> Absorbed from `claude-code`. Full reference for Anthropic's autonomous coding agent CLI.

## Installation
```bash
npm install -g @anthropic-ai/claude-code
claude  # First run: OAuth login
claude auth status --text
```

## Print Mode (Non-Interactive)

```bash
claude -p 'Add error handling to all API calls' --allowedTools 'Read,Edit' --max-turns 10
claude -p 'Analyze auth.py for security issues' --output-format json --max-turns 5
cat src/auth.py | claude -p 'Review this code' --max-turns 1
```

JSON output fields: `session_id`, `num_turns`, `total_cost_usd`, `subtype` (success/error).

## Interactive Mode (PTY via terminal bg)

```bash
terminal(command="claude", workdir="/project", background=True, pty=True)
# Send prompt
process(action="submit", session_id="<id>", data="Implement feature X")
# Monitor
process(action="poll", session_id="<id>")
# Send follow-up
process(action="submit", session_id="<id>", data="Now add tests")
```

Dialog handling (critical for tmux):
- Trust dialog: `tmux send-keys -t <s> Enter`
- Permissions warning: `tmux send-keys -t <s> Down Enter` (default is "No, exit!")
- LSP recommendation: `tmux send-keys -t <s> '2' Enter` ("No, not now")

## Key CLI Flags

| Flag | Purpose |
|------|---------|
| `-p, --print` | One-shot mode, exits when done |
| `-c, --continue` | Resume most recent session in cwd |
| `--resume <id>` / `--fork-session` | Resume/fork specific session |
| `--model <alias>` | sonnet, opus, haiku |
| `--effort <level>` | low, medium, high, max |
| `--max-turns <n>` | Limit agentic loops (print mode only) |
| `--max-budget-usd` | Cost cap (min ~$0.05) |
| `--dangerously-skip-permissions` | Auto-approve all tool use |
| `--allowedTools` | Whitelist specific tools |
| `--output-format` | text, json, stream-json |
| `--json-schema <schema>` | Force structured JSON output |
| `--bare` | Skip hooks/plugins/MCP/OAuth, fastest |
| `--fallback-model haiku` | Auto-fallback when overloaded |
| `--from-pr <number>` | Resume session from a PR |
| `--worktree <name>` | Run in isolated git worktree |

## Session Continuation (Multi-Turn)

```python
# Turn 1
terminal(command="claude -p 'Create project structure' --max-turns 5 --output-format json", workdir="/tmp/proj", timeout=120)
# Turn 2
terminal(command="claude -p 'Implement core' --continue --dangerously-skip-permissions --max-turns 10 --output-format json", workdir="/tmp/proj", timeout=180)
# Turn 3
terminal(command="claude -p 'Add tests' --continue --max-turns 5 --output-format json", workdir="/tmp/proj", timeout=120)
```

## CLAUDE.md — Project Context

Auto-loaded from project root. Structure per-project rules via `.claude/rules/*.md`.

```markdown
# Project: My API
## Key Commands
- `make test` — run full test suite
## Code Standards
- Type hints on all public functions
- 4-space indentation for Python
```

## MCP Integration

```bash
claude mcp add -s user github -- npx @modelcontextprotocol/server-github
claude mcp add puppeteer -- npx @anthropic-ai/server-puppeteer
```

## Subagents

Define in `.claude/agents/<name>.md` (project) or `~/.claude/agents/<name>.md` (global):

```markdown
---
name: security-reviewer
description: Security-focused code review
tools: [Read, Bash]
---
You are a senior security engineer.
```

## Cost Tips

- Use `--max-turns` to prevent runaway loops (start 5-10)
- Use `--effort low` for simple tasks
- Use `--model haiku` for cheap, `--model opus` for complex
- `/compact` mid-session when context gets large
- `--no-session-persistence` in CI to avoid disk accumulation
