---
name: provider-route-diagnostics
description: "Use when a model hits the wrong upstream."
version: 1.0.0
platforms: [macos, linux, windows]
metadata:
  hermes:
    tags: [providers, routing, cc-switch, opencode, model-catalog, diagnostics]
---

# Provider Route Diagnostics

Diagnose model-routing failures across Hermes, CC Switch, OpenCode Zen, Codex-compatible endpoints, and upstream provider catalogs. The central rule is to separate **client model ID**, **proxy provider route**, and **upstream model code**. A model declared in Hermes configuration is only a resolver hint; it does not prove that the selected proxy provider or upstream endpoint serves that model.

## When to use

- HTTP 400 errors such as `modelCode: 不存在` or `unknown model`
- A desktop/TUI/OpenCode surface appears to use a different model or provider
- A model works through one CC Switch provider but fails through another
- A free-model claim needs current verification
- A fallback or model catalog appears inconsistent with actual upstream behavior

## Required diagnostic sequence

1. Record the exact surface, endpoint family, provider name, model string, and wire format. Do not normalize or silently add suffixes such as `-free`.
2. Inspect the proxy's selected provider and endpoint using redacted metadata only. Never dump auth fields, tokens, or full provider settings.
3. Compare the requested model with the selected provider's explicit model catalog.
4. Inspect the proxy request log for the exact `request_model`, upstream status, and error message.
5. Query the upstream model catalog only with valid credentials and only after confirming the endpoint; a 401 proves credentials are invalid, not that the model is absent.
6. Send one minimal smoke request after a route change, then verify both its HTTP result and a new proxy-log row.

## Important distinctions

- `custom_providers.models` or a Codex model catalog controls local selection/resolution. It cannot add an unsupported model to an upstream service.
- OpenCode Zen model IDs may be namespaced as `opencode/<model-id>`. The live official catalog is authoritative; model availability can rotate.
- A BigModel coding endpoint and OpenCode Zen are different upstreams. A model available through Zen is not automatically available through BigModel or another CC Switch provider.
- A successful configuration write is not a successful route. Require an exercised request and read-back evidence.

## Safe metadata probes

```bash
sqlite3 ~/.cc-switch/cc-switch.db \
  "SELECT id,name,app_type,category FROM providers WHERE app_type='codex';"
sqlite3 ~/.cc-switch/cc-switch.db \
  "SELECT provider_id,app_type,url FROM provider_endpoints WHERE app_type='codex';"
sqlite3 ~/.cc-switch/cc-switch.db \
  "SELECT name, json_extract(settings_config,'$.modelCatalog.models')\
   FROM providers WHERE app_type='codex';"
sqlite3 -header ~/.cc-switch/cc-switch.db \
  "SELECT provider_id,app_type,model,request_model,status_code,error_message\
   FROM proxy_request_logs WHERE model='<exact-model>'\n   ORDER BY created_at DESC LIMIT 10;"
```

## OpenCode free-model claims

Do not state a universal request quota from third-party articles. Check the official Zen documentation and live models endpoint at use time, distinguish price-free from unlimited, and record the retrieval date. Availability, suffixes, privacy terms, and limits may change. Keep a tested fallback and avoid claiming a model is configured until the exact endpoint is exercised.

See `references/ccswitch-opencode-case.md` for the verified failure pattern and evidence interpretation.

## Reporting format

Report: (1) observed route, (2) exact requested ID, (3) upstream catalog evidence, (4) root cause, (5) minimal corrective options, (6) smoke-test result, (7) uncertainty and time window. Redact all credentials and sensitive payloads. Do not recommend merely adding a model name to a local catalog as a fix for an upstream `unknown model` response.
