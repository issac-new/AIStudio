---
name: hermes-tool-dependencies
description: "Install Python deps into Hermes venv, not system Python."
version: 1.0.0
---

# Hermes Tool Dependencies

## Core Problem

Hermes runs in its own isolated virtualenv. A bare `pip install <pkg>` installs
into the **system Python** (homebrew, conda, pipx, framework Python, etc.), which
Hermes cannot import. The install reports "Successfully installed" but
`import <pkg>` still fails inside Hermes. This is the #1 gotcha when enabling
features like local STT.

## Finding the Hermes Venv

The `hermes` launcher is a thin bash wrapper. Read it to discover the real venv:

```bash
cat "$(which hermes)"
# Typical output:
#   #!/usr/bin/env bash
#   unset PYTHONPATH
#   unset PYTHONHOME
#   exec "/Users/<user>/.hermes/hermes-agent/venv/bin/hermes" "$@"
```

The venv root is the directory containing `bin/hermes`:
- Python: `<venv>/bin/python`
- Pip:    `<venv>/bin/pip`

On a default install this is `~/.hermes/hermes-agent/venv/`. For profile-scoped
installs resolve via `$HERMES_HOME` instead of hardcoding `~/.hermes`.

## Install + Verify Pattern

```bash
HERMES_VENV=~/.hermes/hermes-agent/venv

# 1. Install into the CORRECT venv (full path, never bare pip)
$HERMES_VENV/bin/pip install faster-whisper

# 2. Verify Hermes can actually import it (critical — don't skip)
$HERMES_VENV/bin/python -c "import faster_whisper; print(faster_whisper.__version__)"
```

**Always verify with the venv's own python.** A successful pip install into the
wrong interpreter is the most common failure mode — it exits 0 and changes
nothing Hermes can see.

## Known Tools → Required Packages

| Hermes feature | Package | Config that triggers it |
|---|---|---|
| STT local (voice→text) | `faster-whisper` | `stt.enabled: true` + `stt.provider: local` |
| _(add rows as discovered)_ | | |

## Pitfalls

- **Bare `pip` is wrong.** It resolves to pipx/conda/homebrew/framework Python by
  default. Always use the full `<venv>/bin/pip` path for Hermes tool deps.
- **`which hermes` may return a PATH shim, not the venv.** Read the shim's
  contents — it `exec`s into the real venv binary. That exec target IS the venv.
- **First STT call downloads the model.** After installing faster-whisper, the
  first `local` STT invocation downloads the Whisper model from HuggingFace
  (~150 MB for `base`, more for `small`/`medium`/`large-v3`). Subsequent calls use
  the local cache. Warn the user about the initial delay.
- **TTS default voice is English.** Edge TTS ships `en-US-AriaNeural` as default.
  For Chinese output: `hermes config set tts.edge.voice zh-CN-XiaoxiaoNeural`.
  Other zh-CN voices: `zh-CN-YunxiNeural` (male), `zh-CN-YunyangNeural` (news).
- **STT model size tradeoff.** `tiny`/`base` are fast but less accurate on
  Chinese; `small`/`medium` are more accurate but slower and memory-hungry.
  Upgrade with `hermes config set stt.local.model small` if `base` misrecognizes.
