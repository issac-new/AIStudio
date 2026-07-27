---
name: terminal-pty-pitfalls
description: When to use pty=true vs background=true in terminal() calls. Covers login-shell pollution, conda/pyenv crashes, native binary vs REPL distinction, and OAuth URL capture patterns. Load when a background terminal command crashes with environment errors, when pty=true produces unexpected conda/python tracebacks, or when orchestrating interactive OAuth/device-flow CLI commands.
version: 1.0.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [terminal, pty, background, conda, oauth, troubleshooting]
---

# Terminal PTY Pitfalls — When NOT to use pty=true

## The Core Problem

`terminal(background=true, pty=true)` starts a **login shell** before executing the command. The login shell sources the user's profile scripts (`.zshrc`, `.bash_profile`, `.zprofile`, etc.). On machines with broken or heavy conda/pyenv setups, these initialization scripts can **crash before the actual command ever runs**.

## Decision Table

| Tool type | Needs PTY? | Correct invocation |
|-----------|-----------|-------------------|
| Native binary (Mach-O / ELF) that polls / blocking-reads stdin | **No** | `background=true` (no pty) |
| CLI that outputs a URL then blocks for OAuth callback | **No** | `background=true` (no pty) |
| Node.js REPL / Python REPL with line editing | Yes | `background=true, pty=true` |
| Interactive coding agent (Claude Code, Codex) needing signal handling | Yes | `background=true, pty=true` |
| One-shot command that exits immediately | No | foreground (default) |

## Concrete Crash: conda 24.7.1 (macOS)

When `pty=true` triggers `conda shell.posix activate base`, conda throws:

```
TypeError: expected str, bytes or os.PathLike object, not NoneType
  File "/opt/anaconda3/lib/python3.11/site-packages/conda/activate.py", line 824, in _get_deactivate_scripts
    for entry in os.scandir(join(prefix, "etc", "conda", "deactivate.d"))
```

A 150-line error report dumps to stderr. The actual command never executes. No output from the intended command is ever produced.

**Key signal**: if you see a conda traceback in terminal output when you didn't call conda, it's the login shell initialization crashing — not your command failing.

## Quick URL Capture Trick (OAuth Device Flow)

Many CLI tools (e.g. `agently-cli auth login`) output an OAuth URL to stdout, then block until the user completes browser auth. Two approaches:

### Approach 1: background without pty (preferred)

```python
terminal(command="agently-cli auth login", background=True, notify_on_complete=True)
# Poll after a few seconds — URL appears in stdout
process(action="poll", session_id="<id>")
# → "请点击以下链接登录并授权邮箱：\n\nhttps://agent.qq.com/page/oauth?..."
```

User completes auth in browser → process exits automatically → notify_on_complete fires.

### Approach 2: foreground + timeout (quick capture, process killed)

```python
terminal(command="timeout 15 agently-cli auth login", timeout=20)
# → URL captured in seconds, but process is killed
```

**Caveat**: the process is killed after 15s, so the OAuth callback may not complete. If the command needs to stay alive (waiting for the callback), run again with `background=true` (no pty).

## Workaround for Polluted Environments

If PTY is truly needed but env scripts crash:

```bash
env -i HOME=$HOME PATH="/usr/bin:/bin" SHELL=/bin/sh <cmd>
```

Or set `CONDA_NO_PLUGINS=true` to disable conda plugins. But **prefer dropping `pty=true` entirely** if the tool doesn't need line editing or signal handling.

## How to Check if a Binary Needs PTY

```bash
file /path/to/binary
# Mach-O 64-bit executable → native binary, likely does NOT need pty
# Python script / Node.js script → may need pty for interactive features
```

If the tool is a thin Node.js wrapper that calls `execFileSync` with `stdio: "inherit"` to a native binary (like `agently-cli`), it does NOT need pty.

## Reference

See `references/pty-vs-background.md` for the full crash transcript and detailed decision flowchart.
