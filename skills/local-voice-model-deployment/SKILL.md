---
name: local-voice-model-deployment
description: "Wire local STT/TTS models into Hermes on macOS."
---

# Local Voice Model Deployment on macOS

Operational counterpart to `local-voice-model-selection` (which holds the selection matrix). THIS skill covers the **hands-on deployment**: install deps into the Hermes venv, download models via ModelScope, fix the HF cache layout, and wire models into Hermes via external-command integration points.

## When this fires

- User says "下载 Qwen3-ASR", "装 CosyVoice", "把模型接入 Hermes", "替换 faster-whisper"
- After `local-voice-model-selection` picked the model; now it needs to actually land on disk and plug into Hermes
- STT/TTS provider is set in config but model files missing, or a higher-quality local model replaces the default

## The four-step deployment pattern

### 1. Install the package into the Hermes venv (NEVER system pip)

```bash
cat ~/.local/bin/hermes   # → exec "~/.hermes/hermes-agent/venv/bin/hermes"
VENV=~/.hermes/hermes-agent/venv/bin

$VENV/pip install qwen-asr          # Qwen3-ASR
# $VENV/pip install faster-whisper  # Whisper
# CosyVoice: clone repo + pip install -r requirements.txt (no PyPI package)
```

Pitfall: system `pip install` lands in the wrong interpreter; `import` fails inside Hermes even though `pip3 list` shows the package. Always use `$VENV/pip`.

### 2. Download from ModelScope (China network)

HuggingFace direct and hf-mirror.com both fail in China (SSL reset / redirect back to HF). ModelScope works:

```python
from modelscope.hub.snapshot_download import snapshot_download
import os
snapshot_download('<Org>/<Repo>',
    cache_dir=os.path.expanduser('~/.cache/huggingface/hub'))
```

Files land under `~/.cache/huggingface/hub/models/<Org>--<Repo>/snapshots/master/` — NOT the layout huggingface_hub expects. Step 3 fixes it.

### 3. Fix the HF cache layout (ModelScope → HuggingFace format)

huggingface_hub looks up `models--<Org>--<Repo>/refs/<rev>` → reads a commit hash (no trailing newline) → looks for `snapshots/<that_hash>/`. ModelScope writes `models/<Org>--<Repo>/snapshots/master/`. Bridge:

```bash
HF=~/.cache/huggingface/hub
MS=$HF/models/<Org>--<Repo>/snapshots/master
HFDIR=$HF/models--<Org>--<Repo>
mkdir -p "$HFDIR/snapshots/master" "$HFDIR/blobs" "$HFDIR/refs"
for f in "$MS"/*; do ln -sf "$f" "$HFDIR/snapshots/master/$(basename "$f")"; done
printf "master" > "$HFDIR/refs/main"   # ⚠️ printf NOT echo — no trailing newline!
```

`printf` vs `echo` is critical: `snapshot_download` does `f.read()` without `.strip()`, so `echo master > refs/main` writes `master\n` and every `local_files_only=True` lookup silently fails ("Cannot find an appropriate cached snapshot folder").

### 4. Wire into Hermes

**STT** — use `HERMES_LOCAL_STT_COMMAND` (no source patching). Receives `{input_path} {output_dir} {language}`, must write `{stem}.txt`:

```
# Write into ALL THREE .env files (survives generate-configs.py regeneration):
#   ~/.hermes/.env
#   ~/.hermes/profiles/<name>/.env
#   ~/.hermes/shared/.env.common
HERMES_LOCAL_STT_COMMAND=<venv-python> <wrapper-script> {input_path} {output_dir} {language}
```

Three-file write is the same single-source-of-truth lesson as the WeChat WEIXIN_TOKEN issue — miss one and the var disappears after a regenerate.

**TTS** — CosyVoice and other local TTS are NOT in Hermes's built-in `tts.provider` list. Options: (a) write a custom provider plugin (subclass `StreamingTTSProvider`, see `docs/streaming-tts.md` in the repo), (b) keep cached as offline fallback behind Edge TTS (cloud primary). Option (b) is zero-code.

## Model-specific gotchas

### Qwen3-ASR-1.7B (STT)
- **Language arg = full name** (`Chinese`), not ISO (`zh`) — `ValueError: Unsupported language: Zh` otherwise. Map in wrapper.
- **Returns `ASRTranscription` objects** (`.text`), NOT dicts — `r.get("text")` → `AttributeError`.
- **AutoProcessor phones home** for a Mistral regex check even when cached → `ConnectionResetError`. Set `TRANSFORMERS_OFFLINE=1` + `HF_HUB_OFFLINE=1` at wrapper top.
- **vLLM (streaming) impossible on macOS** — 0 PyPI wheels, CUDA/Linux only. transformers backend = batch only. For streaming use DashScope cloud (`dashscope-realtime-asr` skill).
- MPS + bf16 works: loads ~6s, transcribes 9.5s audio in ~6s.

### CosyVoice3-0.5B-2512 (TTS)
- **8 files, ~8.2GB total** (not one checkpoint): `llm.pt` (1.9G), `llm.rl.pt` (1.9G, RL-optimized = highest quality), `flow.pt` (1.3G), `flow.decoder.estimator.fp32.onnx` (1.3G), `speech_tokenizer_v3.onnx` (925M), `speech_tokenizer_v3.batch.onnx` (925M), `campplus.onnx` (27M), `hift.pt` (79M).
- `llm.rl.pt` / `_RL` suffix = RL post-training (CER 0.81 vs 1.21 base) = quality-maximized variant. **No larger-than-0.5B CosyVoice exists** — 0.5B is the series ceiling.
- No PyPI package — clone `github.com/FunAudioLLM/CosyVoice` (301→`github.com/QwenAudio/CosyVoice`), install reqs, load via their Python API.

## Disk hygiene after a model swap

Voice models are 4-9GB each. After replacing one, delete **both** dirs (ModelScope source has the real bytes; `models--*` is just symlinks):

```bash
rm -rf ~/.cache/huggingface/hub/models/Systran--faster-whisper-large-v3      # real bytes
rm -rf ~/.cache/huggingface/hub/models--Systran--faster-whisper-large-v3     # symlinks
```

Deleting only `models--*` frees ~4KB, not GB.

## Verification

```bash
# 1. Offline load (must NOT touch network)
TRANSFORMERS_OFFLINE=1 HF_HUB_OFFLINE=1 ~/.hermes/hermes-agent/venv/bin/python -c "
from qwen_asr import Qwen3ASRModel; import torch
Qwen3ASRModel.from_pretrained('Qwen/Qwen3-ASR-1.7B', dtype=torch.bfloat16, device_map='mps')
print('OK')"

# 2. End-to-end transcribe
say -o /tmp/t.aiff "你好这是测试" && ffmpeg -y -i /tmp/t.aiff -ar 16000 -ac 1 /tmp/t.wav
mkdir -p /tmp/asr_test
~/.hermes/hermes-agent/venv/bin/python ~/.hermes/bin/qwen3_asr_stt.py /tmp/t.wav /tmp/asr_test Chinese
cat /tmp/asr_test/t.txt

# 3. Hermes env-var pickup (then send a WeChat voice to test live)
hermes config get stt
```

## Sibling skills

- `local-voice-model-selection` — WHICH model (matrix, benchmarks). Read first.
- `dashscope-realtime-asr` — cloud streaming when local streaming is impossible (vLLM on Mac).
- `hermes-voice-setup` (default profile) — Hermes config mechanics. **Note: references `references/hf-cache-china-download.md` that was not found at audit — recommend `hermes curator adopt hermes-voice-setup` so it and the missing reference file can be maintained here.**
