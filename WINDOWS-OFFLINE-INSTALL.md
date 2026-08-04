# Windows Offline Installation Guide / Windows 离线安装指南

> **Environment**: Windows 10 x64, offline, **pip + npm access only**
> **No bash/WSL/Git Bash required** — all scripts are pure PowerShell (.ps1) or batch (.bat)

## Overview / 概述

This package deploys the SwarmTeam multi-agent system on a Windows machine using only `pip` and `npm`. All patch scripts are PowerShell — no bash, WSL, or Git Bash needed.

**Package size**: ~5 MB (framework installed separately via pip)

---

## Quick Start / 快速开始

### Method 1: Double-click (Easiest)

1. Extract `SwarmTeam-offline.zip` to any folder (e.g. `C:\SwarmTeam`)
2. **Double-click `install-windows.bat`**
3. Follow on-screen prompts

### Method 2: PowerShell

```powershell
# Extract and run
Expand-Archive SwarmTeam-offline.zip C:\SwarmTeam
cd C:\SwarmTeam
powershell -ExecutionPolicy Bypass -File install-windows.ps1
```

### Method 3: Command Prompt

```cmd
cd C:\SwarmTeam
install-windows.bat
```

---

## What the Installer Does / 安装步骤

The installer runs 7 steps automatically:

| Step | Action | Source |
|------|--------|--------|
| 1 | Check Python 3.11+ / pip / git | System check |
| 2 | `pip install hermes-agent[all]` | **pip** (internet) |
| 3 | `hermes setup` (init `~/.hermes/`) | Local |
| 4 | Install 12 profiles via `hermes profile install` | Local (bundled) |
| 5 | Copy 278 skills to `~/.hermes/skills/` | Local (bundled) |
| 6 | Copy protocols + plugins + patches | Local (bundled) |
| 7 | Init workspace repo + apply patches | Local |

**Framework** (200MB) comes from pip; **customizations** (5MB) are bundled.

---

## Post-Install / 安装后

### 1. Configure API Keys

```powershell
notepad %USERPROFILE%\.hermes\.env
```

**Minimal config** (local model via Ollama):
```env
OLLAMA_BASE_URL=http://localhost:11434/v1
```

**With API access**:
```env
DAMOXING_API_KEY=your-key
DAMOXING_BASE_URL=https://your-endpoint
DAMOXING_API_MODE=openai
```

### 2. Verify

```powershell
hermes profile list
hermes -p orchestrator chat -q "Hello"
```

### 3. (Optional) Apply TUI Patches

```powershell
powershell -ExecutionPolicy Bypass -File %USERPROFILE%\.hermes\patches\apply-tui-patches.ps1
```

### 4. (Optional) Install TUI Dependencies

```powershell
cd %USERPROFILE%\.hermes\hermes-agent\ui-tui
copy %USERPROFILE%\.hermes\patches\..\..\ui-tui-package.json package.json
npm install
```

---

## Patch Scripts / 补丁脚本

All patches are **PowerShell** (.ps1), not bash:

| Script | Purpose |
|--------|---------|
| `apply-kanban-worktree-default.ps1` | workspace_kind defaults to "worktree" (persistent) |
| `apply-acp-client-codex-fix.ps1` | ACP Codex CLI compatibility |
| `apply-tui-patches.ps1` | TUI cc-switch status bar widget |
| `post-update-hook.ps1` | Re-apply all patches after `hermes update` |

**Auto-protection**: After `pip install --upgrade hermes-agent`, run:
```powershell
powershell -ExecutionPolicy Bypass -File %USERPROFILE%\.hermes\patches\post-update-hook.ps1
```

---

## Troubleshooting / 故障排查

| Problem | Solution |
|---------|----------|
| `pip install fails` | Use mirror: `pip install -i https://your-mirror/simple hermes-agent[all]` |
| `hermes not found` | Add to PATH: `%APPDATA%\Python\Scripts` or `%LOCALAPPDATA%\Programs\Python\Python311\Scripts` |
| `ExecutionPolicy denied` | Use `-ExecutionPolicy Bypass` flag, or run `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| `git not found` | Workspace repo + TUI patches skipped; core functionality still works |
| `profile install fails` | Ensure running from the extracted folder with `profiles/` subdirectory |
| Patches don't apply | Run `post-update-hook.ps1` manually after any hermes update |

---

## Package Structure / 包结构

```
SwarmTeam/
├── install-windows.bat        ← Double-click to install
├── install-windows.ps1        ← PowerShell installer (7 steps)
├── requirements.txt           ← pip dependencies
├── ui-tui-package.json        ← npm dependencies (optional TUI)
├── WINDOWS-OFFLINE-INSTALL.md ← This file
├── profiles/                  12 profiles + _shared protocols
│   ├── _shared/               ontology, gates, ACP rules
│   └── orchestrator/plugins/  5 plugins
├── skills/                    278 custom skills (34 categories)
├── patches/                   PowerShell patch scripts (.ps1)
│   ├── apply-kanban-worktree-default.ps1
│   ├── apply-acp-client-codex-fix.ps1
│   ├── apply-tui-patches.ps1
│   └── post-update-hook.ps1
└── shared/                    profiles.yaml + generate-configs.py
```
