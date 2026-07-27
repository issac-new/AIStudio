# HeartMuLa — Open-Source Music Generation

HeartMuLa is a family of open-source music foundation models (Apache-2.0) that generates music conditioned on lyrics and tags. Includes HeartMuLa (3B/7B), HeartCodec (12.5Hz music codec), HeartTranscriptor, and HeartCLAP.

## Quick Install

```bash
git clone https://github.com/HeartMuLa/heartlib.git
cd heartlib
uv venv --python 3.10 .venv
. .venv/bin/activate
uv pip install -e .
# Fix dependency conflicts:
uv pip install --upgrade datasets transformers
```

## Hardware

- **Minimum:** 8GB VRAM (`--lazy_load true`), **Recommended:** 16GB+ VRAM
- 3B model with lazy_load peaks at ~6.2GB VRAM
- Multi-GPU: `--mula_device cuda:0 --codec_device cuda:1`
- No GPU? Use CPU (`--mula_device cpu --codec_device cpu`) but expect 30-60+ min per song

## Source Patches (Required for transformers 5.x)

**Patch 1 — RoPE cache fix** in `src/heartlib/heartmula/modeling_heartmula.py`:
Add after `reset_caches` try/except, before `with device:` block:
```python
from torchtune.models.llama3_1._position_embeddings import Llama3ScaledRoPE
for module in self.modules():
    if isinstance(module, Llama3ScaledRoPE) and not module.is_cache_built:
        module.rope_init()
        module.to(device)
```

**Patch 2 — HeartCodec loading fix** in `src/heartlib/pipelines/music_generation.py`:
Add `ignore_mismatched_sizes=True` to all `HeartCodec.from_pretrained()` calls.

## Download Checkpoints

```bash
cd heartlib
hf download --local-dir './ckpt' 'HeartMuLa/HeartMuLaGen'
hf download --local-dir './ckpt/HeartMuLa-oss-3B' 'HeartMuLa/HeartMuLa-oss-3B-happy-new-year'
hf download --local-dir './ckpt/HeartCodec-oss' 'HeartMuLa/HeartCodec-oss-20260123'
```

## Usage

```bash
. .venv/bin/activate
python ./examples/run_music_generation.py \
  --model_path=./ckpt --version="3B" \
  --lyrics="./assets/lyrics.txt" --tags="./assets/tags.txt" \
  --save_path="./assets/output.mp3" --lazy_load true
```

### Tags Format (comma-separated, no spaces)
```
piano,happy,wedding,synthesizer,romantic
```

### Lyrics Format (bracketed structural tags)
```
[Intro]
[Verse]
Your lyrics here...
[Chorus]
Chorus lyrics...
[Bridge]
[Outro]
```

### Key Parameters
| Parameter | Default | Description |
|-----------|---------|-------------|
| `--max_audio_length_ms` | 240000 | Max length (240s = 4 min) |
| `--topk` | 50 | Top-k sampling |
| `--temperature` | 1.0 | Sampling temperature |
| `--cfg_scale` | 1.5 | CFG scale |
| `--lazy_load` | false | Load/unload models on demand |
| `--mula_dtype` | bfloat16 | Model dtype |
| `--codec_dtype` | float32 | Codec dtype (fp32 for quality) |

Performance: RTF ≈ 1.0, Output: MP3 48kHz stereo 128kbps.

## Pitfalls

1. Do NOT use bf16 for HeartCodec — degrades audio quality.
2. Tags may be ignored (known issue #90). Lyrics tend to dominate.
3. Triton not available on macOS — Linux/CUDA only.
4. RTX 5080 incompatibility reported.
5. Links: [Repo](https://github.com/HeartMuLa/heartlib) | [Paper](https://arxiv.org/abs/2601.10547) | License: Apache-2.0
