# Path Portability for Cross-Machine Migration

When replacing hardcoded `/Users/<user>/...` (or any absolute home path) for
cross-machine portability, the correct replacement depends on **where the path
is used** and **which Hermes subsystem reads it**. Using the wrong form silently
breaks the target environment.

## Replacement Matrix

| Location | Replace with | Expansion Mechanism | Source Code |
|----------|-------------|---------------------|-------------|
| YAML config values (`cwd:`, `environment_hint:`) | `~/...` | `os.path.expanduser()` at config load | `config.py:7287` |
| MCP `command:` field | `~/...` | `os.path.expanduser(str(command))` at MCP launch | `mcp_tool.py:631` |
| MCP `env:` values (`HERMES_WEB_UI_HOME`, `HERMES_WEBUI_STATE_DIR`) | `${HOME}/...` | `_expand_env_vars()` processes `${VAR}` only | `config.py:6664` |
| `.env` / `.env.common` files | `$HOME/...` | Shell expansion when sourcing | OS shell |
| Shell scripts (`start.sh`, `*.sh`) | `$HOME/...` | Shell expansion at runtime | OS shell |
| `generate-configs.py` output values | Literal `"~/..."` string | Hermes expands at load time on target | `generate-configs.py` |
| `.md` documentation | `~/...` | Human-readable, no machine parsing | N/A |
| `auth.json` string values | `~/...` | Human-readable metadata | N/A |

## Key Insight: `~` vs `${HOME}` in config.yaml

Hermes has **two separate path expansion mechanisms**:

1. **`os.path.expanduser()`** — handles `~` in specific fields:
   - `terminal.cwd` (config.py:7287)
   - MCP `command:` (mcp_tool.py:631)
   - NOT applied to `mcp_servers.*.env.*` values

2. **`_expand_env_vars()`** — handles `${VAR}` in ALL string values:
   - Processes `${HOME}`, `${DAMOXING_API_KEY}`, etc.
   - Does NOT process `~` — leaves it as a literal character
   - Applied recursively to the entire config tree (config.py:6664-6681)

So MCP `env:` values like `HERMES_WEB_UI_HOME: ~/.hermes-web-ui` will NOT be
expanded — the subprocess receives the literal string `~/.hermes-web-ui`.
Use `${HOME}/.hermes-web-ui` instead.

## YAML Safety

`~/path` in YAML is safe — it parses as a string, not null:

```python
>>> yaml.safe_load("cwd: ~/workspace")
{'cwd': '~/workspace'}  # type=str ✓

>>> yaml.safe_load("cwd: ~")  
{'cwd': None}  # type=NoneType ✗ (but only when ~ is the entire value)
```

As long as `~` is followed by `/`, YAML treats it as a string.

## generate-configs.py Pitfall

The config generator writes config values to `config.yaml`. If it uses:

```python
# WRONG — bakes current machine's home into output
"cwd": os.path.expanduser("~/hermes-docker-sandbox/workspace")
# Output: cwd: $HOME/hermes-docker-sandbox/workspace  ← not portable!

# CORRECT — outputs literal ~ for target machine to expand
"cwd": "~/hermes-docker-sandbox/workspace"
# Output: cwd: ~/hermes-docker-sandbox/workspace  ← portable ✓
```

The generator should output the **literal `~` string**, not expand it at
generation time. The target machine's Hermes will expand it when loading
the config.

## Post-Regeneration Fix Pass

After running `generate-configs.py` to regenerate configs from `profiles.yaml`,
MCP `env:` values revert to `~` (because `profiles.yaml` uses `~` and the
generator passes them through). A post-generation fix is needed:

```python
import re

# In each config.yaml, fix MCP env values: ~ → ${HOME}
content = re.sub(
    r'(HERMES_WEB_UI_HOME:\s*)~(/.*)',
    r'\1${HOME}\2',
    content
)
content = re.sub(
    r'(HERMES_WEBUI_STATE_DIR:\s*)~(/.*)',
    r'\1${HOME}\2',
    content
)
```

This is a known limitation: the generator doesn't distinguish between
`os.path.expanduser()` paths and `_expand_env_vars()` paths. Until the
generator is fixed to emit `${HOME}` for MCP `env:` values, this manual
post-pass is required after every regeneration.

## Verification

After all path replacements, scan for any remaining absolute home paths:

```python
import os

for root, dirs, files in os.walk(STAGING_DIR):
    dirs[:] = [d for d in dirs if d != '__pycache__']
    for f in files:
        path = os.path.join(root, f)
        try:
            with open(path, 'r', errors='ignore') as fh:
                content = fh.read()
            if '$HOME' in content:  # or whatever the source user is
                rel = os.path.relpath(path, STAGING_DIR)
                for i, line in enumerate(content.split('\n'), 1):
                    if '$HOME' in line:
                        print(f"  {rel}:{i}: {line.strip()[:100]}")
        except:
            pass
```

Must return zero matches before zipping.

## Runtime State Files to Exclude

These files contain absolute paths but are runtime state, not configuration —
exclude them from packages (they'll be regenerated on the target machine):

- `skills/.curator_state` — contains `last_report_path` with absolute path
- `gateway_state.json` — contains `argv` with absolute Python binary path
- `state-snapshots/` — old config snapshots with absolute paths
- `cron/output/` — cron run logs with absolute paths
- `spawn-trees/` — delegation tree JSON with absolute paths
- `.claude/settings.local.json` — may contain absolute read permissions
