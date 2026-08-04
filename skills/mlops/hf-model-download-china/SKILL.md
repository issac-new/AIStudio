---
name: hf-model-download-china
description: "Use when HuggingFace fails in China. ModelScope path."
version: 1.0.0
platforms: [macos, linux]
---

# HuggingFace Model Download in China Network

Verified workflow (2026-08, Beijing, China Unicom) for pulling HuggingFace-hosted models when `huggingface.co` is unreachable. Validated end-to-end with `Systran/faster-whisper-large-v3` (3.09 GB) loaded offline by `faster_whisper.WhisperModel('large-v3')` default-path lookup.

## When to use

- `huggingface_hub` / `transformers` / `faster_whisper` / `sentence-transformers` downloads fail with `ConnectError`, `SSL: UNEXPECTED_EOF_WHILE_READING`, `handshake operation timed out`, or `LocalEntryNotFoundError`.
- `curl https://huggingface.co` times out (GFW), so any HF-native download path is dead.

## Why NOT hf-mirror.com

`hf-mirror.com` looks reachable (curl returns HTTP 308), but it **redirects API/file requests to huggingface.co**, so `huggingface_hub` and `requests` follow the redirect and hang on the same blocked host. Python SSL handshakes to hf-mirror itself also time out. Do not burn time on it — go straight to ModelScope.

## Step 1 — Download via ModelScope

ModelScope (modelscope.cn, Alibaba) mirrors most popular HF repos under the same `org/name` id.

```bash
# Install into the SAME python env that will load the model
<TARGET_VENV>/bin/pip install modelscope

<TARGET_VENV>/bin/python -c "
from modelscope.hub.snapshot_download import snapshot_download
import os
path = snapshot_download('<org>/<name>', cache_dir=os.path.expanduser('~/.cache/huggingface/hub'))
print(path)"
```

Expect ~2-3 MB/s; large-v3 (3.09 GB) took ~11 min. If the repo id 404s on ModelScope, search the model name on modelscope.cn — mirrors sometimes live under a different org.

## Step 2 — Shim ModelScope layout into HF cache layout

ModelScope writes `hub/models/<org>--<name>/snapshots/master/<files>`; `huggingface_hub` looks for `hub/models--<org>--<name>/{refs/main, snapshots/<rev>, blobs/}`. Without the shim, loaders fall back to the network and fail.

Run the packaged script:

```bash
python3 scripts/ms_to_hf_cache.py <org>/<name> master
```

Or by hand:

```bash
HF=~/.cache/huggingface/hub
MS=$HF/models/<org>--<name>/snapshots/master
DST=$HF/models--<org>--<name>
mkdir -p $DST/{blobs,refs} $DST/snapshots/master
for f in "$MS"/*; do ln -sf "$f" "$DST/snapshots/master/$(basename "$f")"; done
printf "master" > $DST/refs/main    # ← printf, NOT echo
```

**Critical gotcha**: `huggingface_hub` reads `refs/main` with `f.read()` and does **not strip whitespace**. A trailing newline (from `echo`) makes it look for `snapshots/master\n` and report "cannot find appropriate cached snapshot folder". Always use `printf`.

## Step 3 — Verify offline load

```bash
<TARGET_VENV>/bin/python -c "
from faster_whisper import WhisperModel   # or transformers.AutoModel.from_pretrained('<org>/<name>')
m = WhisperModel('large-v3', device='cpu', compute_type='int8')
print('OK')"
```

Success = no network call, loads from the shimmed cache. If it still tries to connect, re-check `refs/main` content with `repr()` for stray whitespace.

## Pitfall: pip must target the env that LOADS the model

For Hermes features (STT/TTS/voice deps like `faster-whisper`), `pip install` into the system/default python is a silent no-op — Hermes runs from its own venv. Discover the real interpreter from the launcher:

```bash
cat ~/.local/bin/hermes | head -5   # → exec "/Users/.../.hermes/hermes-agent/venv/bin/hermes"
~/.hermes/hermes-agent/venv/bin/pip install <package>
```

Verify with `<venv>/bin/python -c "import <pkg>"` — never trust the pip exit code alone.

## Files

- `scripts/ms_to_hf_cache.py` — automates Step 2 (ModelScope → HF cache-layout shim, printf-safe refs).
