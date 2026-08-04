---
name: cc-switch-provider-troubleshooting
description: "Fix cc-switch 503 熔断 and circuit-breaker trips."
version: 1.0.0
author: Hermes Agent (orchestrator)
platforms: [macos, linux]
metadata:
  hermes:
    tags: [cc-switch, provider, troubleshooting, circuit-breaker, codex, proxy]
    related_skills: [cc-switch-integration, cc-switch-proxy-monitoring, acp-provider-selection]
---

# cc-switch Provider Troubleshooting

Diagnose why a cc-switch-proxied tool (Codex CLI, Claude Code, Hermes agent, opencode) gets `503 所有供应商已熔断` or repeated upstream errors, even though the local client config and cc-switch `/health` look fine.

## The three-layer model

```
Client (codex/claude/hermes) → cc-switch proxy (127.0.0.1:15721) → upstream provider API
```

Failures can be at any layer. The proxy being "healthy" (`/health` returns 200) only means the proxy process is alive — it says nothing about whether the upstream providers are reachable or correctly configured.

## Quick diagnosis flowchart

```
503 "所有供应商已熔断" ?
├── YES → check provider_health table (Step 1)
│         ├── is_healthy=0, consecutive_failures>=4 → circuit-broken (Step 2)
│         │   └── last_error = "404" → API format mismatch (Step 3) ← MOST COMMON for codex
│         │   └── last_error = "401" → expired/invalid API key
│         │   └── last_error = "429" → rate limited upstream
│         └── no rows → provider not configured for this app_type
└── NO (other error) → check proxy_request_logs for the specific failure
```

## Step 1: Check provider health

```bash
sqlite3 ~/.cc-switch/cc-switch.db \
  "SELECT provider_id, app_type, is_healthy, consecutive_failures, substr(last_error,1,100)
   FROM provider_health
   WHERE app_type='<app_type>'   -- codex, claude, hermes, opencode, etc.
   ORDER BY consecutive_failures DESC"
```

- `is_healthy=0` → circuit breaker is OPEN (tripped)
- `consecutive_failures>=4` → about to trip or recently tripped
- `last_error` → the upstream HTTP error that caused the failures

## Step 2: Inspect the provider config

```bash
sqlite3 ~/.cc-switch/cc-switch.db \
  "SELECT name, json_extract(settings_config, '$.config') 
   FROM providers WHERE app_type='<app_type>'"
```

For Codex providers, the config TOML inside shows:
```toml
[model_providers.custom]
base_url = "https://open.bigmodel.cn/api/coding/paas/v4"
wire_api = "responses"     # ← mismatch if upstream doesn't support Responses API
```

## Step 3: Verify upstream endpoint existence (the 404 trap)

The most common failure for `codex` app_type: the provider config assumes the upstream supports OpenAI's Responses API (`/v1/responses`), but Chinese LLM providers (BigModel/Zhipu, Kimi/Moonshot, DeepSeek) **only implement Chat Completions**.

```bash
# Test the /responses endpoint (what codex actually calls)
curl -s -w '\nstatus=%{http_code}\n' \
  '<base_url>/responses' \
  -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <KEY>" \
  -d '{"model":"<model>","input":"test","max_output_tokens":10}'
# 404 → endpoint does not exist, wire_api="responses" is wrong

# Test /chat/completions (what hermes/claude use)
curl -s -w '\nstatus=%{http_code}\n' \
  '<base_url>/chat/completions' \
  -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <KEY>" \
  -d '{"model":"<model>","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'
# 200 → this is what actually works
```

## Known API compatibility matrix

| Upstream Provider | base_url | `/responses` | `/chat/completions` |
|-------------------|----------|:---:|:---:|
| BigModel (Zhipu) coding | `open.bigmodel.cn/api/coding/paas/v4` | ❌ 404 | ✅ 200 |
| Kimi (Moonshot) coding | `api.kimi.com/coding/v1` | ❌ 404 | ✅ 200 |
| DeepSeek | `api.deepseek.com` | ❌ 404 | ✅ 200 |
| OpenAI official | `api.openai.com/v1` | ✅ 200 | ✅ 200 |

**Only OpenAI natively supports the Responses API.** If a Codex provider points at any Chinese LLM provider with `wire_api="responses"`, it will 404 and circuit-break.

## Fixing circuit-broken providers

### Reset the circuit breaker

```bash
sqlite3 ~/.cc-switch/cc-switch.db \
  "UPDATE provider_health SET is_healthy=1, consecutive_failures=0, last_error=NULL
   WHERE app_type='codex'"
```

This alone won't help if the underlying config is wrong — the next request will fail and re-trip.

### Fix the wire_api mismatch

If cc-switch supports API format translation, change `wire_api` from `"responses"` to `"chat"`:

```sql
UPDATE providers
SET settings_config = json_set(settings_config, '$.config',
  REPLACE(json_extract(settings_config, '$.config'),
    'wire_api = "responses"', 'wire_api = "chat"'))
WHERE app_type = 'codex';
```

**Verify cc-switch supports this translation first** — not all versions do.

### Add a Responses-API-compatible provider

If no translation is available, add an OpenAI-official provider for `app_type='codex'`:
- base_url: `https://api.openai.com/v1`
- Requires an OpenAI API key
- This is the only provider that will work with Codex's Responses API mode

## Red herrings to ignore

1. **MCP reconnect errors** in Codex stderr (`chatgpt.com/backend-api/ps/mcp`) — this is Codex's built-in MCP plugin trying to reach OpenAI cloud; unrelated to the proxy failure.
2. **cc-switch `/health` returning 200** — only means the proxy process is alive, not that providers work.
3. **Codex CLI starting correctly** (shows version, model, session id) — the CLI is fine; the failure is upstream.

## Related skills

- **acp-provider-selection** — How to choose claude vs codex ACP provider per task (includes the cc-switch 404 as pitfall #6)
- **cc-switch-integration** — Query cc-switch for TUI display
- **cc-switch-proxy-monitoring** — Real-time proxy monitoring
