# Docker Registry Mirror & Platform Architecture Guide

## The Problem

Docker Desktop on this machine uses mirror `https://docker.xuanyuan.me/` (a Chinese Docker Hub mirror). This mirror:

1. **Rate-limits aggressively** — returns HTTP 429 Too Many Requests after a few pulls
2. **May not carry ARM64 images** — only provides linux/amd64 variants on some registries

When the mirror is rate-limited, `docker build`, `docker pull`, and `docker manifest` all fail at the metadata HEAD request stage — you can't even check if an image exists.

## Diagnostic Commands

```bash
# Check configured mirrors
docker info | grep -A5 "Registry Mirrors"

# Check if mirror is the problem (try direct pull)
docker pull --platform linux/arm64 python:3.12-slim-bookworm
# → "429 Too Many Requests" = mirror is rate-limited

# Check image architecture on a working registry
docker manifest inspect python:3.12-slim-bookworm 2>/dev/null | \
  python3 -c "import sys,json;[print(f'{x[\"platform\"][\"os\"]}/{x[\"platform\"][\"architecture\"]}') for x in json.load(sys.stdin).get('manifests',[])]"
```

## Resolution Strategy: Pull → Tag → Build

### Step 1: Find an alternative registry

| Registry | URL Pattern | Platform | Notes |
|----------|------------|----------|-------|
| Huawei SWR | `swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/<image>:<tag>` | amd64 only | Fast, reliable in China |
| Aliyun CR | `crpi-<id>.cn-hangzhou.personal.cr.aliyuncs.com/<namespace>/<image>:<tag>` | varies | User-customized |
| Docker Hub (direct) | `docker.io/library/<image>:<tag>` | multi-arch | Blocked/slow in China |

### Step 2: Pull and tag

```bash
# From Huawei SWR (amd64)
docker pull swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/python:3.12-slim-bookworm
docker tag swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/python:3.12-slim-bookworm python:3.12-slim-bookworm

# From Aliyun CR (if you have a CR instance)
docker pull crpi-xxx.cn-hangzhou.personal.cr.aliyuncs.com/namespace/python:3.12-slim-bookworm
docker tag crpi-xxx.cn-hangzhou.personal.cr.aliyuncs.com/namespace/python:3.12-slim-bookworm python:3.12-slim-bookworm
```

### Step 3: Verify architecture

```bash
docker inspect python:3.12-slim-bookworm --format '{{.Os}}/{{.Architecture}}'
# → linux/amd64
```

### Step 4: Build with explicit platform in Dockerfile

```dockerfile
FROM --platform=linux/amd64 python:3.12-slim-bookworm
```

## AMD64 Under QEMU (Apple Silicon)

When building amd64 images on Apple Silicon, Docker Desktop uses QEMU user-mode emulation. Known issues:

- **Hermes installer's `uv` binary may SIGSEGV** (exit code 139) — the native x86_64 uv binary crashes under QEMU
- Python dependency compilation is 2-5× slower
- Node.js processes may exhibit random segfaults

**If uv crashes under QEMU**, the only reliable fix is to get a native ARM64 Python image. Try:

1. Wait for `docker.xuanyuan.me` rate limit to expire (typically 1-2 minutes)
2. Use a different time of day when the mirror is less loaded
3. Build the Docker image on a Linux AMD64 machine natively
4. **Use `nousresearch/hermes-agent:latest` as base** (official multi-arch image with ARM64 support) — this is the most reliable fix because the official image is maintained with proper multi-arch support and doesn't need the Dockerfile build steps for Hermes at all:

```dockerfile
FROM nousresearch/hermes-agent:latest
RUN npm config set prefix /usr/local && \
    npm install -g @anthropic-ai/claude-code
```

The `nousresearch/hermes-agent` image handles all Hermes installation, Node.js, and Python setup. You only add Claude Code on top. Build time drops from 40+ min to ~2 min.

## Verifying the Hermes Installer Build Step

The most failure-prone build step is the Hermes installer. Watch for:

```dockerfile
RUN HERMES_HOME=/opt/hermes-data \
    curl -fsSL https://hermes-agent.nousresearch.com/install.sh | \
    bash -s -- --skip-browser --skip-setup
```

Signs of success:
```
→ Root install on Linux — using FHS layout
→   Code:    /usr/local/lib/hermes-agent
→   Command: /usr/local/bin/hermes
```

Signs of failure under QEMU:
```
→ Installing managed uv into /opt/hermes-data/bin ...
# ERROR: process ... did not complete successfully: exit code: 139
```

Exit code 139 = SIGSEGV = uv binary crashed under emulation. The fix is always to get a native-architecture base image.
