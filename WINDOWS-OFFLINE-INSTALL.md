# Windows Offline Installation Guide / Windows 离线安装指南

> **Environment**: Windows 10 x64, offline, pip + npm access only (no GitHub access)

## Overview / 概述

This package contains everything needed to deploy the SwarmTeam multi-agent system on a Windows machine that can only reach `pip` and `npm` package sources. No GitHub access required — all profile files, skills, plugins, and patches are bundled.

**Package contents**: 12 profiles + 278 skills + 5 plugins + 6 patches + 9 shared protocols (~15 MB total)

---

## Step 1: Install Prerequisites / 安装前提

### 1.1 Python 3.11+

Download from https://www.python.org/downloads/ (or use winget if available):

```powershell
# Check if Python is installed
python --version

# If not, the offline machine should have Python from the IT package manager
# or download the installer on a connected machine and transfer via USB
```

### 1.2 Git (for workspace repo + patches)

```powershell
# Git is needed for kanban worktree workspaces
# Download from https://git-scm.com/download/win
git --version
```

### 1.3 Node.js (OPTIONAL — only for TUI)

```powershell
# Only needed if you want the Ink TUI interface
# CLI chat (`hermes chat`) works without Node.js
node --version
```

---

## Step 2: Run the Installer / 运行安装

### Option A: Automated PowerShell Script

```powershell
# Extract the SwarmTeam package to a temp folder
# Then run:
cd C:\path\to\SwarmTeam
powershell -ExecutionPolicy Bypass -File install-windows.ps1
```

The script will:
1. ✅ Install `hermes-agent[all]` via pip (the framework, ~200MB)
2. ✅ Initialize `~/.hermes/`
3. ✅ Install all 12 SwarmTeam profiles via `hermes profile install`
4. ✅ Copy 278 custom skills to `~/.hermes/skills/`
5. ✅ Copy shared protocols (`_shared/`), plugins, and patches
6. ✅ Initialize the workspace git repo

### Option B: Manual Step-by-Step

```powershell
# 1. Install Hermes framework
pip install "hermes-agent[all]>=0.20.0"

# 2. Initialize
hermes setup --skip-model

# 3. Install each profile (repeat for all 12)
hermes profile install .\profiles\orchestrator --alias -y
hermes profile install .\profiles\worker-coder --alias -y
hermes profile install .\profiles\worker-researcher --alias -y
hermes profile install .\profiles\worker-tester --alias -y
hermes profile install .\profiles\product-manager --alias -y
hermes profile install .\profiles\product-researcher --alias -y
hermes profile install .\profiles\ops-devops --alias -y
hermes profile install .\profiles\ops-eval --alias -y
hermes profile install .\profiles\ops-incident-commander --alias -y
hermes profile install .\profiles\ops-sre --alias -y
hermes profile install .\profiles\platform-skill-miner --alias -y
hermes profile install .\profiles\platform-ontology-curator --alias -y

# 4. Copy skills
xcopy /E /I /Y skills\* %USERPROFILE%\.hermes\skills\

# 5. Copy shared protocols
xcopy /E /I /Y profiles\_shared\* %USERPROFILE%\.hermes\profiles\_shared\

# 6. Copy plugins
xcopy /E /I /Y profiles\orchestrator\plugins\* %USERPROFILE%\.hermes\profiles\orchestrator\plugins\

# 7. Copy patches
xcopy /E /I /Y patches\* %USERPROFILE%\.hermes\patches\

# 8. Initialize workspace
mkdir %USERPROFILE%\hermes-docker-sandbox\workspace
cd %USERPROFILE%\hermes-docker-sandbox\workspace
git init
git add -A
git commit -m "init"
```

---

## Step 3: Configure API Keys / 配置密钥

```powershell
# Edit the global .env file
notepad %USERPROFILE%\.hermes\.env
```

**Minimum required for offline use** (local model via Ollama):

```env
# Use a local Ollama model (no internet API needed)
# Install Ollama: https://ollama.com/download
OLLAMA_BASE_URL=http://localhost:11434/v1

# Set as default model
# Then run: hermes config set model.default llama3.2 --profile orchestrator
```

**With internet API access** (if the machine can reach API endpoints):

```env
# Primary LLM
DAMOXING_API_KEY=your-key
DAMOXING_BASE_URL=https://your-endpoint
DAMOXING_API_MODE=openai

# Or DeepSeek
DEEPSEEK_API_KEY=your-key
```

---

## Step 4: Apply Patches (Optional) / 应用补丁

The `patches/` directory contains infrastructure patches. These require **Git Bash** (installed with Git for Windows):

```powershell
# Open Git Bash and run:
cd ~/.hermes

# Kanban worktree default (all tasks use persistent git workspaces)
bash patches/apply-kanban-worktree-default.sh

# ACP Codex fix (enables Codex CLI as coding backend)
bash patches/apply-acp-client-codex-fix.sh

# TUI cc-switch status bar
bash patches/apply-tui-patches.sh
```

---

## Step 5: Verify / 验证

```powershell
# List installed profiles
hermes profile list

# Check profile details
hermes profile info orchestrator

# Run a quick test
hermes -p orchestrator chat -q "Hello, what can you do?"

# Start the gateway (if using messaging platforms)
hermes -p orchestrator gateway run
```

---

## Step 6: (Optional) Install TUI / 安装 TUI

```powershell
# Only if Node.js is available and you want the terminal UI
cd %USERPROFILE%\.hermes\hermes-agent\ui-tui

# Use the bundled package.json
copy <package-source>\ui-tui-package.json package.json

# Install npm dependencies
npm install

# Enable TUI
hermes config set display.interface tui

# Launch
hermes --tui
```

---

## Troubleshooting / 故障排查

| Problem | Solution |
|---------|----------|
| `pip install fails` | Ensure pip source is reachable: `pip config list`. Try `pip install --index-url <your-mirror> hermes-agent[all]` |
| `hermes: command not found` | Add Python Scripts to PATH: `%USERPROFILE%\AppData\Local\Programs\Python\Python311\Scripts` |
| `profile install: distribution.yaml not found` | Run the installer from the package root, not a subdirectory |
| `git: command not found` | Install Git for Windows from https://git-scm.com/download/win |
| `Ollama connection refused` | Start Ollama first: `ollama serve` |
| Patches don't apply | Patches need Git Bash (not PowerShell). Run `bash patches/apply-*.sh` |
| Models not responding | Check `hermes doctor` and verify API keys in `.env` |

---

## Package Structure / 包结构

```
SwarmTeam/
├── profiles/              12 profiles (swarm/product/ops/platform)
│   ├── _shared/           9 protocol files (ontology, gates, ACP, etc.)
│   └── orchestrator/
│       └── plugins/       5 plugins (acp-client, cluster-kanban, etc.)
├── skills/                278 custom skills (34 categories, 12 MB)
├── patches/               6 infrastructure patches
├── shared/                profiles.yaml + generate-configs.py
├── requirements.txt       pip dependencies
├── ui-tui-package.json    npm dependencies (optional TUI)
├── install-windows.ps1    PowerShell installer
└── WINDOWS-OFFLINE-INSTALL.md  ← This file
```

**Total package size**: ~15 MB (framework installed separately via pip)
