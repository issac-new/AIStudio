# OpenAI Codex CLI — Setup and Flags

*Reference for Codex CLI (OpenAI's autonomous coding agent).*

## Prerequisites

- Install: `npm install -g @openai/codex`
- Auth: `OPENAI_API_KEY` env var or Codex OAuth credentials
- **Must run inside a git repository** — Codex refuses to run outside one
- Use `pty=true` — Codex is an interactive terminal app

## Key Flags

| Flag | Effect |
|------|--------|
| `exec "prompt"` | One-shot execution, exits when done |
| `--full-auto` | Sandboxed, auto-approves file changes in workspace |
| `--yolo` | No sandbox, no approvals (fastest, most dangerous) |
| `--sandbox danger-full-access` | Disables sandbox; use when bubblewrap fails |

## One-Shot Tasks

```bash
terminal(command="codex exec 'Add dark mode toggle to settings'", workdir="~/project", pty=true)
```

For scratch work (Codex needs a git repo):
```bash
terminal(command="cd $(mktemp -d) && git init && codex exec 'Build a snake game in Python'", pty=true)
```

## Background Mode (Long Tasks)

```bash
# Start
terminal(command="codex exec --full-auto 'Refactor the auth module'", workdir="~/project", background=true, pty=true)

# Monitor
process(action="poll", session_id="<id>")
process(action="log", session_id="<id>")

# Send input if Codex asks a question
process(action="submit", session_id="<id>", data="yes")

# Kill if needed
process(action="kill", session_id="<id>")
```

## Gateway/Container Caveat

When running in Hermes gateway or container context, Codex workspace-write
sandboxing may fail (bubblewrap/user-namespace errors like `setting up uid
map: Permission denied`). In that context, prefer:

```bash
codex exec --sandbox danger-full-access "<task>"
```

Use process boundaries as the safety layer: explicit workdir, clean git status
before launch, narrow prompts, `git diff` review, and targeted tests.

## Parallel Issue Fixing with Worktrees

```bash
# Create worktrees
git worktree add -b fix/issue-78 /tmp/issue-78 main
git worktree add -b fix/issue-99 /tmp/issue-99 main

# Launch Codex in each
terminal(command="codex --yolo exec 'Fix issue #78'", workdir="/tmp/issue-78", background=true, pty=true)
terminal(command="codex --yolo exec 'Fix issue #99'", workdir="/tmp/issue-99", background=true, pty=true)

# Monitor
process(action="list")

# After completion, push and create PRs
terminal(command="cd /tmp/issue-78 && git push -u origin fix/issue-78")
```

## Gotchas

1. Always `pty=true` — Codex hangs without a PTY
2. Git repo required — `mktemp -d && git init` for scratch work
3. Use `exec` for one-shots — `codex exec "prompt"` runs and exits cleanly
4. `--full-auto` for building — auto-approves changes within sandbox
5. Background for long tasks — monitor with `poll`/`log`
6. Don't interfere — be patient with long-running tasks
7. Parallel is fine — run multiple Codex processes at once
