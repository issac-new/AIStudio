# Kanban Worker + ACP Claude Code Integration

## Pattern Overview

When a Kanban worker profile (e.g. `worker-coder`) receives a coding task from the dispatcher, it should delegate implementation to Claude Code via ACP (`acp_send`) rather than writing code directly. Hermes retains task lifecycle ownership; Claude is an implementation lane.

## Required Setup

### 1. Install ACP Plugin in Worker Profile

```bash
hermes plugins install anpicasso/hermes-plugin-acp-client --profile worker-coder
hermes plugins enable acp-client --profile worker-coder
```

### 2. Configure ACP Binary

Create `plugins/acp-client/config.yaml` in the worker profile:

```yaml
default_provider: claude
auto_approve: true
providers:
  claude:
    binary: /abs/path/to/claude-agent-acp
```

### 3. Patch `_resolve_provider()` for Claude

Edit `plugins/acp-client/__init__.py`. Add a `claude` case in `_resolve_provider()`:

```python
elif name == "claude":
    binary = provider_cfg.get("binary", "")
    if binary:
        binary = os.path.expanduser(binary)
        if not os.path.isfile(binary):
            raise FileNotFoundError(...)
        return [binary], "Claude Agent"
    # fallback: npx
    npx = provider_cfg.get("npx", "npx")
    npx_path = shutil.which(npx)
    if npx_path:
        package = provider_cfg.get("package", "@agentclientprotocol/claude-agent-acp")
        return [npx_path, package], "Claude Agent"
    raise FileNotFoundError("Claude ACP provider requires binary path or npx")
```

Also update the error message in the `else` branch to include `claude`:
```python
f"Unknown ACP provider: '{name}'. Available: opencode, codex, claude"
```

### 4. Add `acp` to Worker's Toolsets

In the worker's `config.yaml`:

```yaml
toolsets:
- hermes-cli
- acp
- kanban    # needed for kanban_* tools
```

### 5. Write SOUL.md with ACP Calling Rules

The worker's `SOUL.md` must instruct it to use `acp_send` for coding tasks. Key rules:

```markdown
# Worker-Coder Rules: ACP + Claude Code

當收到 kanban 編碼任務時：
1. 使用 `acp_send(provider="claude", prompt=...)` 委託給 Claude Code
2. 用 session_id 續接多輪對話：`acp_send(session_id=..., prompt=...)`
3. 驗證 Claude 的輸出（文件是否存在、語法檢查）
4. 不要自己寫代碼 — 永遠通過 ACP 委託給 Claude
5. 不要使用 `claude -p` 命令 — 使用 ACP 協議方式
```

## Session Lifecycle

```
kanban001 dispatches task to worker-coder
       ↓
kanban_show() → analyze requirements
       ↓
acp_send(provider="claude", prompt="任務描述...")  ← Turn 1
       ↓ (if follow-up needed)
acp_send(session_id=..., prompt="繼續...")        ← Turn N
       ↓
Verify output (file check, syntax test)
       ↓
kanban_complete(summary="...", metadata={...})
```

## Pitfalls

1. **Plugin tools not available mid-session** — `acp_send` loads at session start only. Workers spawned by the dispatcher automatically get a fresh session, so this is fine. For manual testing, use `/reset`.

2. **Claude may ask questions** — Be prepared for multi-turn. Claude's response may contain clarifications. Reply via `acp_send(session_id=..., prompt="答案")`.

3. **Add `--dangerously-skip-permissions` equivalent** — The ACP plugin's `auto_approve: true` config handles permission bypass. If using raw `claude -p`, add `--dangerously-skip-permissions`.

4. **Always specify file paths in prompt** — Claude needs absolute or workspace-relative paths. Include the kanban workspace (`$HERMES_KANBAN_WORKSPACE`) in the prompt.

5. **Tool schema description must include `claude`** — The `_PROVIDER_DESC` in `plugins/acp-client/__init__.py` (line ~1036) originally only lists `'opencode' or 'codex'`. If you patch `_resolve_provider()` to add `claude` but forget to update `_PROVIDER_DESC`, the LLM will see a tool description that only lists `opencode` and `codex` as valid provider values. Most models will then default to `opencode` even though SOUL.md says `provider="claude"`. **Always update `_PROVIDER_DESC` to include `'claude'`** when patching the plugin for claude support.
