---
name: hermes-voice-offline-models
description: "Configure offline Chinese STT/TTS on macOS."
version: 1.0.0
category: devops
---

# Hermes Voice: Offline Chinese Models on macOS

Set up high-quality offline (or offline-fallback) voice for Hermes on Apple Silicon Macs in mainland China, where HuggingFace is blocked and vLLM has no macOS wheel.

## Decision matrix — what to install

| Need | STT | TTS |
|------|-----|-----|
| Highest Chinese quality, offline OK | **Qwen3-ASR-1.7B** (transformers + MPS) | **Fun-CosyVoice3-0.5B-2512** (RL version) |
| Free, cloud, instant | DashScope `qwen3-asr-flash-realtime` (WebSocket) | Edge TTS (default, free, no key) |
| WeChat voice messages | **WeChat cloud STT as primary** (zero compute) → Qwen3-ASR as fallback | Edge TTS for replies |

**Hard constraint**: vLLM is CUDA-only (0 macOS ARM64 wheels on PyPI as of 2026-08). Qwen3-ASR **streaming** mode requires vLLM — so on Mac you get offline batch transcription only, not streaming. For streaming STT use DashScope API.

## Install order (do all 5)

1. **Install deps into the Hermes venv** (NOT system python): `$HOME/.hermes/hermes-agent/venv/bin/pip install faster-whisper pilk qwen-asr modelscope sounddevice numpy`
   - `pilk` is the SILK→WAV codec for WeChat .silk voice notes (lazy-installed by Hermes on first use, but pre-installing avoids the first-message failure).
2. **Download models from ModelScope** (HF is blocked; ModelScope works from China). See `references/modelscope-china-download.md`.
3. **Bridge ModelScope cache → HuggingFace cache** so `from_pretrained("Qwen/Qwen3-ASR-1.7B")` finds them offline. See `references/modelscope-china-download.md` § "Cache bridging".
4. **Wire Qwen3-ASR as local STT** via `HERMES_LOCAL_STT_COMMAND` (no Hermes source changes). See `references/local-stt-integration.md`.
5. **Make WeChat cloud STT primary** (reverses Hermes #27300 default). See `references/weixin-cloud-stt-primary.md`.

## Config snapshot (what the running system looks like)

```yaml
stt:
  enabled: true
  provider: local
  language: zh
tts:
  provider: edge
  edge:
    voice: zh-CN-YunxiNeural   # male; zh-CN-XiaoxiaoNeural for female
```
```
HERMES_LOCAL_STT_COMMAND=$HOME/.hermes/hermes-agent/venv/bin/python $HOME/.hermes/bin/qwen3_asr_stt.py {input_path} {output_dir} {language}
```
Env var must be in `profiles/orchestrator/.env` AND global `~/.hermes/.env` AND `shared/.env.common` (the three-source pattern — see hindsight on WEIXIN_TOKEN recurrence).

## Disk budget (M1 Pro 32GB reference)

| Model | Size | Purpose |
|-------|------|---------|
| Qwen3-ASR-1.7B | 4.4 GB | STT (offline, batch) |
| Fun-CosyVoice3-0.5B-2512 | 8.2 GB | TTS (offline fallback) |
| bge-large-zh-v1.5 | 2.4 GB | Hindsight embedding (unrelated, kept) |
| bge-reranker-large | 2.1 GB | Hindsight reranker (unrelated, kept) |

Cleanup candidates after switching STT: faster-whisper large-v3 (2.9 GB), bge-small-en, ms-marco-MiniLM, bce-embedding — all dead weight once Qwen3-ASR + bge-large-zh are in place.

## Pitfalls (each one bit us — read before deploying)

- **HF blocked in China** → `huggingface_hub.snapshot_download` throws SSL EOF. Use `modelscope.hub.snapshot_download.snapshot_download` with `cache_dir=~/.cache/huggingface/hub`. ModelScope serves the same repos under `Qwen/...` and `FunAudioLLM/...`.
- **ModelScope cache layout ≠ HF layout** → ModelScope writes `models/<Org>--<Model>/snapshots/master/`; HF expects `models--<Org>--<Model>/snapshots/<commit_hash>/` with a `refs/main` file whose content is the commit hash **with no trailing newline**. `echo` adds a newline; use `printf "master" > refs/main`. Get this wrong and `WhisperModel("large-v3")` / `Qwen3ASRModel.from_pretrained(...)` silently re-fetch from the network and fail.
- **`from_pretrained` pings HF even with a local cache** → set `TRANSFORMERS_OFFLINE=1` and `HF_HUB_OFFLINE=1` in the STT wrapper script, or transformers' tokenizer init does a `model_info()` network call that fails offline.
- **Qwen3-ASR language param is full names** → `language="Chinese"`, not `"zh"`. Passing `"zh"` raises `ValueError`. Map ISO codes in your wrapper.
- **Qwen3-ASR result objects aren't dicts** → `results[0].text`, not `results[0]["text"]`. Type is `qwen_asr.inference.qwen3_asr.ASRTranscription`.
- **WeChat .silk isn't a valid audio format for most STT engines** → Hermes' `_prepare_audio_for_transcription` uses `pilk.silk_to_wav` to decode before passing to the STT backend. If pilk isn't installed the first WeChat voice message fails with "Unsupported format: .silk".
- **vLLM streaming is CUDA-only** → on Mac, Qwen3-ASR gives batch transcription only. Don't promise users streaming STT from a local Qwen3-ASR on macOS.

## References

- `references/modelscope-china-download.md` — ModelScope download + HF cache bridging (the newline bug)
- `references/local-stt-integration.md` — `HERMES_LOCAL_STT_COMMAND` wrapper script + wiring
- `references/weixin-cloud-stt-primary.md` — reversing Hermes #27300 so cloud STT is primary
- `references/qwen-voice-model-survey.md` — full Qwen/CosyVoice/SenseVoice/DashScope matrix
