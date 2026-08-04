---
name: cc-switch-widget
description: "Build TUI widgets for cc-switch proxy monitoring."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [cc-switch, tui, widget, provider, balance, volcengine, signing]
---

# cc-switch TUI Widget

Build a Hermes TUI widget that shows the **actual** upstream provider, model,
and balance/quota for the local cc-switch proxy (`127.0.0.1:15721`). The proxy
ignores the requested model name and routes to whichever provider is currently
active in its failover queue, so the only reliable way to see where requests
land is to query the proxy's `/status` endpoint and the cc-switch SQLite DB.

## When to Use

- User wants to see which upstream provider/model is actually handling requests.
- User wants provider balance/quota displayed in the TUI.
- User asks to "show the real provider" or "display balance" for cc-switch.
- Building any TUI widget that reads from cc-switch's DB or proxy endpoints.

## Prerequisites

- cc-switch (CC Switch.app) running with proxy on `127.0.0.1:15721`.
- Hermes TUI in use (`hermes --tui`).
- Widget file must be at `$HERMES_HOME/tui-widgets/<name>.mjs` (see Pitfalls).

## Data Sources

### 1. Proxy `/status` endpoint (real-time, no auth)

```bash
curl -s http://127.0.0.1:15721/status
```

Returns: `current_provider`, `current_provider_id`, `total_requests`,
`success_requests`, `failed_requests`, `success_rate`, `failover_count`,
`last_request_at`.

### 2. cc-switch SQLite DB (`~/.cc-switch/cc-switch.db`)

Key tables:
- `providers` - `settings_config` JSON has `$.env.ANTHROPIC_MODEL`,
  `$.env.ANTHROPIC_AUTH_TOKEN`, `$.env.ANTHROPIC_BASE_URL`. `meta` JSON has
  `usage_script` config (accessKeyId/secretAccessKey for volcengine).
- `proxy_request_logs` - per-request: model, request_model, tokens, cost, latency.

Current provider's actual model:
```sql
SELECT json_extract(settings_config, '$.env.ANTHROPIC_MODEL') as model,
       json_extract(settings_config, '$.env.ANTHROPIC_BASE_URL') as base_url
FROM providers WHERE app_type='claude' AND is_current=1;
```

### 3. Provider balance APIs

| Provider | Endpoint | Key fields |
|----------|----------|------------|
| **Kimi** | `GET api.kimi.com/coding/v1/usages` (Bearer) | `usage.remaining/limit`, `limits[0].detail` (5h window), `parallel.limit` |
| **BigModel** | `GET open.bigmodel.cn/api/monitor/usage/quota/limit` (Bearer) | `data.limits[]` with `TOKENS_LIMIT`, `unit=3`(5h)/`6`(7d), `percentage` |
| **DeepSeek** | `GET api.deepseek.com/user/balance` (Bearer) | `is_available`, `balance_infos[0].total_balance`, `currency` |
| **Volcengine** | SigV4 POST to `open.volcengineapi.com` | `GetCodingPlanUsage`: session/weekly/monthly percent |
| **weekly-z.ai / opus5** | No balance API | Use usage windows from `proxy_request_logs` |

See `references/volcengine-v4-signing.md` for the Volcengine SigV4 implementation.

### 4. Usage windows fallback (for providers without balance API)

```sql
-- 5h / 7d / monthly from proxy_request_logs
SELECT COUNT(*), SUM(input_tokens), SUM(output_tokens),
       SUM(CAST(total_cost_usd AS REAL))
FROM proxy_request_logs
WHERE provider_id='<id>' AND created_at >= strftime('%s','now','-5 hours');
```

**User preference**: When balance API is unavailable, ALWAYS show 5h/7d/monthly
usage windows - never show "no balance API" or "n/a".

## Procedure

1. Write the widget `.mjs` file to `$HERMES_HOME/tui-widgets/ccswitch.mjs`.
   See `templates/ccswitch.mjs` for a complete working template.
2. Test syntax: `node --check <file>`.
3. Test registration with mock SDK (see Verification section).
4. In TUI: `/widgets-reload` to scan the widget file.
5. In TUI: `/ccswitch` to toggle the docked panel.
6. The widget auto-refreshes every 5 seconds via `React.useState` + `setInterval`.

The widget uses:
- `fetch()` for HTTP endpoints (works from Node/Ink runtime).
- `child_process.execSync` for sqlite3 queries (`sqlite3 -json` output).
- `import('crypto')` for Volcengine V4 signing (Node built-in).
- Theme tones (`t.color.*`) for all colors - never hardcode hexes.
- Stable `Dialog` width to prevent resize while ticking.

## Pitfalls

- **HERMES_HOME path** - In a profile session, `$HERMES_HOME` is
  `~/.hermes/profiles/<profile>/`, NOT `~/.hermes/`. Widget files must go in
  `$HERMES_HOME/tui-widgets/`. Putting them in `~/.hermes/tui-widgets/` will
  silently fail with "no user widgets found". Verify with:
  `ps eww -p <TUI_PID> | tr ' ' '\n' | grep HERMES_HOME`.
- **`/widgets-reload` must run first** - A newly created widget file won't be
  recognized as a slash command until `/widgets-reload` scans it. If `/<id>`
  is sent as a plain message, the widget hasn't been loaded yet.
- **Volcengine SK is NOT base64-decoded** - The `secretAccessKey` in the DB
  looks base64-encoded but must be used as-is (raw string). Do NOT decode it.
  See `references/volcengine-v4-signing.md` for the 5 critical SigV4 differences.
- **Model name mismatch** - Hermes declares `glm-5.2` but cc-switch may route
  to `k3[1M]` (Kimi) or `glm-5.2[1M]` (huoshan). Always read the actual model
  from the DB, not from Hermes config.
- **DeepSeek negative balance** - Can show `total_balance: "-0.50"` with
  `is_available: false`. Check `is_available`, not just the balance number.
- **Proxy key masking** - `settings_config` contains plaintext API keys. Never
  log or display full key values. Always mask (`key[:10] + '...'`).

## Verification

1. `node --check $HERMES_HOME/tui-widgets/ccswitch.mjs` - syntax valid.
2. Mock SDK registration test:
   ```bash
   node --input-type=module -e "
   const url = require('url');
   const fileUrl = url.pathToFileURL('$HERMES_HOME/tui-widgets/ccswitch.mjs').href + '?t=' + Date.now();
   const mod = await import(fileUrl);
   const sdk = { Box:()=>{}, Dialog:()=>{}, React:{useState:(v)=>[v,()=>{}],useEffect:()=>{}},
     Text:()=>{}, defineWidgetApp:(c)=>console.log('OK id='+c.id), h:()=>{},
     openWidget:()=>{}, updateWidget:()=>{}, isCtrl:()=>false,
     sparkline:()=>'', sparkRows:()=>'', gauge:()=>'', hbars:()=>[],
     Shimmer:()=>{}, ShimmerRows:()=>{}, useShimmerPhase:()=>0 };
   mod.default(sdk);
   "
   ```
3. In TUI: `/widgets-reload` -> should list `loaded: ccswitch.mjs`.
4. In TUI: `/ccswitch` -> ambient widget appears docked above status bar.
5. `/ccswitch` again -> widget dismisses.
