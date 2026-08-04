---
name: provider-fallback-chain-management
title: Provider & Fallback Chain Management in Multi-Profile Hermes
description: Rewrite provider and fallback chain across profiles.
triggers:
  - "配置所有 provider"
  - "rewrite all providers"
  - "fallback chain"
  - "多 provider fallback"
  - "高峰禁用 provider"
  - "provider enable disable schedule"
  - "add multiple api keys"
  - "clean credential pool"
  - "anthropic format providers"
  - "reasoning_effort ultra"
  - "profile env not inheriting"
---

# Provider & Fallback Chain Management in Multi-Profile Hermes

## When to Use

- User provides a table of N providers (name, base_url, api_key, model) and
  wants all profiles configured to use them with a fallback chain.
- User wants a specific provider auto-disabled during a time window
  ("高峰禁用") while others remain available.
- Provider architecture needs a full rewrite (replacing all old providers
  with a new uniform scheme, e.g. all-anthropic-format).
- Debugging `${VAR_NAME}` appearing in API calls instead of resolved keys.

## Architecture Overview

Hermes resolves providers through three layers:

1. **`custom_providers`** (list in config.yaml) — named endpoints with
   `name`, `base_url`, `api_key` (supports `${ENV_VAR}` refs), `api_mode`,
   `context_length`, `models` (dict of `{model_name: {name: model_name}}`).
   Referenced as `custom:<name>` (e.g. `custom:weekly-zai`).
2. **`fallback_providers`** (list in config.yaml) — ordered chain tried on
   HTTP errors (429/5xx/connection failure). Each entry: `{provider, model,
   base_url}`. Does NOT trigger on latency/slowdown — only hard errors.
3. **Credential pool** (`~/.hermes/auth.json`) — auto-registered from
   `custom_providers` entries (source `config:<name>`) and built-in env vars
   (source `env:<VAR>`). Multiple keys per provider rotate automatically.

**Key insight**: each profile's config.yaml has its OWN `custom_providers`
and `fallback_providers` — they do NOT merge with or inherit root config.
When you rewrite providers, you must update root config.yaml + EVERY active
profile config.yaml.

## Full Provider Rewrite Workflow (7 steps)

### 1. Back up everything first

```bash
BACKUP=~/.hermes/backup-pre-provider-rewrite-$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP/profiles"
cp ~/.hermes/config.yaml "$BACKUP/config.yaml.root"
cp ~/.hermes/.env "$BACKUP/.env"
cp ~/.hermes/auth.json "$BACKUP/auth.json"
for d in ~/.hermes/profiles/*/; do
  name=$(basename "$d")
  [ "$name" = "_shared" ] && continue
  [ -f "$d/config.yaml" ] && cp "$d/config.yaml" "$BACKUP/profiles/$name.config.yaml"
done
```

### 2. Write API keys to root .env AND every profile .env

⚠️ **THE critical pitfall** — see Pitfalls section below. Each profile has its
own `.env` that does NOT inherit root's. Write every new key to both.

```python
# Batch-write keys to root .env + all 27 profile .env files
import os, glob
home = os.path.expanduser('~')
new_keys = {'WEEKLY_ZAI_KEY': 'sk-...', 'OPUS5_KEY': 'sk-...', ...}

# Root .env
block = '\n# === Provider keys ===\n' + ''.join(f'{k}={v}\n' for k,v in new_keys.items())
with open(f'{home}/.hermes/.env', 'a') as f: f.write(block)

# Every active profile .env
for pdir in sorted(glob.glob(f'{home}/.hermes/profiles/*/')):
    name = os.path.basename(pdir.rstrip('/'))
    if name == '_shared' or name.endswith('.archived'): continue
    env = os.path.join(pdir, '.env')
    if not os.path.exists(env): continue
    content = open(env).read().rstrip() + '\n' + block
    open(env, 'w').write(content)
```

### 3. Pre-test every endpoint with curl

Test with the EXACT model name from the user's table BEFORE writing config.
Common findings: model name case matters (`GLM-5.2` ≠ `glm-4.6`), some keys
have 402 (insufficient balance — still usable as auto-skip fallback).

```bash
test_provider() {
  local name="$1" url="$2" key="$3" model="$4"
  local code=$(curl -sS -m 25 -o /tmp/ctest -w '%{http_code}' \
    -X POST "${url}/v1/messages" \
    -H 'Content-Type: application/json' -H "x-api-key: ${key}" \
    -H 'anthropic-version: 2023-06-01' \
    -d "{\"model\":\"${model}\",\"max_tokens\":8,\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}" 2>/dev/null)
  echo "$name: $code $( [ "$code" = "200" ] && echo OK || echo FAIL )"
}
```

### 4. Rewrite root config.yaml providers section

Use the Hermes venv python (NOT system python3 — no yaml module). Replace
`model`, `providers`, `custom_providers`, `fallback_providers`, and
`agent.reasoning_effort`:

```python
import yaml
path = '$HOME/.hermes/config.yaml'
c = yaml.safe_load(open(path))

c['model'] = {'default': 'glm-5.2', 'provider': 'custom:weekly-zai'}
c['providers'] = {}  # all providers now in custom_providers
c['custom_providers'] = [
    {'name': 'weekly-zai', 'base_url': 'https://...', 'api_key': '${WEEKLY_ZAI_KEY}',
     'api_mode': 'anthropic_messages', 'context_length': 1048576,
     'models': {'glm-5.2': {'name': 'glm-5.2'}}},
    # ... 6 more entries
]
c['fallback_providers'] = [
    {'provider': 'custom:huoshan', 'model': 'glm-5.2', 'base_url': '...'},
    # ... chain in priority order
]
c.setdefault('agent', {})['reasoning_effort'] = 'ultra'

with open(path, 'w') as f:
    yaml.safe_dump(c, f, default_flow_style=False, sort_keys=False, allow_unicode=True, width=100)
```

**`api_mode: anthropic_messages`** = the "kind=anthropic" / "source=custom"
requirement from user tables. All entries use the same format.

### 5. Replicate to all 27 profile configs

Profiles do NOT inherit root's custom_providers. Each must carry its own copy.
Copy the root's `custom_providers` + `fallback_providers` into every profile,
setting `model.default`/`model.provider` per-team:

```python
SHARED_CP = root_cfg['custom_providers']  # deep-copy for each profile
SHARED_FB = root_cfg['fallback_providers']
HACK_PROFILES = {'hack-auditor', 'hack-exploit', 'hack-forensics', 'hack-recon'}

for cfg_path in all_profile_configs:
    c = yaml.safe_load(open(cfg_path))
    if name in HACK_PROFILES:
        c['model'] = {'default': 'kimi-k3', 'provider': 'custom:kimi-mid'}
    else:
        c['model'] = {'default': 'glm-5.2', 'provider': 'custom:weekly-zai'}
    c['providers'] = {}
    c['custom_providers'] = yaml.safe_load(yaml.dump(SHARED_CP))
    c['fallback_providers'] = yaml.safe_load(yaml.dump(SHARED_FB))
    c.setdefault('agent', {})['reasoning_effort'] = 'ultra'
    yaml.safe_dump(c, open(cfg_path, 'w'), default_flow_style=False, sort_keys=False, allow_unicode=True)
```

### 6. Clean stale credential pools + env vars

Old providers linger in `auth.json` and `.env` files, causing phantom
registrations. Built-in providers (zai, deepseek, kimi-coding) auto-register
from env vars — a leftover key revives them.

```bash
# Remove old pools via CLI
hermes auth remove deepseek 1
hermes auth remove kimi-coding 1
hermes auth remove zai 1
hermes auth remove custom:kimicode 1  # old custom providers too

# Delete stale env var lines from root + all profile .env files
sed -i '' '/^DAMOXING_API_KEY=/d; /^KIMI_API_KEY=/d; /^GLM_API_KEY=/d; /^DEEPSEEK_API_KEY=/d' ~/.hermes/.env
for f in ~/.hermes/profiles/*/.env; do
  sed -i '' '/^DAMOXING_API_KEY=/d; /^KIMI_API_KEY=/d; /^GLM_API_KEY=/d; /^DEEPSEEK_API_KEY=/d' "$f"
done

# Edit auth.json directly to delete stale pool keys + suppressed_sources
```

### 7. Verify end-to-end

```bash
# YAML validity (all 42 files)
~/.hermes/hermes-agent/venv/bin/python -c "import yaml,glob,os; [yaml.safe_load(open(f)) for f in glob.glob(os.path.expanduser('~/.hermes/profiles/*/config.yaml'))+glob.glob(os.path.expanduser('~/.hermes/config.yaml'))]; print('OK')"

# Hermes doctor
hermes doctor

# ACTUAL model call (not just curl) — confirms env resolution
hermes chat -q "Reply with exactly: TEST_OK" -Q --max-turns 1
# Must print TEST_OK. If it prints "${VAR_NAME}" → profile .env missing key.
```

## Time-Based Provider Toggle (Peak-Hour Disable)

Two patterns, pick based on what changes:

### Pattern A (preferred): Remove provider from fallback_providers

Primary model never changes. Cron removes/re-inserts a mid-chain provider.
See `scripts/provider-toggle.sh` for implementation.

### Pattern B: Bulk switch model.default

The primary model itself changes. Must protect permanently-pinned profiles.

Both use `no_agent=True` cron jobs (zero token cost, script stdout = message).

## Pitfalls

### Profile .env does NOT inherit root .env ⚠️ CRITICAL

**Symptom**: `hermes chat` fails with `Token prefix: ${WEEKLY_ZAI...` — the
`${VAR}` was passed as a literal string, not resolved.

**Cause**: each profile's `.env` at `~/.hermes/profiles/<name>/.env` is
loaded independently. Root `~/.hermes/.env` keys are invisible to profile
`${VAR}` resolution.

**Fix**: write every new key to ALL active profile `.env` files (step 2 above).

### Paste collapse truncates multi-line tables

**Symptom**: user pastes a 13-row config table, you only receive
`[[ header... [13 lines] ...footer ]]`.

**Cause**: `paste_collapse_threshold: 5` (default) collapses pastes >5 lines.

**Fix**: `hermes config set paste_collapse_threshold 0` +
`hermes config set paste_collapse_char_threshold 0`. Immediate, no restart.
Fallback: tell user to use `/prompt` (opens `$EDITOR`, bypasses collapse).

### Fallback triggers ONLY on HTTP errors, not latency

A slow-but-200 provider won't trigger fallback. For peak-hour slowdown,
use Pattern A (cron removes the provider from the chain entirely).

### `api_server.model_routes` must be updated too

If the API Server (port 8650) exposes model routes, they reference provider
names. After rewriting providers, update `platforms.api_server.extra.model_routes`
to point to the new `custom:<name>` providers, else external clients get 404.

### deepseek 402 (insufficient balance) is safe in fallback chain

A 402 counts as an error → fallback auto-skips to the next provider. The
key stays configured and auto-activates once the user tops up balance.

## Related Skills

- **time-based-model-downgrade** (default profile) — the cron scheduling
  mechanics. This skill focuses on the provider architecture rewrite.
- **team-model-routing** — permanent per-profile model pinning via
  profiles.yaml + generate-configs.py (generator pipeline approach).
- **model-switch-troubleshooting** — `/model` failures, fallback credential
  debugging, the `models:` declaration requirement.
- **model-allocation-strategy** / **multi-model-role-allocation** —
  deciding WHICH model each role runs.
