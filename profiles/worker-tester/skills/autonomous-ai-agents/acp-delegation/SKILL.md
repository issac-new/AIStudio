---
name: acp-delegation
description: "Delegate coding tasks to external ACP coding agents (Claude Code, OpenAI Codex, OpenCode). Common orchestration patterns, tool selection guide, and per-CLI setup."
tags: [acp, delegation, coding-agent, claude-code, codex, opencode, autonomous, terminal, pty]
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [acp, delegation, coding-agent, claude-code, codex, opencode, autonomous]
    related_skills: [hermes-agent, plan, test-driven-development, requesting-code-review]
---

# ACP Delegation — Common Orchestration Guide

Delegate coding tasks to external autonomous coding agent CLIs. This umbrella covers the
shared workflow across all supported ACP tools, with per-CLI references for setup, flags,
and edge cases.

## Which Tool to Pick

| Tool | Best for | Flags | Cost model |
|------|----------|-------|------------|
| **Claude Code** | Complex multi-step reasoning, PR review, refactoring. Full TUI + print mode. | `-p`, `--max-turns`, `--model` | Anthropic API (per-token) |
| **OpenAI Codex** | One-shot tasks, batch issue fixing, fast prototyping. Sandboxed by default. | `exec`, `--full-auto`, `--yolo` | OpenAI API (per-token) |
| **OpenCode** | Provider-agnostic (OpenRouter/Anthropic/OpenAI), open-source, TUI+CLI. | `run`, `--model`, `--thinking` | Bring-your-own-key |

**When none is installed:** If the user hasn't installed any ACP CLI, the task still belongs
to YOU (the Hermes agent). Use `plan`, `write_file`, `terminal`, and `patch` directly.

## Shared Workflow

All three CLIs follow the same orchestration pattern:

### 1. Setup Check

```bash
# Claude Code
claude --version && claude auth status 2>/dev/null

# Codex
codex --version

# OpenCode
opencode --version && opencode auth list
```

### 2. One-Shot Task (Preferred)

```bash
# Claude Code (print mode — no PTY needed)
terminal(command="claude -p 'Add error handling to API calls' --allowedTools Read,Edit --max-turns 10", workdir="~/project", timeout=120)

# Codex
terminal(command="codex exec 'Add dark mode toggle to settings'", workdir="~/project", pty=true)

# OpenCode
terminal(command="opencode run 'Add retry logic to API calls'", workdir="~/project")
```

### 3. Interactive Session (Multi-Turn)

For iterative work requiring multiple exchanges, use background mode with PTY:

```python
# Start in background
result = terminal(command="<cli> ...", workdir="~/project", background=True, pty=True)
session_id = result["session_id"]

# Monitor progress
process(action="poll", session_id=session_id)
process(action="log", session_id=session_id)

# Send follow-up input
process(action="submit", session_id=session_id, data="Now add tests for this")

# Clean up
process(action="kill", session_id=session_id)
```

### 4. Parallel Work with Worktrees

```bash
# Isolate each task in a git worktree
git worktree add -b fix/issue-78 /tmp/issue-78 main

# Launch ACP CLI in each
terminal(command="<cli> 'Fix issue #78: ...'", workdir="/tmp/issue-78", background=True, pty=True)

# After completion, push and create PR
terminal(command="git push -u origin fix/issue-78", workdir="/tmp/issue-78")

# Cleanup
git worktree remove /tmp/issue-78
```

### 5. PR Review Pattern

```bash
# Quick review (diff piped to CLI)
terminal(command="git diff main...feature-branch | claude -p 'Review this diff for bugs' --max-turns 1", timeout=60)

# Clone to temp directory for safe review
terminal(command="REVIEW=$(mktemp -d) && git clone https://github.com/user/repo.git $REVIEW && cd $REVIEW && gh pr checkout 42 && opencode run 'Review this PR vs main'", pty=true)

# With built-in PR command
terminal(command="opencode pr 42", workdir="~/project", pty=true)
```

### 6. Kanban Lane Pattern

When using Codex (or any ACP CLI) inside a Kanban worker task, follow the
dual-lane convention documented in `references/kanban-codex-lane.md`.

## Common Rules

1. **Prefer one-shot mode** for single tasks — cleaner, no dialog handling, structured output.
2. **Always verify claimed results** — use `read_file` to check files the CLI claims to have written.
3. **Use background+PTY for multi-turn** interactive work.
4. **Set workdir** — keep the ACP CLI focused on the right project directory.
5. **Set turn/max limits** to prevent runaway costs.
6. **Monitor with poll/log** — look for the prompt indicator that shows the CLI is waiting for input.
7. **Don't trust self-reports** — inspect diffs and run tests yourself before accepting results.
8. **Clean up** background processes and temporary worktrees when done.
9. **Isolate tasks** in separate workdirs/worktrees to avoid conflicts.
10. **Forward decision questions to the user** — never self-decide on configuration choices the ACP CLI asks about.

## Pitfalls

- ACP CLIs hang without PTY in interactive mode — always use `pty=True`.
- Git repos required — most refuse to run outside one. Use `mktemp -d && git init` for scratch.
- PATH mismatches can select wrong binary version — always verify with `which -a <tool>`.
- Background sessions persist — kill them or clean up with `process(action="kill")`.
- Large diffs blow token budgets — scope down before delegating.
