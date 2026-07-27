---
name: model-switch-troubleshooting
title: Model Switch & Fallback Troubleshooting in Multi-Profile Hermes
description: >-
  Diagnose and fix /model command failures, typed-model resolution errors,
  fallback chain credential issues, and TUI model picker problems in a
  multi-profile Hermes deployment with custom providers. Covers the
  providers.models declaration requirement, switch_model() resolver path
  analysis, fallback credential verification (fallback list does NOT probe
  endpoints), GLM-5.1 as free degradation layer, and the latency-vs-error
  fallback trigger distinction. Use when /model can't find a model that
  exists on the provider, when fallback silently fails due to stale keys,
  or when peak-hour slowdown doesn't trigger automatic fallback.
triggers:
  - "/model 找不到"
  - "model switch error"
  - "fallback credential"
  - "fallback list 不验证"
  - "Could not resolve credentials"
  - "typed model switch"
  - "providers models declaration"
  - "glm-5.1 降级"
  - "高峰期卡顿 fallback"
  - "model picker missing"
---

# Model Switch & Fallback Troubleshooting

Diagnose `/model` failures and fallback chain issues in a multi-profile
Hermes deployment with custom providers (damoxing, custom:kimicode, etc.).

## When to Use

- `/model <name>` returns "Could not resolve credentials" for a model that
  IS configured and working on the provider
- `/model` interactive picker shows a model but typing its name fails
- Fallback chain looks healthy in `fallback list` but silently 401s on
  actual trigger
- GLM-5.2 peak-hour slowdown doesn't auto-switch to fallback
- Need to add GLM-5.1 as a free degradation layer

## Pitfall: /model typed switch fails without `models:` in providers

**Symptom**: `/model glm-5.2` → "Could not resolve credentials for provider
'Z.AI'" even though damoxing serves glm-5.2 with a valid key. The
interactive picker (`/model` + Enter) works fine — only the typed path fails.

**Root cause**: `switch_model()` → `_configured_provider_matches()` scans
`providers.<slug>.models` and `custom_providers[].models` for exact
case-insensitive matches. If no configured provider declares the model,
the resolver falls through to `detect_provider_for_model()` which uses
STATIC catalogs — `glm-*` maps to the built-in `zai` provider (Z.AI),
which has no credentials → error.

**Fix**: add a `models:` list to the provider declaration in profiles.yaml:

```yaml
providers:
  damoxing:
    base_url: ${DAMOXING_BASE_URL}
    api_key: ${DAMOXING_API_KEY}
    api_mode: ${DAMOXING_API_MODE}
    context_length: 1048576
    models:                    # ← REQUIRED for typed /model to work
      - glm-5
      - glm-5.1
      - glm-5.1-20260408
      - glm-5.2
      - glm-5.2-20260613
      - GLM-5.2-C
```

Regenerate + verify with the switch_model resolver:

```python
from hermes_cli.model_switch import switch_model
from hermes_cli.config import load_config
cfg = load_config()
m = cfg.get('model', {})
for name in ['glm-5.2', 'glm-5.1', 'k3', 'deepseek-v4-flash']:
    r = switch_model(name, current_provider=m.get('provider',''),
                     current_model=m.get('default',''),
                     user_providers=cfg.get('providers'),
                     custom_providers=cfg.get('custom_providers'))
    print(f'/model {name} -> success={r.success}')
```

**Scope**: `custom_providers` list entries (like kimicode) already declare
`models:` so `k3` resolves correctly. The bug only hits `providers:` dict
entries that omit the list. (2026-07-24: damoxing was missing `models:`,
causing `/model glm-5.2` and `/model glm-5.1` to fail on all 15 profiles.)

## Pitfall: fallback list does NOT verify credentials

`hermes -p <p> fallback list` prints the chain from config.yaml — it never
probes the endpoint. A stale/expired key sits silently and the first
discovery is a 401 when a real fallback triggers.

**2026-07-24 incident**: `fallback list` showed `[deepseek-v4-flash]` as
healthy on all 15 profiles; `curl /v1/models` returned 401. Root cause:
`DEEPSEEK_API_KEY` in `~/.hermes/shared/.env.common` was stale; the working
key was in `~/.hermes/config.yaml` root provider block but never propagated.

**After ANY fallback chain edit, curl-verify every credential:**

```bash
for prof in orchestrator hack-recon worker-coder; do
  source ~/.hermes/profiles/$prof/.env
  curl -sS -m 10 -w "\n$prof HTTP %{http_code}" \
    "https://api.deepseek.com/v1/models" \
    -H "Authorization: Bearer $DEEPSEEK_API_KEY" | tail -1
done
```

Sync stale key from root config:

```bash
DS_KEY=$(grep -A3 "name: deepseek" ~/.hermes/config.yaml | \
  grep "api_key:" | head -1 | awk '{print $2}' | tr -d "\"'")
# Write to .env.common, then regenerate
~/.hermes/hermes-agent/venv/bin/python ~/.hermes/shared/generate-configs.py
```

## Pitfall: fallback does NOT cover latency degradation

`fallback_providers` triggers ONLY on HTTP errors (429/5xx/connection
failure). A model that responds slowly but still returns 200 — e.g.
GLM-5.2 during peak hours — will NOT trigger the chain.

Remediation for peak-hour slowdown:
1. **Manual (TUI)**: `/model glm-5.1` — instant, session-scoped
2. **Manual (config)**: edit profiles.yaml `model.default` → regenerate (30s)
3. **Automated**: cron job switching at known peak hours (unimplemented)

## GLM-5.1 as free degradation layer

GLM-5.1 runs on the same damoxing Max subscription as GLM-5.2 — zero
marginal cost, no rate window. Quality ≈ v4-flash (curl-verified
2026-07-24: both 3/3 correct on identical tasks; glm-5.1 produces longer
reasoning, v4-flash 2-3× faster). This makes glm-5.1 the cost-optimal
FIRST fallback before paying for deepseek:

```yaml
# swarm shared fallback (cost-priority order)
fallback_providers:
  - provider: damoxing          # FREE: same Max subscription
    model: glm-5.1
  - provider: deepseek          # PAID: only if damoxing itself is down
    model: deepseek-v4-flash
```

Hack team keeps deepseek first (k3 quota exhaustion needs speed), with
glm-5.2 → glm-5.1 as unlimited backstop:

```yaml
# hack per-profile fallback
fallback_providers:
  - provider: deepseek
    model: deepseek-v4-flash
  - provider: damoxing
    model: glm-5.2
  - provider: damoxing
    model: glm-5.1
```

## How the TUI /model picker works (for debugging)

The TUI model picker has TWO paths:

1. **Interactive picker** (`/model` + Enter): calls `model.options` RPC →
   `build_models_payload()` → `list_authenticated_providers()` → probes
   each provider's `/v1/models` live. Shows ALL providers (43 rows),
   including unconfigured ones with "needs setup". Models appear under
   their provider row.

2. **Typed switch** (`/model <name>`): calls `config.set` RPC →
   `switch_model()` → resolution chain:
   - Step a: `resolve_alias()` on current provider
   - Step b: if alias exists but not on current provider, try fallback
   - Step d.5: `_configured_provider_matches()` — scans `providers:` and
     `custom_providers:` for exact model name match
   - Step e: `detect_provider_for_model()` — static catalog lookup (this
     is where glm-* → zai misrouting happens)
   - Step f: resolve credentials for the resolved provider

The interactive picker works because it probes live; the typed path fails
because it relies on declared `models:` lists before falling back to
static catalogs.

## Related Skills

- **team-model-routing** — main-model switching mechanics (profiles.yaml
  override, custom-provider declaration, backup→regenerate→diff)
- **aux-fallback-model-routing** — auxiliary task routing + fallback chain
  format/selection (companion to this skill's troubleshooting focus)
- **multi-model-role-allocation** — decision layer for which model each
  role runs (capability × cost matrix)
- **debugging-hermes-tui-commands** — broader TUI slash command debugging
