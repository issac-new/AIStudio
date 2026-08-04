---
name: hermes-voice-configuration
description: "Use when enabling Hermes voice or choosing STT/TTS models."
---

# Hermes Voice Configuration (STT + TTS)

Operational workflow for enabling voice in Hermes Agent and selecting speech models. The **option catalog** (all providers, config keys, voice commands) lives in the bundled `hermes-agent` skill → `references/configuration.md` §Voice — load that as the source of truth for available choices. THIS skill covers the **selection and verification workflow** around it.

## When this fires

- User asks "开启 voice", "which speech/voice models do I need", "set up TTS/STT", "voice not working"
- Choosing between local vs cloud STT, free vs paid TTS, offline vs online voice

## Workflow

1. **Load the option catalog**: `skill_view(name='hermes-agent', file_path='references/configuration.md')` — §Voice lists every STT/TTS provider, env var, and cost tier. Do not answer from memory; the catalog changes between Hermes versions.
2. **Inspect current config** (read-only here; never hand-edit):
   ```bash
   grep -A 20 '^stt:' ~/.hermes/config.yaml
   grep -A 40 '^tts:' ~/.hermes/config.yaml
   ```
3. **Verify what's actually installed** — run `scripts/verify-voice-deps.sh` (or the one-liner inside it). See Pitfall #1: you MUST probe with the Hermes venv python, not system python.
4. **Select by user constraints** — use `references/voice-provider-matrix.md` (condensed decision tables: model size vs language quality vs cost, per-provider). Key questions:
   - Primary language? (Chinese → STT `small`+ or groq; TTS edge `zh-CN-*` voices or MiniMax)
   - Offline/privacy required? (STT local faster-whisper; TTS piper/neutts/kittentts)
   - Which API keys already exist? (GROQ_API_KEY → free fast cloud STT; ELEVENLABS_API_KEY → highest-quality TTS)
   - Cost tolerance? (edge TTS + local STT = fully free)
5. **Apply with `hermes config set` only** — never hand-edit config.yaml:
   ```bash
   hermes config set stt.enabled true
   hermes config set stt.provider local
   hermes config set stt.local.model small
   hermes config set tts.provider edge
   hermes config set tts.edge.voice zh-CN-XiaoxiaoNeural
   ```
6. **Report with a decision table**: current state → chosen provider/model → why → exact config commands run. Voice model choice is a trade-off decision; present 2-3 options (free-minimal / quality / offline) rather than silently picking one.

## Pitfalls

1. **Wrong python interpreter gives false negatives.** Hermes runs from its own venv at `~/.hermes/hermes-agent/venv/bin/python3` (note: `venv`, NOT `.venv`). System `python3` may fail `import faster_whisper` while `pip3 list` shows it installed — different interpreters. All dependency probes and yaml config reads must use the Hermes venv python. Generalizes to ALL Hermes dependency checks, not just voice.
2. **`stt.provider: local` requires faster-whisper in the Hermes venv.** If missing: `~/.hermes/hermes-agent/venv/bin/pip install faster-whisper`, not system pip. See also skill `hermes-tool-dependencies`.
3. **Local STT model size is the main quality knob.** `base` (default) is marginal for Chinese; `small` is the cost/quality sweet spot (~465MB); `large-v3` best but slow (~3GB). Models download on first use.
4. **edge TTS is free but needs network and defaults to English voice.** For Chinese users, switch `tts.edge.voice` to a `zh-CN-*` neural voice — the single most common TTS complaint.
5. **Local TTS (piper/neutts/kittentts) requires separate model/voice downloads** — don't promise "offline TTS works" until the model files are actually present. Verify with a real TTS call, not just config inspection.
6. **Voice commands are in-session**: `/voice on` (voice-to-voice), `/voice tts`, `/voice off`; TUI push-to-talk key is `voice.record_key` (default ctrl+b). Some stt/tts config changes need a new session to take effect.

## Support files

- `references/voice-provider-matrix.md` — condensed STT/TTS provider & model decision tables (size, quality, cost, language fit) with three ready recommendation profiles (free / quality-Chinese / fully-offline).
- `scripts/verify-voice-deps.sh` — probes the Hermes venv for voice deps and dumps current stt/tts config. Run before recommending anything.
