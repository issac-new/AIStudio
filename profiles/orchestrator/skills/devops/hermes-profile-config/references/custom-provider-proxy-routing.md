# Custom Provider: Proxy Routing Session Detail

## Context

All three Hermes profiles (orchestrator, worker-coder, worker-researcher) needed
to route through a local cc switch model proxy at `127.0.0.1:15721` so a single
`cc switch` command would change the model for every agent.

## Original State

```yaml
model:
  base_url: ''
  default: deepseek-v4-flash
  provider: deepseek
```

Each profile had its own `DEEPSEEK_API_KEY` in `.env` but they were independent.
Changing `cc switch` did not affect Hermes.

## Attempted Approach (failed)

Setting `provider: openai` with `base_url: http://127.0.0.1:15721/v1` fails with:
```
Unknown provider 'openai'. Check 'hermes model' for available providers, or run
'hermes doctor' to diagnose config issues.
```

`openai` is a recognized TTS/STT provider and an OAuth provider, but **not** a
valid model provider name. The mistake: the Hermes docs provider table lists
"OpenAI" as a provider, but that refers to the OpenAI Codex OAuth flow, not a
model provider named `openai`.

## Working Solution

Define a custom provider and reference it as `custom:<name>`:

```yaml
model:
  base_url: 'http://127.0.0.1:15721/v1'
  default: deepseek-v4-flash
  provider: 'custom:cc-switch'
providers:
  cc-switch:
    base_url: http://127.0.0.1:15721/v1
    key_env: DEEPSEEK_API_KEY
    api_mode: openai_chat
    model: deepseek-v4-flash
```

### Key fields explained

| Field | Value | Purpose |
|-------|-------|---------|
| `name` | cc-switch | Identifier used to generate `custom:cc-switch` slug |
| `base_url` | `http://127.0.0.1:15721/v1` | Proxy endpoint (must support OpenAI `/v1/chat/completions`) |
| `key_env` | `DEEPSEEK_API_KEY` | Reads API key from existing env var at runtime |
| `api_mode` | `openai_chat` | Transport format (OpenAI-compatible chat completions) |
| `model` | `deepseek-v4-flash` | Default model name the proxy should route |

### The `providers` dict format

The `providers:` section in config.yaml uses the **v12+ schema** — a dict keyed
by provider name. This gets normalized to the legacy `custom_providers:` list
format internally via `get_compatible_custom_providers()` in
`hermes_cli/config.py`.

Supported fields (from `_KNOWN_KEYS` in `config.py`):
- `name` — display name
- `base_url` / `url` / `api` — endpoint URL (must have scheme + netloc)
- `api_key` — literal API key (avoid; use `key_env` instead)
- `key_env` / `api_key_env` — env var name to read at runtime
- `api_mode` / `transport` — protocol (`openai_chat`, `anthropic`, etc.)
- `model` / `default_model` — default model name
- `models` — dict of per-model overrides (e.g. `context_length`)
- `context_length` — default context window override
- `rate_limit_delay` — delay between requests (seconds)
- `request_timeout_seconds` — per-request timeout
- `stale_timeout_seconds` — inactivity timeout
- `discover_models` — auto-discover available models
- `extra_body` — extra JSON body fields for every request

### The `custom:<name>` slug

Defined in `hermes_cli/providers.py::custom_provider_slug()`:
```python
def custom_provider_slug(display_name):
    return "custom:" + display_name.strip().lower().replace(" ", "-")
```

So `name: cc-switch` → `custom:cc-switch`.

### Self-heal fallback

If the stored provider is literally `"custom"` (from a prior bug), Hermes
automatically falls back to the first valid custom provider entry in the list.
See `resolve_custom_provider()` in `providers.py` (GH #17478).

## Environment Variables

The `.env` added `OPENAI_API_KEY=<same-as-DEEPSEEK_API_KEY>` as a fallback
in case `key_env` didn't work on an older Hermes version. The `key_env` field
is the preferred approach — it reads from the env at runtime and avoids
storing the same secret under two names.

## Proxy Verification

cc switch at `:15721` responds to:
- `GET /health` → `{"status":"healthy","timestamp":"..."}`
- `POST /v1/chat/completions` → OpenAI-compatible response
- `GET /v1/models` → `{"models":[]}` (empty — proxy doesn't advertise models)

The proxy validates model names and returns descriptive errors:
```
{
  "error": {
    "message": "The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed test.",
    "type": "invalid_request_error",
    "provider": "DeepSeek",
    "model": "test",
    "endpoint": "/chat/completions",
    "upstream_status": 400
  }
}
```

## Duplicate `providers:` pitfall

The `hermes config set model.provider` command sometimes creates a second
`providers:` section at the bottom of the file (after `model_catalog:`) when
the model section already has a `providers: {}` that was replaced by a
custom dict. This duplicates the provider definition.

**Detection**: 
```bash
grep -n "^providers:" config.yaml
# If >1 line → duplicate detected
```

**Fix**: Python script to remove the duplicate block (the one after
`model_catalog.ttl_hours`):
```python
path = '~/.hermes/profiles/orchestrator/config.yaml'
with open(path) as f:
    lines = f.readlines()
new_lines = []
skip_block = False
for i, line in enumerate(lines):
    if i >= 3 and lines[i-1].strip().startswith('ttl_hours:') and line.strip() == 'providers:':
        skip_block = True
        print(f'Found duplicate at line {i+1}')
    if skip_block:
        if line.strip() and not line.startswith(' ') and not line.startswith('\n'):
            if line.strip() != 'providers:' and not line.startswith('  '):
                skip_block = False
                new_lines.append(line)
        continue
    new_lines.append(line)
with open(path, 'w') as f:
    f.writelines(new_lines)
```

## End-to-end Verification Results

```
orchestrator:      hermes chat -q "测试"    → "测试"  ✓
worker-coder:      hermes chat -q "成功"    → "成功"  ✓
worker-researcher: hermes chat -q "完成"    → "完成"  ✓
```

All three routed through cc switch to `deepseek-v4-flash`.
