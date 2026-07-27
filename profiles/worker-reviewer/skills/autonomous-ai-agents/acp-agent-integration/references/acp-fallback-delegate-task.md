# ACP Fallback: delegate_task When ACP Tools Fail

## Symptom

`acp_agents()` / `acp_send()` fail with:

```
{"error": "expected str, bytes or os.PathLike object, not NoneType"}
```

The ACP plugin tools raise a `NoneType` error immediately — no session created, no binary invoked.

## Root Cause

**YAML null parsing of `default_cwd: ~`.** In YAML, `~` is the null literal. When `config.yaml` has:

```yaml
default_cwd: ~
```

PyYAML parses this as `None` (Python null), not the string `"~"`. Then `os.path.expanduser(None)` in the ACPClient constructor raises:

```
TypeError: expected str, bytes or os.PathLike object, not NoneType
```

This error fires in the plugin's `__init__.py` at `ACPClient.__init__()` (line ~163) before any ACP binary is even spawned. **It is a config file format issue, not a plugin code bug.**

### Verify

```bash
# Show the bug
python3 -c "import yaml; print(repr(yaml.safe_load('cwd: ~')['cwd']))"
# → None

# Show the fix
python3 -c "import yaml; print(repr(yaml.safe_load('cwd: \"~\"')['cwd']))"
# → '~'
```

### Fix

Change `config.yaml`:

```diff
- default_cwd: ~
+ default_cwd: "~"
```

Then restart the gateway: `hermes gateway restart`.

If you also run into file-write permission denials (even with `auto_approve: true`), use the `bypassPermissions` agent mode:

```python
acp_send(provider="claude", agent="bypassPermissions", prompt="...")
```

See pitfall #13 in the main `acp-agent-integration` SKILL.md for details.

## Workaround: delegate_task Fallback

When `acp_send` fails with this NoneType error, use `delegate_task` as a reliable alternative:

```python
delegate_task(
    goal="Write a Python sorting algorithm to /path/to/output.py",
    context="""Full task context, requirements, and constraints here.""",
    toolsets=["terminal", "file"]
)
```

### When to use this fallback

| Condition | Action |
|-----------|--------|
| `acp_send` returns NoneType error | Use delegate_task with terminal+file |
| Binary not found / wrong path | Fix `providers.claude.binary` in config.yaml |
| Auth failure (401) | Fix `.env` credentials |
| `acp_send` works but is slow | Keep using acp_send; set `timeout` higher |
| User requests a specific agent | Try acp_agents first; fallback to delegate_task if it errors |

### Why this works

`delegate_task` spawns a fresh Hermes subagent with isolated context and its own terminal session. The subagent can read/write files and run shell commands directly — no ACP binary needed. This trades off (losing Claude Code's specific intelligence) for reliability (the task always executes).

### Caveats

- **No Claude Code reasoning** — The subagent runs on the worker's own LLM (e.g. `deepseek-v4-flash`), not Claude Code. For simple coding tasks this is fine; for complex ones, the output quality may differ.
- **No multi-turn session** — Each delegate_task is a single-shot call. For iterative work, you need a single delegate_task that handles the full scope internally (the subagent can do multiple terminal+file calls within its own turn).
- **No ACP review workflow** — You lose the ability to chain reviewers. If review is needed, include it in the delegate_task prompt: `"Write the code, then run tests and report results."`

## Example: Full Replacement Pattern

Instead of:

```python
# ❌ Fails with NoneType
acp_agents(provider="claude")
acp_send(provider="claude", prompt="Write a quicksort in Python")
```

Use:

```python
# ✅ Always works
delegate_task(
    goal="Write a Python quicksort into ~/ai_completion/sorting.py",
    context="""
    Write a well-documented sorting algorithm with:
    - Type hints and docstrings
    - Test/demo section in if __name__ == "__main__"
    - Time complexity analysis in comments
    - Handle edge cases (empty list, single element, duplicates, etc.)
    Save to: ~/ai_completion/sorting.py
    """,
    toolsets=["terminal", "file"]
)
```

## Future Fix

The real fix is **always** to quote `~` in `config.yaml` — no code changes needed:

```diff
- default_cwd: ~
+ default_cwd: "~"
```

Then `hermes gateway restart`. The fix takes effect without touching `__init__.py` at all.

### Preventive check

When diagnosing ACP issues, always check the config first:

```bash
python3 -c "
import yaml
cfg = yaml.safe_load(open('~/.hermes/profiles/orchestrator/plugins/acp-client/config.yaml'))
print(f'default_cwd = {repr(cfg.get(\"default_cwd\"))}')
if cfg.get('default_cwd') is None:
    print('⚠️ BUG: default_cwd is None — unquoted ~ in YAML!')
elif cfg.get('default_cwd') == '~':
    print('✓ default_cwd is string ~ — expanduser will work')
"
```
