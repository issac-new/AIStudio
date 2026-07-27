---
name: music-and-audio
description: AI music generation, audio analysis, and songwriting craft. Covers HeartMuLa (open-source Suno-like generation), songsee (spectrogram/feature visualization), and songwriting/AI music prompt engineering.
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [music, audio, generation, songwriting, spectrogram, suno, analysis]
---

# Music & Audio — Generation, Analysis, and Songcraft

Three areas: open-source music generation (HeartMuLa), audio feature visualization (songsee), and songwriting craft + Suno AI prompt engineering.

## HeartMuLa — Open-Source Music Generation
Full reference: `references/heartmula.md`

Generate songs from lyrics + tags. Requires Python 3.10, NVIDIA GPU (8GB+ VRAM).

```bash
git clone https://github.com/HeartMuLa/heartlib.git
cd heartlib && uv venv --python 3.10 .venv && . .venv/bin/activate
uv pip install -e .
# Download checkpoints (several GB)
hf download --local-dir './ckpt' 'HeartMuLa/HeartMuLaGen'
# Generate
python ./examples/run_music_generation.py --model_path=./ckpt --version=3B \
  --lyrics=./assets/lyrics.txt --tags=./assets/tags.txt --lazy_load true
```

## Songsee — Audio Spectrograms
Full reference: `references/songsee.md`

```bash
go install github.com/steipete/songsee/cmd/songsee@latest
songsee track.mp3 -o spectrogram.png
songsee track.mp3 --viz spectrogram,mel,chroma,mfcc,flux
```

## Songwriting & AI Music Prompts
Full reference: `references/songwriting-and-ai-music.md`

Song structure: ABABCB (Verse/Chorus/Bridge), AABA, ABAB, AAA. Suno style prompts should describe the dynamic arc ("whisper to roar to whisper") not just the genre.

Metatags in lyrics: `[Whispered] [Belted] [Spoken Word] [Choir] [Guitar Solo]` etc. Use Custom Mode for serious work.

## Reference Files

| File | Content |
|------|---------|
| `references/heartmula.md` | HeartMuLa installation, patches, generation parameters |
| `references/songsee.md` | Songsee spectrogram/feature visualization |
| `references/songwriting-and-ai-music.md` | Song structure, rhyme, lyric craft, Suno prompt engineering |
