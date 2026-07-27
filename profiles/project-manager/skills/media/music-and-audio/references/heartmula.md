# HeartMuLa — Open-Source Music Generation

HeartMuLa generates songs from lyrics + tags. Apache-2.0. Python 3.10 + GPU required.

## Installation

```bash
git clone https://github.com/HeartMuLa/heartlib.git
cd heartlib && uv venv --python 3.10 .venv && . .venv/bin/activate
uv pip install -e .
uv pip install --upgrade datasets transformers  # Fix dep conflicts
```

## Required Patches (transformers 5.x)

### Patch 1: RoPE cache fix
In `src/heartlib/heartmula/modeling_heartmula.py`, add after `reset_caches`:
```python
from torchtune.models.llama3_1._position_embeddings import Llama3ScaledRoPE
for module in self.modules():
    if isinstance(module, Llama3ScaledRoPE) and not module.is_cache_built:
        module.rope_init()
        module.to(device)
```

### Patch 2: HeartCodec loading fix
In `src/heartlib/pipelines/music_generation.py`, add `ignore_mismatched_sizes=True` to ALL `HeartCodec.from_pretrained()` calls.

## Download Checkpoints

```bash
cd heartlib
hf download --local-dir './ckpt' 'HeartMuLa/HeartMuLaGen'
hf download --local-dir './ckpt/HeartMuLa-oss-3B' 'HeartMuLa/HeartMuLa-oss-3B-happy-new-year'
hf download --local-dir './ckpt/HeartCodec-oss' 'HeartMuLa/HeartCodec-oss-20260123'
```

## Generate

```bash
python ./examples/run_music_generation.py \
  --model_path=./ckpt --version=3B \
  --lyrics=./assets/lyrics.txt --tags=./assets/tags.txt \
  --save_path=./assets/output.mp3 --lazy_load true
```

Tags format: `piano,happy,wedding,synthesizer,romantic` (comma-separated, no spaces)
Lyrics use bracketed structure: `[Intro] [Verse] [Chorus] [Bridge] [Outro]`

## Key Params

| Param | Default | Description |
|-------|---------|-------------|
| `--max_audio_length_ms` | 240000 | 4 min max |
| `--temperature` | 1.0 | Sampling temperature |
| `--cfg_scale` | 1.5 | Classifier-free guidance |
| `--lazy_load` | false | Saves VRAM (loads/unloads) |
| `--mula_dtype` | bfloat16 | MuLa dtype |
| `--codec_dtype` | float32 | Codec dtype — keep fp32! |

Performance: RTF ≈ 1.0 (4-min song takes ~4 min). Output: MP3 48kHz stereo 128kbps.

Pitfalls: Do NOT use bf16 for HeartCodec. Tags may be ignored (lyrics dominate). Requires CUDA (no macOS Triton).
