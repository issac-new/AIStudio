# OpenCode CLI Reference

> Absorbed from `opencode`. Provider-agnostic open-source coding agent.

## Installation
```bash
npm i -g opencode-ai@latest
# or: brew install anomalyco/tap/opencode
opencode auth login
opencode auth list  # Verify at least one provider
```

## One-Shot Tasks

```bash
opencode run 'Add retry logic to API calls and update tests'
opencode run 'Review this config for security issues' -f config.yaml
opencode run 'Refactor auth module' --model openrouter/anthropic/claude-sonnet-4
```

Flags: `--file/-f` (attach files), `--thinking` (show reasoning), `--model`, `--agent build|plan`, `--variant high|max`

## Interactive TUI (Background)

```bash
terminal(command="opencode", workdir="~/project", background=True, pty=True)
process(action="submit", session_id="<id>", data="Implement OAuth refresh flow")
process(action="poll", session_id="<id>")
# Exit via Ctrl+C (NOT /exit — that opens agent selector!)
process(action="write", session_id="<id>", data="\\x03")
# Or kill
process(action="kill", session_id="<id>")
```

## Session Management

```bash
opencode session list
opencode stats --days 7 --models anthropic/claude-sonnet-4
opencode -c  # Continue last session
opencode -s ses_abc123  # Resume specific session
```

## PR Review

```bash
opencode pr 42

# Or in temp clone for isolation
REVIEW=$(mktemp -d) && git clone https://github.com/user/repo.git $REVIEW
cd $REVIEW && opencode run 'Review this PR' -f $(git diff origin/main --name-only)
```

## Verdict

Smoke test:
```bash
opencode run 'Respond with exactly: OPENCODE_SMOKE_OK'
```
Expected: output includes `OPENCODE_SMOKE_OK`.

## Pitfalls

- `/exit` is NOT a valid command — opens agent selector. Use Ctrl+C or `process(action="kill")`
- `opencode run` does NOT need pty; interactive TUI DOES
- Enter may need to be pressed twice in TUI
- Avoid sharing one workdir across parallel sessions
- PATH mismatch can select wrong binary
