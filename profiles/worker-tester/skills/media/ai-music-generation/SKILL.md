---
name: ai-music-generation
description: AI music generation, audio visualization, and songwriting craft. Covers HeartMuLa, songsee spectrograms, and Suno prompt engineering + lyrics structure.
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [music, audio, generation, songwriting, suno, ai, spectrogram, lyrics]
    related_skills: []
---

# AI Music Generation & Audio Tools

Umbrella skill for AI music generation, audio analysis, and songwriting. Three sub-tools, each documented in `references/`:

## 1. HeartMuLa — Open-Source Music Generation (`references/heartmula.md`)

HeartMuLa is a family of open-source music foundation models (Apache-2.0) that generates music conditioned on lyrics and tags. Comparable to Suno for open-source. Requires Python 3.10 and an NVIDIA GPU (8GB+ VRAM minimum).

**Key commands:**
```bash
git clone https://github.com/HeartMuLa/heartlib.git
cd heartlib
uv venv --python 3.10 .venv && . .venv/bin/activate
uv pip install -e .
python ./examples/run_music_generation.py \
  --model_path=./ckpt --version="3B" \
  --lyrics="./assets/lyrics.txt" --tags="./assets/tags.txt" \
  --save_path="./assets/output.mp3" --lazy_load true
```

See `references/heartmula.md` for full installation, dependency patches, parameter reference, and performance notes.

## 2. Songsee — Audio Spectrogram Visualization (`references/songsee.md`)

Generate spectrograms and multi-panel audio feature visualizations (mel, chroma, MFCC, hpss, self-similarity, loudness, tempogram, flux) from audio files. Requires Go.

**Key commands:**
```bash
go install github.com/steipete/songsee/cmd/songsee@latest
songsee track.mp3 -o spectrogram.png
songsee track.mp3 --viz spectrogram,mel,chroma,mfcc -o grid.png
```

See `references/songsee.md` for visualization types, flags, and output formats.

## 3. Songwriting & Suno AI Prompts (`references/songwriting.md`)

Covers: song structure (ABABCB, AABA, strophic), rhyme types (perfect, family, assonance, consonance, near/slant), emotional arc and dynamics mapping, Suno AI prompt engineering (style description, metatags, Custom Mode), parody adaptation, and phonetic tricks for AI vocalists.

See `references/songwriting.md` for the full songwriting craft guide and Suno prompt reference.

## Choosing the Right Tool

| Need | Use |
|------|-----|
| Generate a full song from lyrics + tags | HeartMuLa (local, GPU) or Suno (cloud) |
| Visualize audio (spectrograms, features) | songsee |
| Write lyrics with proper structure & rhyme | songwriting guide |
| Craft Suno AI prompts | songwriting guide § Suno section |
| Analyze audio properties programmatically | songsee + vision_analyze on output images |
