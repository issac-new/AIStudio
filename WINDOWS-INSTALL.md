# Windows Installation Guide / Windows 安装指南

This guide walks you through importing the SwarmTeam multi-agent profiles on a **Windows** machine using Hermes Agent's native `profile install` command.

## Prerequisites / 前提条件

### 1. Install Hermes Agent

Open **PowerShell** (as Administrator) and run:

```powershell
# Install Hermes Agent
irm https://hermes-agent.nousresearch.com/install.ps1 | iex

# Or if the installer URL doesn't work, use the Python installer:
pip install hermes-agent
hermes setup
```

Verify installation:
```powershell
hermes --version
hermes doctor
```

### 2. Install Git

```powershell
winget install Git.Git
```

Or download from https://git-scm.com/download/win

### 3. Create the workspace directory

```powershell
# Hermes worktree workspaces need a git repo as the base
mkdir $env:USERPROFILE\hermes-docker-sandbox\workspace
cd $env:USERPROFILE\hermes-docker-sandbox\workspace
git init
git add -A
git commit -m "init"
```

---

## Installation / 安装

### Option A: Batch Install (All 12 Profiles) — Recommended

```powershell
# Clone the repo
cd $env:TEMP
git clone --depth 1 https://github.com/issac-new/SwarmTeam.git
cd SwarmTeam

# Run the installer (uses Git Bash, comes with Git for Windows)
bash install-all.sh
```

### Option B: Install Individual Profiles

```powershell
# Clone the repo
cd $env:TEMP
git clone --depth 1 https://github.com/issac-new/SwarmTeam.git

# Install one profile at a time using Hermes native import:
hermes profile install $env:TEMP\SwarmTeam\profiles\worker-coder --alias -y
hermes profile install $env:TEMP\SwarmTeam\profiles\orchestrator --alias -y
hermes profile install $env:TEMP\SwarmTeam\profiles\worker-researcher --alias -y
# ... repeat for each profile you want
```

### Option C: Install a Single Team

```powershell
# Install only the swarm team (4 profiles)
bash install-all.sh --team swarm

# Install only the ops team (4 profiles)
bash install-all.sh --team ops
```

---

## Post-Install Setup / 安装后配置

### 1. Set API Keys

```powershell
# Edit the global .env file
notepad $env:USERPROFILE\.hermes\.env
```

Add your API keys (see `shared/profiles.yaml` for the full list):

```env
# Required — primary LLM
DAMOXING_API_KEY=your-damoxing-key
DAMOXING_BASE_URL=https://your-api-endpoint
DAMOXING_API_MODE=openai

# Optional — fallback models
DEEPSEEK_API_KEY=your-deepseek-key

# Optional — Hindsight memory embeddings
SILICONFLOW_API_KEY=your-siliconflow-key

# Optional — ACP Claude Code
ANTHROPIC_AUTH_TOKEN=your-anthropic-token
ANTHROPIC_BASE_URL=https://your-proxy-endpoint

# Optional — Matrix messaging
MATRIX_SERVER=https://matrix.org
MATRIX_ACCESS_TOKEN=your-matrix-token

# Optional — WeChat
WEIXIN_TOKEN=your-weixin-token
WEIXIN_ACCOUNT_ID=your-account-id
```

### 2. Verify Installation

```powershell
# List all installed profiles
hermes profile list

# Check a specific profile
hermes profile info worker-coder

# Start the TUI with a profile
hermes -p orchestrator
```

### 3. Apply Source Patches (Optional but Recommended)

The `patches/` directory contains infrastructure patches that customize Hermes behavior:

```powershell
# These patches fix ACP Codex integration, TUI widgets, and workspace defaults
# They need Git Bash to run:
cd $env:USERPROFILE\.hermes

# Apply ACP Codex fix (enables Codex CLI as coding backend)
bash patches/apply-acp-client-codex-fix.sh

# Apply kanban worktree-default (all tasks use persistent git workspaces)
bash patches/apply-kanban-worktree-default.sh

# Apply TUI patches (cc-switch status bar widget)
bash patches/apply-tui-patches.sh
```

### 4. Set Up the Workspace Git Repo

All kanban tasks use `workspace_kind="worktree"` — they create git branches under your workspace repo:

```powershell
# Initialize the worktree base repo (if not done in prerequisites)
cd $env:USERPROFILE\hermes-docker-sandbox\workspace
git init
echo "*.pyc" > .gitignore
echo "__pycache__/" >> .gitignore
git add -A
git commit -m "init: base repo for kanban worktree workspaces"
```

---

## Updating Profiles / 更新 Profile

When the repo is updated, pull new versions:

```powershell
# Update a single profile (preserves your .env, memories, sessions)
hermes profile update worker-coder

# Update all profiles
hermes profile update orchestrator
hermes profile update worker-coder
# ... etc
```

---

## Troubleshooting / 故障排查

| Problem | Solution |
|---------|----------|
| `hermes: command not found` | Restart PowerShell after install, or add `%USERPROFILE%\.local\bin` to PATH |
| `git clone fails` | Check internet connection; or download ZIP from https://github.com/issac-new/SwarmTeam |
| `profile install: no distribution.yaml` | Make sure you're pointing at `profiles/<name>/`, not the repo root |
| `bash: command not found` | Install Git for Windows (includes Git Bash), or use WSL |
| `ACP Claude Code not working` | Run `patches/apply-acp-client-codex-fix.sh` after install |
| Models not responding | Check API keys in `~/.hermes/.env`; verify with `hermes doctor` |

---

## Profile Roster (12 profiles / 4 teams)

| Team | Profiles | Purpose |
|------|----------|---------|
| **swarm** (4) | orchestrator, worker-coder, worker-researcher, worker-tester | Software engineering |
| **product** (2) | product-manager, product-researcher | Product management |
| **ops** (4) | ops-sre, ops-incident-commander, ops-devops, ops-eval | DevOps & SRE |
| **platform** (2) | platform-skill-miner, platform-ontology-curator | Self-improving system |

See `README.md` for detailed capabilities of each profile.
