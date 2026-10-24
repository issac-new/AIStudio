---
name: cc-switch-monitoring
description: "Use for cc-switch proxy monitoring or TUI widgets."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
---

# cc-switch Monitoring

Monitor the local cc-switch proxy (127.0.0.1:15721) to show the **actual** upstream provider and model being used - not the model name Hermes thinks it's using. The proxy ignores the requested model name and routes to whichever provider is currently active in its failover queue, so the only reliable way to see where requests land is to query the proxy's `/status` endpoint and the cc-switch SQLite DB.

## When to Use

- User wants to see which upstream provider/model is actually handling requests (Hermes declares one model, cc-switch routes to another).
- User wants to display provider balance/quota in the TUI or a script.
- User wants usage statistics (5h/7d/monthly windows) per provider.
- Building a TUI widget that shows cc-switch state.

## Key Paths

```
~/.cc-switch/cc-switch.db     cc-switch SQLite database (providers, request logs, usage rollups)
~/.cc-switch/logs/cc-switch.log   cc-switch application log
http://127.0.0.1:15721/status     Proxy health + current provider (JSON, no auth)
http://127.0.0.1:15721/health      Proxy health check
```

## Data Sources

### 1. Proxy `/status` endpoint (real-time)

```bash
curl -s http://127.0.0.1:15721/status
```

Returns: `current_provider`, `current_provider_id`, `total_requests`, `success_requests`, `failed_requests`, `success_rate`, `failover_count`, `last_request_at`.

### 2. cc-switch SQLite DB (provider config + request logs)

The DB at `~/.cc-switch/cc-switch.db` has these key tables:
- `providers` - provider name, settings_config (env vars including ANTHROPIC_MODEL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL), meta (usage_script config), is_current, in_failover_queue, sort_index
- `proxy_request_logs` - every proxied request: provider_id, model, request_model, input/output/cache tokens, cost, latency, status_code, created_at
- `usage_daily_rollups` - daily aggregated usage per provider/model
- `provider_health` - health status, consecutive failures
- `model_pricing` - pricing per model (for cost calculation)

Key query - current provider's actual model:

```sql
SELECT json_extract(p.settings_config, '$.env.ANTHROPIC_MODEL') as model,
       json_extract(p.settings_config, '$.env.ANTHROPIC_BASE_URL') as base_url,
       json_extract(p.settings_config, '$.env.ANTHROPIC_AUTH_TOKEN') as token
FROM providers p
WHERE p.app_type='claude' AND p.is_current=1;
```

### 3. Provider balance APIs (per-provider)

Each upstream provider has its own balance/quota API. See `references/cc-switch-balance-apis.md` for the full list of endpoints and response formats.

**Supported providers:**
| Provider | Balance API | Data returned |
|----------|------------|---------------|
| kimi-mid / kimi-max | `api.kimi.com/coding/v1/usages` | remaining/limit, 5h window, parallel limit, reset time |
| BigModel-coding-plan | `open.bigmodel.cn/api/monitor/usage/quota/limit` | 5h/7d token quota percentage |
| deepseek | `api.deepseek.com/user/balance` | total_balance, is_available |
| huoshan (volcengine) | Not working - V4 signing failed | Use usage windows fallback |
| weekly-z.ai / opus5 | No balance API (proxy resellers) | Use usage windows fallback |

### 4. Usage windows fallback (for providers without balance API)

When a provider has no balance API, calculate usage from `proxy_request_logs`:

```sql
-- 5h window
SELECT COUNT(*), SUM(input_tokens), SUM(output_tokens), SUM(CAST(total_cost_usd AS REAL))
FROM proxy_request_logs
WHERE provider_id='<id>' AND created_at >= strftime('%s','now','-5 hours');

-- 7d window
... AND created_at >= strftime('%s','now','-7 days');

-- Monthly
... AND created_at >= strftime('%s','now','start of month');
```

**User preference**: When balance API is unavailable, ALWAYS show 5h/7d/monthly usage windows - never show "no balance API" or "n/a". The user explicitly requested this.

## TUI Widget

The canonical implementation is a TUI widget at `~/.hermes/profiles/<profile>/tui-widgets/ccswitch.mjs`. See `templates/ccswitch.mjs` for the full working template.

**Critical path gotcha**: In a profile session, `$HERMES_HOME` points to `~/.hermes/profiles/<profile-name>/`, NOT `~/.hermes/`. Widget files must go in `~/.hermes/profiles/<profile-name>/tui-widgets/<name>.mjs`. Putting them in `~/.hermes/tui-widgets/` will silently fail with "no user widgets found".

After placing the widget file, run `/widgets-reload` in the TUI, then `/<widget-id>` to toggle it.

## Procedure

1. Query `/status` for the current provider name and proxy health.
2. Query the SQLite DB for the current provider's actual model and API token.
3. Query the provider's balance API (if supported) using the token from step 2.
4. If no balance API: query `proxy_request_logs` for 5h/7d/monthly usage windows.
5. Display in TUI widget or script output.

## Pitfalls

- **Volcengine V4 signing**: The huoshan provider stores `accessKeyId` + `secretAccessKey` (base64-encoded) in the provider's `meta.usage_script` field. Manual V4 signature implementation and the volcengine Python SDK both produce `SignatureDoesNotMatch` errors. The SK may have additional encryption applied by cc-switch. Do not attempt to implement volcengine balance queries - use the usage windows fallback instead.
- **Model name mismatch**: Hermes declares `glm-5.2` but cc-switch may route to `k3[1M]` (Kimi) or `glm-5.2[1M]` (huoshan). Always read the actual model from the DB, not from Hermes config.
- **DeepSeek balance can be negative**: DeepSeek returns `total_balance: "-0.50"` when overdrawn. Check `is_available` field, not just the balance number.
- **cc-switch DB path**: Always use `~/.cc-switch/cc-switch.db`. The `HERMES_HOME` env var does NOT affect cc-switch's DB location.
