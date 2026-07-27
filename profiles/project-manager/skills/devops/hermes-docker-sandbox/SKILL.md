---
name: hermes-docker-sandbox
description: "Deploy Hermes Agent in Docker containers: standalone containers with Docker Compose, Claude Code integration, multi-instance orchestration, and cross-architecture concerns (ARM64/AMD64)."
version: 1.4.0
author: agent
tags: [hermes, docker, deployment, claude-code, sandbox, container]
related_skills: [hermes-agent, claude-code, memory-provider-deployment]
---

# Hermes Docker Sandbox Deployment

Deploy Hermes Agent instances as Docker containers — either standalone or as a multi-instance fleet. Each container can optionally include Claude Code CLI for autonomous coding tasks.

## When to Use This

| Use Case | Approach | Why |
|----------|----------|-----|
| **Isolated sandbox** | Single Docker container | Hermes runs inside, host stays clean |
| **Multi-agent team** | Docker Compose with 3+ services | Design/Generator/Evaluator pattern |
| **Docker terminal backend** | Hermes on host, commands in Docker | Host agent, sandboxed execution |
| **Resource isolation** | Per-container `mem_limit` / `cpus` | Prevent one agent starving others |

## Architecture: Multi-Instance Pattern

```
┌────────────────────────────────────────────┐
│              Docker Host                     │
│  ┌────────────────┐  ┌─────────────┐  ┌───┐│
│  │ design:8643    │  │ generator   │  │ eva│
│  │ Hermes+Claude  │  │ :8644       │  │ ...│
│  └────────────────┘  └─────────────┘  └───┘│
│  ┌──────────────────────────────────────┐   │
│  │        Shared Workspace              │   │
│  └──────────────────────────────────────┘   │
└────────────────────────────────────────────┘
```

Each instance gets:
- Named volume for `HERMES_HOME` (persists config, sessions, memory)
- Dedicated API port mapping
- Optional `mem_limit` and `cpus` constraints
- Shared workspace volume for file interchange

## Dockerfile Essentials

### Base Image Strategy

| Base | Python | Notes |
|------|--------|-------|
| `python:3.12-slim-bookworm` | 3.12 + install 3.11 via apt | Hermes installer needs `python3.11` |
| `python:3.11-slim-bookworm` | 3.11 (native) | Best — Hermes installer finds it immediately |
| `nousresearch/hermes-agent:latest` | Pre-built | Fastest; add Claude Code on top |

### Required System Packages

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    jq \
    xz-utils \          # Required for Node.js tar.xz extraction by Hermes installer
    ca-certificates \
    gnupg \
    python3.11 \        # If base is 3.12, Hermes installer needs 3.11 explicitly
    && rm -rf /var/lib/apt/lists/*
```

### Hermes Installation

```dockerfile
ENV HERMES_HOME=/opt/hermes-data
RUN HERMES_HOME=/opt/hermes-data \
    curl -fsSL https://hermes-agent.nousresearch.com/install.sh | \
    bash -s -- --skip-browser --skip-setup
```

Installer flags:
- `--skip-browser` — skip Playwright/Chromium (saves ~500MB)
- `--skip-setup` — skip interactive setup wizard (non-interactive mode)
- `--no-skills` — don't seed bundled skills (optional, keeps image lean)

### GitHub Unreachable Workaround

When the Docker build environment cannot reach `github.com` (common behind firewalls, corporate proxies, or in China):

**Symptom**: Hermes installer fails with `fatal: unable to access 'https://github.com/...': GnuTLS recv error (-110)` or `Couldn't connect to server`.

**Solution**: Pre-clone the Hermes repo on the host and COPY it into the image:

```bash
# Host
git clone --depth 1 https://github.com/NousResearch/hermes-agent.git /tmp/hermes-agent
cp -a /tmp/hermes-agent ./hermes-agent/
rm -rf ./hermes-agent/.git    # 52MB saved
```

```dockerfile
# Dockerfile — replaces the Hermes installer RUN step
COPY hermes-agent /usr/local/lib/hermes-agent
RUN cd /usr/local/lib/hermes-agent && \
    python3.11 -m venv venv && \
    . venv/bin/activate && \
    pip install --upgrade pip setuptools wheel && \
    pip install -e '.[all]' && \
    echo '#!/usr/bin/env bash' > /usr/local/bin/hermes && \
    echo 'exec /usr/local/lib/hermes-agent/venv/bin/hermes "$@"' >> /usr/local/bin/hermes && \
    chmod +x /usr/local/bin/hermes
```

See `references/pre-clone-workaround.md` for full details and recovery paths.

### Manual Hermes Install (QEMU Workaround)

When the official installer's `uv` binary segfaults under QEMU emulation (exit code 139), install Hermes manually:

```dockerfile
RUN git clone --depth 1 https://github.com/NousResearch/hermes-agent.git /usr/local/lib/hermes-agent && \
    cd /usr/local/lib/hermes-agent && \
    python3.11 -m venv venv && \
    . venv/bin/activate && \
    pip install --upgrade pip setuptools wheel && \
    pip install -e '.[all]' && \
    echo '#!/usr/bin/env bash' > /usr/local/bin/hermes && \
    echo 'exec /usr/local/lib/hermes-agent/venv/bin/hermes "$@"' >> /usr/local/bin/hermes && \
    chmod +x /usr/local/bin/hermes
```

⚠️ **This approach is ~2-3× slower** than the official installer (pip resolves and installs ~120 packages, taking 10-15 minutes under QEMU). Only use when the official installer fails due to uv binary crashes.

**Why it works when uv fails:** pip uses pre-compiled manylinux wheels for native extensions, which are compatible with QEMU user-mode emulation. The official installer's `uv` binary is a pre-compiled Rust binary that's dynamically linked and can crash under QEMU.

Full error reproduction and step-by-step manual install walkthrough: `skill_view(name="hermes-docker-sandbox", file_path="references/qemu-manual-install-workaround.md")`.

### Optimization: Pre-install Node.js

Pre-installing Node.js via nodesource prevents the Hermes installer from downloading node-v22.22.3-linux-*.tar.xz (which requires `xz-utils`):

```dockerfile
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*
RUN HERMES_HOME=/opt/hermes-data \
    curl -fsSL https://hermes-agent.nousresearch.com/install.sh | \
    bash -s -- --skip-browser --skip-setup
```

### Claude Code Installation

```dockerfile
RUN npm config set prefix /usr/local && \
    npm install -g @anthropic-ai/claude-code
```

`npm config set prefix /usr/local` is critical — without it the global binary goes to `/root/.npm-global/bin/` which is not on PATH by default.

### Entrypoint Pattern

```dockerfile
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["/usr/local/bin/hermes"]
```

The entrypoint script (see `templates/docker-entrypoint.sh`) seeds a minimal `config.yaml` into `HERMES_HOME` if empty, ensuring the container starts gracefully without pre-configuration.

## Platform Architecture Concerns

**Critical**: The Docker registry mirror determines available platform architectures.

### Symptoms of Architecture Mismatch
- Build warning: `InvalidBaseImagePlatform: Base image was pulled with platform "linux/amd64", expected "linux/arm64"`
- `exit code 139` (SIGSEGV) during Hermes installer uv binary execution
- General QEMU emulation instability

### Resolution Paths

**Path A: Get native ARM64 images**
```bash
# Check what your Docker mirror provides
docker manifest inspect <image> | python3 -c "import sys,json;[print(f'{x[\"platform\"][\"architecture\"]}') for x in json.load(sys.stdin).get('manifests',[])]"

# Pull with explicit platform
docker pull --platform linux/arm64 python:3.12-slim-bookworm
```

**Path B: Build for AMD64 (via QEMU)**
```dockerfile
FROM --platform=linux/amd64 python:3.12-slim-bookworm
```
⚠️ QEMU emulation can cause uv binary segfaults (SIGSEGV). Only use as fallback.

**Path C: Find alternative registries**
Chinese mirror examples:
- `swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/python` (Huawei SWR — amd64 only)
- `crpi-7xkxsdc0iki61l0q.cn-hangzhou.personal.cr.aliyuncs.com/apconw/` (Aliyun CR — custom)

### Caching Strategy

Pull the base image once, tag it, then build off the local tag to avoid mirror rate limits:

```bash
# If mirror is 429'd (Too Many Requests):
docker pull --platform linux/arm64 <alternative-registry>/python:3.12-slim-bookworm
docker tag <alternative-registry>/python:3.12-slim-bookworm python:3.12-slim-bookworm
docker build -t hermes-sandbox:latest .
```

## Docker Compose: Multi-Instance Setup

See `references/docker-compose-config.md` for the full compose file template.

### Per-Instance Profile Isolation

Each instance needs its own:
- **Named volume** for `HERMES_HOME` (config, sessions, memory are per-instance)
- **`config.yaml`** with instance-specific settings (model, max_turns, etc.)
- **`.env`** with API keys (each instance can use the same keys)
- **Port mapping** (each instance exposes its Hermes API on a unique host port)

### Instance Role Configuration

| Instance | Role | max_turns | timeout | Port |
|----------|------|-----------|---------|------|
| design | Spec/planning | 50 | 300s | 8643 |
| generator | Code/content generation | 80 | 600s | 8644 |
| evaluator | Testing/review | 40 | 300s | 8645 |

```yaml
# Key docker-compose settings
services:
  design:
    image: hermes-sandbox:latest
    container_name: hermes-design
    command: gateway run
    ports: ["8643:8642"]
    volumes:
      - hermes-data-design:/opt/hermes-data
      - ./profiles/design/config.yaml:/opt/hermes-data/config.yaml:ro
      - ./workspace:/opt/workspace
    environment:
      - HERMES_INSTANCE=design
    mem_limit: 4g
    cpus: '2'
    networks: [hermes-net]

volumes:
  hermes-data-design:
  hermes-data-generator:
  hermes-data-evaluator:
```

## Image Build Times

On a typical connection (including ARM64 QEMU), the full build takes:

| Step | Time (approx) | Notes |
|------|---------------|-------|
| Base image pull | 30-120s | Depends on mirror speed |
| apt packages | 120s | Git + xz-utils + python3.11 |
| Hermes installer | 300-600s | Downloads uv, Python 3.11/Node.js 22, clones repo, installs deps |
| Claude Code | 60-120s | npm global install |
| **Total** | **10-15 min** | Varies by network |

Using the official `nousresearch/hermes-agent:latest` image as base saves ~5-10 minutes because Hermes is pre-installed.

## Gateway + Dashboard: Default-on Startup

For production deployment, start the Hermes gateway (OpenAI-compatible API server) and dashboard (web UI) by default. This requires a custom entrypoint because `hermes dashboard` and `hermes gateway run` are separate processes.

### Entrypoint Pattern: Background Dashboard + Foreground Gateway

The critical challenge: `hermes dashboard` must run as a **background** process, because `hermes gateway run` runs in the foreground as PID 1. If you background with a plain `&`, the dashboard receives **SIGHUP** when the shell `exec`s the gateway, killing it silently.

**⚠️ Docker-compose command wrapping**: When `docker-compose.yml` specifies `command: hermes gateway run` (a string, not a list), Docker wraps it in `sh -c "hermes gateway run"`. The entrypoint's `$1` will be `sh`, not `hermes`. Use `grep -q "gateway run"` instead of positional argument checks:

```bash
if echo "$*" | grep -q "gateway run"; then
    # dashboard + gateway startup
fi
```

**⚠️ Kill stale dashboard (PID 8)**: The background `nohup hermes dashboard` process typically becomes PID 8 in the container. `hermes dashboard --stop` cannot kill it because it was started via nohup+disown, not via `hermes dashboard register`. This stale process holds port 9119 bound to `127.0.0.1`, preventing the new dashboard from binding to `0.0.0.0`. Always kill it explicitly:

```bash
for pid in 8 9 10; do kill $pid 2>/dev/null || true; done
sleep 1
```

**⚠️ Dashboard first-run web UI build**: On first launch, `hermes dashboard` runs `tsc -b && vite build` which takes ~5 seconds. During this time, the dashboard is not yet listening. The `--skip-build` flag only works if `hermes_cli/web_dist/` was already built. Wait for the dashboard to be ready:

```bash
nohup hermes dashboard --host 0.0.0.0 --insecure > /tmp/dashboard.log 2>&1 &
disown
for i in $(seq 1 30); do
    if curl -s -o /dev/null http://127.0.0.1:9119/ 2>/dev/null; then
        # Verify it's on all interfaces (not just 127.0.0.1)
        HOST=$(hostname)
        if curl -s -o /dev/null --connect-timeout 2 "http://$HOST:9119/" 2>/dev/null; then
            echo "✅ Dashboard ready on 0.0.0.0:9119"
        fi
        break
    fi
    [ $i -eq 5 ] && echo "⏳ Building dashboard web UI..."
    sleep 1
done
```

**Working pattern** (see `templates/docker-entrypoint.sh`):

```bash
# Full working pattern combining all fixes
if echo "$*" | grep -q "gateway run"; then
    # Kill stale leftover dashboard holding port 9119
    for pid in 8 9 10; do kill $pid 2>/dev/null || true; done
    sleep 1

    if [ "${HERMES_DASHBOARD:-0}" = "1" ]; then
        echo "🔧 Starting dashboard on 0.0.0.0:9119..."
        nohup hermes dashboard --host 0.0.0.0 --insecure \
            > "${HERMES_HOME}/logs/dash.log" 2>&1 &
        disown
        for i in $(seq 1 30); do
            if curl -s -o /dev/null http://127.0.0.1:9119/ 2>/dev/null; then
                HOST=$(hostname)
                if curl -s -o /dev/null --connect-timeout 2 "http://$HOST:9119/" 2>/dev/null; then
                    echo "✅ Dashboard ready on 0.0.0.0:9119"
                fi
                break
            fi
            [ $i -eq 5 ] && echo "⏳ Building dashboard..."
            sleep 1
        done
    fi
    echo "🔧 Starting gateway..."
    exec hermes gateway run
fi
```

### Gateway + Dashboard Environment Variables

```yaml
environment:
  - HERMES_DASHBOARD=1                          # Enable dashboard
  - HERMES_DASHBOARD_HOST=0.0.0.0              # Bind to all interfaces
  - API_SERVER_ENABLED=true                     # Enable OpenAI-compatible API
  - API_SERVER_KEY=your-instance-key            # API key for authentication
  - API_SERVER_HOST=0.0.0.0                    # API server bind address
  - API_SERVER_CORS_ORIGINS=*                  # CORS for web access
```

Port mapping for multi-instance:

| Instance | API Port | Dashboard Port |
|----------|----------|---------------|
| design   | `8643:8642` | `9123:9119` |
| generator | `8644:8642` | `9124:9119` |
| evaluator | `8645:8642` | `9125:9119` |

### Entrypoint Override Pattern

To modify the entrypoint without rebuilding the image, mount it from the host:

```yaml
volumes:
  - ./docker-entrypoint.sh:/usr/local/bin/docker-entrypoint.sh
```

Also override the entrypoint path in docker-compose so the mount is used:

```yaml
entrypoint: ["/usr/local/bin/docker-entrypoint.sh"]
```

⚠️ The mounted file must have execute permission (`chmod +x`).

### Gateway crash: "unexpected signal"

**Symptom**: The gateway starts then immediately exits with:
```
Gateway stopped by an unexpected signal — persisting gateway_state=running
```

**Root cause**: (1) A background process (`hermes dashboard &`) sends SIGHUP to the shell when `exec` replaces it, or (2) the container has `stdin_open: true` / `tty: true` which makes the gateway think it's interactive and handle signals differently.

**Fix**: Remove `stdin_open` and `tty` when running in gateway mode, and use `nohup + disown` for the dashboard background process (see entrypoint pattern above).

## Claude Code Sandbox Permissions

In non-interactive Docker environments, Claude Code's default permission mode blocks file writes. Configure `/root/.claude/settings.json` with explicit allow list:

```json
{
  "permissions": {
    "allow": ["Read", "Write", "Bash", "Edit"]
  },
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "PROXY_MANAGED",
    "ANTHROPIC_BASE_URL": "http://host.docker.internal:15721",
    "CLAUDE_CODE_EFFORT_LEVEL": "high"
  }
}
```

Apply to all instances:

```bash
for c in design generator evaluator; do
  docker compose exec -T "$c" sh -c "cat > /root/.claude/settings.json" << 'EOF'
{
  "permissions": { "allow": ["Read", "Write", "Bash", "Edit"] },
  "env": { "ANTHROPIC_BASE_URL": "http://host.docker.internal:15721" }
}
EOF
done
```

Without this, `claude -p` will print "Done!" but never actually write the file — it's waiting for a permission confirmation that never comes in non-interactive mode.

## Post-Deployment Configuration

After containers are running, inject provider config and shared host configs directly without rebuilding.

### Pattern: Bulk Fleet Config Injection

Apply the same Hermes config to all instances by iterating over container names:

```bash
for c in design generator evaluator; do
  docker compose exec -T "$c" bash -c "cat > /opt/hermes-data/config.yaml" << 'CONFIGEOF'
model:
  default: deepseek-v4-flash
  provider: deepseek
  base_url: ''
agent:
  max_turns: 50
terminal:
  backend: local
  timeout: 180
CONFIGEOF
  docker compose exec -T "$c" bash -c "echo 'DEEPSEEK_API_KEY=*** > /opt/hermes-data/.env && chmod 600 /opt/hermes-data/.env"
done
```

### Pattern: Share Host Claude Code / cc-switch Config with Containers

When the host has a configured Claude Code proxy or `cc-switch` setup, share it with containers.

> **`cc switch` clarification**: `cc switch` is Codex CLI's **built-in subcommand** for switching model profiles / provider routing. It is NOT a third-party script. The host config directory is `~/.codex/` containing `config.toml`, `auth.json`, and `cc-switch-model-catalog.json` (auto-managed by Codex CLI). Claude Code on the host uses a separate config at `~/.claude/` which may point to the same proxy endpoint (`ANTHROPIC_BASE_URL`).

```bash
# 1. Copy Claude Code configs (auth tokens, base URL, model mapping)
for c in design generator evaluator; do
  docker compose exec -T "$c" mkdir -p /root/.claude
  docker compose cp ~/.claude.json "$c:/root/.claude.json"
  docker compose cp ~/.claude/settings.json "$c:/root/.claude/settings.json"
  # ⚠️ docker compose cp preserves host UID. Must chown to root:
  docker compose exec -T "$c" chown root:root /root/.claude.json /root/.claude/settings.json
done

# 2. Copy Codex CLI / cc-switch config (`cc switch` = Codex CLI built-in subcommand)
for c in design generator evaluator; do
  docker compose exec -T "$c" mkdir -p /root/.codex
  for f in config.toml auth.json cc-switch-model-catalog.json; do
    [ -f ~/.codex/$f ] && docker compose cp ~/.codex/$f "$c:/root/.codex/$f"
  done
  docker compose exec -T "$c" chown -R root:root /root/.codex
done
```

**Critical: Fix proxy address.** The host's Claude Code config uses `http://127.0.0.1:15721` (or similar). Inside a container, `127.0.0.1` is the container's loopback, not the host. Use `host.docker.internal` (Docker's built-in host DNS on macOS):

```bash
for c in design generator evaluator; do
  docker compose exec -T "$c" sh -c '
    sed -i "s|http://127.0.0.1:15721|http://host.docker.internal:15721|g" /root/.claude.json
    sed -i "s|127.0.0.1:15721|host.docker.internal:15721|g" /root/.codex/config.toml 2>/dev/null
  '
done
```

Verify proxy connectivity:

```bash
for c in design generator evaluator; do
  docker compose exec -T "$c" curl -s http://host.docker.internal:15721/health
done
# Expected per container: {"status":"healthy",...}
```

See `references/shared-host-proxy-config.md` for the full walkthrough.

### Pattern: Quick API Connectivity Smoke Test

After configuring API keys and model, verify with a minimal query:

```bash
docker compose exec design hermes chat -q "Reply only with OK"

# Expected output:
# ╭─ ⚕ Hermes ───────────────────────────────╮
#     OK
# ╰──────────────────────────────────────────╯
# Duration: ~14s (first query includes model loading)
```

A short response under 30s confirms the model provider connection is working.

## Verifying the Container

```bash
# Health check
docker compose exec design hermes doctor

# Interactive CLI
docker compose exec -it design hermes

# One-shot query (see "Quick API Connectivity Test" above for minimal test)
docker compose exec design hermes chat -q "Hello"

# Claude Code verification
docker compose exec design claude --version

# Claude Code print mode
docker compose exec design claude -p "What is 2+2?" --max-turns 1
```

## Cross-Machine Migration (Backup & Restore)

Package `~/.hermes/` for migration to another machine (e.g. macOS → Windows).
Two packaging modes available:

| Mode | Size | Includes | Use Case |
|------|------|----------|----------|
| **Standard** | ~325 MB | Kanban history, cron jobs, channel routing | Preserve all state |
| **Clean-target** | ~79 MB | Config + skills + plugins only | Brand-new machine, fresh start |

➡️ **Full packaging + upload + restore guide**: `references/migration-packaging.md`

Key decisions:
- **INCLUDE**: `profiles/` (config + rules + SOUL + skills + plugins + cron + memories + hindsight config), global `config.yaml`/`SOUL.md`/`global_kanban_rules.md`, `.env`, `auth.json`, `skills/`, `plugins/`
- **EXCLUDE**: `hermes-agent/` (3G source), `node/` (2G), `bin/`, `hermes-office/`, `memos-plugin/`, `plugins/memos-local-plugin/` (424M), `logs/`, `state-snapshots/`, `sessions/`, `state.db*`, `kanban.db*`, `kanban/`, `cache/`, profile `home/` dirs, all runtime DBs and state files
- **Upload**: via git LFS to modelscope repo (`.gitattributes` has `*.zip filter=lfs`)
- **Restore**: extract over `~/.hermes/`, run `hermes setup`, start Hindsight service, fix machine-specific paths, optionally `hermes kanban --board kanban001 init`

## Pitfalls

### 1. npm global binary not on PATH
The `npm install -g` installs Claude Code to npm's global prefix, which defaults to a directory outside PATH. **Always set the prefix:**
```dockerfile
RUN npm config set prefix /usr/local && npm install -g @anthropic-ai/claude-code
```

### 2. Multiple containers sharing one data directory
NEVER point two containers at the same `HERMES_HOME` — session files and memory stores don't support concurrent writes. Use separate named volumes or host directories per instance.

### 3. Claude Code first-use login required
Inside the container, Claude Code requires authentication:
```bash
docker compose exec -it design claude auth login --console
```
Or set `ANTHROPIC_API_KEY` in the container's `.env` and use `claude --bare -p` for CI.

### 4. Hermes gateway needs API keys in `.env`
The gateway won't start without at least one provider's API key. Configured via mounted `.env` or `-e` environment variables.

### 5. Debian slim images missing xz-utils
The Hermes installer downloads `node-v22.22.3-linux-arm64.tar.xz` — `tar` calls `xz` internally. The slim image doesn't include `xz-utils`, so the Node.js extraction silently fails. Install it explicitly.

### 6. Registry mirror rate limits (429)
Chinese Docker mirrors (e.g., `docker.xuanyuan.me`) frequently return 429 Too Many Requests. Workaround: pull the image from an alternative registry (Huawei SWR, Aliyun CR) and tag it locally before building.

### 7. Docker compose cp file ownership

`docker compose cp` preserves the host file's UID/GID. For files that need to be owned by `root:root` inside the container, always run `chown` after copying:

```bash
docker compose cp ~/.claude.json "$c:/root/.claude.json"
docker compose exec -T "$c" chown root:root /root/.claude.json
```

### 8. GitHub unreachable inside Docker build

The Docker build environment (BuildKit) may use a different network namespace that cannot resolve or connect to `github.com`. Use the pre-clone + COPY workaround (see section "GitHub Unreachable Workaround" above).

### 9. Dashboard binding fails silently

The background `nohup hermes dashboard --host 0.0.0.0 --insecure` process (PID 8) may bind to `127.0.0.1` only, and `hermes dashboard --stop` cannot kill it. Always explicitly `kill 8` before starting the dashboard. See `references/dashboard-binding-debug.md` for full diagnostic flow.

### 10. Docker Desktop pre-allocates port range on macOS (api_server conflict)

**Symptom:** Hermes api_server fails to connect after gateway restart, with repeated errors in gateway.log:
```
ERROR gateway.platforms.api_server: Port 8644 already in use.
Set a different port in config.yaml: platforms.api_server.port
```

But no Docker container explicitly maps port 8644 — `docker port <container>` shows only the expected ports.

**Root cause:** Docker Desktop on macOS (`com.docker` process) pre-allocates a range of adjacent ports beyond what containers explicitly map. When multiple containers use ports like 8643→8642, Docker Desktop also reserves 8644, 8645, etc. for internal routing, even though no container claims them.

**How to diagnose and fix:**
```bash
# 1. Verify no container claims the port
docker port hermes-design     # Check container's explicit port mappings

# 2. Find what's actually listening
lsof -i :8644                 # Shows "com.docker" process

# 3. Find any free port outside Docker's range
for port in 8650 8660 8670; do
  if ! lsof -i :$port >/dev/null 2>&1; then
    echo "$port is free"
    break
  fi
done

# 4. Update api_server port in all profile configs
for prof in orchestrator worker-coder worker-researcher; do
  sed -i '' 's/port: 864.*/port: 8650/' ~/.hermes/profiles/$prof/config.yaml
done

# 5. Restart gateway
hermes gateway restart
```

**Prevention:** Avoid ports near existing Docker port mappings. If your containers use 8643/9123, pick api_server ports at least 5-10 numbers away (e.g., 8650 instead of 8644). Docker Desktop appears to reserve about a 2-3 port window around each mapped container port.

Full diagnostic walkthrough: `references/api-server-port-conflict.md`.
