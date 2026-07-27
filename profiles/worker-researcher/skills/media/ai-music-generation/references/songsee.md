# Songsee — Audio Spectrogram Visualization

Generate spectrograms and multi-panel audio feature visualizations from audio files.

## Install

```bash
go install github.com/steipete/songsee/cmd/songsee@latest
```

Optional: `ffmpeg` for formats beyond WAV/MP3.

## Quick Start

```bash
# Basic spectrogram
songsee track.mp3

# Save to file
songsee track.mp3 -o spectrogram.png

# Multi-panel visualization grid
songsee track.mp3 --viz spectrogram,mel,chroma,hpss,selfsim,loudness,tempogram,mfcc,flux

# Time slice
songsee track.mp3 --start 12.5 --duration 8 -o slice.jpg

# From stdin
cat track.mp3 | songsee - --format png -o out.png
```

## Visualization Types

| Type | Description |
|------|-------------|
| `spectrogram` | Standard frequency spectrogram |
| `mel` | Mel-scaled spectrogram |
| `chroma` | Pitch class distribution |
| `hpss` | Harmonic/percussive separation |
| `selfsim` | Self-similarity matrix |
| `loudness` | Loudness over time |
| `tempogram` | Tempo estimation |
| `mfcc` | Mel-frequency cepstral coefficients |
| `flux` | Spectral flux (onset detection) |

## Common Flags

`--style` (color palette): `classic`, `magma`, `inferno`, `viridis`, `gray`
`--width` / `--height`, `--window` / `--hop`, `--min-freq` / `--max-freq`
`--format`: `jpg` or `png`

## Notes

- WAV and MP3 decoded natively; other formats require `ffmpeg`
- Output images can be inspected with `vision_analyze` for automated audio analysis
- Useful for comparing audio outputs, debugging synthesis, or documenting audio processing pipelines
