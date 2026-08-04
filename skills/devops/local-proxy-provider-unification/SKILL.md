---
name: local-proxy-provider-unification
title: Unify Hermes Model Providers Behind a Single Local Proxy
description: "Collapse providers to one local proxy endpoint."
triggers:
  - "cc switch 代理"
  - "统一走代理"
  - "local proxy provider"
  - "one-api 统一管理"
  - "collapse providers to proxy"
  - "single endpoint failover"
  - "PROXY_MANAGED"
  - "127.0.0.1:15721"
  - "litellm proxy hermes"
  - "proxy 管理所有 provider"
---

# Unify Hermes Model Providers Behind a Single Local Proxy

## When to Use

- The user already runs a local failover proxy (cc switch, one-api, new-api,
  LiteLLM) that manages multiple upstream providers with its own GUI/DB.
- The user says "冗余配置太多了，统一用代理吧" after seeing a multi-provider
  Hermes config — they want to simplify.
- You are about to build a 7-provider + 6-fallback chain and the user
  mentions they have a proxy that already does failover.

**Do NOT use** if the user has no local proxy — build the native multi-provider
config instead (see provider-fallback-chain-management in the default profile).

## Decision: Proxy vs Native Multi-Provider

| Factor | Native multi-provider | Single local proxy |
|--------|----------------------|-------------------|
| Hermes config complexity | N providers × M profiles | 1 provider × M profiles |
| Failover management | Hermes fallback_providers list | Proxy's own queue |
| Peak-hour rules | Hermes cron + model-shift.sh | Proxy GUI settings |
| Key rotation | Hermes auth.json credential pool | Proxy's own key store |
| Per-profile model pinning | Yes (each profile independent) | No (proxy routes all the same) |
| Single point of failure | Distributed | Proxy process (mitigate: auto-start) |

**Key question**: does any profile need a DIFFERENT provider than the others?
(e.g. hack team needs k3 for low-refusal while swarm uses glm-5.2). If yes
AND the proxy can't route per-request by model name, the proxy approach
forces all profiles onto the same upstream. Confirm with the user.

## cc switch Proxy (Validated 2026-08-03)

### How it works

cc switch (the Claude Code/Codex provider switcher desktop app) runs a local
HTTP proxy on `127.0.0.1:15721`. Key behaviors:

- **Ignores the `model` field** in requests — always routes to the
  currently-active provider in its failover queue. Sending `model: kimi-k3`
  while weekly-z.ai is active returns `glm-5.2`.
- **Anthropic messages format** — `/v1/messages` endpoint, `x-api-key` header,
  `anthropic-version: 2023-06-01`.
- **Failover queue** in SQLite (`~/.cc-switch/cc-switch.db`):
  - Table `providers`, `in_failover_queue=1`, ordered by `sort_index`
  - `is_current=1` marks the active provider
  - Managed via the cc switch GUI (not Hermes)
- **api_key**: use literal `PROXY_MANAGED` — proxy injects the real upstream key

### Probe the proxy before configuring Hermes

```bash
# Is the proxy running?
curl -sS -m 10 -X POST http://127.0.0.1:15721/v1/messages \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: PROXY_MANAGED' \
  -H 'anthropic-version: 2023-06-01' \
  -d '{"model":"glm-5.2","max_tokens":8,"messages":[{"role":"user","content":"hi"}]}'
# 200 + JSON response = proxy alive and routing

# What providers are in the failover queue?
sqlite3 ~/.cc-switch/cc-switch.db \
  "SELECT name, is_current, sort_index FROM providers WHERE app_type='claude' AND in_failover_queue=1 ORDER BY sort_index;"
```

### Read the cc switch DB to understand its config

```bash
# Provider list
sqlite3 ~/.cc-switch/cc-switch.db \
  "SELECT app_type, name, is_current, in_failover_queue, sort_index FROM providers ORDER BY app_type, sort_index;"

# Active provider's full config (contains base_url, model mappings)
sqlite3 ~/.cc-switch/cc-switch.db \
  "SELECT settings_config FROM providers WHERE app_type='claude' AND is_current=1;"
```

## Simplification Workflow (6 steps)

### 1. Back up the current multi-provider state

```bash
BACKUP=~/.hermes/backup-pre-proxy-simplify-$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP/profiles"
cp ~/.hermes/config.yaml "$BACKUP/config.yaml.root"
cp ~/.hermes/.env "$BACKUP/.env"
cp ~/.hermes/auth.json "$BACKUP/auth.json"
for d in ~/.hermes/profiles/*/; do
  name=$(basename "$d")
  [ "$name" = "_shared" ] && continue
  [ -f "$d/config.yaml" ] && cp "$d/config.yaml" "$BACKUP/profiles/$name.config.yaml"
  [ -f "$d/.env" ] && cp "$d/.env" "$BACKUP/profiles/$name.env"
done
```

### 2. Rewrite root config.yaml to single proxy provider

Use the Hermes venv python (`~/.hermes/hermes-agent/venv/bin/python`) — system
python3 has no yaml module.

```python
import yaml
path = '$HOME/.hermes/config.yaml'
c = yaml.safe_load(open(path))

PROXY_URL = 'http://127.0.0.1:15721'

c['model'] = {
    'default': 'glm-5.2',           # hint; proxy ignores it
    'provider': 'custom:cc-switch',
    'base_url': PROXY_URL,
    'api_key': 'PROXY_MANAGED',
}
c['providers'] = {}
c['custom_providers'] = [
    {
        'name': 'cc-switch',
        'base_url': PROXY_URL,
        'api_key': 'PROXY_MANAGED',
        'api_mode': 'anthropic_messages',
        'context_length': 1048576,
        'models': {
            'glm-5.2':           {'name': 'glm-5.2'},
            'kimi-k3':           {'name': 'kimi-k3'},
            'claude-opus-5':     {'name': 'claude-opus-5'},
            'deepseek-v4-flash': {'name': 'deepseek-v4-flash'},
        },
    },
]
c['fallback_providers'] = []        # proxy owns failover
c.setdefault('agent', {})['reasoning_effort'] = 'ultra'

# Update API Server routes too
c['platforms']['api_server']['extra']['model_routes'] = {
    'glm-5.2': {'model': 'glm-5.2', 'provider': 'custom:cc-switch'},
}

yaml.safe_dump(c, open(path, 'w'),
    default_flow_style=False, sort_keys=False, allow_unicode=True, width=100)
```

### 3. Replicate to all profile configs

Each profile needs its own copy of `custom_providers` (profiles do NOT inherit
root's). Hack team profiles can set `model.default: kimi-k3` as a hint, though
the proxy ignores it.

```python
import yaml, os, glob
home = os.path.expanduser('~')
root = yaml.safe_load(open(f'{home}/.hermes/config.yaml'))
CP = root['custom_providers']  # single cc-switch entry

HACK = {'hack-auditor', 'hack-exploit', 'hack-forensics', 'hack-recon'}

for pdir in sorted(glob.glob(f'{home}/.hermes/profiles/*/')):
    name = os.path.basename(pdir.rstrip('/'))
    if name == '_shared' or name.endswith('.archived'): continue
    cfg = os.path.join(pdir, 'config.yaml')
    if not os.path.exists(cfg): continue
    c = yaml.safe_load(open(cfg)) or {}
    c['model'] = {'default': 'kimi-k3' if name in HACK else 'glm-5.2',
                  'provider': 'custom:cc-switch'}
    c['providers'] = {}
    c['custom_providers'] = yaml.safe_load(yaml.dump(CP))
    c['fallback_providers'] = []
    c.setdefault('agent', {})['reasoning_effort'] = 'ultra'
    yaml.safe_dump(c, open(cfg, 'w'),
        default_flow_style=False, sort_keys=False, allow_unicode=True, width=100)
```

### 4. Strip provider-specific env vars

All N provider keys are now dead weight — the proxy manages keys internally.
Remove from root `.env` AND every profile `.env` (profiles don't inherit root).

```python
import os, glob, re
home = os.path.expanduser('~')
STALE = ['BIGMODEL_CODING_KEY','WEEKLY_ZAI_KEY','HUOSHAN_CODING_KEY',
         'KIMI_MID_KEY','KIMI_MAX_KEY','DEEPSEEK_ANTHROPIC_KEY','OPUS5_KEY',
         'DAMOXING_API_KEY','DAMOXING_BASE_URL','DAMOXING_API_MODE',
         'KIMI_API_KEY','GLM_API_KEY','DEEPSEEK_API_KEY',
         'CUSTOM_PROVIDER_KIMICODE_KEY']
pat = re.compile(r'^(' + '|'.join(re.escape(k) for k in STALE) + r')=')
for env in [f'{home}/.hermes/.env'] + sorted(glob.glob(f'{home}/.hermes/profiles/*/.env')):
    if not os.path.exists(env): continue
    lines = open(env).readlines()
    filtered = [l for l in lines if not pat.match(l)]
    if len(filtered) != len(lines):
        open(env, 'w').writelines(filtered)
```

### 5. Remove Hermes-side switching infrastructure

If migrating FROM a native multi-provider setup that had cron-based switching:

```bash
# Remove cron jobs (find IDs first via cronjob action='list', then remove)
# Remove switch scripts
rm -f ~/.hermes/scripts/model-shift.sh
rm -f ~/.hermes/profiles/orchestrator/scripts/model-shift-downgrade.sh
rm -f ~/.hermes/profiles/orchestrator/scripts/model-shift-restore.sh
```

Also clean `auth.json` credential_pool of stale provider entries (old
custom:kimicode, deepseek, zai, kimi-coding pools). Use
`hermes auth remove <provider> <idx>` or edit auth.json directly.

### 6. Verify end-to-end

```bash
# YAML validity (all configs)
~/.hermes/hermes-agent/venv/bin/python -c "
import yaml, glob, os
home = os.path.expanduser('~')
files = [f'{home}/.hermes/config.yaml'] + sorted(glob.glob(f'{home}/.hermes/profiles/*/config.yaml'))
for f in files:
    if '.archived/' not in f and '/_shared/' not in f:
        yaml.safe_load(open(f))
print(f'All {len(files)} configs valid')
"

# ACTUAL model call through the proxy (confirms full chain)
hermes chat -q "Reply with exactly: PROXY_OK" -Q --max-turns 1
# Must print PROXY_OK. If connection refused → proxy app not running.
```

## Pitfalls

### Profile .env does NOT inherit root .env

Each profile's `.env` at `~/.hermes/profiles/<name>/.env` is loaded
independently. When writing keys (or cleaning them), touch ALL active
profile `.env` files, not just root. Symptom of miss: `Token prefix:
${VAR...` in error output means the `${VAR}` was passed as a literal string.

### Proxy is a single point of failure

Unlike native multi-provider (where each provider is an independent remote
endpoint), a single-proxy setup has one SPOF: the proxy process. Ensure the
proxy app auto-starts (cc switch has `launchOnStartup: true` in its
settings.json). If the proxy dies, ALL Hermes profiles go down simultaneously.

### `/model` becomes cosmetic

After unification, `/model <name>` in the TUI still "works" (no error) but
has no effect — the proxy ignores the model field. Switching models happens
in the proxy GUI. Set expectations with the user.

### paste_collapse truncates config tables

When the user pastes a provider/model config table in the TUI and you only
see `[[ ... [N lines] ... ]]`, that's `paste_collapse_threshold: 5` folding
multi-line pastes. Fix: `hermes config set paste_collapse_threshold 0` +
`hermes config set paste_collapse_char_threshold 0` (immediate, no restart).
Fallback: `/prompt` opens `$EDITOR` and bypasses collapse.

## Related Skills

- **provider-fallback-chain-management** (default profile) — the native
  multi-provider architecture this skill replaces. Read it to understand
  what you're collapsing FROM.
- **model-switch-troubleshooting** (default profile) — most /model and
  fallback issues disappear under proxy mode; that skill explains why.
- **time-based-model-downgrade** (default profile) — Hermes-side cron
  switching becomes unnecessary when the proxy owns peak-hour rules.
