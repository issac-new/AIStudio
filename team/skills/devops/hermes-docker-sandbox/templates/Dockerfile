# Hermes Agent + Claude Code - Docker Sandbox Image

Minimal Hermes Agent Docker image with Claude Code CLI pre-installed.

## Dockerfile

```dockerfile
# Uses python:3.12 base + python3.11 from Debian repos so Hermes installer
# finds Python 3.11 and skips downloading it (~29MB uv download saved).
# xz-utils pre-installed so the Node.js tar.xz extraction succeeds.

FROM python:3.12-slim-bookworm

LABEL maintainer="Hermes Sandbox Deployment"
LABEL description="Hermes Agent with Claude Code CLI - Docker Sandbox"

ENV DEBIAN_FRONTEND=noninteractive
ENV HERMES_HOME=/opt/hermes-data
ENV PATH="/usr/local/bin:/usr/local/lib/hermes-agent/venv/bin:${PATH}"

# Install system dependencies + Python 3.11 (Hermes installer needs this)
# + xz-utils (for Node.js tar.xz extraction by Hermes installer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    jq \
    xz-utils \
    ca-certificates \
    gnupg \
    python3.11 \
    && rm -rf /var/lib/apt/lists/*

# Install Hermes Agent via official install script
RUN HERMES_HOME=/opt/hermes-data \
    curl -fsSL https://hermes-agent.nousresearch.com/install.sh | \
    bash -s -- --skip-browser --skip-setup

# Verify Hermes
RUN test -x /usr/local/bin/hermes && /usr/local/bin/hermes --version

# Install Claude Code CLI globally via npm
RUN npm config set prefix /usr/local && \
    npm install -g @anthropic-ai/claude-code

# Create data and workspace directories
RUN mkdir -p /opt/hermes-data /opt/workspace

# Entrypoint
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /opt/workspace
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/usr/local/bin/hermes"]
```

## Official Image Shortcut

If the official Hermes Docker image is available:

```dockerfile
FROM nousresearch/hermes-agent:latest
RUN npm config set prefix /usr/local && \
    npm install -g @anthropic-ai/claude-code
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["hermes"]
```

## Build

```bash
docker build -t hermes-sandbox:latest -f Dockerfile .
```

## Build Time Estimates

| Factor | Time | Condition |
|--------|------|-----------|
| Full build (slim base) | 10-15 min | First build, slow network |
| Cached rebuild | 30-60s | Only changed layers |
| Official base image | 2-5 min | Pre-installed Hermes, just add Claude Code |

## Registry Mirror Notes

When `docker.xuanyuan.me` is rate-limited (429):

```bash
# Find an alternative mirror that has the image
docker pull --platform linux/arm64 swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/python:3.12-slim-bookworm
docker tag swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/python:3.12-slim-bookworm python:3.12-slim-bookworm

# Then build normally — Docker uses the locally-tagged image
docker build -t hermes-sandbox:latest .
```

Ensure the mirror provides the correct platform (arm64 for Apple Silicon, amd64 for Intel/Linux).
