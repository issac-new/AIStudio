---
name: cc-switch-integration
description: "Query cc-switch to show upstream provider and usage in TUI."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
tags: [cc-switch, tui, widgets, provider, usage, volcengine, kimi, bigmodel, deepseek]
---

# cc-switch Integration

Query the local cc-switch proxy (127.0.0.1:15721) to discover the **actual** upstream provider and model in use — cc-switch ignores the requested model name and routes to whichever provider is currently active in its failover queue. Build TUI widgets that surface this information alongside coding-plan usage quotas.

## When to Use

- User asks to see the actual upstream provider/model in the TUI (not the model Hermes thinks it's using).
- User wants coding plan usage (5h/7d/monthly quotas) displayed in the TUI.
- User wants to build a custom TUI status panel backed by cc-switch data.
- Debugging "which provider am I actually hitting right now?"

## Key Paths

```
~/.cc-switch/cc-switch.db              SQLite DB (providers, request logs, pricing)
~/.cc-switch/logs/cc-switch.log        Proxy log (failover events, request targets)
~/.hermes/profiles/<name>/tui-widgets/  Widget .mjs files (NOT ~/.hermes/tui-widgets/)
```

## Quick Reference

| Task | Reference |
|------|-----------|
| Provider balance/usage API endpoints + field mappings | `references/cc-switch-apis.md` |
| Volcengine V4 signing (5 differences from AWS SigV4) | `references/cc-switch-apis.md#volcengine-v4-signing` |
| TUI widget patterns (auto-dock, zones, fetch) | `references/tui-widget-patterns.md` |
| Complete working cc-switch status widget | `templates/ccswitch.mjs` |

## Data Sources

1. **`GET http://127.0.0.1:15721/status`** — proxy health, `current_provider`, `current_provider_id`, success rate, failover count.
2. **`sqlite3 ~/.cc-switch/cc-switch.db`** — provider `settings_config` JSON (model, token, effort), `meta` JSON (usage_script with accessKeyId/secretAccessKey), `proxy_request_logs` (last request model/latency/status, today's usage).
3. **Provider-specific APIs** — each provider has a different balance/usage endpoint. See `references/cc-switch-apis.md` for the full table.

## Provider Usage APIs (summary)

| Provider | Endpoint | Returns |
|----------|----------|---------|
| kimi-mid/max | `GET api.kimi.com/coding/v1/usages` (Bearer) | `usage`=7d window, `limits[0].detail`=5h window |
| BigModel | `GET open.bigmodel.cn/api/monitor/usage/quota/limit` (Bearer) | `data.limits[TOKENS_LIMIT unit=3]`=5h%, `unit=6`=7d% |
| DeepSeek | `GET api.deepseek.com/user/balance` (Bearer) | `balance_infos[0].total_balance`, `is_available` |
| huoshan (Volcengine) | `POST open.volcengineapi.com` (V4 signed) | `Result.QuotaUsage[]` with `Level`/`Percent` |
| weekly-z.ai / opus5 | No standard balance API | Use `proxy_request_logs` usage stats |

## Volcengine V4 Signing (critical)

Ported from cc-switch Rust source (`src-tauri/src/services/coding_plan.rs`). **Five differences from standard AWS SigV4**:

1. **POST**, not GET
2. Canonical headers use **fixed order**: `host;x-date;x-content-sha256;content-type` (NOT alphabetical)
3. Query includes **`Region` param** alongside `Action` and `Version`
4. SK used **as-is** (the raw string from DB, no base64 decode — even though it looks base64-encoded)
5. Algorithm string is `HMAC-SHA256` (no `AWS4` prefix), scope suffix is `request` (not `aws4_request`)

See `references/cc-switch-apis.md#volcengine-v4-signing` for the complete Node.js implementation.

## Pitfalls

- **Widget file path**: In a profile session, `$HERMES_HOME` = `~/.hermes/profiles/<name>/`, NOT `~/.hermes/`. Widget files must go in `$HERMES_HOME/tui-widgets/`. See `references/tui-widget-patterns.md#path-gotcha`.
- **Volcengine SK**: The `secretAccessKey` in cc-switch DB's `meta.usage_script` looks base64-encoded but is used **as-is** for signing. Do NOT base64-decode it.
- **Kimi field mapping**: `usage` object = 7-day window (NOT total). `limits[0].detail` = 5-hour window. cc-switch source confirms: `usage` → weekly, `limits` → five_hour.
- **Volcengine signing fails with GET**: The API returns 401 SignatureDoesNotMatch if you use GET. Must use POST with empty body.
- **cc-switch has no HTTP API for balance queries**: The Tauri app queries provider APIs directly via Rust. You must replicate the signing in your widget. The GitHub repo is `farion1231/cc-switch`.

## Verification

After creating a widget:
1. `/widgets-reload` — transcript must list the file under `loaded:`
2. `/<id>` — ambient widget appears docked
3. `node --check <file>` — syntax validation before loading
4. `node --input-type=module -e "import ...; mod.default(sdk)"` — register test with mock SDK
