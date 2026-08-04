---
name: cloud-speech-provider-selection
description: "Use when evaluating cloud speech APIs for Hermes voice."
---

# Cloud Speech Provider Selection (TTS / ASR / Realtime Voice)

Use when the user evaluates cloud speech model APIs for Hermes Agent voice features — comparing providers, verifying endpoint reachability, decoding protocol requirements (SSE vs WebSocket vs OpenAI-compatible), or checking free quotas and pricing. Complements `hermes-voice-configuration` / `hermes-voice-setup` (which cover the Hermes-side config mechanics) with the provider-side facts.

## Workflow

1. **Verify endpoint reachability first** — before quoting any capability, curl the base endpoint unauthenticated. A 401 with a well-formed JSON error body proves DNS + TLS + route are alive (e.g. DashScope returns OpenAI-style `invalid_request_error`); a 404 page proves nothing about the API. For China users, test direct connectivity — do not assume a proxy is needed.
2. **Locate real doc URLs from the vendor's model-list / API-reference index pages**, not guessed paths. Vendor doc sites (Aliyun help center especially) have irregular URL naming — guessed slugs like `/qwen-asr`, `/compatible-mode` 404. The model list page (e.g. `getting-started/models`) and the API reference index are the reliable entry points.
3. **Distinguish the three protocol classes** and never conflate them in a recommendation:
   - HTTP + SSE streaming (non-realtime TTS/LLM; often a vendor header like `X-DashScope-SSE: enable`)
   - WebSocket realtime APIs (`wss://…/realtime`) — bidirectional, event-driven; NOT SSE
   - OpenAI-compatible `/compatible-mode/v1` — often only a subset of models (e.g. only the omni/multimodal line), NOT the dedicated TTS/ASR models
4. **Map to Hermes integration cost**: OpenAI-compatible endpoints integrate with near-zero change (existing provider config); WebSocket realtime speech-to-speech APIs do NOT fit Hermes' current STT→LLM→TTS three-stage voice architecture and require new WS client code.
5. **Always report free quota + unit pricing + region restriction together** — free tiers are commonly region-locked (e.g. DashScope free quota only in 华北2-北京) and per-model independent (not shared across models).

## Verified provider facts

Load `references/dashscope-voice-models.md` for the 2026-08 verified Alibaba Cloud Bailian (DashScope) speech model matrix: model IDs, endpoints, protocols, free quotas (1 万字符 TTS / 10 小时 ASR / 100 万 token Omni), per-unit pricing, API Key flow (`sk-ws-` format, shown once), and China direct-connect confirmation. Key facts:

- `dashscope.aliyuncs.com` direct-connect works from Beijing (no proxy).
- OpenAI compatible mode exists at `/compatible-mode/v1` but covers only Qwen-Omni; dedicated TTS/ASR use DashScope-native HTTP+SSE or WebSocket.
- Realtime voice (tts-realtime, asr-streaming, omni-realtime, s2s) is WebSocket `wss://…/api-ws/v1/realtime`.
- Recommended Hermes picks: `qwen3.5-omni-flash` via OpenAI-compat for chat+audio; `qwen3-tts-flash` (0.8 元/万字符) for pure TTS.

## Pitfalls

1. **Do not present an unauthenticated probe as a functional test.** 401 reachability ≠ the model works; say clearly what was and wasn't verified (no API key = no real call).
2. **Vendor model names churn fast** — old lines disappear (qwen-audio/qwen2-audio audio-understanding models were removed, absorbed into Qwen-Omni and qwen-audio-3.0-asr-*). Always check the current model list page rather than trusting remembered model IDs.
3. **Free quota is per-model, not per-account** on DashScope, and expires (90 days); exhausting one model does not fall over to another.
4. **Audio token billing is duration-based** (DashScope: tokens = seconds × 12.5) — cost estimates for voice conversations must account for context accumulation across turns.
