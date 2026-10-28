---
name: hermes-moa-configuration
version: 1.5.0
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

ccswitch (`127.0.0.1:15721`) is a **single-port, single-active-provider** proxy. Its SQLite schema has one `listen_port`; only one provider is `is_current` at a time. MoA's reference fan-out needs **concurrent** calls to different models — impossible through ccswitch. Worse, it fails SILENTLY on the wrong model: a proxied call naming `MiniMax-M3` returned the ACTIVE provider's model with HTTP 200 — never validate a new provider's key or model through the proxy; always direct-connect to the provider's own `base_url`.

**Solution:** register direct providers in `custom_providers:` (bypassing ccswitch), one per MoA model. The reference fan-out resolves each slot via `resolve_runtime_provider` to the provider's real `base_url`/`api_key`/`api_mode`.

## Wire choice per upstream (2026-09-30 user ruling: ALL-MoA anthropic wire, direct, no cc-switch)

User ruling 2026-09-30: every MoA model (references AND aggregator) uses the anthropic protocol via DIRECT providers — nothing in a MoA preset routes through cc-switch. Verified end-to-end after the change.

- **bigmodel (MGLM)**: `api_mode: anthropic_messages` + `base_url: https://open.bigmodel.cn/api/anthropic` (user-mandated canonical URL). Real-call 200 verified for glm-5.3 AND glm-5.3-flash on this wire, including through the anthropic **Python SDK** inside Hermes (`参考 1/3` + aggregator both served 2026-09-30). The 2026-08 "anthropic SDK 401" pitfall is NO LONGER reproducible — treat it as historical, do not route around it.
- **kimi (MK256)**: `api_mode: anthropic_messages` + `base_url: https://api.kimi.com/coding` (NO trailing `/v1` — the client appends `/v1/messages`; auxiliary_client.py L5192-L5199 passes the ORIGINAL un-rewritten URL to the anthropic SDK for named custom providers). Model id: `k3`.
- **MiMo**: `api_mode: anthropic_messages` + `base_url: https://token-plan-cn.xiaomimimo.com/anthropic`. Model id: `mimo-v2.6-pro`.
- **StepFun**: `api_mode: anthropic_messages` + `base_url: https://api.stepfun.com/step_plan` (NO trailing `/v1` — the client appends `/v1/messages`). Model id: `step-5-preview`, 1M context. Direct anthropic-style POST 200-verified; response carries a thinking block with zero thinking config.
- **MiniMax**: `api_mode: anthropic_messages` + `base_url: https://api.minimax.cn/anthropic`. Model id: `MiniMax-M3`, 1M context. Direct POST 200-verified (direct answer, no thinking block — see thinking table).
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
| StepFun step-5-preview | thinking ON by default when no thinking params are sent | unset | no `reasoning_effort` on slot |
| MiniMax-M3 | thinking **OFF** by default; official contract gates it on via `adaptive` — Hermes effort→MiniMax thinking mapping UNVERIFIED | open | first cut: omit the param; A/B `adaptive` injection before pinning a slot value |

### Anti-patterns (each verified to REDUCE thinking below vendor max)

- Do NOT set `reasoning_effort: ultra|xhigh|high|medium` on GLM or MiMo slots: any injected reasoning config makes the anthropic adapter send `thinking.budget_tokens` (THINKING_BUDGET, no `max` key → ultra/max/high clamp → **8000 = medium tier**), overriding the vendor's stronger unset-default max. A/B: glm-5.3 unset-default 1110 thinking chars vs explicit budget 32000 → 866.
- Do NOT leave k3 unconfigured: coding-wire default is high, not max — explicit `reasoning_effort: max` is required (+63% thinking in A/B).
- Aggregator slots INHERIT `agent.reasoning_effort` (ultra here) when unset → same budget-8000 downgrade. Fix: `reasoning_effort: none` on the aggregator slot → `_accepts_thinking_disable("glm-5.3-flash")` is False (non-Claude) → Hermes sends NO thinking field → bigmodel unset-default max applies. Safe: the omission branch is hardcoded, `thinking: disabled` is never sent to GLM.
- MiMo official note: thinking mode ignores custom temperature/top_p (forced 1.0/0.95).

Config state 2026-09-30: k3 slot `reasoning_effort: max`; glm-5.3, mimo-v2.6-pro, aggregator slots unset/`none` → all four slots at vendor-official max. E2E `k3[reasoning=max]` label confirmed in transcript.

## Setup Steps

1. **Extract credentials** — probe recovery sources LIVE before trusting any list; they go stale (all three 2026-09-30 sources were later verified dead: `proxy_live_backup` empty, `~/.cc-switch/backups/hermes/` gone, MiniMax masked in every DB copy). Current probe order:
   - cc-switch DB `providers` rows of type `hermes` (MoA providers registered into cc-switch) — these kept FULL plaintext keys after cc-switch masked its own native entries (a 72-char kimi key was recovered from a `moa-*` row there).
   - cc-switch DB `settings_config` for still-unmasked providers (MiMo `tp-…`).
   - Local backups — but grep each wanted value for `__ROTATED-YYYYMMDD__` placeholders first: key-rotation batch scripts rewrite backups in place (many backups sharing one identical mtime second = batch-rewrite fingerprint).
   - Masked everywhere (MiniMax and DeepSeek both hit this): ask the user for the key; verify its tail matches the masked tail before use. Two sources are structurally barren — cc-switch request logs record URLs only (never auth headers) and the desktop app's WebKit localstorage holds UI state — skip them early instead of grepping.
   - Staging: write keys to `$HERMES_HOME/cache/scratch/moa-keys.json` (chmod 600; scratch auto-prunes after 24h), delete right after the config write.
2. **Verify each token** with a REAL API call (urllib POST; all three in ~9s) BEFORE writing config. Anthropic-style: POST `{base}/v1/messages` with `x-api-key` + `anthropic-version: 2023-06-01`; OpenAI-style: POST `{base}/chat/completions` with Bearer.
3. **Register direct providers** in the active profile's `config.yaml` (NOT root `~/.hermes/config.yaml` — `hermes config path` confirms; under multiplex it's `~/.hermes/profiles/<profile>/config.yaml`). Each entry needs `name`, `base_url`, `api_key`, `api_mode`, `context_length`, and a `models:` map. `hermes doctor` will warn "Legacy custom_providers entry has no providers: twin" — cosmetic; the retired list store is still read; keep the fleet-uniform list form (the cc-switch entry uses it too).
4. **Define presets** under `moa:`. Set `default_preset`; keep `active_preset: ""` (off).
5. **Verify:** `hermes moa list` shows presets with the right refs/aggregator (`*` marks default). `Active in config: (off)` is correct for on-demand use.
6. **Test:** `hermes chat -q "<simple prompt>" -m 'moa:<preset>' --cli -v`. Expect `参考 N/3 — custom:moa-<x>:<model>` lines for each reference + a final aggregator answer.

## Current heavy preset (2026-10-18, all-anthropic direct, 6 refs, all max-thinking, E2E verified)

References: MGLM `glm-5.3` (moa-mglm), MK256 `k3` (moa-mk256), MiMo `mimo-v2.6-pro` (moa-mimo), StepFun `step-5-preview` (moa-stepfun), MiniMax `MiniMax-M3` (moa-minimax), DeepSeek `deepseek-v4-pro` (moa-deepseek). Aggregator: moa-mglm `glm-5.3-flash` — direct bigmodel anthropic wire, NOT cc-switch (user ruling 2026-09-30). Daily non-MoA traffic still flows through cc-switch/aim unchanged. E2E re-verified 2026-10-18 with the DeepSeek slot: `参考 6/6` fan-out, per-slot final request bodies inspected, answer correct, rc=0. kimi slot currently 401 (key revoked, awaiting user re-issue) — preset runs degraded 5/6.

User ruling 2026-10-17: ALL MoA reference slots at vendor-max thinking.

### New vendors 2026-10-17 (wires + thinking contracts, real-call verified)

| vendor | base_url (anthropic_messages, NO trailing /v1) | model | ctx | vendor max-thinking shape | slot config |
|--------|-------|-------|-----|---------------------------|-------------|
| StepFun | `https://api.stepfun.com/step_plan` | `step-5-preview` | 1M | official ladder low/medium/**high** via `output_config.effort` on the anthropic wire; **unset = medium, NOT max** | provider `extra_body: {output_config: {effort: high}}`. Hermes sends stepfun down the MANUAL budget path (non-kimi non-claude → `THINKING_BUDGET`), which lands only medium-tier; extra_body flattens into the request body via the anthropic SDK (verified in final json_data). A/B: noparam 459 / effort_high 580 / budget32k 417 thinking-chars |
| MiniMax | `https://api.minimax.cn/anthropic` | `MiniMax-M3` | 1M | binary: thinking OFF when omitted; `thinking: {type: adaptive}` = on = its max (no effort ladder; M3.1-Flash 400s on `disabled`) | provider `extra_body: {thinking: {type: adaptive}}` (verified thinking blocks in responses). Bearer + `x-api-key` both accepted |
| DeepSeek | `https://api.deepseek.com/anthropic` | `deepseek-v4-pro` | 128K | `thinking` supported (`budget_tokens` IGNORED per official docs); `output_config.effort` ladder low/high/**max**; unset default ≈ between low and high; effort=max ≈ 2.9× default thinking | provider `extra_body: {output_config: {effort: max}}` (E2E verified in final json_data). v4-pro thinks by default (returns thinking blocks with no params). deepseek-flash also works on this wire but is the cheap tier. 128K context is the smallest slot in the preset — fine for an advisor. A/B bat-and-ball: noparam 233 / low 306 / high 373 / max 672 think-chars; hard-probe latency 5s |

### Config regression 2026-10-14/15 + three-layer anti-wash fix (LESSON)

The whole `moa:` section + moa-* custom_providers were SILENTLY WIPED from orchestrator config between 10-08 and 10-15 (a batch key-rotation script set every backup's mtime to 10-14 09:33:43, replaced the kimi key with `__ROTATED-20261014__`, and dropped the moa block). Symptom: `hermes moa list` showed only the code-default preset. Fix — all three layers in sync and regen-survival verified by re-running `generate-configs.py --profile orchestrator`:
1. `~/.hermes/shared/profiles.yaml` → `shared_config.custom_providers` holds all 5 moa-* providers (the generator copies this list verbatim into every profile config).
2. `~/.hermes/shared/generate-configs.py` → `PRESERVE_KEYS` now includes `"moa"` (the disk `moa:` section survives regeneration).
3. `~/.hermes/profiles/orchestrator/config.yaml` → live artifact.
Backups: `config.yaml.bak-moa-restore-20261017`, `generate-configs.py.bak-moa-20261017`, `profiles.yaml.bak-moa-20261017`.

### Key recovery sources UPDATE (2026-10-17 — the old three sources are all dead)

- kimi: `sqlite3 ~/.cc-switch/cc-switch.db "SELECT json_extract(settings_config,'$.api_key') FROM providers WHERE name='moa-mk256'"` — the hermes-app_type provider rows keep FULL unmasked keys.
- bigmodel / MiMo: pre-rotation profile backup `config.yaml.bak-session-affinity-20261008` holds full keys.
- StepFun: current cc-switch db `env.ANTHROPIC_AUTH_TOKEN` is unmasked.
- MiniMax: masked everywhere (`sk-cp-...EtIU`); proxy_live_backup table is EMPTY, backups/hermes/ is gone, the archive db predates the vendor — only source is the user re-issuing from platform.minimax.cn (verify tail matches the masked tail).
- DeepSeek: main DB `DeepSeek` row (claude-type) masked `sk-ccd...e496`; the archived DB's full plaintext key (tail 8956) is upstream-REVOKED (401 error body echoed `Your api key: ****8956`, confirming attribution). Only source: user re-issues from platform.deepseek.com / cc-switch desktop — plaintext lives only in the desktop app's memory, never on disk.
- The proxy does NOT route by model: POSTing `model=MiniMax-M3` to 127.0.0.1:15721 served glm-5.3 (the active provider). MoA must stay direct-wired — re-confirmed 2026-10-17.

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
