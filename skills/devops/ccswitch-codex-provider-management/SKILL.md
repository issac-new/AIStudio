---
name: ccswitch-codex-provider-management
description: Codex-side ccswitch provider add/reorder/model-mappings.
triggers:
  - ccswitch codex provider
  - codex 模型映射
  - codex queue alignment
  - add codex provider ccswitch
  - codex model_mappings
---

# ccswitch Codex Provider Management

Add, reorder, and configure **codex-side** providers in ccswitch
(`~/.cc-switch/cc-switch.db`). This is the codex counterpart to
`ccswitch-failover-queue-management` (which lives in the `default` profile
and is protected). Use when the user asks to:

- Add a new codex provider (e.g. DS deepseek) to match the claude queue.
- Align codex queue ordering with claude queue rules.
- Configure codex model mappings (`meta.model_mappings`).
- Diagnose why a codex provider addition isn't being picked up.

DISTINCT from:
- `ccswitch-failover-queue-management` (default profile, protected) — covers
  claude-side queue reordering + peak-time cron. This skill covers the codex
  side which has its own queue and a different `settings_config` shape.
- `cc-switch-monitoring` — read-only.

## app_type queues are independent

`app_type='claude'` and `app_type='codex'` have **separate** queues,
`is_current`, and `sort_index` namespaces. Reordering claude does NOT touch
codex. When the user says "align codex with claude rules", the work happens
on the codex rows only:

```sql
SELECT id, name, sort_index, is_current, in_failover_queue
FROM providers WHERE app_type='codex' ORDER BY sort_index;
```

The codex queue mirrors claude ordering (bgm/MKimi/HKimi/DS) but has its own
`meta.model_mappings` and `codexChatReasoning` blocks the claude side does
not need.

## Adding a new codex provider (full recipe)

A codex provider row is NOT just `settings_config` — it needs **four pieces**:

### 1. `providers` row with full JSON shape

The `settings_config` is one escaped JSON string containing `auth`, `config`
(TOML), and `modelCatalog`:

```json
{
  "auth": {"OPENAI_API_KEY": "sk-..."},
  "config": "model_provider = \"custom\"\nmodel = \"<model>\"\ndisable_response_storage = true\n\n[model_providers.custom]\nname = \"OpenAI\"\nbase_url = \"<upstream-url>\"\nwire_api = \"responses\"\nrequires_openai_auth = true\n",
  "modelCatalog": {"models": [{"model": "<model>", "displayName": "<model>", "contextWindow": 1000000}]}
}
```

### 2. `meta` JSON

Must include `apiFormat:"openai_chat"` and the codexChatReasoning block
(copy from an existing codex provider):

```json
{
  "commonConfigEnabled": false,
  "endpointAutoSelect": true,
  "apiFormat": "openai_chat",
  "codexChatReasoning": {
    "supportsThinking": true,
    "supportsEffort": true,
    "thinkingParam": "thinking",
    "effortParam": "reasoning_effort",
    "effortValueMode": "passthrough",
    "outputFormat": "auto"
  }
}
```

### 3. `provider_endpoints` row

```sql
INSERT INTO provider_endpoints (provider_id, app_type, url, added_at)
VALUES ('<provider-id>', 'codex', '<upstream-url>', strftime('%s','now'));
```

Without this the proxy cannot route to the provider.

### 4. Restart the CC Switch app

```bash
pkill -f cc-switch && sleep 2 && open -a "CC Switch"
```

**Critical pitfall**: New provider rows are NOT picked up from DB writes
alone. The in-memory cache only reloads on restart for newly inserted
provider ids. (Updates to *existing* rows DO get picked up on the next
request.) After restart, send one test request and verify with
`proxy_request_logs`.

## Codex model mappings

ccswitch rewrites the request's `model` field per-provider via
`meta.model_mappings`. This is **codex-specific** — the claude app uses
`ANTHROPIC_MODEL` env vars instead.

When a codex request specifies `model=glm-5.2`, ccswitch rewrites it based
on the target provider's `meta.model_mappings`:

```json
// bgm / Zhipu GLM (glm-5.2 native)
{"glm-5.2":"glm-5.2","k3":"k3","deepseek-v4-flash":"deepseek-v4-flash"}

// MKimi / HKimi (k3 native, maps glm-5.2 to k3)
{"glm-5.2":"k3","k3":"k3","deepseek-v4-flash":"deepseek-v4-flash"}

// DS (deepseek native, maps glm-5.2 to deepseek-v4-flash)
{"glm-5.2":"deepseek-v4-flash","k3":"k3","deepseek-v4-flash":"deepseek-v4-flash"}
```

Apply via:

```sql
UPDATE providers SET meta = json_set(
  meta, '$.model_mappings',
  json('{"glm-5.2":"k3","k3":"k3","deepseek-v4-flash":"deepseek-v4-flash"}')
) WHERE app_type='codex' AND id='<provider-id>';
```

**Mechanical verification** (mandatory after any mapping change):

```bash
curl -X POST http://127.0.0.1:15721/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-5.2","messages":[{"role":"user","content":"ping"}],"max_tokens":1}'

sqlite3 ~/.cc-switch/cc-switch.db \
  "SELECT model, request_model, provider_id, status_code
   FROM proxy_request_logs WHERE app_type='codex'
   ORDER BY created_at DESC LIMIT 1"
# Should show model=<mapped-model> for the target provider, not the request model
```

## Peak-time disable (meta-level marker only)

Codex providers support `meta.peak_disabled_hours` as a JSON marker:

```sql
UPDATE providers SET meta = json_set(
  meta, '$.peak_disabled_hours',
  json('{"enabled":true,"weekdays":[1,2,3,4,5],"hours":[9,10,11,14,15,16,17],"note":"工作日高峰期禁用"}')
) WHERE app_type='codex' AND id='<provider-id>';
```

**Important**: ccswitch has NO built-in scheduler that reads this field.
The marker alone does NOT disable anything at peak time. The actual
enforcement requires the same cron-based toggle script as the claude side
(see `ccswitch-failover-queue-management` in the default profile). The meta
field is documentation/routing intent only.

## Pitfalls

### Provider name changes mid-session
ccswitch lets the user rename providers (e.g. "Zhipu GLM" → "bgm") via the
UI. Any SQL using `WHERE name='Zhipu GLM'` will silently match 0 rows after
a rename. **Always query live by name first**, or use the provider `id` which
is stable.

### FO-001 failover fires on the current provider's 401
When the current codex provider (e.g. bgm) returns 401, ccswitch's failover
switch logs `[FO-001] 切换: codex → <next-provider>` and promotes the next
in the queue. This is automatic; the failed provider's `is_current` is
cleared. After the user fixes the API key, you may need to manually set
`is_current=1` back on the original provider and `is_current=0` on the
promoted one, then restart.

### codex proxy_request_logs has both `model` and `request_model`
`request_model` = what the client sent (e.g. `glm-5.2`), `model` = what was
actually forwarded upstream after mapping (e.g. `k3`). When verifying model
mappings, compare these two columns; a mismatch means the mapping worked.
A match means the request was passed through unchanged.

## Related Skills

- `ccswitch-failover-queue-management` (default profile) — claude-side queue
  reordering + peak cron. Protected; do not edit from orchestrator.
- `cc-switch-monitoring` — read-only observation of the same DB.
- `cc-switch-provider-troubleshooting` — 503 / circuit-breaker diagnosis.
