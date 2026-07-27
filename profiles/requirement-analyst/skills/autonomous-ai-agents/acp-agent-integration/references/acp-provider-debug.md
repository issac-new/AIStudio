# ACP Provider Routing — Debugging Guide

## Symptom: Agent calls wrong ACP provider

**Observed behavior**: Worker-coder is configured with `default_provider: claude` and SOUL.md says `provider="claude"`, but ACP calls actually route to OpenCode instead.

### Diagnostic Steps

**Step 1 — Check the tool schema description the agent sees**

The `acp_send` tool's `provider` parameter description lives in `plugins/acp-client/__init__.py`:

```python
_PROVIDER_DESC = (
    "ACP provider to use: 'opencode' or 'codex'. "
    "Defaults to config default_provider."
)
```

If this only lists `opencode` and `codex`, the LLM will think "claude" is not a valid value. Even though the config sets `default_provider: claude`, and the SOUL.md says `provider="claude"`, many models trust the tool schema description as authoritative.

**Fix**: Update `_PROVIDER_DESC` to include `claude`:

```python
_PROVIDER_DESC = (
    "ACP provider to use: 'opencode', 'codex', or 'claude'. "
    "Defaults to config default_provider."
)
```

**Step 2 — Verify the config.yaml**

Check `plugins/acp-client/config.yaml`:

```yaml
default_provider: claude       # ← this is used when no provider= param is passed
```

If the agent explicitly passes `provider="claude"` (as SOUL.md instructs), this is fine. But if the agent passes nothing (because the tool description made it think "claude" is invalid), it falls through to `default_provider`.

**Step 3 — Verify `_resolve_provider()` has a `claude` branch**

Check `__init__.py` for the `_resolve_provider()` function. The `claude` branch must be present:

```python
elif name == "claude":
    binary = provider_cfg.get("binary", "")
    if binary:
        binary = os.path.expanduser(binary)
        if not os.path.isfile(binary):
            raise FileNotFoundError(...)
        return [binary], "Claude Agent"
    # fallback: npx
    ...
    raise FileNotFoundError("Claude ACP provider requires binary path or npx")
```

**Step 4 — Verify the binary exists**

```bash
file ~/.hermes/node/bin/claude-agent-acp
# Expected: symbolic link to ../lib/node_modules/@agentclientprotocol/...
```

**Step 5 — Verify the error message lists claude**

The `else` branch catch-all should include `claude`:

```python
raise ValueError(
    f"Unknown ACP provider: '{name}'. Available: opencode, codex, claude"
)
```

### Root Cause Summary

| Layer | What can go wrong | How to detect |
|-------|-------------------|---------------|
| Tool schema description | `_PROVIDER_DESC` omits `claude` → LLM defaults to `opencode` | Check `__init__.py` line ~1036 |
| Plugin config | `default_provider` wrong or `binary` path invalid | Check `config.yaml` |
| Resolve function | No `claude` branch in `_resolve_provider()` | Check `__init__.py` function |
| Binary on disk | `claude-agent-acp` missing | `which claude-agent-acp` or `file ...` |
| .env vars | `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` missing | Check profile's `.env` |

### Prevention

When adding a new ACP provider, always update **three** locations in the plugin:

1. `_resolve_provider()` — add the new `elif name == "..."` branch
2. `_PROVIDER_DESC` — add the new provider name to the list
3. `else` branch error message — add the new provider to the "Available" list

Missing any one of these (especially #2) causes the LLM to misbehave even though the routing logic is correct.
