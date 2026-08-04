---
name: hermes-voice-setup
description: "Use when setting up Hermes voice (STT/TTS/voice mode)."
---

# Hermes Voice Setup (STT / TTS / Voice Mode)

Use when enabling Hermes voice features (`/voice on`, `/voice tts`), configuring STT/TTS providers, fixing voice transcription failures, or downloading Whisper models in a network-restricted (China) environment.

## Hard-won invariants

1. **Hermes has its own venv — never use system pip.** Install voice deps into the venv the launcher actually execs:
   ```bash
   # Resolve the real venv (the `hermes` launcher is a bash wrapper):
   cat ~/.local/bin/hermes        # shows: exec "~/.hermes/hermes-agent/venv/bin/hermes"
   ~/.hermes/hermes-agent/venv/bin/pip install faster-whisper sounddevice numpy
   ```
   `pip install` (system) silently lands in the wrong interpreter and `import faster_whisper` still fails inside Hermes.

2. **Config keys** (write with `hermes config set`, never hand-edit config.yaml):
   ```bash
   hermes config set tts.provider edge
   hermes config set tts.edge.voice zh-CN-YunxiNeural   # 男声; XiaoxiaoNeural=女声
   hermes config set stt.enabled true
   hermes config set stt.provider local                  # faster-whisper, free, offline
   hermes config set stt.local.model large-v3            # tiny/base/small/medium/large-v3
   hermes config set stt.language zh                     # avoids misdetection for Chinese speech
   ```
   Voice config is read live — no `/reset` needed for `/voice` commands.

3. **In China, HuggingFace direct download fails** (SSL `UNEXPECTED_EOF_WHILE_READING` / connection reset; hf-mirror.com redirects back to huggingface.co for file payloads and also dies). The working path is **ModelScope + manual HF cache layout**. See `references/hf-cache-china-download.md` for the verified recipe, including the refs-file newline gotcha that makes `local_files_only` lookups silently fail.

4. **Streaming TTS capability matrix** (from `docs/streaming-tts.md` in the Hermes repo): true chunked PCM streaming exists only for **elevenlabs / gemini / openai / xai**. `edge` (the free default) falls back to **per-sentence sync playback** — conversational but not true streaming. Don't promise "streaming" when the provider is edge.

5. **Voice mode (CLI/TUI) requirements**: `sounddevice` + `numpy` in the Hermes venv. On macOS, audio *output* is routed through `afplay` (sounddevice output is disabled to avoid a TCC media-library prompt); recording still uses sounddevice and triggers a one-time microphone permission prompt for the terminal app. Barge-in (interrupting spoken replies) works via a full-duplex listener.

6. **WeChat voice pipeline** (`gateway/platforms/weixin.py` → `tools/transcription_tools.py`): WeChat voice arrives as `.silk`; the cloud STT text WeChat supplies is **deliberately discarded** (garbage for non-Chinese audio, issue #27300). Hermes decodes silk→wav via `pilk` (lazy-installed on first voice note), then transcribes with the configured STT provider, echoes `🎙️ "transcript"` to the user, and prepends the transcript to the message. WeChat voice replies are **batch-mode only** — no streaming audio upload exists on the platform, so end-to-end latency is download+STT+LLM+TTS+upload (~5–15s).

## Verification checklist

```bash
# 1. faster-whisper loads offline from cache (must NOT hit the network):
~/.hermes/hermes-agent/venv/bin/python -c "
from faster_whisper import WhisperModel
WhisperModel('large-v3', device='cpu', compute_type='int8')
print('OK')"

# 2. sounddevice sees input/output devices:
~/.hermes/hermes-agent/venv/bin/python -c "import sounddevice as sd; print(sd.query_devices())"

# 3. Config state:
hermes config get stt; hermes config get tts
```

## Pitfalls

- **`stt.provider: local` with faster-whisper not installed = STT silently broken.** The config flag alone does nothing; verify the import in the Hermes venv.
- **ModelScope cache layout ≠ HuggingFace cache layout.** ModelScope writes `hub/models/Org--Repo/snapshots/master/`; huggingface_hub expects `hub/models--Org--Repo/{refs/<rev>, snapshots/<commit>}`. Symlink + rewrite refs, or every load re-attempts a (blocked) network download.
- **refs file must have NO trailing newline** — `f.read()` is not stripped in `snapshot_download`, so `echo master > refs/main` (with `\n`) breaks the lookup; use `printf master > refs/main`.
- First STT call with a new model downloads it — do the download deliberately (ModelScope recipe) instead of letting a live voice message trigger it.
