---
name: hermes-moa-configuration
description: "Configure Hermes MoA. Use for /moa or multi-model teams."
---

# Hermes MoA Configuration

Use when the user asks to set up, modify, debug, or explain Hermes Mixture of Agents — the `/moa` command, `hermes moa` CLI, MoA presets, or multi-model "team" routing. NOT for single-model fallback chains (see provider-fallback-chain-management).

## Architecture (verified 2026-08-04)

MoA = N **reference models** (parallel advisors, no tools) → 1 **aggregator** (the acting model, has tools, produces the user-visible answer). Configured as **presets** in `config.yaml` under `moa:`. Triggered by:
- `/moa <prompt>` — one-shot through the default preset, then restores prior model.
- Model picker / `-m moa:<preset>` — entire session uses that preset.

The aggregator is NOT also a reference (avoid role duplication).

## Critical Constraint: ccswitch Cannot Parallelize

ccswitch (`127.0.0.1:15721`) is a **single-port, single-active-provider** proxy. Its SQLite schema has one `listen_port`; only one provider is `is_current` at a time. MoA's reference fan-out needs **concurrent** calls to different models — impossible through ccswitch.

**Solution:** register direct providers in `custom_providers:` (bypassing ccswitch), one per MoA model. The reference fan-out resolves each slot via `resolve_runtime_provider` to the provider's real `base_url`/`api_key`/`api_mode`.

## Setup Steps

1. **Extract credentials** from ccswitch DB (UI masks tokens like `sk-kim…sGPW`; read raw via `sqlite3 ~/.cc-switch/cc-switch.db` + Python `json.loads(settings_config)['env']['ANTHROPIC_AUTH_TOKEN']`).
2. **Verify each token** with `curl` against the provider's `/v1/messages` endpoint BEFORE writing config (catches stale tokens early).
3. **Register direct providers** in the active profile's `config.yaml` (NOT root `~/.hermes/config.yaml` — check `hermes config path` for the real path; under multiplex it's `~/.hermes/profiles/<profile>/config.yaml`). Each entry needs `name`, `base_url`, `api_key`, `api_mode: anthropic_messages`, `context_length`, and a `models:` map.
4. **Define presets** under `moa:`. Slot format: `{provider: <direct-provider-name>, model: <id>, enabled: true}`. Set `default_preset`.
5. **Verify:** `hermes moa list` must show your presets with the right refs/aggregator. `Active in config: (off)` is correct for on-demand use.
6. **Test:** `hermes chat -q "<simple prompt>" -m 'moa:<preset>' --cli -v`. Check logs for `Reference N/M` lines (fan-out) and the final aggregator call.

## Pitfalls

### 1. Wrong config file (MOST COMMON)
`HERMES_HOME` under multiplex points to `~/.hermes/profiles/<profile>/`, so `hermes config path` returns the PROFILE config, not root. Editing `~/.hermes/config.yaml` silently no-ops. Always run `hermes config path` first.

### 2. ccswitch token masking
ccswitch's UI and `settings_config` display masks `sk-…` tokens (`sk-kim…sGPW`). The masked form is INVALID at the API. Read the full token via direct sqlite3 + Python json parse. Tokens WITHOUT the `sk-` prefix (e.g. bigmodel's `231c2864…`) are NOT masked.

### 3. bigmodel `/api/anthropic` URL rewrite bug (Hermes source)
`agent/auxiliary_client.py`'s `_to_openai_base_url` rewrites any URL containing `bigmodel` and ending `/anthropic` to `/api/paas/v4` (the OpenAI-wire billing channel). This breaks providers declared with `api_mode: anthropic_messages`, because `/paas/v4` rejects anthropic-shaped requests (returns `余额不足` / 401 — it's a different billing channel).

**Fix applied (2026-08-04, may need re-applying after `hermes update`):** patched `_maybe_wrap_anthropic` to revert `/api/paas/v4` → `/api/anthropic` when `api_mode == "anthropic_messages"`. Verify with `grep "reverted ZAI base_url" ~/.hermes/hermes-agent/agent/auxiliary_client.py`. See `references/bigmodel-url-rewrite-bug.md`.

### 4. bigmodel anthropic SDK 401 (UNRESOLVED)
Even after fixing the URL (pitfall #3), the **anthropic Python SDK** returns 401 against `https://open.bigmodel.cn/api/anthropic/v1/messages` with the same token that succeeds via `curl` (both `x-api-key` and `Authorization: Bearer` headers work in curl). Suspected cause: SDK-added headers (`anthropic-version`, `anthropic-beta`, `user-agent`) trigger server-side validation. **This blocked the `complex` preset's glm-5.2 aggregator.** Do NOT present bigmodel-as-aggregator as validated. Workaround candidates (untested): use bigmodel on its OpenAI wire with a paid balance, or pick a different aggregator.

### 5. k3 reference fan-out WORKS
The `moa-kimi` direct provider (api.kimi.com/coding, anthropic_messages) successfully served as a reference model — logs showed `Reference 1/1 — moa-kimi:k3` returning valid output and `POST https://api.kimi.com/coding/v1/messages 200 OK`. This path is validated.

## User Preferences (this user)

- **NEVER auto-start MoA.** Only trigger when the user explicitly says "use MoA" / `/moa` / `-m moa:<preset>`. MoA is expensive (3+ model calls per turn). Keep `active_preset: ""` (off) in config.
- **No "main model" concept for daily routing.** Daily traffic flows through ccswitch's failover queue; the active provider is whatever ccswitch currently has active. Do NOT hardcode the ccswitch queue order or current provider in docs/memory — query ccswitch live (`curl 127.0.0.1:15721/status` or `sqlite3 ~/.cc-switch/cc-switch.db`) when you need the real state.

## References
- `references/current-presets.md` — the exact `complex`/`ultra` preset YAML and 3 direct providers (session-specific).
- `references/bigmodel-url-rewrite-bug.md` — the `_to_openai_base_url` source bug, patch diff, and verification command.
