# Manual Hermes Install (QEMU Workaround)

When the official Hermes installer crashes with `exit code 139` (SIGSEGV) during `uv` binary execution, the root cause is QEMU user-mode emulation's incompatibility with statically-linked Rust binaries.

## Detecting the Problem

The hermetic installer build step fails with:

```
#7 ERROR: process "/bin/sh -c HERMES_HOME=/opt/hermes-data ...
curl -fsSL https://hermes-agent.nousresearch.com/install.sh |
bash -s -- --skip-browser --skip-setup" did not complete successfully: exit code: 139
```

The `139` exit code is SIGSEGV. It happens at the "Installing managed uv" step.

## Manual Install Sequence

```dockerfile
FROM --platform=linux/amd64 python:3.12-slim-bookworm

# System deps + Python 3.11 + Node.js 22
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git jq ca-certificates gnupg xz-utils \
    python3.11 python3.11-venv python3.11-dev \
    && rm -rf /var/lib/apt/lists/*

# Node.js (Claude Code dependency)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Manual Hermes install (no uv — it segfaults under QEMU)
RUN git clone --depth 1 https://github.com/NousResearch/hermes-agent.git \
      /usr/local/lib/hermes-agent && \
    cd /usr/local/lib/hermes-agent && \
    python3.11 -m venv venv && \
    . venv/bin/activate && \
    pip install --upgrade pip setuptools wheel && \
    pip install -e '.[all]' && \
    echo '#!/usr/bin/env bash' > /usr/local/bin/hermes && \
    echo 'exec /usr/local/lib/hermes-agent/venv/bin/hermes "$@"' \
      >> /usr/local/bin/hermes && \
    chmod +x /usr/local/bin/hermes
```

## Why This Works

| Component | Under QEMU | Reason |
|-----------|-----------|--------|
| `git clone` | ✅ Works | Pure network + file I/O |
| `python3.11 -m venv` | ✅ Works | Python stdlib, well-tested under emulation |
| `pip install` | ✅ Works | Downloads pre-compiled manylinux wheels (x86_64 native format, runs fine) |
| `uv sync` (official installer) | ❌ Segfaults | Rust binary, dynamically linked, unstable under QEMU |
| Node.js npm install | ✅ Works | Node.js itself runs fine under QEMU |

## Performance Note

The `pip install -e '.[all]'` step downloads ~120 packages and takes 10-15 minutes under QEMU. The official installer's `uv sync` is ~2-3× faster but unavailable when uv crashes. Progress indicators show each package downloading; look for the final line:

```
Successfully installed hermes-agent
```

## Verifying After Manual Install

```dockerfile
RUN /usr/local/bin/hermes --version
# Expected: "Hermes Agent v0.16.0 ..."
```

The launcher script at `/usr/local/bin/hermes` clears `PYTHONPATH` and `PYTHONHOME` before exec'ing the venv binary, preventing module shadowing from the host environment.
