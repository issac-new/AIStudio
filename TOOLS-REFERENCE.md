# SwarmTeam — Third-Party Tools Reference

This document lists all third-party CLI tools referenced by SwarmTeam skills and SOUL.md files.

## Installation Methods

| Method | Command | When to use |
|--------|---------|-------------|
| **pip** (covered) | `pip install -r requirements-tools.txt` | Python packages |
| **npm** (covered) | `npm install` (from package-all.json) | Node.js tools |
| **winget** | `winget install <id>` | Windows built-in package manager |
| **choco** | `choco install <name>` | Chocolatey (needs install first) |
| **go** | `go install ...` | Go binaries (needs Go toolchain) |
| **manual** | Download from website | Tools without package managers |

---

## System Tools (NOT pip/npm — need winget/choco/manual)

### Documents & Media

| Tool | winget | choco | Purpose |
|------|--------|-------|---------|
| **ffmpeg** | `winget install Gyan.FFmpeg` | `choco install ffmpeg` | Video/audio processing |
| **pandoc** | `winget install JohnMacFarlane.Pandoc` | `choco install pandoc` | Document conversion |
| **libreoffice** | `winget install TheDocumentFoundation.LibreOffice` | `choco install libreoffice-fresh` | Office documents |
| **poppler** | manual (https://blog.alivate.com.au/poppler-windows/) | `choco install poppler` | PDF utilities (pdftotext, pdftoppm) |
| **qpdf** | `winget install Apache.QPDF` | `choco install qpdf` | PDF manipulation |
| **tesseract** | `winget install UB-Mannheim.TesseractOCR` | `choco install tesseract` | OCR (text recognition) |

### Development

| Tool | winget | choco | Purpose |
|------|--------|-------|---------|
| **git** | `winget install Git.Git` | `choco install git` | Version control |
| **node** | `winget install OpenJS.NodeJS.LTS` | `choco install nodejs-lts` | JavaScript runtime |
| **python** | `winget install Python.Python.3.12` | `choco install python` | Python runtime |
| **uv** | `winget install astral-sh.uv` | `choco install uv` | Fast Python package manager |
| **gh** | `winget install GitHub.cli` | `choco install gh` | GitHub CLI |
| **jq** | `winget install jqlang.jq` | `choco install jq` | JSON processor |
| **just** | `winget install Casey.Just` | `choco install just` | Command runner |

### Go Tools (need Go toolchain: `winget install GoLang.Go`)

| Tool | Install | Purpose |
|------|---------|---------|
| **nuclei** | `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest` | Vulnerability scanner |
| **subfinder** | `go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest` | Subdomain discovery |
| **htmlq** | `go install github.com/mgdm/htmlq@latest` | HTML query (like jq for HTML) |
| **himalaya** | `go install github.com/pimalaya/himalaya@latest` | CLI email client |

### Diagrams & Visualization

| Tool | winget | Purpose |
|------|--------|---------|
| **draw.io** | `winget install JGraph.Draw` | Diagram editor |
| **d2** | manual (https://d2lang.com/) | Declarative diagrams |
| **netron** | `winget install netron.netron` | ML model viewer |

### ML / AI

| Tool | Purpose |
|------|---------|
| **llama.cpp** | Local LLM inference — see https://github.com/ggerganov/llama.cpp |
| **ollama** | Local model runner — `winget install Ollama.Ollama` |

---

## pip Tools (covered by requirements-tools.txt)

62 Python packages including: faster-whisper, llama-cpp-python, pymupdf, vllm, pandas,
matplotlib, cryptography, httpx, pytest, debugpy, pre-commit, commitizen, cookiecutter, etc.

## npm Tools (covered by package-all.json)

31 Node.js packages including: @anthropic-ai/claude-code, puppeteer, pnpm, nx, artillery,
@mermaid-js/mermaid-cli, @stoplight/spectral-cli, etc.

---

## Quick Install (Windows PowerShell)

```powershell
# 1. Core system tools via winget
winget install Git.Git
winget install Gyan.FFmpeg
winget install JohnMacFarlane.Pandoc
winget install UB-Mannheim.TesseractOCR
winget install jqlang.jq
winget install GitHub.cli

# 2. Python tools via pip
pip install -r requirements-tools.txt

# 3. Node tools via npm
npm install --location=global  # from package-all.json
```
