---
name: cc-switch-proxy-monitoring
description: "Monitor cc switch proxy upstream, model, and balance in TUI."
version: 1.0.0
author: orchestrator
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [cc-switch, proxy, monitoring, tui, widget, provider, balance]
---

# cc-switch Proxy Monitoring

cc switch (CC Switch.app, Tauri/Rust) runs a local proxy at `127.0.0.1:15721` that
routes LLM requests through a failover queue of upstream providers. The proxy
**ignores the requested model name** and forwards to whichever provider is
currently active in the queue. This skill covers querying the proxy's internal
state, reading its SQLite database, fetching upstream balances, and displaying
all of this in the Hermes TUI.

## When to Use

- User asks "which provider is actually being used" / "what model am I really hitting"
- User wants to see remaining quota / balance for a provider
- User wants a TUI widget showing live proxy status
- Debugging failover behavior or provider switching
- Building any TUI widget that reads external/local data sources

## cc-switch Internal State

### HTTP endpoints (127.0.0.1:15721)

| Endpoint | Returns |
|----------|---------|
| `GET /status` | `current_provider`, `current_provider_id`, `success_rate`, `failover_count`, `total_requests`, `last_request_at` |
| `GET /health` | `{"status":"healthy","timestamp":"..."}` |
| `GET /models` | `{"models":[]}` (often empty - the proxy ignores model names) |

No `/balance`, `/usage`, `/quota` endpoints exist on the proxy itself. Balance
data must be fetched directly from each upstream provider's API.

### SQLite database (~/.cc-switch/cc-switch.db)

Key tables:

| Table | Contents |
|-------|----------|
| `providers` | Provider configs (id, name, app_type, settings_config JSON, meta JSON, is_current, in_failover_queue, sort_index) |
| `proxy_request_logs` | Per-request logs: provider_id, model (actual), request_model (requested), status_code, latency_ms, tokens, cost, timestamp |
| `usage_daily_rollups` | Daily aggregated usage per provider/model |
| `provider_health` | Health state: is_healthy, consecutive_failures, last_success_at |
| `model_pricing` | Pricing per model (input/output/cache costs per million tokens) |
| `proxy_config` | Proxy settings: listen_port, auto_failover_enabled, circuit breaker thresholds |
| `settings` | Key-value: common_config_claude, optimizer_config, etc. |

**Critical JSON paths in `providers.settings_config`:**
- `$.env.ANTHROPIC_MODEL` - actual model name (e.g. `k3[1M]`, `glm-5.2[1M]`)
- `$.env.ANTHROPIC_BASE_URL` - upstream endpoint URL
- `$.env.ANTHROPIC_AUTH_TOKEN` - API key for the upstream

**`providers.meta` JSON** may contain `usage_script` config for providers that
support balance queries (volcengine needs `accessKeyId` + `secretAccessKey`).

### Provider balance APIs

Each upstream provider has its own balance/quota endpoint. cc switch knows
about these (visible in the binary's strings) but doesn't expose them via the
proxy. Query them directly:

| Provider | Endpoint | Key fields |
|----------|----------|------------|
| **Kimi** (kimi-mid/kimi-max) | `GET https://api.kimi.com/coding/v1/usages` (Auth: `Bearer <key>`) | `usage.remaining`, `usage.limit`, `usage.resetTime`, `limits[0].detail` (5h window), `parallel.limit` |
| **BigModel** (zhipu) | `GET https://open.bigmodel.cn/api/monitor/usage/quota/limit` (Auth: `Bearer <key>`) | `data.limits[]` with `type=TOKENS_LIMIT`, `unit=3` (5h) / `unit=6` (7d), `percentage` |
| **DeepSeek** | `GET https://api.deepseek.com/user/balance` (Auth: `Bearer <key>`) | `is_available`, `balance_infos[0].total_balance`, `currency` |
| **Volcengine** (huoshan) | Needs SigV4 signing with AccessKey/Secret from `meta.usage_script` | Complex - use cc switch's built-in query if possible |
| **weekly-z.ai / opus5** | No standard balance API (proxy reseller) | Skip |

See `references/provider-balance-apis.md` for detailed response schemas and edge cases.

## TUI Widget for cc-switch Status

The deliverable is a TUI widget (`/ccswitch` slash command) that docks above
the status bar and shows: current provider, actual model, balance/quota,
proxy stats, and last request details.

### HERMES_HOME path resolution (critical pitfall)

The `hermes-agent` skill's `references/tui-widgets.md` says to put widgets in
`~/.hermes/tui-widgets/`. This is **wrong for profile sessions**. The TUI
scans `$HERMES_HOME/tui-widgets/`, and in a profile session `HERMES_HOME`
resolves to `~/.hermes/profiles/<profile-name>/`, not `~/.hermes/`.

**Always place widgets at:** `$HERMES_HOME/tui-widgets/<name>.mjs`

Check the running TUI's actual `HERMES_HOME`:
```bash
TUI_PID=$(ps aux | grep "entry.js" | grep -v grep | awk 'NR==1{print $2}')
ps eww -p $TUI_PID | tr ' ' '\n' | grep HERMES_HOME
```

### Widget development pattern

1. Write `.mjs` file to `$HERMES_HOME/tui-widgets/<name>.mjs`
2. `/widgets-reload` in TUI to scan (hot-reload also watches the dir)
3. `/<id>` to toggle the ambient widget
4. Test syntax with `node --check <file>` before reloading
5. Test registration with a mock SDK (see `scripts/test-widget.mjs`)

A complete working widget is in `templates/ccswitch.mjs`. It demonstrates:
- `fetch()` for HTTP endpoints (works from Node/Ink runtime)
- `child_process.execSync` for sqlite3 queries
- `React.useState` + `useEffect` for polling state
- Theme tones (`t.color.*`) for all colors - never hardcode hexes
- Stable `Dialog` width to prevent resize while ticking
- `AbortSignal.timeout()` for fetch resilience

## Procedure: Query current upstream

```bash
# 1. Current provider from proxy /status
curl -s http://127.0.0.1:15721/status | python3 -m json.tool

# 2. Actual model from DB
sqlite3 ~/.cc-switch/cc-switch.db "
  SELECT name,
         json_extract(settings_config, '$.env.ANTHROPIC_MODEL') as model,
         json_extract(settings_config, '$.env.ANTHROPIC_BASE_URL') as base_url
  FROM providers WHERE app_type='claude' AND is_current=1;"

# 3. Failover queue
sqlite3 ~/.cc-switch/cc-switch.db "
  SELECT sort_index, name, is_current
  FROM providers WHERE app_type='claude' AND in_failover_queue=1
  ORDER BY sort_index;"

# 4. Last request actual model vs requested model
sqlite3 ~/.cc-switch/cc-switch.db "
  SELECT model, request_model, status_code, latency_ms,
         datetime(created_at, 'unixepoch', 'localtime')
  FROM proxy_request_logs ORDER BY created_at DESC LIMIT 1;"

# 5. Today's cost
sqlite3 ~/.cc-switch/cc-switch.db "
  SELECT SUM(CAST(total_cost_usd AS REAL)) as cost, COUNT(*) as reqs
  FROM proxy_request_logs
  WHERE date(created_at, 'unixepoch') = date('now');"
```

## Procedure: Query provider balance

```bash
# Kimi coding plan quota
KIMI_KEY=$(sqlite3 ~/.cc-switch/cc-switch.db "SELECT json_extract(settings_config, '$.env.ANTHROPIC_AUTH_TOKEN') FROM providers WHERE name='kimi-mid' AND app_type='claude';")
curl -s -H "Authorization: Bearer $KIMI_KEY" https://api.kimi.com/coding/v1/usages | python3 -m json.tool

# BigModel quota
BM_KEY=$(sqlite3 ~/.cc-switch/cc-switch.db "SELECT json_extract(settings_config, '$.env.ANTHROPIC_AUTH_TOKEN') FROM providers WHERE name='BigModel-coding-plan' AND app_type='claude';")
curl -s -H "Authorization: Bearer $BM_KEY" https://open.bigmodel.cn/api/monitor/usage/quota/limit | python3 -m json.tool

# DeepSeek balance
DS_KEY=$(sqlite3 ~/.cc-switch/cc-switch.db "SELECT json_extract(settings_config, '$.env.ANTHROPIC_AUTH_TOKEN') FROM providers WHERE name='deepseek' AND app_type='claude';")
curl -s -H "Authorization: Bearer $DS_KEY" https://api.deepseek.com/user/balance | python3 -m json.tool
```

## Pitfalls

- **HERMES_HOME path** - Widgets in `~/.hermes/tui-widgets/` won't load in a profile session. Always use `$HERMES_HOME/tui-widgets/`. Verify with `ps eww` on the TUI process.
- **`/models` returns empty** - The proxy's `/models` endpoint often returns `{"models":[]}`. This is normal; the proxy ignores model names and routes by failover queue.
- **`/widgets-reload` must run first** - A newly created widget file won't be recognized as a slash command until `/widgets-reload` scans it. If `/<id>` is sent as a plain message, the widget hasn't been loaded yet.
- **Proxy key masking** - The `settings_config` JSON contains plaintext API keys. Never log or display full key values. Always mask in output (`key[:10] + '...'`).
- **Volcengine balance needs SigV4** - Huoshan (volcengine) balance queries require AWS-style SigV4 signing with AccessKey/Secret from `meta.usage_script`, not the inference API key. Skip in widget or use cc switch's built-in Tauri command if available.
- **DeepSeek negative balance** - DeepSeek can show negative balance (`total_balance: "-0.50"`) with `is_available: false`. This means the account is overdrawn; the provider will reject requests.
- **No `cat`/`grep` in terminal** - Use `sqlite3 -json` for DB queries and `python3 -m json.tool` for JSON formatting. The terminal tool blocks piped-to-interpreter commands as a security measure; use `execute_code` for programmatic DB access.

## Verification

After creating/updating a TUI widget:
1. `node --check $HERMES_HOME/tui-widgets/<name>.mjs` - syntax valid
2. `node --input-type=module -e "..."` with mock SDK - register succeeds
3. In TUI: `/widgets-reload` -> should list the file under `loaded:`
4. In TUI: `/<id>` -> ambient widget appears docked above status bar
5. `/<id>` again -> widget dismisses

See `templates/ccswitch.mjs` for a complete working example.
