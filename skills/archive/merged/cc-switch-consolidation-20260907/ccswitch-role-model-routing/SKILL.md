---
name: ccswitch-role-model-routing
description: Use when tracing which model cc-switch routes per role.
triggers:
  - which model cc-switch actually uses
  - cc-switch hermes model passthrough
  - cc-switch role app_type model resolution
  - cc-switch model_mappings verification
  - 命中供应商后实际用的模型
  - hermes 走 cc-switch 实际模型
---

# cc-switch Role → Model Resolution

When a client (Hermes, Codex, Claude Desktop) hits cc-switch at 127.0.0.1:15721, the
**actual upstream model** is decided by the supplier's `app_type` namespace, NOT by a
single global table. This skill is the architecture map; for codex-side mapping *edits*
see `ccswitch-codex-provider-management`.

## `app_type` IS the role

Every provider row is `(id, app_type)` keyed. `app_type` takes values
`claude | claude-desktop | codex | gemini | build | opencode | openclaw | hermes | pi`.
Each app_type is a **fully independent namespace**: its own `is_current`, `sort_index`
queue, `meta.model_mappings`, `settings_config` (native model + modelCatalog), and
`provider_endpoints`. The same physical supplier (e.g. `bgm`) exists as N separate rows
across app_types, each declaring its OWN native model. Never assume a model carries
across roles.

## Per-role model-resolution mechanism (the three cases)

### 1. `hermes` role → TRANSPARENT PASSTHROUGH (the #1 gotcha)

`hermes`-app_type providers have **NO `model_mappings`** in `meta` (verified: 0 matches).
cc-switch does not rewrite `model`; it forwards the client `model` field verbatim upstream.
That field = the Hermes profile's `model.default`. On this cluster every profile sets
`model.default: glm-5.3` + `provider: custom:cc-switch`, so the real model is **glm-5.3**.

**The `model`/`modelCatalog` printed on the hermes provider card in cc-switch DB is a
placeholder synced from Hermes config — it is NOT authoritative for the passthrough path.**
Do not conclude the model from the cc-switch hermes card; read the Hermes profile.

### 2. `codex` role → per-provider `meta.model_mappings` rewrite

cc-switch rewrites the request `model` per target provider via `meta.model_mappings`.
Example shape: `{"glm-5.2":"k3","k3":"k3","deepseek-v4-flash":"deepseek-v4-flash"}`.
A request `model=glm-5.2` to MKimi maps to `k3`; to DS maps to `deepseek-v4-flash`.
Edit recipe lives in `ccswitch-codex-provider-management`.

### 3. `claude` role → `_MODEL` env injection + failover rewriting

claude app_type `meta` has no `model_mappings`; the model is injected via the
`_MODEL` env var (or resolved at the claude client). **However, the current
provider's `_MODEL` env is authoritative — it rewrites the request model
verbatim to the upstream model.** (2026-09-01 实测: `request_model=glm-5.3`
on MGLM got upstream `glm-5.3-flash` 200×60 — the `_MODEL` env `glm-5.3-flash[1M]`
was used, not the client name. This means you CAN send a canonical name like
`glm-5.3` and the provider decides the real model; you do NOT need to register
every possible client model name in cc-switch — only the canonical name must
exist in the provider's `modelCatalog`.)

**Consequence for Hermes routing**: For hermes role (claude-linked profiles),
if you want the provider to pick the real model, keep `model.default` and all
`auxiliary.*.model` at the canonical name that maps to `_MODEL`. Avoid sending
an upstream-specific name (e.g. `glm-5.3-flash`) because it bypasses the
provider's `_MODEL` choice and can break when the upstream changes.

## Decision procedure: "what model will actually be used?"

1. Identify the calling role → the `app_type`.
2. If `hermes`: actual = client `model` = Hermes profile `model.default`. Stop.
3. If `codex`: look up the TARGET provider's `meta.model_mappings`; the mapped value wins, else passthrough.
4. If `claude`: `_MODEL` env, else passthrough.

## Verification (mandatory before claiming a routing conclusion)

See `references/verification.md` for the exact, copy-paste SQL/commands. Key columns:
`proxy_request_logs.model` = forwarded (actual upstream) vs
`proxy_request_logs.request_model` = what the client sent. Mismatch ⇒ mapping applied; match ⇒ passthrough.

**Caveat:** `proxy_request_logs` had **0 rows for `app_type='hermes'`** in this env — the
`proxy_config` table contains only claude/codex/gemini/build rows, so hermes request
logging is off at the proxy level. You therefore CANNOT verify hermes passthrough from
logs; verify it structurally: (a) confirm hermes providers' `meta` lacks `model_mappings`,
and (b) read the Hermes profile `model.default`.

## Pitfalls

- **Don't trust the cc-switch hermes provider card's `model`/`modelCatalog`** — it's a placeholder, not what Hermes sends.
- **Same supplier = N rows across app_types** with different native models. Grepping by `name` without `app_type` will mix them.
- **hermes has no proxy logs** here; don't conclude "nothing routed" — it's a logging gap.
- `model_mappings` is a **codex-only** concept in this cluster; claude/hermes don't use it.

## Related skills
- `ccswitch-codex-provider-management` — codex-side mapping *edits* (this skill is the architecture umbrella; the codex detail feeds into case 2 above).
- `ccswitch-failover-queue-management` (claude side), `cc-switch-monitoring` (read-only).
