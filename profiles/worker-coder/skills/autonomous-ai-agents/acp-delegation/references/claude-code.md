# Claude Code — Setup, Flags, and Advanced Usage

*Full reference for Claude Code CLI (Anthropic's autonomous coding agent).*

## Prerequisites

- **Install:** `npm install -g @anthropic-ai/claude-code`
- **Auth:** run `claude` once (browser OAuth) or set `ANTHROPIC_API_KEY`
- **Console auth:** `claude auth login --console` for API key billing
- **SSO auth:** `claude auth login --sso` for Enterprise
- **Check:** `claude auth status`, `claude doctor`, `claude --version`

## CLI Subcommands

| Subcommand | Purpose |
|------------|---------|
| `claude` | Start interactive REPL |
| `claude "query"` | Start REPL with initial prompt |
| `claude -p "query"` | Print mode (non-interactive) |
| `claude -c` | Continue most recent conversation in this directory |
| `claude -r "id"` | Resume specific session |
| `claude auth login/status` | Auth management |
| `claude mcp add/list/remove` | MCP server management |
| `claude doctor` | Health checks |
| `claude update/upgrade` | Update to latest |
| `claude install [target]` | Install native build |

## Print Mode Deep Dive

### Structured JSON Output
```bash
claude -p 'Analyze auth.py' --output-format json --max-turns 5
```

Returns JSON with: `session_id`, `num_turns`, `total_cost_usd`, `stop_reason`, `usage`.

### Key Flags in Print Mode

| Flag | Effect |
|------|--------|
| `--max-turns <n>` | Limit agentic loops (prevents runaway) |
| `--max-budget-usd <n>` | Cap API spend |
| `--allowedTools <tools>` | Whitelist tools: `Read, Edit, Write, Bash, WebSearch` |
| `--output-format json` | Structured JSON result |
| `--json-schema <schema>` | Force structured output matching schema |
| `--bare` | Skip hooks, plugins, MCP, CLAUDE.md (fastest startup) |
| `--model <alias>` | `sonnet`, `opus`, `haiku` |
| `--effort <level>` | `low`, `medium`, `high`, `max` |
| `--fallback-model <model>` | Auto-fallback when overloaded |

### Piped Input
```bash
cat src/auth.py | claude -p 'Review this code' --max-turns 1
git diff HEAD~3 | claude -p 'Summarize these changes' --max-turns 1
```

### Session Continuation
```bash
# Resume last session in this directory
claude -p 'Continue and add connection pooling' --continue --max-turns 5

# Resume specific session
claude -p 'Continue this' --resume <session_id> --max-turns 5
```

## Interactive Mode (Multi-Turn via tmux)

Claude Code is a full TUI app. Orchestrate it with tmux:

```bash
# Start tmux session
terminal(command="tmux new-session -d -s claude-work -x 140 -y 40")

# Launch Claude Code inside it
terminal(command="tmux send-keys -t claude-work 'cd /path/to/project && claude' Enter")

# Handle workspace trust dialog (first visit only — Enter accepts default "Yes")
terminal(command="sleep 4 && tmux send-keys -t claude-work Enter")

# Send task
terminal(command="sleep 3 && tmux send-keys -t claude-work 'Refactor the auth module to use JWT tokens' Enter")

# Monitor
terminal(command="sleep 15 && tmux capture-pane -t claude-work -p -S -50")
```

### Dialog Handling

**Workspace Trust** (first visit per directory): Default is "Yes" — just press Enter.

**Tool Permission Confirmation** (when NOT using --dangerously-skip-permissions):
Claude asks before each tool use. Send `Enter` for "Yes" per action.

**Bypass Permissions Warning** (with --dangerously-skip-permissions):
The default is "No, exit" — you MUST navigate Down then Enter:
```bash
tmux send-keys -t claude-work Down && sleep 0.3 && tmux send-keys -t claude-work Enter
```

**LSP Plugin Recommendations** (appears after creating .py/.ts/.js files):
Send `'2' Enter` for "No, not now" or `'4' Enter` to disable permanently.

### Interactive Slash Commands

| Command | Purpose |
|---------|---------|
| `/compact [focus]` | Compress context to save tokens |
| `/clear` | Wipe conversation history |
| `/context` | Visualize context usage |
| `/cost` | Token usage breakdown |
| `/review` | Request code review |
| `/plan [description]` | Enter plan mode |
| `/model [model]` | Switch models mid-session |
| `/effort [level]` | Set reasoning effort |
| `/init` | Create CLAUDE.md |
| `/memory` | Open CLAUDE.md for editing |
| `/mcp` | Manage MCP servers |
| `/exit` or `Ctrl+D` | End session |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+C` | Cancel current input or generation |
| `Ctrl+D` | Exit session |
| `Ctrl+R` | Reverse search command history |
| `Ctrl+B` | Background a running task |
| `Esc Esc` | Rewind/revert |
| `Shift+Tab` | Cycle permission modes |
| `Alt+P` | Switch model |
| `!` prefix | Execute bash directly |
| `@` prefix | Reference files with autocomplete |
| `#` prefix | Quick add to CLAUDE.md memory |

## Settings & Configuration

### Settings Hierarchy
1. **CLI flags** — override everything
2. **Local project:** `.claude/settings.local.json` (gitignored)
3. **Project:** `.claude/settings.json` (git-tracked)
4. **User:** `~/.claude/settings.json` (global)

### Permissions in Settings
```json
{
  "permissions": {
    "allow": ["Bash(npm run lint:*)", "WebSearch", "Read"],
    "ask": ["Write(*.ts)", "Bash(git push*)"],
    "deny": ["Read(.env)", "Bash(rm -rf *)"]
  }
}
```

### Memory Files
- **Global:** `~/.claude/CLAUDE.md`
- **Project:** `./CLAUDE.md` (git-tracked)
- **Local:** `.claude/CLAUDE.local.md` (gitignored)

### Hooks (Automation)
Configure in settings.json:
- `PreToolUse` — security gates, block dangerous commands (exit 2 = block)
- `PostToolUse` — auto-format code, run linters
- `Stop` — completion logging
- `SessionStart` — load dev context
- `SubagentStop` — agent orchestration

### Custom Agents
Define in `.claude/agents/*.md` (project) or `~/.claude/agents/*.md` (global):
```markdown
# .claude/agents/security-reviewer.md
---
name: security-reviewer
description: Security-focused code review
model: opus
tools: [Read, Bash]
---
Review code for injection vulnerabilities, auth flaws, secrets...
```

## MCP Integration
```bash
claude mcp add -s user github -- npx @modelcontextprotocol/server-github
claude mcp add puppeteer -- npx @anthropic-ai/server-puppeteer
```

In print/CI mode:
```bash
claude --bare -p 'Query database' --mcp-config mcp-servers.json --strict-mcp-config
```

## Environment Variables

| Variable | Effect |
|----------|--------|
| `ANTHROPIC_API_KEY` | API key (alternative to OAuth) |
| `CLAUDE_CODE_EFFORT_LEVEL` | Default effort level |
| `MAX_THINKING_TOKENS` | Cap thinking tokens |
| `MAX_MCP_OUTPUT_TOKENS` | Cap MCP output |
| `CLAUDE_CODE_NO_FLICKER=1` | Alt-screen rendering (eliminates flicker) |

## Cost Tips

1. Use `--max-turns` to prevent runaway loops (start with 5-10)
2. Use `--effort low` for simple tasks, `high`/`max` for complex reasoning
3. Use `--bare` for CI to skip hook discovery overhead
4. Use `--allowedTools` to restrict to only what's needed
5. Use `--model haiku` for cheap tasks, `opus` for complex work
6. Use `/compact` when context gets large in interactive mode

## Gotchas

1. `--max-budget-usd` minimum ~$0.05 — system prompt cache costs this much
2. `--max-turns` is print-mode only — ignored in interactive
3. Claude may use `python` instead of `python3` — self-corrects but slows first call
4. Context degradation above 70% — monitor with `/context`
5. Trust dialog only appears once per directory
6. Background tmux sessions persist — always `tmux kill-session -t <name>`
7. `--dangerously-skip-permissions` dialog defaults to "No, exit" — must navigate
8. ACP mode (via hermes) bypasses TUI — runs as text-only agent
