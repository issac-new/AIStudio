---
name: model-provider-audit
version: 1.1.0
description: Audit if a model/provider was ever configured across tools.
---

# Model/Provider Configuration Audit

## When to Use

- User asks "我之前配置过 X 么" / "did I ever configure model X" for any
  tool (Hermes, cc-switch, codex, opencode, claude, gemini).
- Before "change X to version N": confirm X exists and under what exact ID.
- Answering "which model does tool T actually route to?"

## Always-on rules

- Answer from evidence, never memory: sweep the config surfaces, then state
  findings. Absence from the current provider list ≠ never configured.
- Report CURRENT and HISTORICAL as separate facts: "not active now" and
  "historical trace found" are different answers to different questions.
- Before changing to a requested model ID, grep the model catalogs for the
  user's EXACT ID. If absent, name the closest real IDs and let the user
  pick — never silently substitute a neighbor ID (e.g. asked
  qwen3.8-omni-flash, catalogs only have qwen3.8-flash / qwen3.8-max →
  surface the gap, don't guess).
- Fleet boundary: under the fleet unification ruling, changing the Hermes
  fleet's effective model is done at cc-switch (alias → upstream mapping),
  NOT by editing profiles.yaml — model.default is an alias; a regenerate
  would reproduce the pinned alias regardless.

## The sweep (one pass, ~8 greps)

```bash
M=qwen   # the model/provider stem to search

# 1. Schema first — providers key is (id, app_type); column is app_type not app
sqlite3 ~/.cc-switch/cc-switch.db ".schema providers"

# 2. Current providers: name column AND the settings_config JSON blob
sqlite3 ~/.cc-switch/cc-switch.db "select app_type, id, name, is_current from providers where lower(name) like '%$M%' or lower(settings_config) like '%$M%'"

# 3. Embedded per-tool configs: one JSON blob per tool in settings
#    (common_config_openclaw / codex / claude / opencode hold full provider
#    definitions incl. baseUrl + model list)
sqlite3 ~/.cc-switch/cc-switch.db "select key, substr(value,1,2000) from settings where value like '%$M%'"

# 4. Historical traces: freed/WAL pages keep deleted rows and old names
strings ~/.cc-switch/cc-switch.db | grep -iE "$M"

# 5. Tool configs on disk
M2=qwen|omni
grep -rniE "$M2" ~/.hermes/config.yaml ~/.hermes/profiles/*/config.yaml 2>/dev/null
grep -iE "$M2" ~/.codex/config.toml 2>/dev/null
grep -rniE "$M2" ~/.config/opencode/ 2>/dev/null
grep -iE "$M2" ~/.zsh_history 2>/dev/null

# 6. Catalogs — does the exact requested ID exist anywhere?
grep -inE "qwen3\\.8|omni-flash" ~/.cc-switch/models.json ~/.cc-switch/model-pricing.json

# 7. Hermes provider registry: credential_pool (chat providers, per-region
#    keys, request_count = ever-called evidence) + vendor catalog cache
python3 -c "import json; pool=json.load(open('/Users/YOURNAME/.hermes/auth.json')).get('credential_pool',{}); [print(n, e.get('base_url'), 'requests:', e.get('request_count')) for n, es in pool.items() for e in es]"
python3 -c "import json; cat=json.load(open('/Users/YOURNAME/.hermes/provider_models_cache.json')); [print(n, len(v.get('models', v)) if isinstance(v, dict) else len(v), 'models') for n, v in cat.items()]"
grep -inE "$M2" ~/.hermes/provider_models_cache.json
```

## Interpreting the results

| Evidence | Verdict |
|----------|---------|
| rows in step 2/3 with is_current=1 | actively configured now |
| step 2/3 rows, is_current=0 | configured, not active |
| step 2/3 empty but step 4 strings hit | configured before, since removed (old names survive deletion in freed pages) |
| all empty | never configured on this machine |
| credential_pool entry exists, request_count=0 | registered on the provider but never called — configured surface, zero usage |

Pitfalls:

- Real model references live inside `settings_config` blobs and `settings`
  values, not just the `name` column — search both or you report "not
  configured" while an embedded tool config holds it.
- Hermes provider-side model lists: check
  `~/.hermes/hermes-agent/plugins/model-providers/*/plugin.yaml` for which
  built-in providers exist (e.g. qwen-oauth = Qwen Portal OAuth).
- When a hit turns out to be another tool's config (e.g. openclaw's
  qwen-portal inside cc-switch settings), say WHICH tool it belongs to —
  the user's mental model of "my configuration" is usually per-tool.
- One vendor often has TWO independent config surfaces: chat providers in
  auth.json credential_pool (often request_count=0) vs dedicated adapter
  paths (e.g. image gen: keys in ~/.hermes/.env + ~/.hermes/bin/*-image-gen.py,
  invisible to credential_pool). "What is configured for X" can differ per
  channel — check both and name the channel in the verdict.
- Same vendor registers per-region provider keys (e.g. alibaba-cn =
  dashscope.aliyuncs.com vs alibaba = dashscope-intl) whose cached
  catalogs differ — a model ID present on the CN key's catalog can be
  absent on intl. Grep the region's catalog entry, not the vendor name.
- Mask key material in every output: auth.json / .env inspection prints
  base_url, fingerprint, request_count only — never the key itself.

## Companion skills (default profile — visible here, NOT editable from orchestrator; recommend `hermes curator adopt` if stale)

- model-fleet-migration — unified fleet migration + served-model probe.
- provider-fallback-chain-management — provider rewrite workflow.
- local-proxy-provider-unification — collapsing providers onto the proxy.
- chinese-image-api-integration — the DashScope image-gen adapter surface
  (keys in ~/.hermes/.env + bin/dashscope-image-gen.py) that sits outside
  credential_pool; consult it when the audit hits the image channel.
