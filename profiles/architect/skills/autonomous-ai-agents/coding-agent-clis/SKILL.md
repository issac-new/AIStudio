---
name: coding-agent-clis
description: Orchestrate external coding agents (Claude Code, Codex, OpenCode) via the Hermes terminal. Covers print-mode and interactive usage, PTY/tmux orchestration, multi-turn conversation, and parallel task execution.
version: 1.0.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [coding-agent, claude-code, codex, opencode, automation, pty]
    related_skills: [acp-agent-integration]
---

# Coding Agent CLIs — Terminal Orchestration

Orchestrate three external coding agent CLIs via Hermes `terminal()` and `process()` tools. Each agent can run in print mode (one-shot, clean) or interactive mode (multi-turn, PTY needed).

## Shared Patterns

### Print Mode (preferred for single tasks)
```python
terminal(command="<agent> -p 'prompt' --max-turns 10", workdir="/project", timeout=120)
```

### Interactive Mode (multi-turn via PTY)
```python
terminal(command="<agent>", workdir="/project", background=True, pty=True)
process(action="submit", session_id="<id>", data="Implement feature X")
process(action="poll", session_id="<id>")
```

### Multi-Turn Continue Pattern
```python
terminal(command="claude -p 'Start task' --max-turns 5 --output-format json", workdir="/project", timeout=120)
terminal(command="claude -p 'Continue' --continue --max-turns 10", workdir="/project", timeout=180)
```

### Parallel Tasks
```python
terminal(command="<agent1> run 'Task A'", workdir="/tmp/task1", background=True, pty=True)
terminal(command="<agent2> run 'Task B'", workdir="/tmp/task2", background=True, pty=True)
```

## Reference Files

| Reference | Origin | Content |
|-----------|--------|---------|
| `references/claude-code.md` | `claude-code` | Full Claude Code CLI reference, print/interactive/tmux modes, PR review, CLAUDE.md, MCP, hooks |
| `references/codex.md` | `codex` | Codex CLI, one-shot and background tasks, PR reviews, worktrees, sandbox modes |
| `references/opencode.md` | `opencode` | OpenCode CLI, run/interactive/tui, auth, session management |

## Quick Comparison

| Feature | Claude Code | Codex | OpenCode |
|---------|-------------|-------|----------|
| Print mode | `-p "prompt"` | `exec "prompt"` | `run "prompt"` |
| Multi-turn | `--continue` | n/a (single shot) | `--continue` / `-c` |
| PTY needed? | No (-p mode) | Yes (always) | No (run mode) |
| Git required? | No | **Yes** | No |
| Permission bypass | `--dangerously-skip-permissions` | `--yolo` (dangerous) | n/a |
| Structured output | `--output-format json` | n/a | n/a |
| PR workflow | `--from-pr N` / `claude -p` | `codex review` | `opencode pr N` |
| Auth | OAuth or `ANTHROPIC_API_KEY` | OAuth or `OPENAI_API_KEY` | `opencode auth login` |
| Install | `npm i -g @anthropic-ai/claude-code` | `npm i -g @openai/codex` | `npm i -g opencode-ai` |
