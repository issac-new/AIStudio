# Codex CLI Reference

> Absorbed from `codex`. OpenAI's autonomous coding agent.

## Installation
```bash
npm install -g @openai/codex
# Auth: OAuth or OPENAI_API_KEY
```

## One-Shot Tasks

```bash
codex exec 'Add dark mode toggle to settings'
# Must be inside a git repo! Use mktemp -d && git init for scratch
cd $(mktemp -d) && git init && codex exec 'Build a snake game'
```

## Background Mode

```bash
terminal(command="codex exec --full-auto 'Refactor auth module'", workdir="~/project", background=True, pty=True)
process(action="poll", session_id="<id>")
# Send input if Codex asks a question
process(action="submit", session_id="<id>", data="yes")
process(action="kill", session_id="<id>")
```

## Key Flags

| Flag | Effect |
|------|--------|
| `exec "prompt"` | One-shot execution, exits when done |
| `--full-auto` | Sandboxed, auto-approves file changes |
| `--yolo` | No sandbox, no approvals (fastest, dangerous) |
| `--sandbox danger-full-access` | Skip sandbox; use when host breaks bubblewrap |

## PR Reviews

```bash
REVIEW=$(mktemp -d) && git clone https://github.com/user/repo.git $REVIEW
cd $REVIEW && gh pr checkout 42 && codex review --base origin/main
```

## Parallel Issue Fixing with Worktrees

```bash
git worktree add -b fix/issue-78 /tmp/issue-78 main
git worktree add -b fix/issue-99 /tmp/issue-99 main

terminal(command="codex --yolo exec 'Fix issue #78. Commit when done.'", workdir="/tmp/issue-78", background=True, pty=True)
terminal(command="codex --yolo exec 'Fix issue #99. Commit when done.'", workdir="/tmp/issue-99", background=True, pty=True)
```

## Batch PR Reviews

```bash
git fetch origin '+refs/pull/*/head:refs/remotes/origin/pr/*'
terminal(command="codex exec 'Review PR #86'", workdir="~/project", background=True, pty=True)
terminal(command="codex exec 'Review PR #87'", workdir="~/project", background=True, pty=True)
gh pr comment 86 --body '<review>'
```

## Rules

1. **Always `pty=true`** — Codex is interactive, hangs without PTY
2. **Git repo required** — Codex refuses to run outside one
3. Use `exec` for one-shots, `--full-auto` for building
4. Use `--sandbox danger-full-access` in Hermes gateway/service contexts (bubblewrap fails)
5. Monitor background tasks with `poll`/`log`
