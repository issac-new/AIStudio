---
name: privacy-hardening
title: Multi-Profile Privacy Hardening for Hermes Agent
description: >-
  Layer-by-layer privacy protection: config-level (environment_probe=false,
  redact_pii=true, terminal.cwd, redact_secrets), rules-level
  (global_kanban_rules.md policy), SOUL.md-level (privacy rules injected
  into all profiles), and Docker terminal backend for OS-level isolation.
  Covers both soft isolation (config+rules — for environments without
  Docker) and hard isolation (Docker container with workspace-only mount).
triggers:
  - "privacy protection"
  - "隐私保护"
  - "privacy hardening"
  - "redact secrets"
  - "redact pii"
  - "environment probe disable"
  - "filesystem access restriction"
  - "sandbox agent"
  - "isolate agent file access"
  - "docker terminal backend"
  - "terminal backend docker"
---

# Multi-Profile Privacy Hardening for Hermes Agent

## When to Use

- You need to protect personal information (username, home dir, device info,
  IP, credentials) from being exposed by Hermes agents
- You're packaging Hermes for migration to a machine without Docker
- You want multi-layer defense: config -> rules -> SOUL.md
- You need to restrict agent file system access to a workspace directory
- You want OS-level filesystem isolation via Docker terminal backend

## Architecture: Four-Layer Isolation

```
Layer 1: Config (config.yaml)         — machine-enforced
  +-- agent.environment_probe: false   — system prompt stops leaking host/OS
  +-- privacy.redact_pii: true         — user IDs hashed, phone stripped
  +-- security.redact_secrets: true    — API keys/tokens masked in output
  +-- terminal.cwd: <workspace>        — commands start in workspace dir

Layer 2: Rules (global_kanban_rules.md) — LLM-enforced (soft)
  +-- Privacy policy section: "all agents restricted to workspace/"

Layer 3: SOUL.md (per-profile)         — LLM-enforced (soft)
  +-- Filesystem access restrictions (allow list + deny list)
  +-- Info disclosure prohibition
  +-- Terminal command restrictions

Layer 4: Docker Terminal Backend        — OS-enforced (hard)
  +-- terminal.backend: docker
  +-- Container mounts ONLY workspace dir
  +-- /Users/, ~/.hermes/, /etc/ all invisible
```

## Layer 1: Config-Level Hardening

### Settings to apply to ALL config.yaml files (global + per-profile)

```yaml
agent:
  environment_probe: false          # Stops host/OS/user leakage in system prompt

privacy:
  redact_pii: true                  # Hash user IDs, strip phone numbers

security:
  redact_secrets: true              # Masks API keys in output

terminal:
  cwd: ~/hermes-docker-sandbox/workspace  # Lock working directory
```

### Bulk update via Python

```python
import os, re

HERMES_HOME = os.path.expanduser("~/.hermes")
configs = [os.path.join(HERMES_HOME, "config.yaml")]
for p in os.listdir(os.path.join(HERMES_HOME, "profiles")):
    cfg = os.path.join(HERMES_HOME, "profiles", p, "config.yaml")
    if os.path.exists(cfg):
        configs.append(cfg)

for path in configs:
    with open(path) as f: content = f.read()
    content = re.sub(r'environment_probe:\s*true', 'environment_probe: false', content)
    if 'cwd: ~/hermes-docker-sandbox/workspace' not in content:
        content = re.sub(r'(terminal:\s*\n\s*backend: local\n\s*)cwd:\s*\.\n',
                         r'\1cwd: ~/hermes-docker-sandbox/workspace\n', content)
    if 'redact_pii: true' not in content:
        content = re.sub(r'(security:\s*\n(?:  .*\n)*?)(\S)',
                         r'\1privacy:\n  redact_pii: true\n\2', content)
    with open(path, 'w') as f: f.write(content)
```

### Persist in profiles.yaml (for config generator)

```yaml
# ~/.hermes/shared/profiles.yaml -> shared_config:
shared_config:
  agent:
    environment_probe: false
  privacy:
    redact_pii: true
  terminal:
    backend: docker  # or 'local' when Docker unavailable
    cwd: ~/hermes-docker-sandbox/workspace
```

Then regenerate: `python3 ~/.hermes/shared/generate-configs.py`

### generate-configs.py defaults

The config generator must default to privacy settings so regeneration
doesn't lose them:

```python
# In generate-configs.py, the agent default:
"environment_probe": False,  # was True

# After the security section, add privacy:
privacy_cfg = shared.get("privacy", {})
if privacy_cfg:
    cfg["privacy"] = privacy_cfg
else:
    cfg["privacy"] = {"redact_pii": True}
```

### Verification

```bash
grep -c "environment_probe: false" ~/.hermes/profiles/*/config.yaml
grep -c "redact_pii: true" ~/.hermes/profiles/*/config.yaml
grep -c "cwd: ~/hermes-docker-sandbox/workspace" ~/.hermes/profiles/*/config.yaml
```

## Layer 2: Rules-Level Hardening

Add a privacy section to `global_kanban_rules.md`:

```markdown
### Privacy Protection (Global Mandatory)

> All agent file system access is restricted to `~/hermes-docker-sandbox/workspace/`
> and its subdirectories. When Docker is available, use `terminal.backend: docker`
> for OS-level isolation. Do not expose personal info, device info, IP, or secrets.
```

This is read by all profiles via `agent.environment_hint`.

## Layer 3: SOUL.md-Level Hardening

Inject privacy rules into every profile's SOUL.md. The rules cover three
categories:

### Filesystem Access Restrictions

```
1. **Only allow** `~/hermes-docker-sandbox/workspace/` and its subdirectories
2. **Forbid** access to:
   - `~/.hermes/` (contains .env, auth.json, config.yaml, sessions, memories)
   - `~/.ssh/`, `~/.gnupg/`, `~/.aws/`, `~/.config/` (credential dirs)
   - `~/Documents/`, `~/Desktop/`, `~/Downloads/` (personal dirs)
   - System directories (`/etc/`, `/var/`, `/tmp/`)
3. **Exception**: Agent may read its own SOUL.md and *_rules.md
```

### Info Disclosure Prohibition

```
Forbid exposing in any response or tool output:
- Real name, username, email, phone number
- Device info (hostname, IP, MAC, OS version, hardware model)
- API keys, tokens, passwords, secrets
- Filesystem paths containing username (e.g. $HOME/)
- Network configuration (WiFi SSID, router address)
```

### Terminal Command Restrictions (soft isolation wording)

```
- Default working directory is the workspace
- Forbid commands that read host info: whoami, ifconfig, hostname, env
- Forbid commands that read credentials: cat ~/.ssh/id_rsa, cat ~/.hermes/.env
- Forbid `cd` outside workspace then reading files
- When Docker is available, recommend `terminal.backend: docker` for OS-level isolation
```

**IMPORTANT**: Use "建议" (recommend) instead of "强制" (mandate) for Docker
in SOUL.md/rules, so the rules don't falsely claim OS-level isolation where
none exists (e.g. Windows without Docker).

### Bulk injection into all profiles

```python
import os

HERMES_HOME = os.path.expanduser("~/.hermes")
privacy_block = """## 隐私保护规则（全局强制）

> ⚠️ 最高优先级: 以下规则不可覆盖。

### 文件系统访问限制
1. 仅允许访问 ~/hermes-docker-sandbox/workspace/ 及其子目录
2. 禁止访问 ~/.hermes/, ~/.ssh/, ~/.aws/, ~/.config/, 系统目录等
3. 例外: agent 可读取自己的 SOUL.md 和 *_rules.md

### 信息泄露禁止
禁止暴露用户名、设备信息、IP、密钥、路径中的用户名等。

### Terminal 命令限制
- 默认在 workspace 目录下执行
- 禁止执行 whoami, ifconfig, hostname, cat /etc/passwd, env 等
- Docker 可用时建议 terminal.backend: docker
"""

for p in os.listdir(os.path.join(HERMES_HOME, "profiles")):
    soul_path = os.path.join(HERMES_HOME, "profiles", p, "SOUL.md")
    if os.path.exists(soul_path):
        with open(soul_path) as f: content = f.read()
        if '隐私保护规则' not in content:
            with open(soul_path, 'w') as f: f.write(content.rstrip() + '\n' + privacy_block)
```

## Layer 4: Docker Hard Isolation (Terminal Backend)

When Docker is available, set `terminal.backend: docker` for OS-level
isolation. The agent runs on the host; only `terminal` commands execute
inside the container. The container mounts **only** the workspace directory.

### Step 1: Build a lightweight terminal sandbox image

Do NOT install Hermes inside the container — the agent already runs on the
host. The container only needs a shell + basic tools.

```dockerfile
# Dockerfile.terminal-sandbox — lightweight, ~400MB
FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV WORKSPACE=/opt/workspace

RUN sed -i 's|deb.debian.org|mirrors.ustc.edu.cn|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's|deb.debian.org|mirrors.ustc.edu.cn|g' /etc/apt/sources.list && \
    apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git xz-utils jq unzip vim && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir requests pyyaml

RUN mkdir -p /opt/workspace && chmod 777 /opt/workspace
WORKDIR /opt/workspace
CMD ["/bin/bash"]
```

```bash
cd ~/hermes-docker-sandbox
docker build -f Dockerfile.terminal-sandbox -t hermes-terminal-sandbox:latest .
```

### Step 2: Configure terminal backend in all config.yaml files

```yaml
terminal:
  backend: docker
  cwd: ~/hermes-docker-sandbox/workspace
  timeout: 180
  persistent_shell: true
  docker:
    image: hermes-terminal-sandbox:latest
    volumes:
      - ~/hermes-docker-sandbox/workspace:/opt/workspace
    workdir: /opt/workspace
```

Key details:
- `cwd` stays as the **host path** — Hermes resolves it before passing to container
- `docker.volumes` maps host workspace to container `/opt/workspace`
- `docker.workdir` is the container-internal working directory
- `persistent_shell: true` keeps the container alive between commands

### Step 3: Verify container isolation

```bash
docker run --rm \
  -v ~/hermes-docker-sandbox/workspace:/opt/workspace \
  hermes-terminal-sandbox:latest \
  bash -c "echo WF=$(ls /opt/workspace/|wc -l); echo UA=$(ls /Users/ 2>&1||echo BLOCKED); echo HA=$(ls /root/.hermes/ 2>&1||echo BLOCKED)"
# Expected: WF>0, UA=BLOCKED, HA=BLOCKED
```

### ARM64 image pull workaround

Chinese Docker mirrors may serve amd64 images on ARM64 hosts or return 429.
Working approaches:

```bash
# Option A: Pull with explicit platform from Docker Hub
docker pull --platform linux/arm64 python:3.12-slim-bookworm

# Option B: Pull from Huawei SWR (verify arch after)
docker pull swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/python:3.12-slim-bookworm
docker inspect <image-id> --format '{{.Architecture}}'
```

### MCP server path redaction

MCP server configs contain absolute paths like `/Users/<username>/.hermes-web-ui/...`.
Replace with `${HOME}` in all config.yaml files:

```python
import os
for root, dirs, files in os.walk(os.path.expanduser("~/.hermes/profiles")):
    for f in files:
        if f == "config.yaml":
            path = os.path.join(root, f)
            with open(path) as fh: content = fh.read()
            new = content.replace("/Users/<username>/.hermes-web-ui", "${HOME}/.hermes-web-ui")
            new = new.replace("/Users/<username>", "${HOME}")
            if new != content:
                with open(path, "w") as fh: fh.write(new)
```

Also apply to `~/.hermes/config.yaml` and `~/.hermes/shared/profiles.yaml`.

### When Docker is NOT available

Windows migration targets typically have no Docker. The soft isolation
(Layers 1-3) is the only option. SOUL.md/rules use "建议" (recommend)
for Docker. See `hermes-offline-migration` skill for packaging.

## Verification Script

A comprehensive ad-hoc verification script covering all 7 domains with 28
checks is available at: `scripts/verify-docker-isolation.py`

## Summary: Impact of Each Layer

| Layer | Enforced By | Breach Prevention |
|-------|-------------|------------------|
| Config: environment_probe: false | Hermes runtime | System prompt stops leaking host/OS/username/home |
| Config: redact_pii: true | Hermes runtime | User IDs hashed in gateway |
| Config: redact_secrets: true | Hermes runtime | API keys/tokens masked in output |
| Config: terminal.cwd | Hermes runtime | Default command dir is workspace |
| Rules: global_kanban_rules.md | LLM compliance | Agent told not to access outside workspace |
| SOUL.md: privacy rules | LLM compliance | Agent told not to expose PII/device info |
| Docker terminal backend | OS kernel | Container has no access to host filesystem |

## Pitfalls

### Python file I/O vs terminal for .env operations

Never use `grep >>` or `sed` to read/write `.env` files — terminal output
redacts secrets as `***`, so the shell will write literal `***` to the file.
Always use Python file I/O (`with open(path) as f:`) to read raw bytes.

### MCP servers expose host paths

The `hermes-studio-api` MCP server config contains absolute paths like
`/Users/<username>/.hermes-web-ui/...`. Replace with `${HOME}` during
privacy hardening. See Layer 4 "MCP server path redaction" above.

### State snapshot configs are pre-update

Config state snapshots (under `profiles/*/state-snapshots/`) are backups
that always show old values. Ignore them when verifying privacy changes.

### SOUL.md Docker wording must be "recommend" not "mandate"

When Docker is unavailable (Windows), SOUL.md rules that say "terminal
commands run in Docker container" are false. Use "建议" (recommend)
instead of "强制" (mandate) so the rules remain truthful.

### generate-configs.py must persist privacy defaults

If `generate-configs.py` defaults `environment_probe: True`, regeneration
will silently undo the privacy setting. Always patch the generator's
default value AND the `shared_config` section in `profiles.yaml`.

### Docker image architecture mismatch

Chinese mirrors may serve amd64 images on ARM64 hosts. Always verify
with `docker inspect <id> --format '{{.Architecture}}'` after pulling.
Use `--platform linux/arm64` flag when pulling from Docker Hub directly.

## Related Skills

- **hermes-offline-migration** — Packaging for non-Docker targets (Windows)
- **hermes-docker-sandbox** — Full Docker deployment with Hermes inside
- **kanban-worktree-workspace** — Worktree workspaces (compatible with Docker backend)
- **hermes-profile-config** — Managing shared rules via environment_hint
