---
name: ccswitch-failover-queue-management
description: Reorder ccswitch queue by cost. Use for 成本优先 or 高峰禁用.
triggers:
  - ccswitch 队列排序
  - failover queue order
  - 高峰期禁用 provider
  - peak-time disable provider
  - 成本优先 failover
  - cc switch 排序
  - bgm 高峰禁用
  - codex 模型映射
  - model mapping ccswitch
---

# ccswitch Failover Queue Management

Reorder the ccswitch (`~/.cc-switch/cc-switch.db`) failover queue and
schedule peak-time provider disable/restore via Hermes cron. This is the
**mutating-state** counterpart to `cc-switch-monitoring` (read-only).

Use when the user asks to:
- Reorder the failover queue by **cost priority** (套餐 → 按量便宜 → 按量贵).
- **Disable a provider during peak hours** (e.g. 工作日 14-18h 禁用官方渠道).
- Re-enable a provider off-peak.
- Check the current queue order against intended strategy.
- Configure **model mapping** for codex providers (meta.model_mappings).

DISTINCT from:
- `time-based-model-downgrade` — that switches Hermes profile `model.default`
  on a schedule. This skill switches which **ccswitch provider** is in the
  queue, without touching Hermes configs. Both can coexist.
- `cc-switch-monitoring` — read-only state observation.
- `provider-fallback-chain-management` — Hermes-side `fallback_providers:[]`
  in config.yaml, NOT the ccswitch SQLite queue.

## ccswitch has NO built-in rules engine

Verified 2026-08-04: the ccswitch `settings` table holds only static config
keys (`common_config_*`, `optimizer_config`, etc.). `proxy_config` has no
time/schedule columns. The app binary has no `peak`/`schedule` keywords.
**Any "peak disable" / "priority by time" logic must be implemented on the
Hermes side via cron + direct SQLite writes.** Older memories referencing
"高峰禁用由 cc switch 管" are stale — ccswitch cannot do this.

## Model Mapping (Codex-Specific)

ccswitch supports per-provider model mapping via the `meta.model_mappings`
JSON field. This is **codex-specific** — the claude app uses `ANTHROPIC_MODEL`
env vars instead.

When a codex request specifies `model=glm-5.2`, ccswitch rewrites it based
on the target provider's `meta.model_mappings`:

```json
// Zhipu GLM (glm-5.2 native)
{"glm-5.2":"glm-5.2","k3":"k3","deepseek-v4-flash":"deepseek-v4-flash"}

// MKimi / HKimi (k3 native, maps glm-5.2 to k3)
{"glm-5.2":"k3","k3":"k3","deepseek-v4-flash":"deepseek-v4-flash"}

// DS (deepseek native, maps glm-5.2 to deepseek-v4-flash)
{"glm-5.2":"deepseek-v4-flash","k3":"k3","deepseek-v4-flash":"deepseek-v4-flash"}
```

**Mechanical check**: after any model mapping change, send a test request
and verify `model` in `proxy_request_logs` matches the mapped model:

```bash
curl -X POST http://127.0.0.1:15721/v1/chat/completions \
  -d '{"model":"glm-5.2",...}'
sqlite3 ~/.cc-switch/cc-switch.db \
  "SELECT model, provider_id FROM proxy_request_logs
   WHERE app_type='codex' ORDER BY created_at DESC LIMIT 1"
# Should show model=k3 for MKimi, not glm-5.2
```

## The cost-priority ordering principle

For a queue of subscription + pay-per-use providers, cost-optimal order is:

1. **Subscription / unlimited (sunk cost, marginal = 0)** — use first, exhaust window.
2. **Subscription / quota-limited** — next; limited by 5h/7d windows, not price.
3. **Pay-per-use cheapest** — after all subscription quota.
4. **Pay-per-use premium** — last resort, highest unit price.

ccswitch's `sort_index` ASC = priority (0 is tried first). `is_current=1`
marks the active provider. `in_failover_queue=1` includes in rotation.

## Reordering the queue (one-shot)

```sql
-- Back up first
!cp ~/.cc-switch/cc-switch.db ~/.cc-switch/backups/db_backup_$(date +%Y%m%d_%H%M%S).db

-- Fixed-order assign by name (most reliable — avoids sort_index gaps)
sqlite3 ~/.cc-switch/cc-switch.db <<SQL
PRAGMA busy_timeout=10000;
UPDATE providers SET sort_index = CASE name
    WHEN '<provider-1>' THEN 0
    WHEN '<provider-2>' THEN 1
    WHEN '<provider-3>' THEN 2
    WHEN '<provider-4>' THEN 3
    WHEN '<provider-5>' THEN 4
    WHEN '<provider-6>' THEN 5
END
WHERE app_type='claude' AND in_failover_queue=1;
SQL
```

Use a `CASE name` map rather than relative `sort_index+1` arithmetic —
the arithmetic approach produces gaps and ties when rows have equal starting
indices. The CASE map is idempotent and unambiguous.

## Peak-time disable/restore (cron)

ccswitch's SQLite DB is held open by the running proxy. Two implications:

1. **`PRAGMA busy_timeout=10000;` is mandatory** — without it, writes fail
   with `database is locked (5)`.
2. The script must reassign `is_current` when disabling the active provider,
   otherwise ccswitch keeps routing to a provider that's no longer in the
   queue.

The canonical toggle script is `scripts/ccswitch-peak-toggle.sh`. It takes
`disable | restore | status`:

- `disable` — set `in_failover_queue=0` on the target, clear its `is_current`,
  and promote the next-highest-priority provider to `is_current=1`.
- `restore` — set `in_failover_queue=1`, `sort_index=0`, `is_current=1` on
  the target; demote all others.
- `status` — print the queue (read-only).

Then schedule two `no_agent=True` cron jobs:

```
# Disable at peak start (weekdays 14:00)
schedule: "0 14 * * 1-5"
no_agent: true
script: bash ~/.hermes/profiles/orchestrator/scripts/ccswitch-peak-toggle.sh disable

# Restore at peak end (weekdays 18:00)
schedule: "0 18 * * 1-5"
no_agent: true
script: bash ~/.hermes/profiles/orchestrator/scripts/ccswitch-peak-toggle.sh restore
```

`no_agent=True` means the script's stdout IS the run log — zero LLM cost.
`deliver='local'` is correct: routine infra switches don't need to push to
the user. If the user wants peak-window alerts, set `deliver='weixin'` (or
whichever gateway is connected).

## Verification

After any mutation:

```bash
# 1. Queue state
sqlite3 ~/.cc-switch/cc-switch.db "
SELECT sort_index, name, is_current, in_failover_queue
FROM providers WHERE app_type='claude'
ORDER BY CASE WHEN in_failover_queue=1 THEN 0 ELSE 1 END, sort_index;
" -header -column

# 2. Proxy actually picked up the change
curl -s http://127.0.0.1:15721/status | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["current_provider"], d["success_rate"])'

# 3. Run the disable→restore cycle manually once before trusting cron
bash scripts/ccswitch-peak-toggle.sh disable
sleep 2
bash scripts/ccswitch-peak-toggle.sh status
sleep 2
bash scripts/ccswitch-peak-toggle.sh restore
bash scripts/ccswitch-peak-toggle.sh status
```

Step 3 is critical: the proxy holds the DB open, so a transaction that
acquires a write lock may partially apply. The manual cycle confirms both
directions complete cleanly.

## Pitfalls

### `database is locked` on first restore attempt
The ccswitch proxy process keeps a connection to the DB. A `disable` writes
transactionally; a `restore` fired immediately after can hit lock contention.
**Always prefix writes with `PRAGMA busy_timeout=10000;`** (10s wait). If a
write still fails, `sleep 2-3` between the disable and restore when testing
manually; cron runs hours apart so this only affects ad-hoc testing.

### `sort_index` gaps after restore
A naive `UPDATE ... SET sort_index = sort_index+1 WHERE name!='bgm'` produces
duplicate indices (two providers at index 2) because the CASE expression
evaluates against the pre-update snapshot. Use the fixed `CASE name WHEN ...`
map shown above for any reorder. Verify no ties: `SELECT sort_index, COUNT(*)
FROM providers WHERE in_failover_queue=1 GROUP BY sort_index HAVING COUNT(*)>1`.

### ccswitch does NOT react to DB changes immediately
The proxy caches provider state in memory. A direct DB write does NOT cause
ccswitch to re-read on the next request in all cases. After mutating the
queue, **send one proxied request** (any Hermes call through 127.0.0.1:15721)
to force the proxy to refresh, OR restart the ccswitch app. The `/status`
endpoint reflects the in-memory state, so trust `/status` over a raw DB read
when judging "did the change take effect".

### Don't hardcode provider names in docs/memory
The queue composition and order change over time (providers added/removed,
priorities revised). When asked "what's the current queue", **always query
live** (`sqlite3 ... SELECT` or `curl /status`) — never quote from memory or
a prior session's description. Stale queue descriptions in memory are a
recurring source of confusion.

### Reading provider rows: column set has drifted across versions
Schema checked 2026-09-04 against the live DB and the upstream source
(github.com/farion1231/cc-switch, `src-tauri/src/`): `providers` now also
carries `is_current`, `in_failover_queue`, `sort_index`, `cost_multiplier`,
`limit_daily_usd`, `limit_monthly_usd`, `provider_type`. Queue state query:

```sql
SELECT name, is_current, in_failover_queue, sort_index
FROM providers WHERE app_type='claude' ORDER BY sort_index;
```

For deeper schema questions (config dir location, table meanings, migrations),
`git clone --depth=1` the upstream repo and read `src-tauri/src/` instead of
guessing — the repo is authoritative.

### Proxy smoke test: dummy credentials are fine
The proxy (127.0.0.1:15721) injects the active provider's real key upstream,
so a probe with a **dummy** key works:

```bash
curl -s http://127.0.0.1:15721/v1/messages \
  -H 'content-type: application/json' -H 'anthropic-version: 2023-06-01' \
  -H 'x-api-key: probe' \
  -d '{"model":"glm-5.3-flash[1M]","max_tokens":64,"messages":[{"role":"user","content":"Reply with exactly: OK"}]}'
```

A 200 with a real model reply proves the queue head is alive without touching
any real credential. Anthropic-protocol providers use `/v1/messages`;
`[1M]` model-name suffixes are cc-switch display mappings — the reply's
`model` field shows the resolved real name (`glm-5.3-flash`).

### MGLM ⇆ zcode plan credential identity (verified 2026-09-04)
The claude-channel `MGLM` provider's `ANTHROPIC_AUTH_TOKEN` is byte-identical
to the GLM Coding Plan key in `~/.zcode/v2/config.json`
(`builtin:bigmodel-coding-plan`), and both point at
`https://open.bigmodel.cn/api/anthropic`. Requests routed via cc-switch while
MGLM is queue head therefore consume the zcode plan quota **by official
authorization** — no session-feature emulation needed, and emulation was
declined twice as out of scope. When the user asks to "use the zcode plan
from cc-switch/Hermes", the answer is: keep/re-promote MGLM as queue head,
or use the `zcode` ACP provider (see `acp-provider-selection`).

## Related Skills

- **cc-switch-monitoring** — read-only observation of the same DB + `/status`.
- **time-based-model-downgrade** — time-scheduled Hermes-profile model switch
  (Hermes side), complementing this skill's ccswitch-side scheduling.
- **model-allocation-strategy** / **multi-model-role-allocation** — deciding
  WHICH providers belong in the queue and in what order (cost/intelligence
  analysis). This skill executes the resulting order.
