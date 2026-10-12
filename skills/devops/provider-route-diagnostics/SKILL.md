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
- An error signature that CHANGES after a config switch (e.g. quota-window 403 → endpoint 404) means the root cause moved to the next hop, not that the route healed. Before declaring "root cause gone" and re-dispatching a crashed card batch, run one minimal end-to-end probe per affected provider surface and require a successful response — the absence of the old error is not evidence.
- A Codex CLI surface routes through `~/.codex/config.toml` (base_url + wire_api), not only cc-switch. `wire_api = "responses"` pointed at an upstream that only serves chat/completions (e.g. a BigModel coding endpoint) fails with `404 Not Found` on `/responses` — fix by switching `wire_api` to `"chat"` or pointing base_url at a responses-capable endpoint. Check this file when ACP codex probes fail while hermes-side routing looks correct.

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

## Session-pinned wire: config edits do NOT reach existing sessions

- A gateway/weixin session snapshots its resolved routing into
  `sessions.model_config.gateway_runtime` (api_mode, provider, base_url,
  fallback_active) at creation time and at every fallback activation.
  Editing config.yaml or .env afterwards only affects NEW sessions — a
  resumed long-lived session replays the stale snapshot forever. Symptom:
  one chat keeps failing with `Codex endpoint /chat/completions ...
  modelCode 不存在` while every other surface on the same profile works.
- Before concluding the config is wrong, read the session row:
  `SELECT model_config FROM sessions WHERE id='<session-id>'` in the
  profile's state.db. Fix in place: rewrite `gateway_runtime.api_mode` to
  the profile's declared api_mode and set `fallback_active=false`; the
  gateway reads the row per turn, no restart needed.
- The pinning mechanism: when a fallback activates and the fallback provider
  entry lacks explicit `api_mode`, wire re-detection can rewrite the
  session's api_mode (e.g. anthropic_messages → chat_completions). An error
  that survives a config edit is the tell — check the session row first.
- Standing guard: `~/.hermes/scripts/session_wire_watchdog.py` scans every
  profile's state.db, compares each open session's pinned api_mode against
  the profile's `custom_providers.cc-switch.api_mode`, reports drift
  (exit 1) or realigns with `--fix` (per-row backups under
  `~/.hermes/backup/session-wire-watchdog/`). Wired two ways: launchd
  `com.hermes.session-wire-watchdog.plist` runs `--fix` every 60 s
  (near-real-time; a full scan is well under a second), plus an hourly
  no-agent cron as an independent alarm/audit trail. launchd pitfall:
  `/usr/bin/python3` fails under launchd with an Xcode-license error
  (exit 69, looks like a silent no-op) — point `ProgramArguments` at the
  Hermes venv python.

## Fallback entries MUST carry explicit api_mode (three-layer rule)

- Every `fallback_providers` entry pointing at cc-switch must declare
  `api_mode: anthropic_messages` explicitly; without it the fallback
  re-detection above can flip the session wire mid-conversation. Fixing
  sessions without fixing fallback entries means the next provider hiccup
  re-pins them.
- The fix must land at THREE layers or a config regen washes it back:
  (1) source `~/.hermes/shared/profiles.yaml` — every
  `provider: custom:cc-switch` fallback entry; (2) template
  `profiles/_shared/config.yaml`; (3) all live `profiles/<name>/config.yaml`.
  Verify with a yaml scan across all three; any single-layer fix is
  temporary. Same layering logic as
  `hermes-profile-config-regression-recovery`.
- `yaml.safe_load` every touched file before declaring done.

## Reporting format

Report: (1) observed route, (2) exact requested ID, (3) upstream catalog evidence, (4) root cause, (5) minimal corrective options, (6) smoke-test result, (7) uncertainty and time window. Redact all credentials and sensitive payloads. Do not recommend merely adding a model name to a local catalog as a fix for an upstream `unknown model` response.

## Auxiliary task routing pitfalls (2026-09 case)

- Auxiliary tasks resolve `auxiliary.<task>.provider/model` from **two different files**: the
  main `~/.hermes/config.yaml` (read by the orchestrator TUI/gateway itself, via
  `load_config_readonly` which always resolves to `$HERMES_HOME/config.yaml`) and the
  per-profile `~/.hermes/profiles/<name>/config.yaml` (read by dispatcher-spawned worker
  processes). A task can be correctly configured in one and fall back to `auto` in the
  other — verify BOTH, never conclude from one file.
- `api_mode: anthropic_messages` alone in an auxiliary block does NOT route to cc-switch;
  without explicit `provider`/`model` the task resolves to `auto` (main provider). Blocks
  with only `api_mode` are half-configured — grep for blocks missing provider/model.
- The generated profile configs are derived from `~/.hermes/shared/profiles.yaml`
  `shared_config.auxiliary` via `generate-configs.py`. Fix the SOURCE first, re-run the
  generator, then hand-patch `~/.hermes/config.yaml` (not generator-managed) and
  `profiles/_shared/config.yaml` separately. Three files must stay in sync.
- Verify with the live resolver, not file contents:
  `python3 -c` script importing `agent.auxiliary_client._resolve_task_provider_model(task)`
  per task; expect provider=custom:cc-switch, model=glm-5.3-flash for all 13 aux tasks.
  Module caches poison re-tests: `del sys.modules[...]` for hermes/agent modules between
  HERMES_PROFILE switches.
- Goal-mode kanban gate silently degrades: `_goal_judge_available()` returns False when the
  judge client can't be built, and `judge_goal` "fails open" to "continue" — a broken
  goal_judge route means goal-mode cards complete without judging, invisibly. Symptom-free
  is not proof of correct routing.
