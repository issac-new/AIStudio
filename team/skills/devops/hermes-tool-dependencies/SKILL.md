---
name: hermes-tool-dependencies
description: "Install Python deps into Hermes venv, not system Python. Use when any `hermes ...` CLI or Python-based tool fails with `No module named 'X'` or `ModuleNotFoundError` from inside the tools Python."
version: 1.1.0
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
| Action-gate yaml | `pyyaml` | Pinned in `hermes-agent/pyproject.toml` (gate is a hot-path import) |
| _(add rows as discovered)_ | | |

## When tools python stdlib itself is broken — `hermes-anaconda` fallback

A new failure class surfaced in 2026-10-15: tools python's own stdlib modules
(`re`, `pathlib`, `glob`, `traceback`, …) raise `ModuleNotFoundError: No module
named 'copyreg'` on the very first `import`. This is **not** a missing
site-package — `re/__init__.py:381` still has `import copyreg` (a module
removed in Python 3.13+ but pinned in this 3.14.7 build's stdlib). The
`.pth` file, the `wrapper`, the `pyyaml` pin, and `python-drift-watchdog.sh`
all check green. The whole `hermes ...` command tree silently no-ops on
every invocation that touches a stdlib module:

```
File "/Users/YOURNAME/.hermes/tools/python-3.14.7+202****0901-darwin-arm64/lib/python3.14/re/__init__.py", line 381, in <module>
    import copyreg
ModuleNotFoundError: No module named 'copyreg'
```

**Diagnosis** (in order, no skipping — the failure cascades through every
later check, so the FIRST command's output is the real evidence):

```bash
# 1. .pth + wrapper look fine? (sanity — proves it's not a setup drift)
cat "$HOME/.hermes/tools/python-3.14.7+202****0901-darwin-arm64/lib/python3.14/site-packages/hermes-live-root.pth"
ls -la "/Users/YOURNAME/.hermes/hermes-agent/.hermes/bin/hermes"

# 2. Reproduce on a stdlib-only import (no hermes_cli, no site-packages)
TOOLS_PY=$(ls -d "$HOME/.hermes/tools/python-3.14"*"/bin/python3" 2>/dev/null | head -1)
"$TOOLS_PY" -c 'import re; print(re.__file__)'
# If this fails with "No module named 'copyreg'" → stdlib itself is broken, fall through to fallback.

# 3. Confirm the same call works under anaconda python
/opt/anaconda3/bin/python3 -c 'import re; print(re.__file__)'   # → success
/opt/anaconda3/bin/python3 -c 'import sys; sys.path.insert(0, "/Users/YOURNAME/.hermes/hermes-agent"); import hermes_cli; print(hermes_cli.__file__)'  # → success
```

**Fallback wrapper** — already installed at `~/.hermes/bin/hermes-anaconda`
(255 bytes). It bypasses the broken tools python and runs the hermes entry
point under anaconda python with an explicit `sys.path.insert` for the live
hermes-agent tree:

```bash
cat ~/.hermes/bin/hermes-anaconda
# #!/bin/sh
# # Fallback wrapper: use anaconda python + sys.path.insert when tools python 残废
# exec /opt/anaconda3/bin/python3 -c "
# import sys
# sys.path.insert(0, '/Users/YOURNAME/.hermes/hermes-agent')
# from hermes_cli.main import main
# sys.exit(main())
# " "$@"
```

Use it as `hermes-anaconda kanban show t_xxx` instead of `hermes kanban show
t_xxx` until the broken tools python is fixed. **It still won't help
processes that were spawned with the broken `hermes` wrapper (gateway,
dispatcher, workers)** — those need a gateway restart with `HERMES_PYTHON`
or by replacing the wrapper symlink globally.

**Why the existing fixes don't catch this**: `python-drift-watchdog.sh`
checks (1) `.pth` content, (2) `wrapper` exec bit, (3) bare `hermes_cli.main`
spawn. All three can be green while the stdlib is broken, because the
broken stdlib is *above* `hermes_cli` in the import graph. The watchdog's
check #2 (`bare tools python cannot run -m hermes_cli.main`) is the closest
to catching it — extend that check to also probe `import re` first, so a
failing import fails the watchdog before hermes_cli is even reached.

**`.pth` for hermes_cli from anaconda python is *not* enough** — anaconda
python will reach the `.pth`, but `hermes_bootstrap.py` itself imports
`pathlib` (which is in tools python's stdlib), so adding `/Users/YOURNAME/.hermes/hermes-agent`
to anaconda's `site-packages` is a no-op without fixing the bootstrap chain.
The wrapper's `sys.path.insert(0, …)` before `import hermes_cli.main` is the
load-bearing line; do not delete it.

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
- **Don't diagnose tools-python failures as `~/.hermes config` drift when the
  real culprit is the stdlib.** `ModuleNotFoundError: No module named 'copyreg'`
  from `re/__init__.py` is a *Python 3.14.7 build artefact*, not a missing
  site-package. The `.pth` recipe, the wrapper bootstrap, and the
  `pyproject.toml` pyyaml pin all three are NO-OPS against this failure.
  Reach for the anaconda fallback wrapper instead of reinstalling pyyaml
  for the Nth time.
- **The fallback wrapper is a per-shell escape, not a global fix.** It works
  for the orchestrator's own CLI calls (`hermes-anaconda kanban show …`),
  but gateway/dispatcher/worker processes spawned with the broken `hermes`
  wrapper will keep crashing — those need a different remediation
  (replace the broken `hermes` wrapper symlink, or restart the gateway
  pointing to a working python). Don't claim "all tools work now" after
  switching the orchestrator to the anaconda wrapper.
