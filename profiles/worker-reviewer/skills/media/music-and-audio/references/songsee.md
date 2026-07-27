# Songsee — Audio Spectrograms

Generate spectrograms and multi-panel audio feature visualizations.

```bash
go install github.com/steipete/songsee/cmd/songsee@latest

# Basic spectrogram
songsee track.mp3 -o spectrogram.png

# Multi-panel visualization
songsee track.mp3 --viz spectrogram,mel,chroma,hpss,selfsim,loudness,tempogram,mfcc,flux

# Time slice
songsee track.mp3 --start 12.5 --duration 8 -o slice.jpg

# Stdin
cat track.mp3 | songsee - --format png -o out.png
```

Flags: `--style classic|magma|inferno|viridis|gray`, `--width`, `--height`, `--format jpg|png`, `-o output`

Visualization types: `spectrogram`, `mel`, `chroma`, `hpss` (harmonic/percussive), `selfsim`, `loudness`, `tempogram`, `mfcc`, `flux`.
