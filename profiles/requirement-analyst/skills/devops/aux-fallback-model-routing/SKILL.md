---
name: aux-fallback-model-routing
title: Auxiliary & Fallback Model Routing in Multi-Profile Hermes
description: >-
  Route auxiliary tasks (title/compression/session_search/web_extract/vision/
  approval) and fallback_providers chains across providers in the
  profiles.yaml + generate-configs.py pipeline. Covers aux persistence rules
  (aux NOT in PRESERVE_KEYS — config set gets wiped on regeneration), the
  alias-specific k3 /coding aux-404 nuance (k3 alias accepts OpenAI format;
  only kimi-for-coding aliases 404), unified multimodal routing via
  auxiliary.vision (text-main-model agents auto-divert images to a vision
  model while the main session model stays unchanged), fallback chain
  format/selection/verification, and the capability-verification discipline
  (probe aggregator /v1/models; never assume flagship implies multimodal).
triggers:
  - "auxiliary 404"
  - "auxiliary.vision"
  - "fallback_providers"
  - "fallback chain"
  - "多模态统一走"
  - "视觉模型分配"
  - "approval 模型"
  - "aux pin"
---

# Auxiliary & Fallback Model Routing in Multi-Profile Hermes

Companion to **team-model-routing** (which covers switching the MAIN model).
This skill covers the two layers around it: auxiliary tasks and the
fallback chain, in the same `~/.hermes/shared/profiles.yaml` +
`generate-configs.py` pipeline.

## When to Use

- Auxiliary tasks (title/compression/session_search/web_extract/vision/
  approval) must point at a different provider than the main model
- A model lacks native vision and images must route to a multimodal model
- Deploying / changing `fallback_providers` for quota or outage insurance
- A documented provider limitation needs re-verification before designing
  around it

## Persistence: aux and fallback MUST go through the generator

`generate-configs.py` rebuilds every profile's config.yaml from
profiles.yaml and preserves only `PRESERVE_KEYS` (mcp_servers,
platform_toolsets, known_plugin_toolsets, onboarding, updates,
_config_version). **`auxiliary` and `fallback_providers` are not preserved**,
so `hermes -p <p> config set auxiliary.*` is silently wiped on the next
regeneration — the same trap as hand-editing `model:`. Both now have
generator support (added 2026-07-24): declare `shared_config.auxiliary` /
`shared_config.fallback_providers` in profiles.yaml (per-profile
`fallback_providers` overrides shared, same pattern as `model:`), then
regenerate with the venv python:

```bash
~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/generate-configs.py
```

## The k3 /coding aux-404 is ALIAS-SPECIFIC, not endpoint-wide

The bundled hermes-agent doc (`references/kimi-coding-auxiliary-404.md`)
says aux tasks 404 on `api.kimi.com/coding` because the route speaks only
Anthropic wire format. Empirical retest (2026-07-24): the **`k3` alias
answers OpenAI `POST /coding/v1/chat/completions` with HTTP 200 for both
plain-text and `image_url` vision payloads** — the model even returned
correct image analysis. The 404 applies to Anthropic-only aliases such as
`kimi-for-coding`, not to the whole endpoint.

Lesson: before designing architecture around a documented endpoint
limitation, send ONE real minimal request in each wire format. A two-curl
probe (OpenAI-format + Anthropic-format) settles what docs leave ambiguous.

## Unified multimodal routing = auxiliary.vision

Facts established 2026-07-24 (user corrections + probes): GLM-5.2 is
TEXT-ONLY; deepseek v4-pro/flash have no vision; k3 is the only multimodal
model in the fleet. Mechanism:

```yaml
# profiles.yaml → shared_config.auxiliary
auxiliary:
  vision:
    provider: custom:kimicode   # the only multimodal provider
    model: k3
```

- With a non-vision main model, the `vision_analyze` tool auto-diverts the
  image to `auxiliary.vision` and injects the returned text description
  back into the main session — **the main session model never changes**.
  This is exactly the "low-frequency multimodal uniformly through the
  strong model, then back to the text model" pattern.
- Aux vision only fires for non-vision main models, so k3-native profiles
  (hack team) never touch it — they use native main-loop vision instead.
- Quota cost: low-frequency image analysis on a quota-capped model is
  acceptable (~100s of tokens per call); do NOT route bulk text aux
  (compression/title) to the quota model.
- Verified end-to-end: a glm-5.2 worker given a pure-red test PNG answered
  "red" via the k3 aux path.

Current shared aux layout: title/compression/session_search/web_extract →
damoxing/glm-5.2 (unlimited subscription, zero marginal cost); approval →
cheap fast model; vision → custom:kimicode/k3.

## fallback_providers: format, deployment, selection

Format — TOP-LEVEL key in config.yaml (NOT under `model:`), ordered list:

```yaml
fallback_providers:
  - provider: deepseek          # built-in provider: auto-reads DEEPSEEK_API_KEY
    model: deepseek-v4-flash
  - provider: damoxing          # second level for the quota-capped team
    model: glm-5.2
```

- Tried in order on rate-limit / overload (5xx) / connection errors — NOT
  on content refusals. A refusal-mitigation chain needs the
  llm-refusal-mitigation skill, not fallback.
- Built-in providers (deepseek, openrouter, …) resolve credentials from
  their standard env var; no custom_providers entry needed in the fallback
  item. Verify the env var is in the profile's .env first.
- Selection reasoning for the INSURANCE role: the dominant trigger is the
  primary plan's quota window (hack team's k3 monthly cap = potentially
  DAYS running on fallback), so per-token price outweighs peak
  intelligence — chose v4-flash (40) over v4-pro (43) at 3× price for only
  +7.5% intelligence. Keep the pricier model as a manual-boost option.
- Give the quota-capped team a second-level backstop on an UNLIMITED
  provider (hack: k3 → deepseek-v4-flash → damoxing/glm-5.2) so even
  double failure (quota + provider outage) can't stall the board.
- Verify: `hermes -p <p> fallback list` prints primary + ordered chain;
  the main loop prints "🔄 Fallback chain" at startup. Smoke-test the main
  loop afterwards (`hermes -p <p> chat -q ... -Q`) to confirm the new key
  didn't break startup.

## Capability verification discipline

- Aggregator gateways (New API / one-api forks, e.g. damoxing) serve a JS
  frontend at `/models`; the real list is at `/v1/models`:
  `curl -sS "$BASE/v1/models" -H "Authorization: Bearer $KEY"`.
  damoxing exposes only 6 GLM TEXT variants — no glm-4v/4.5v exists there.
- **Never infer modality from model tier.** GLM-5.2 is a flagship and is
  text-only — asserted by the user after multimodal was wrongly claimed
  from the tier. Check the provider's model list or send a 1×1 px test
  image before promising vision anywhere in the architecture.
- Allocation corollary that shaped this fleet: kanban workers are ASYNC —
  raw speed has no value for them, only intelligence × cost. Speed matters
  only where a human waits (orchestrator front door, smart-mode approval).

## Related Skills

- **team-model-routing** — main-model switching workflow (override
  mechanism, custom-provider declaration, backup→regenerate→diff,
  dangling-skills-symlink pitfall). This skill extends it to the
  aux/fallback layers.
- **hermes-profile-config** — broader config-editing playbook (write-guard
  rules, provider shapes, .env management).
- **llm-refusal-mitigation** — refusals are a prompt-framing problem;
  fallback chains do NOT trigger on refusals.
