---
name: hermes-moa-configuration
version: 1.3.0
description: "Configure Hermes MoA. Use for /moa or multi-model teams."
---

# Hermes MoA Configuration

Use when the user asks to set up, modify, debug, or explain Hermes Mixture of Agents — the `/moa` command, `hermes moa` CLI, MoA presets, or multi-model "team" routing. NOT for single-model fallback chains (see provider-fallback-chain-management).

## Architecture (verified 2026-08-04, re-verified 2026-09-30)

MoA = N **reference models** (parallel advisors, no tools) → 1 **aggregator** (the acting model, has tools, produces the user-visible answer). Configured as **presets** in `config.yaml` under `moa:`. Triggered by:
- `/moa <prompt>` — one-shot through the default preset, then restores prior model.
- Model picker / `-m moa:<preset>` — entire session uses that preset.

The aggregator is NOT also a reference (avoid role duplication).

## Config schema (from hermes_cli/moa_config.py, config v49)

```yaml
moa:
  presets:
    <name>:
      reference_models:        # list of slots
        - provider: custom:<name>
          model: <model-id>
          enabled: true
      aggregator: {provider: ..., model: ...}
      fanout: user_turn            # | per_iteration | every_n:<N>
      degraded_reference_policy: loud  # | silent
      reference_temperature: null      # optional floats
      aggregator_temperature: null
      reference_timeout: null
  default_preset: <name>
  active_preset: ""   # keep empty = on-demand only
```

- Slot `provider` accepts BOTH bare name and `custom:`-prefixed slug (`custom_provider_aliases`); `hermes moa list` shows canonical `custom:` form.
- A missing/invalid `moa:` section falls back to code defaults (openai-codex+openrouter refs, openrouter opus aggregator) — `hermes moa list` showing a `default` preset does NOT mean it exists in your config.
- `auxiliary.moa_aggregator`/`moa_reference` in config.yaml are separate per-task routing hints (aim placeholder), unrelated to preset slots.
- Valid custom_providers entry fields (`_VALID_CUSTOM_PROVIDER_FIELDS`, hermes_cli/config.py): `name, base_url, api_key, api_mode, model, models, context_length, rate_limit_delay, extra_body, ssl_ca_cert, ssl_verify, key_env, catalog_provider`. Valid api_mode: `chat_completions | anthropic_messages | codex_responses | bedrock_converse`.

## Synthesis Fallacy Filters (aggregator-side, added 2026-09-08)

Before presenting a synthesized answer, run three fallacy filters on the claims being merged from reference outputs:

1. **Appeal to authority (诉诸权威)** — a claim backed only by "model X / official docs say so" without measurement stays flagged, never promoted to consensus.
2. **Slippery slope (滑坡)** — a chain of unmediated consequences drawn from one data point gets cut back to the single step the evidence actually supports.
3. **False dilemma (假两难)** — a forced either/or across reference outputs is checked for a third path before the aggregator picks a side.

Source: synthesis-fusion-plan.md C1附属 / philosophy-logic-report.md §2.2 S12/S13/S14 (Copi, Introduction to Logic — fallacy checklist, three-source consistent; filter framework only).

## Critical Constraint: ccswitch Cannot Parallelize

ccswitch (`127.0.0.1:15721`) is a **single-port, single-active-provider** proxy. Its SQLite schema has one `listen_port`; only one provider is `is_current` at a time. MoA's reference fan-out needs **concurrent** calls to different models — impossible through ccswitch.

**Solution:** register direct providers in `custom_providers:` (bypassing ccswitch), one per MoA model. The reference fan-out resolves each slot via `resolve_runtime_provider` to the provider's real `base_url`/`api_key`/`api_mode`.

## Wire choice per upstream (2026-09-30 user ruling: ALL-MoA anthropic wire, direct, no cc-switch)

User ruling 2026-09-30: every MoA model (references AND aggregator) uses the anthropic protocol via DIRECT providers — nothing in a MoA preset routes through cc-switch. Verified end-to-end after the change.

- **bigmodel (MGLM)**: `api_mode: anthropic_messages` + `base_url: https://open.bigmodel.cn/api/anthropic` (user-mandated canonical URL). Real-call 200 verified for glm-5.3 AND glm-5.3-flash on this wire, including through the anthropic **Python SDK** inside Hermes (`参考 1/3` + aggregator both served 2026-09-30). The 2026-08 "anthropic SDK 401" pitfall is NO LONGER reproducible — treat it as historical, do not route around it.
- **kimi (MK256)**: `api_mode: anthropic_messages` + `base_url: https://api.kimi.com/coding` (NO trailing `/v1` — the client appends `/v1/messages`; auxiliary_client.py L5192-L5199 passes the ORIGINAL un-rewritten URL to the anthropic SDK for named custom providers). Model id: `k3`.
- **MiMo**: `api_mode: anthropic_messages` + `base_url: https://token-plan-cn.xiaomimimo.com/anthropic`. Model id: `mimo-v2.6-pro`.
- The 2026-08-04 `_maybe_wrap_anthropic` URL-revert source patch is OBSOLETE (upstream rewrote `_to_openai_base_url`; `grep "reverted ZAI base_url"` finds nothing). Do not re-apply.
- Fallback wire if bigmodel anthropic ever regresses: `chat_completions` + `https://open.bigmodel.cn/api/coding/paas/v4` (was 200-verified 2026-09-30) — but the standing ruling is anthropic wire.
- Context lengths: glm-5.3 / k3 / mimo-v2.6-pro all 1M → `context_length: 1048576`; moa-mglm entry uses 1003520 (conservative, bigmodel coding-plan cap).

## Official thinking-parameter alignment (2026-09-30, vendor docs + A/B probes)

Ruling: max thinking per slot MUST match each vendor's official API semantics — never route through Hermes internal effort levels that map differently per wire. Verified per vendor (docs.bigmodel.cn, platform.kimi.ai, mimo.mi.com deep-thinking page):

| vendor | official thinking contract | max = | slot config |
|--------|---------------------------|-------|-------------|
| GLM-5.3 / -5.3-flash (bigmodel) | thinking FORCED on (disabled → API error); `reasoning_effort` low/high/**max**; **unset defaults to max** ("未传入时默认为 max"); Coding-Personal wire maps xhigh/max→max | omit ALL thinking params | no `reasoning_effort` on slot |
| Kimi K3 (coding anthropic wire) | always thinks; adaptive contract, default **high** (NOT max); `output_config.effort` low/high/max | explicit max | `reasoning_effort: max` (kimi-family check in anthropic_adapter maps Hermes max → `output_config.effort: max` verbatim; A/B: default 995 vs max 1621 thinking chars) |
| MiMo v2.6 (pro/flash) | binary thinking on/off only, **on by default** = its max; no effort ladder | omit | no `reasoning_effort` on slot |

### Anti-patterns (each verified to REDUCE thinking below vendor max)

- Do NOT set `reasoning_effort: ultra|xhigh|high|medium` on GLM or MiMo slots: any injected reasoning config makes the anthropic adapter send `thinking.budget_tokens` (THINKING_BUDGET, no `max` key → ultra/max/high clamp → **8000 = medium tier**), overriding the vendor's stronger unset-default max. A/B: glm-5.3 unset-default 1110 thinking chars vs explicit budget 32000 → 866.
- Do NOT leave k3 unconfigured: coding-wire default is high, not max — explicit `reasoning_effort: max` is required (+63% thinking in A/B).
- Aggregator slots INHERIT `agent.reasoning_effort` (ultra here) when unset → same budget-8000 downgrade. Fix: `reasoning_effort: none` on the aggregator slot → `_accepts_thinking_disable("glm-5.3-flash")` is False (non-Claude) → Hermes sends NO thinking field → bigmodel unset-default max applies. Safe: the omission branch is hardcoded, `thinking: disabled` is never sent to GLM.
- MiMo official note: thinking mode ignores custom temperature/top_p (forced 1.0/0.95).

Config state 2026-09-30: k3 slot `reasoning_effort: max`; glm-5.3, mimo-v2.6-pro, aggregator slots unset/`none` → all four slots at vendor-official max. E2E `k3[reasoning=max]` label confirmed in transcript.

## Setup Steps

1. **Extract credentials** from cc-switch. 2026-09-30: NEW cc-switch masks tokens even inside its own DB `settings_config` (literal `sk-kim…sGPW` in stored JSON). Recovery sources, in probe order:
   - `proxy_live_backup.original_config` (JSON) — full token of the live-takeover provider (49-char bigmodel token found here).
   - `~/.cc-switch/backups/hermes/*.yaml` — full plaintext keys from before masking began (kimi key recovered from the 2026-07-20 backup; recovered-key tail must match the current masked tail).
   - Unmasked providers (MiMo `tp-…`) still store full tokens in `settings_config`.
   - Staging: write keys to `$HERMES_HOME/cache/scratch/moa-keys.json` (chmod 600; scratch auto-prunes after 24h), delete right after the config write.
2. **Verify each token** with a REAL API call (urllib POST; all three in ~9s) BEFORE writing config. Anthropic-style: POST `{base}/v1/messages` with `x-api-key` + `anthropic-version: 2023-06-01`; OpenAI-style: POST `{base}/chat/completions` with Bearer.
3. **Register direct providers** in the active profile's `config.yaml` (NOT root `~/.hermes/config.yaml` — `hermes config path` confirms; under multiplex it's `~/.hermes/profiles/<profile>/config.yaml`). Each entry needs `name`, `base_url`, `api_key`, `api_mode`, `context_length`, and a `models:` map. `hermes doctor` will warn "Legacy custom_providers entry has no providers: twin" — cosmetic; the retired list store is still read; keep the fleet-uniform list form (the cc-switch entry uses it too).
4. **Define presets** under `moa:`. Set `default_preset`; keep `active_preset: ""` (off).
5. **Verify:** `hermes moa list` shows presets with the right refs/aggregator (`*` marks default). `Active in config: (off)` is correct for on-demand use.
6. **Test:** `hermes chat -q "<simple prompt>" -m 'moa:<preset>' --cli -v`. Expect `参考 N/3 — custom:moa-<x>:<model>` lines for each reference + a final aggregator answer.

## Current heavy preset (2026-09-30, all-anthropic direct, verified end-to-end)

References: MGLM `glm-5.3` (moa-mglm), MK256 `k3` (moa-mk256), MiMo `mimo-v2.6-pro` (moa-mimo). Aggregator: moa-mglm `glm-5.3-flash` — direct bigmodel anthropic wire, NOT cc-switch (user ruling 2026-09-30). Daily non-MoA traffic still flows through cc-switch/aim unchanged. E2E test 2026-09-30 post-change: 3 refs + aggregator all served via anthropic wire in ~26s (context limit 1,003,520 in the transcript confirms the aggregator resolved to moa-mglm). See `references/current-presets.md`.

## Pitfalls

### 1. Wrong config file (MOST COMMON)
`HERMES_HOME` under multiplex points to `~/.hermes/profiles/<profile>/`, so `hermes config path` returns the PROFILE config, not root. Editing `~/.hermes/config.yaml` silently no-ops. Always run `hermes config path` first.

### 2. ccswitch token masking (extended 2026-09-30)
Masking now extends INTO the DB (`settings_config` stores literal `sk-kim…sGPW`). Old advice ("read raw via sqlite3") only works for unmasked providers. See credential recovery sources in Setup Step 1.

### 3. bigmodel wire — resolved by user ruling (2026-09-30)
Canonical wire is `https://open.bigmodel.cn/api/anthropic` + `anthropic_messages`, SDK path included (re-verified 2026-09-30; the 2026-08 SDK-401 no longer reproduces). The old source patch is gone (upstream rewrote the function); named-custom `anthropic_messages` providers get their original URL anyway (auxiliary_client.py L5192-L5199).

### 4. kimi base_url trailing path
Use `https://api.kimi.com/coding` — the client appends `/v1/messages`. Writing `/coding/v1` double-appends. (Hand-probing with curl works against `/coding/v1/messages` directly.)

## User Preferences (this user)

- **NEVER auto-start MoA.** Only trigger when the user explicitly says "use MoA" / `/moa` / `-m moa:<preset>`. MoA is expensive (3+ model calls per turn). Keep `active_preset: ""` (off) in config.
- **No "main model" concept for daily routing.** Daily traffic flows through ccswitch's failover queue; the active provider is whatever ccswitch currently has active. Do NOT hardcode the ccswitch queue order or current provider in docs/memory — query ccswitch live (`curl 127.0.0.1:15721/status` or `sqlite3 ~/.cc-switch/cc-switch.db`) when you need the real state.

## References
- `references/current-presets.md` — the exact `heavy` preset YAML and 3 direct providers (2026-09-30, end-to-end verified).
- Official docs: docs.bigmodel.cn/cn/guide/capabilities/thinking (GLM reasoning_effort mapping), platform.kimi.ai/docs/guide/use-reasoning-effort (K3 low/high/max, default max on open platform / high on coding wire), mimo.mi.com deep-thinking (binary thinking, default on).
