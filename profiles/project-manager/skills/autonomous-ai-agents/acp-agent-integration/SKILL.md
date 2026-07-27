---
name: acp-agent-integration
description: "Connect Hermes to external coding agents (Claude Code, Codex, OpenCode) through the Agent Client Protocol (ACP) using the acp-client plugin. Covers plugin setup, provider configuration, auth, and multi-agent orchestration."
version: 1.3.0
author: Hermes Agent
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [acp, agent-client-protocol, plugin, claude, codex, opencode, multi-agent]
    related_skills: [claude-code, codex, opencode, hermes-agent]
---

# ACP Agent Integration — Plugin-Based External Agent Orchestration

Connect **Hermes** to external ACP-compatible coding agents (Claude Code, Codex, OpenCode) via the `hermes-plugin-acp-client`. This gives Hermes the ability to delegate coding tasks to specialist agents while Hermes retains orchestration, context management, and multi-agent coordination.

## Prerequisites

- Hermes Agent installed and running
- ACP-compatible agent binary available on PATH or via npx
- Appropriate auth credentials for the target agent

## Available ACP Agents

| Provider | Package | Binary |
|----------|---------|--------|
| **Claude Code** | `@agentclientprotocol/claude-agent-acp` | `claude-agent-acp` |
| **Codex** | `@zed-industries/codex-acp` | npx `@zed-industries/codex-acp` |
| **OpenCode** | `opencode` | `opencode acp` |

Note: `@agentclientprotocol/claude-agent-acp` (v0.44.0+) is the renamed successor to `@zed-industries/claude-code-acp` (deprecated). Always use the new package.

## Installing the ACP Server Binary

### Claude Code ACP

```bash
npm install -g @agentclientprotocol/claude-agent-acp
```

The binary installs to npm's global bin directory. Find it with:

```bash
npm root -g    # → ~/.hermes/node/lib/node_modules
ls "$(npm root -g)/../bin/claude-agent-acp"
```

### Codex ACP

```bash
npm install -g @zed-industries/codex-acp
# or use via npx: npx @zed-industries/codex-acp
```

### OpenCode ACP

Install OpenCode normally — it ships with the `opencode acp` subcommand.

## Installing the Hermes Plugin

```bash
hermes plugins install anpicasso/hermes-plugin-acp-client
```

This installs the plugin into the active profile's plugins directory (e.g. `~/.hermes/profiles/<profile>/plugins/acp-client/`).

The plugin provides three tools:
- **`acp_agents`** — discover available agents/modes for a provider
- **`acp_send`** — send a prompt and get the response (supports multi-turn via `session_id`)
- **`acp_sessions`** — list active sessions

Enable the plugin:

```bash
hermes plugins enable acp-client
hermes gateway restart    # or start a fresh session
```

## Configuration

Create/edit `~/.hermes/profiles/<profile>/plugins/acp-client/config.yaml`:

```yaml
# Default provider when none specified
default_provider: claude

# Default workspace directory for new sessions
# ⚠️ MUST be quoted: "~" — unquoted ~ is YAML null, not a string!
default_cwd: "~"

# Auto-approve all permission requests from agents
auto_approve: true

# Provider-specific overrides
providers:
  opencode:
    binary: ~/.opencode/bin/opencode
  codex:
    npx: npx
    package: "@zed-industries/codex-acp"
  claude:
    # Direct binary path (preferred)
    binary: /path/to/claude-agent-acp
    # Extra CLI args passed to the provider binary (optional)
    # args: ["--dangerously-skip-permissions"]

    # Via npx (fallback)
    # npx: npx
    # package: "@agentclientprotocol/claude-agent-acp"
```

### Adding New Providers to the Plugin

The plugin's `_resolve_provider()` (in `__init__.py`) only ships with `opencode` and `codex`. To add a new provider (e.g. `claude`), patch the function.

**Quick way — run the included script:**

```bash
# Patch default profile
python3 patch-acp-plugin-for-claude.py

# Patch a specific profile (e.g. worker-coder)
python3 patch-acp-plugin-for-claude.py --profile worker-coder

# Dry-run to check without changing
python3 patch-acp-plugin-for-claude.py --check
```

Script location: `skill_view(name="acp-agent-integration", file_path="scripts/patch-acp-plugin-for-claude.py")`

**Manual patch** — if you prefer to edit by hand, the code to add inside `_resolve_provider()`:

```python
elif name == "claude":
    # 1) Direct binary path (preferred)
    binary = provider_cfg.get("binary", "")
    if binary:
        binary = os.path.expanduser(binary)
        if not os.path.isfile(binary):
            raise FileNotFoundError(
                f"Claude ACP binary not found at '{binary}'. "
                f"Install with: npm install -g @agentclientprotocol/claude-agent-acp"
            )
        extra_args = provider_cfg.get("args", [])
        return [binary] + extra_args, "Claude Agent"

        # 2) Via npx (fallback) — includes path fallbacks for common locations
    npx = provider_cfg.get("npx", "npx")
    npx_path = shutil.which(npx)
    if not npx_path:
        for candidate in [
            "/home/linuxbrew/.linuxbrew/bin/npx",
            "/usr/local/bin/npx",
            os.path.expanduser("~/.nvm/current/bin/npx"),
        ]:
            if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                npx_path = candidate
                break
    if npx_path:
        package = provider_cfg.get("package", "@agentclientprotocol/claude-agent-acp")
        return [npx_path, package], "Claude Agent"

    raise FileNotFoundError(
        "Claude ACP provider requires either:\n"
        "  1) binary path to claude-agent-acp, or\n"
        "  2) npx (Node.js) to run @agentclientprotocol/claude-agent-acp"
    )
```

Also update two additional places in the same file:

1. The error message in the `else` branch: `f"Unknown ACP provider: '{name}'. Available: opencode, codex, claude"`
2. The `_PROVIDER_DESC` (~L1036): change `'opencode' or 'codex'` to `'opencode', 'codex', or 'claude'`

## Auth Configuration

Set the required credentials in the Hermes profile's `.env` file (`~/.hermes/profiles/<profile>/.env`):

### Claude Code (OAuth via Proxy)

If using a transparent proxy like CC Switch:

```bash
# In .env
ANTHROPIC_AUTH_TOKEN=***
```

Claude Agent SDK respects `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` from the environment. When a proxy is used, set `ANTHROPIC_AUTH_TOKEN` to the token the proxy expects (often `PROXY_MANAGED`) and `ANTHROPIC_BASE_URL` to the proxy endpoint.

### Claude Code (Direct API Key)

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### Codex

```bash
# OpenAI API key or OAuth via hermes auth
```

## Usage

After configuration and gateway restart, the plugin tools are available in any Hermes session. Tools load on `/reset` or new session start — not retroactively.

### Basic Usage (Plugin)

```python
# List available agents/modes
agents = acp_agents(provider="claude")

# Send a coding task
result = acp_send(
    provider="claude",
    prompt="实现一个 FastAPI 用户认证模块，包含 JWT 登录和注册接口"
)
# Returns: {text: "...", session_id: "ses_xxx", tool_summary: {...}, usage: {...}}

# Multi-turn conversation
result1 = acp_send(provider="claude", prompt="创建项目结构")
session_id = result1["session_id"]
result2 = acp_send(
    provider="claude",
    prompt="添加测试代码",
    session_id=session_id
)
```

### Direct ACP Protocol (Without Plugin)

When the plugin tools aren't loaded (e.g. in an existing session), you can communicate with `claude-agent-acp` directly via its JSON-RPC 2.0 stdio protocol. **This requires a persistent subprocess** — each binary invocation starts fresh and loses state.

The correct ACP protocol methods (discovered from `@agentclientprotocol/sdk/dist/schema/index.js`) are:

#### Two-Step Session Flow

```
Step 1: session/new  →  creates a session (returns actual sessionId)
Step 2: session/prompt  →  sends a prompt to an existing session
```

#### session/new Parameters

```json
{
  "sessionId": "your-uuid",       // overridden by agent — actual ID returned in response
  "cwd": "/absolute/path",        // REQUIRED — must exist
  "mcpServers": [],               // REQUIRED — empty array is fine
  "additionalDirectories": [],    // optional
  "_meta": {
    "claudeCode": {
      "options": {
        "maxTurns": 15,
        "permissionMode": "bypassPermissions"
      }
    }
  }
}
```

#### session/prompt Parameters

```json
{
  "sessionId": "actual-sid-from-new",  // use the sessionId returned by session/new
  "prompt": [
    {"type": "text", "text": "Your prompt here"}
  ]
}
```

The `prompt` field is always an **array of content blocks** (Anthropic format), not a bare string.

#### Multi-turn Conversation via Terminal (Alternative to Plugin)

When plugin tools aren't loaded, use `claude -p --continue` via `terminal()`:

```python
# Turn 1 — creates a session
terminal(command="claude -p 'Create project structure' --max-turns 5 --output-format json",
         workdir="/project", timeout=120)

# Turn 2 — auto-resumes most recent session in this directory
terminal(command="claude -p 'Implement core feature' --continue --max-turns 10 --output-format json",
         workdir="/project", timeout=180)

# Turn 3 — continues further
terminal(command="claude -p 'Add tests' --continue --max-turns 8 --output-format json",
         workdir="/project", timeout=120)
```

`--continue` finds and resumes the most recent Claude session in the current working directory. Context is preserved across turns. This is the simplest multi-turn approach when `acp_send` isn't available.

### Cross-Provider Orchestration

The real power is combining providers in a pipeline — one agent reviews, another fixes:

```python
# Step 1: Claude Code reviews (read-only)
review = acp_send(
    provider="claude",
    prompt="Review the codebase for security issues. List all findings with severity."
)

# Step 2: Codex implements fixes based on review
fix = acp_send(
    provider="codex",
    prompt=f"Fix these issues found during review:\n{review['text']}"
)
```

### Parallel Agents

```python
# Run claude and codex in parallel (via Hermes delegate_task)
import json
delegate_task(tasks=[
    {"goal": f"Use acp_send to fix auth bugs", "toolsets": ["terminal"]},
    {"goal": f"Use acp_send to add unit tests", "toolsets": ["terminal"]},
])
```

## Pitfalls

1. **Plugin tools not visible** — `acp_agents`/`acp_send`/`acp_sessions` are plugin tools, not built-in Hermes tools. They won't appear in `hermes tools list` as individual items—only the `acp` toolset shows there. To verify: check that `hermes tools list` shows `✓ enabled  acp  🔌 Acp`. Start a fresh session (`/reset`) to load them.

2. **Plugin tools require session restart** — Tools load at session start, not retroactively. If you've already started a session and just enabled the plugin, run `/reset` or start a new session to see `acp_send`/`acp_agents`. In an existing session, use `claude -p --continue` via terminal as a fallback for multi-turn.

3. **ACP binary needs persistent connection** — `claude-agent-acp` is a stdio JSON-RPC server. Each process invocation starts fresh — all prior state is lost. You **cannot** start a new subprocess per request and expect session continuity. Use the Hermes plugin (which keeps the subprocess alive) or a persistent daemon bridge.

4. **session/new ignores your sessionId** — The ACP agent generates its own UUID internally (`createSession` doesn't use `params.sessionId`). Always use the `sessionId` from the response, not the one you passed in params.

5. **session/new is slow (15-30s)** — The native SDK binary (`@anthropic-ai/claude-agent-sdk`) loads lazily during `session/new`. First call has significant latency. Subsequent `session/prompt` calls on the same session are fast.

6. **session/prompt expects content blocks** — The `prompt` field is an **array of content blocks** (`[{"type": "text", "text": "..."}]`), not a bare string. Passing a string will fail validation with "Invalid params".

7. **Auth via proxy** — If using CC Switch or similar proxy, the `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` must be exported to the child process. The `hermes-plugin-acp-client` uses `subprocess.Popen` which inherits the parent process environment. Set the vars in `.env` so Hermes can source them at startup.

8. **cc-switch proxy detail** — The env var `ANTHROPIC_AUTH_TOKEN=PROXY_MANAGED` with `ANTHROPIC_BASE_URL=http://127.0.0.1:15721` is a special proxy setup. The token `PROXY_MANAGED` is not a real credential — it's a signal to the proxy to inject auth automatically. This only works when the proxy is running.

9. **OAuth vs API key** — Claude Code can authenticate via OAuth device flow (no API key needed). The actual token is stored in the system keychain and is not easily extractable. If using OAuth, the proxy approach is the cleanest workaround. For direct integration, use `ANTHROPIC_API_KEY`.

10. **Provider description in tool schema omits `claude`** — The `_PROVIDER_DESC` in the plugin's `__init__.py` originally only lists `'opencode' or 'codex'`, making LLMs think `"claude"` is not a valid provider value. Even if `default_provider: claude` is set in config.yaml, the agent sees the tool description and defaults to OpenCode because it's the first listed option. **Always update `_PROVIDER_DESC` to include `'claude'`** after patching `_resolve_provider()`. The fix is in `__init__.py` line ~1036:
    ```python
    _PROVIDER_DESC = (
        "ACP provider to use: 'opencode', 'codex', or 'claude'. "
        "Defaults to config default_provider."
    )
    ```
    Without this fix, the LLM receives a tool description that contradicts the SOUL.md instructions — and many models trust the tool schema over natural language instructions.

11. **default_cwd must exist** — If `default_cwd: ~/projects` is set but the directory doesn't exist, `session/new` fails with `cwd does not exist on the machine`. Set `default_cwd: ~` (which always exists) or a real project directory. This error manifests as `acp_agents` failing with "Invalid params: cwd does not exist".

12. **`acp_send` fails with `NoneType` error (`"expected str, bytes or os.PathLike object, not NoneType"`)** — Root cause: **YAML parsing of `default_cwd: ~`**. In YAML, `~` is the **null literal**, not the home-directory string. So `default_cwd: ~` is parsed as Python `None`, and `os.path.expanduser(None)` raises `TypeError`. **Fix: quote the value** — `default_cwd: "~"` in `config.yaml`. No code changes needed. Verify with:
    ```bash
    python3 -c "import yaml; print(repr(yaml.safe_load('cwd: ~')['cwd']))"
    # → None  ← the bug
    python3 -c "import yaml; print(repr(yaml.safe_load('cwd: \"~\"')['cwd']))"
    # → '~'  ← correct
    ```
    After fixing config.yaml, restart the gateway: `hermes gateway restart`.

13. **File writes denied even with `auto_approve: true`** — The Claude Code ACP `default` mode (which is the default) categorises write operations as "dangerous" and prompts for approval, which the plugin's auto-approve handler may not satisfy. The solution is to use the **`bypassPermissions`** agent/mode:
    ```python
    # First call: create session
    result = acp_send(
        provider="claude",
        agent="bypassPermissions",  # ← skips all permission prompts
        prompt="Write a sorting algorithm to /path/file.py"
    )

    # For multi-turn, the mode is set once per session
    session_id = result["session_id"]

    # Subsequent calls in the same session don't need agent= again
    result2 = acp_send(
        provider="claude",
        session_id=session_id,
        prompt="Now add tests"
    )
    ```
    Available modes from `acp_agents`: `auto`, `default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions`. The `bypassPermissions` mode is the only one that auto-approves file writes without interaction.

14. **Per-provider extra CLI args via `args:` config** — The plugin reads `provider_cfg.get("args", [])` and appends them to the provider binary command. This lets you pass arbitrary flags like `--dangerously-skip-permissions` per provider. Add `args:` to the provider config in `config.yaml`:
    ```yaml
    providers:
      claude:
        binary: /path/to/claude-agent-acp
        args: ["--dangerously-skip-permissions"]
    ```
    The `_resolve_provider()` function appends these to the command: `[binary] + extra_args`. This works for all providers (opencode, codex, claude). Restart gateway after changing args.

## Verification

Test the ACP initialize handshake to verify the integration is working:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientInfo":{"name":"verify","version":"1.0"},"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true},"terminal":true}}}' | \
timeout 10 /path/to/claude-agent-acp 2>/dev/null | \
python3 -c "import json,sys; d=json.load(sys.stdin); r=d['result']; print(f\"Agent: {r['agentInfo']['name']} v{r['agentInfo']['version']}\")"
```

Expected output: `Agent: @agentclientprotocol/claude-agent-acp v0.44.0`

## Troubleshooting

* **"Unknown ACP provider"** — The `_resolve_provider()` function needs to be patched to support the new provider. Edit `__init__.py`.
* **Binary not found** — Set `binary:` in config.yaml to the absolute path of the globally installed binary.
* **ACP subprocess dies** — Check stderr logs (the plugin logs to Hermes's logger). Common causes: missing auth, incorrect base URL.
* **Plugin not responding** — Restart gateway: `hermes gateway restart`.
* **\"Session not found\" on session/prompt** — The `session/new` call auto-generates its own sessionId; use the `sessionId` from the response, not the one you passed in `params.sessionId`.
* **acp_send not visible in session** — Plugin tools load at session start only. Run `/reset` or start a new session to load them.
* **acp_send/agents return NoneType error** — `"expected str, bytes or os.PathLike object, not NoneType"`. Root cause: `default_cwd: ~` in config.yaml — YAML parses `~` as null. Fix: change to `default_cwd: "~"` (with quotes). See pitfall #12 above.

## Cross-Profile ACP Configuration

When you set up ACP for a worker profile (e.g. `worker-coder`), the **orchestrator profile also needs updating** — otherwise the orchestrator cannot delegate tasks via `acp_send`.

### Configuration Checklist Per Profile

| Item | Location | Notes |
|------|----------|-------|
| `acp` in toolsets | `config.yaml` → `toolsets` | Without this, tools like `acp_send` are invisible to the agent |
| `default_provider: claude` | `plugins/acp-client/config.yaml` | Sets default ACP provider to Claude |
| `_PROVIDER_DESC` includes `'claude'` | `plugins/acp-client/__init__.py` ~L1036 | Must list `'claude'` or LLM won't treat it as valid |
| Claude ACP binary path | `plugins/acp-client/config.yaml` → `providers.claude.binary` | Point to `claude-agent-acp` binary |
| `default_cwd` must exist | `plugins/acp-client/config.yaml` | Use `"~"` (quoted) rather than a non-existent dir — unquoted `~` is YAML null |

### Modifying toolsets with `hermes config set`

`config.yaml` is security-sensitive and the `patch` tool refuses to edit it directly. Use the CLI:

```bash
# Add acp toolset to orchestrator
hermes config set toolsets "hermes-cli,acp,kanban,memory,messaging,terminal" --profile orchestrator

# Add acp toolset to worker-coder
hermes config set toolsets "hermes-cli,acp,kanban" --profile worker-coder
```

### Cross-Profile File Editing

When you need to edit another profile's plugin files (e.g. editing `worker-coder`'s `__init__.py` while running under `orchestrator`), the `patch` tool enforces a cross-profile write guard:

```python
patch(
    path="~/.hermes/profiles/worker-coder/plugins/acp-client/__init__.py",
    old_string="...",
    new_string="...",
    cross_profile=True   # bypass the guard — requires explicit user direction
)
```

Only use `cross_profile=True` after the user explicitly directs you to edit another profile.

### Quick Sync Across Profiles

```bash
# List all profiles
ls ~/.hermes/profiles/

# Check ACP status across profiles
for p in ~/.hermes/profiles/*/; do
  name=$(basename $p)
  echo "=== $name ==="
  grep 'toolsets' "$p/config.yaml" 2>/dev/null
  [ -f "$p/plugins/acp-client/config.yaml" ] && echo "  ACP plugin: YES" || echo "  ACP plugin: NO"
  echo ""
done
```

### Cross-Profile Code Sync

The orchestrator profile often accumulates manual patches to the ACP plugin (`_resolve_provider()` improvements, npx path fallbacks, better error messages). These patches must be **explicitly synced** to worker profiles — they don't propagate automatically.

Symptoms of unsynced code:
- Worker profiles have fewer lines in `plugins/acp-client/__init__.py` (e.g. 1172 vs 1183)
- Workers fail on npx resolution or show bare error messages
- Workers call OpenCode instead of Claude Code (outdated `_PROVIDER_DESC`)

**Check for drift:**

```bash
diff \
  ~/.hermes/profiles/orchestrator/plugins/acp-client/__init__.py \
  ~/.hermes/profiles/worker-coder/plugins/acp-client/__init__.py

diff \
  ~/.hermes/profiles/orchestrator/plugins/acp-client/__init__.py \
  ~/.hermes/profiles/worker-researcher/plugins/acp-client/__init__.py
```

**Fix drift** — run the patching script on all profiles:

```bash
# Patch ALL profiles with ACP plugin
python3 patch-acp-plugin-for-claude.py --all

# Or patch specific profiles
python3 patch-acp-plugin-for-claude.py --profile worker-coder
python3 patch-acp-plugin-for-claude.py --profile worker-researcher
```

### Restart Gateways After Config Changes

After modifying ACP plugin code or configuration, restart each profile's gateway individually:

```bash
hermes gateway restart --profile orchestrator
hermes gateway restart --profile worker-coder
hermes gateway restart --profile worker-researcher
```

Verify all are running with the new PIDs:

```bash
for p in orchestrator worker-coder worker-researcher; do
  pid=$(ps aux | grep "profile $p gateway run" | grep -v grep | awk '{print $2}')
  echo "$p — PID $pid $(ps -p $pid -o etime= 2>/dev/null | xargs)"
done
```

### Installing ACP on a Profile From Scratch

When a profile (e.g. `worker-researcher`) has no ACP plugin at all, you need to create it from scratch:

```bash
# 1. Create the plugin directory and copy from a working profile
mkdir -p ~/.hermes/profiles/<new-profile>/plugins
cp -a ~/.hermes/profiles/<source-profile>/plugins/acp-client \
      ~/.hermes/profiles/<new-profile>/plugins/acp-client

# 2. Add acp and kanban toolsets to config
hermes config set toolsets '["hermes-cli","acp","kanban"]' --profile <new-profile>

# 3. Write a SOUL.md that instructs the agent to use acp_send(provider="claude")
#    See worker-coder/SOUL.md or worker-researcher/SOUL.md for examples
```

The `cp -a` preserves the entire plugin directory including the already-patched `_PROVIDER_DESC` and `default_provider: claude`.

### Worker Profile `.env` Requirements

Worker profiles (e.g. `worker-coder`, `worker-researcher`) have their own `.env` that does **not** inherit from the orchestrator. Three env vars are commonly needed:

```bash
# ~/.hermes/profiles/<worker-profile>/.env

# DeepSeek API key (for the worker's own LLM — deepseek-v4-flash)
DEEPSEEK_API_KEY=sk-...

# Claude Code ACP auth (if using CC Switch proxy)
ANTHROPIC_AUTH_TOKEN=***
ANTHROPIC_BASE_URL=http://127.0.0.1:15721
```

Without these, the worker can neither run its own LLM queries (`DEEPSEEK_API_KEY` missing) nor authenticate the ACP Claude binary (`ANTHROPIC_AUTH_TOKEN` missing). **Always copy these from the orchestrator's `.env` when creating a new worker profile.**

Quick copy recipe:
```bash
# Copy specific vars from orchestrator to worker
for var in DEEPSEEK_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL; do
  grep "^$var=" ~/.hermes/profiles/orchestrator/.env >> ~/.hermes/profiles/worker-coder/.env
done
```

## Protocol Reference

See `skill_view(name="acp-agent-integration", file_path="references/acp-protocol-methods.md")` for the complete ACP method schema: all agent methods, client methods, session/new/session/prompt request formats, and architecture notes.

## Provider Routing Debug Guide

See `skill_view(name="acp-agent-integration", file_path="references/acp-provider-debug.md")` for a systematic guide to diagnosing why an ACP call routes to the wrong provider — covers tool schema description, config, binary, and resolve function checks.

## ACP Fallback: delegate_task When ACP Tools Fail

See `skill_view(name="acp-agent-integration", file_path="references/acp-fallback-delegate-task.md")` — a complete playbook for when `acp_send`/`acp_agents` crash with the NoneType plugin bug, including the delegate_task workaround with terminal+file toolsets, caveats, and when to use it vs. fixing the plugin directly.
