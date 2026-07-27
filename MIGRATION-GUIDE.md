# Migration Guide

Complete deployment guide for SwarmTeam Hermes Agent profiles.

## Prerequisites

### 1. Install Hermes Agent

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash

# Or via pip
uv tool install hermes-agent
```

### 2. Install Git

```bash
# macOS
brew install git

# Ubuntu/Debian
sudo apt install git

# Windows
winget install Git.Git
```

### 3. Verify Installation

```bash
hermes --version
hermes doctor
```

## Installation

### Option A: Batch Install (Recommended)

```bash
# Clone the repo
git clone https://github.com/issac-new/SwarmTeam.git
cd SwarmTeam

# Make installer executable
chmod +x install-all.sh

# Install all 23 profiles
./install-all.sh

# Or install a specific team
./install-all.sh --team swarm
./install-all.sh --team hack
./install-all.sh --team product
./install-all.sh --team ops
```

### Option B: Install via `hermes profile install`

Each profile is a standard Hermes distribution:

```bash
# Install orchestrator
hermes profile install github.com/issac-new/SwarmTeam --name orchestrator --alias -y

# Install a worker
hermes profile install github.com/issac-new/SwarmTeam --name worker-coder --alias -y
```

### Option C: Manual Clone

```bash
# Clone to ~/.hermes/profiles/
git clone https://github.com/issac-new/SwarmTeam.git /tmp/swarmteam
cp -r /tmp/swarmteam/profiles/* ~/.hermes/profiles/
```

## Post-Install Configuration

### 1. Fill in Credentials

Each profile needs its own `.env` file:

```bash
# For each profile you installed:
cp ~/.hermes/profiles/<profile-name>/.env.EXAMPLE ~/.hermes/profiles/<profile-name>/.env
nano ~/.hermes/profiles/<profile-name>/.env
```

Required keys (see `distribution.yaml` → `env_requires`):

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key (primary LLM) |
| `GLM_API_KEY` | Yes | Z.AI/GLM API key (GLM-5.2 model) |
| `SILICONFLOW_API_KEY` | No | SiliconFlow API key (Hindsight embeddings) |
| `MATRIX_ACCESS_TOKEN` | No | Matrix access token (gateway) |
| `ANTHROPIC_AUTH_TOKEN` | No | Anthropic token (ACP Claude Code) |
| `ANTHROPIC_BASE_URL` | No | Anthropic base URL (cc switch proxy) |

### 2. Verify Profiles

```bash
hermes profile list
```

You should see all installed profiles with their distribution info.

### 3. Configure Global Settings

The global `config.yaml` and `shared/profiles.yaml` are included (sanitized). If you want to use the shared config generator:

```bash
# Copy shared resources
cp shared/generate-configs.py ~/.hermes/shared/
cp shared/profiles.yaml ~/.hermes/shared/

# Edit profiles.yaml with your model/provider preferences
nano ~/.hermes/shared/profiles.yaml

# Generate per-profile configs
cd ~/.hermes/shared && python3 generate-configs.py
```

### 4. Initialize Kanban Board (Multi-Agent Collaboration)

```bash
# Initialize the shared Kanban board
hermes kanban --board kanban001 init

# Verify
hermes kanban --board kanban001 list
```

### 5. Start Gateway (Optional — for messaging platforms)

```bash
# Start the gateway with orchestrator profile
hermes -p orchestrator gateway run

# Or install as background service
hermes gateway install
hermes gateway start
```

### 6. Configure Hindsight Memory (Optional)

If using Hindsight for long-term memory:

```bash
# Each profile's hindsight/config.json is included
# Start the Hindsight API server
cd ~/.hermes/profiles/orchestrator/hindsight
./start.sh
```

## Model Configuration

The profiles are configured for these models:

| Team | Model | Provider | Fallback |
|------|-------|----------|----------|
| swarm (9) | GLM-5.2 | Z.AI (custom) | GLM-5.1 → V4-Flash |
| hack (6) | Kimi K3 | Moonshot | V4-Flash → GLM-5.2 |
| product (4) | GLM-5.2 | Z.AI (custom) | GLM-5.1 → V4-Flash |
| ops (4) | GLM-5.2 | Z.AI (custom) | GLM-5.1 → V4-Flash |
| aux/vision | Kimi K3 | Moonshot | — |

To change models, edit each profile's `config.yaml`:

```yaml
model:
  default: your-model-name
  provider: your-provider
```

## ACP Claude Code Integration

All profiles include the `acp-client` plugin for Claude Code integration:

1. Install Claude Code CLI
2. Set up the cc switch proxy:
   ```bash
   export ANTHROPIC_AUTH_TOKEN=your-token
   export ANTHROPIC_BASE_URL=http://127.0.0.1:15721
   ```
3. Enable in profile config:
   ```yaml
   toolsets:
     - acp
   ```

## Troubleshooting

### Profile not showing after install

```bash
hermes profile list
hermes profile show <name>
```

### Gateway won't start

```bash
# Check logs
tail -50 ~/.hermes/logs/gateway.log
tail -50 ~/.hermes/logs/error.log

# Restart
hermes gateway restart
```

### Kanban dispatcher not working

```bash
# Check board status
hermes kanban --board kanban001 stats

# Reset dispatcher lock (if stuck)
rm ~/.hermes/dispatcher.lock
hermes gateway restart
```

### Model/provider errors

```bash
# Check config
hermes config

# Reconfigure
hermes model
```

## Package Contents

| Component | Count | Description |
|-----------|-------|-------------|
| Profiles | 23 | Full agent distributions with distribution.yaml |
| Global skills | ~30 categories | Shared skill library |
| Per-profile skills | 15-30 categories each | Specialized per role |
| Plugins | acp-client, run-trace, etc. | Per-profile plugin configs |
| Configs | config.yaml per profile | Sanitized (api_key: "") |
| Shared | generate-configs.py, profiles.yaml | Config generation tooling |

## Security

- All `.env` files have been **removed** — installer generates `.env.EXAMPLE`
- All `auth.json` files have been **removed**
- All `api_key:` values in YAML configs → `""`
- All API key patterns in documentation → redacted
- All macOS absolute paths → `$HOME`
- No real credentials are present in this repository
