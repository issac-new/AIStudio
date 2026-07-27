---
name: ascii-tools
description: "ASCII art generation and ASCII video production: banners, cowsay, boxes, image-to-ASCII, video-to-ASCII, audio-reactive visualizers."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [ASCII, art, video, banners, creative, terminal, animation, text-art]
    related_skills: [excalidraw, p5js]
---

# ASCII Tools

ASCII art generation and ASCII video production — from simple text banners to full video-to-ASCII pipelines.

Two main workflows:

---

## 1. ASCII Art Tools (Static)

Generate banners, decorative borders, talking animals, QR codes, weather art, and image-to-ASCII conversions. All tools are local CLI or free REST APIs — no API keys required.

### Text Banners — pyfiglet (local)

```bash
pip install pyfiglet --break-system-packages -q
python3 -m pyfiglet "YOUR TEXT" -f slant
python3 -m pyfiglet "TEXT" -f doom -w 80    # Set width
python3 -m pyfiglet --list_fonts             # List all 571 fonts
```

Recommended fonts: `slant` (clean modern), `doom` (bold blocky), `big` (readable), `banner3` (classic), `cyberlarge` (tech), `3-d` (3D effect).

### Text Banners — asciified API (no install)

```bash
curl -s "https://asciified.thelicato.io/api/v2/ascii?text=Hello+World"
curl -s "https://asciified.thelicato.io/api/v2/ascii?text=Hello&font=Slant"
curl -s "https://asciified.thelicato.io/api/v2/fonts"   # List fonts
```

### Cowsay — Message Art

```bash
sudo apt install cowsay -y
cowsay "Hello World"
cowsay -f tux "Linux rules"       # Tux the penguin
cowsay -f dragon "Rawr!"          # Dragon
cowsay -l                         # List 50+ characters
cowsay -b "Borg"                  # =_= eyes
cowsay -d "Dead"                  # x_x eyes
```

### Boxes — Decorative Borders

```bash
sudo apt install boxes -y
echo "Hello World" | boxes -d stone           # Stone border
echo "Hello World" | boxes -d parchment       # Parchment scroll
echo "Hello World" | boxes -d cat             # Cat border
boxes -l                                       # List 70+ designs
```

### TOIlet — Colored Text Art

```bash
sudo apt install toilet -y
toilet "Hello World"                    # Basic
toilet --gay "Rainbow!"                 # Rainbow coloring
toilet --metal "Metal!"                 # Metallic effect
```

### Image to ASCII

```bash
# ascii-image-converter (modern)
ascii-image-converter image.png             # Basic
ascii-image-converter image.png -C          # Color
ascii-image-converter image.png -d 60,30    # Set dimensions

# jp2a (lightweight, JPEG)
jp2a --width=80 image.jpg
jp2a --colors image.jpg
```

### Pre-made ASCII Art

```bash
curl -s 'https://ascii.co.uk/art/cat' -o /tmp/ascii_art.html
# Extract <pre> tags with Python for clean output
```

Subjects: cat, dog, dragon, skull, robot, tree, car, rocket, coffee, etc.

### Fun Utilities

```bash
curl -s "qrenco.de/Hello+World"               # QR code as ASCII
curl -s "wttr.in/London"                      # Weather as ASCII
curl -s "https://api.github.com/octocat"       # GitHub Octocat
```

### LLM-Generated Custom Art (Fallback)

Use Unicode box drawing (╔═╗╚╝║), block elements (░▒▓█), and geometric symbols (◆◇◈●○■▲△). Max 60 chars wide, 15-25 lines.

---

## 2. ASCII Video Production (Animated)

Full pipeline for converting video/audio/images into colored ASCII character video output (MP4, GIF, image sequences). Python + NumPy + Pillow + ffmpeg.

### Modes

| Mode | Input | Output |
|------|-------|--------|
| Video-to-ASCII | Video file | ASCII recreation of source footage |
| Audio-reactive | Audio file | Generative visuals driven by audio features |
| Generative | None/seed | Procedural ASCII animation |
| Hybrid | Video + audio | ASCII video with audio-reactive overlays |
| Lyrics/text | Audio + SRT | Timed text with visual effects |

### Pipeline

```
INPUT → ANALYZE → SCENE_FN → TONEMAP → SHADE → ENCODE
```

### Quick Start

```bash
pip install numpy scipy pillow
# Requires ffmpeg installed
```

Single Python script per project using:
- **Engine:** NumPy + Pillow for character rasterization and compositing
- **Audio:** SciPy FFT, peak detection for audio-reactive modes
- **Video I/O:** ffmpeg CLI for decoding input, encoding output, muxing audio
- **Parallel:** `concurrent.futures` for multi-clip rendering

### Critical Implementation Note

**Brightness:** Always use adaptive `tonemap()`, never `canvas * N` multipliers:
```python
def tonemap(canvas, gamma=0.75):
    f = canvas.astype(np.float32)
    lo, hi = np.percentile(f[::4, ::4], [1, 99.5])
    if hi - lo < 10: hi = lo + 10
    f = np.clip((f - lo) / (hi - lo), 0, 1) ** gamma
    return (f * 255).astype(np.uint8)
```

### Creative Dimensions

| Dimension | Options |
|-----------|---------|
| Character palette | Density ramps, block elements, scripts (katakana, Greek, braille) |
| Color strategy | HSV, OKLAB, discrete RGB, monochrome |
| Background texture | Sine fields, noise, domain warp, voronoi, CA |
| Effects | Rings, spirals, tunnel, vortex, fire, SDFs, particles (snow, rain, boids) |
| Shader mood | Retro CRT, glitch, cinematic, dreamy, industrial |
| Grid density | 8px-40px, mixed per layer |
| Feedback | Zoom tunnel, rainbow trails, ghostly echo |

### Performance Targets

~100-200ms/frame total. Character render bottleneck at 80-150ms.

### Reference Files

This umbrella's `references/` directory contains detailed technical references for:
- `architecture.md` — Grid systems, character palettes, color system
- `composition.md` — Blend modes, masking, feedback buffers
- `effects.md` — Noise, particles, SDFs, transforms
- `inputs.md` — Audio analysis, video sampling, TTS
- `optimization.md` — Hardware detection, quality profiles
- `scenes.md` — Scene protocol, scene table, design patterns
- `shaders.md` — Shader chain, 38 shader catalog
- `troubleshooting.md` — Common issues and fixes

Load with: `skill_view(name="ascii-tools", file_path="references/<file>.md")`

---

## Decision Flow

1. **Static text banner** → pyfiglet or asciified API
2. **Fun message character** → cowsay
3. **Decorative border** → boxes
4. **Pre-made ASCII art** → ascii.co.uk via curl
5. **Image to ASCII** → ascii-image-converter or jp2a
6. **QR code** → qrenco.de
7. **Weather art** → wttr.in
8. **Video to ASCII** → Python production pipeline (see section 2)
9. **Audio-reactive visualizer** → Python pipeline with SciPy FFT
10. **Generative ASCII animation** → Python with noise fields and effects
11. **Custom/creative ASCII** → LLM generation with Unicode palette
