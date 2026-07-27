# Windows Fresh Install (Mode D — Networked Target)

## Use Case

When the target Windows machine **has network access** (can reach PyPI, npm,
GitHub) and you need a full Hermes Agent installation with all tools working.
The user's stated preference: "给出我具体命令即可" (just give me the specific
commands) — when the target can install from network, provide installation
commands rather than packaging and transferring binaries.

## Tool Architecture: Where Do "Available Tools" Come From?

When `hermes tools list` shows enabled toolsets (web, terminal, file, vision,
etc.), those tools are **Python source code** inside the hermes-agent package —
NOT separate binaries that live in `~/.hermes/`. Understanding this is the key
to resolving "Windows 缺少 available tools":

| Component | Location | What it is | Platform-specific? |
|-----------|----------|------------|-------------------|
| **Tool implementations** | `hermes-agent/tools/*.py` (95 files) | Python source — web, terminal, file, vision, etc. | ❌ No (pure Python) |
| **Toolset registry** | `hermes-agent/toolsets.py` | Maps toolset names → tool lists | ❌ No |
| **Lazy deps** | `hermes-agent/tools/lazy_deps.py` | Opt-in backends installed at first use | ❌ No (pip install) |
| **tirith** (security scanner) | `~/.hermes/bin/tirith` | Mach-O arm64 binary | ⚠️ YES — download Windows version or disable |
| **uv / uvx** | `~/.hermes/bin/uv`, `uvx` | Mach-O arm64 binaries | ⚠️ YES — `pip install uv` on Windows |
| **Node.js + npm packages** | `~/.hermes/node/` (2GB) | Node 22 + global packages | ⚠️ YES — reinstall on Windows |
| **Plugins** | `~/.hermes/plugins/` + per-profile `plugins/` | Python + JS plugins | Mixed (see below) |
| **Skills** | `~/.hermes/skills/` + per-profile `skills/` | Markdown + scripts | ❌ No (plain text) |

### Key insight: tools are NOT in ~/.hermes/

The `~/.hermes/` directory is the **data directory** — it stores profiles,
skills, configs, memories, and runtime state. The hermes-agent **source code**
(which implements all tools) lives in `~/.hermes/hermes-agent/` (installed via
git clone + `setup-hermes.sh`).

If Windows shows "no available tools", it means hermes-agent itself wasn't
installed correctly — the Python venv with all tool implementations is missing
or broken. Copying `~/.hermes/` data files alone won't fix it.

## Installation Method Detection

```bash
cat ~/.hermes/.install_method
# "git" = cloned from GitHub, venv at ~/.hermes/hermes-agent/venv/
# "uv"  = installed via `uv tool install hermes-agent`
```

The `hermes` command itself is a wrapper script:
```bash
cat $(which hermes)
#!/usr/bin/env bash
unset PYTHONPATH
unset PYTHONHOME
exec "/Users/<user>/.hermes/hermes-agent/venv/bin/hermes" "$@"
```

## What to Package vs Install Fresh

| Component | Package from source machine? | Install fresh on Windows? |
|-----------|------------------------------|--------------------------|
| hermes-agent source code | ❌ (re-clone from GitHub) | ✅ `git clone` + `setup-hermes.sh` |
| Python venv (742MB) | ❌ (platform-specific) | ✅ `uv venv` + `uv sync --extra all` |
| Node.js (2GB) | ❌ (platform-specific) | ✅ `winget install NodeJS` + `npm install -g` |
| bin/ (tirith, uv) | ❌ (arm64 binaries) | ✅ Download Windows versions |
| Skills (10MB) | ✅ (use Mode C dedup zip) | Or re-sync from hermes-agent source |
| Configs/personality | ✅ (Mode A or B) | Or create fresh via `hermes setup` |
| Plugins (438MB) | Partial (code only, no node_modules) | ✅ `npm install` in plugin dirs |

**Bottom line**: The only thing you MUST transfer from the source machine is
the **data directory** (profiles, skills, configs, memories). Everything else
can be rebuilt on the target.

## Windows Installation Commands (PowerShell)

### Prerequisites

```powershell
# Python 3.11 (required by hermes-agent, requires-python = ">=3.11,<3.14")
winget install Python.Python.3.11

# Node.js 22 LTS (for browser tools, ACP, plugins)
winget install OpenJS.NodeJS.LTS

# Git (for cloning hermes-agent)
winget install Git.Git

# uv (Python package manager — faster than pip)
pip install uv
```

### Install hermes-agent from source

```powershell
# Clone the same commit as the source machine
cd $HOME
git clone https://github.com/NousResearch/hermes-agent.git .hermes\hermes-agent
cd .hermes\hermes-agent

# Check out the exact version (find with: git rev-parse HEAD on source machine)
git checkout <commit-hash>

# Create venv and install all dependencies
uv venv venv --python 3.11
uv sync --extra all --locked

# If uv sync fails (lockfile mismatch), fall back:
.\venv\Scripts\python.exe -m pip install -e ".[all]"
```

### Alternative: uv tool install (simpler, no source code)

```powershell
# If you don't need to hack on hermes-agent source:
uv tool install hermes-agent
# This installs hermes as a standalone tool, venv managed by uv
```

Note: `uv tool install` puts hermes in `~/.local/share/uv/tools/hermes-agent/`,
NOT in `~/.hermes/hermes-agent/`. The `hermes` command will be in
`~/.local/bin/hermes`. This is fine — `~/.hermes/` is still the data directory.

### Create hermes command (if installed from source)

```powershell
# Create a hermes.cmd wrapper
$binDir = "$HOME\.local\bin"
New-Item -ItemType Directory -Force -Path $binDir

@'
@echo off
"%~dp0..\..\.hermes\hermes-agent\venv\Scripts\hermes.exe" %*
'@ | Set-Content "$binDir\hermes.cmd"

# Add to PATH
Add-Content $PROFILE 'export PATH="$HOME/.local/bin:$PATH"'
```

### Transfer data directory from source machine

```bash
# On macOS source machine — package data only (no source, no runtime)
cd ~
zip -r /tmp/hermes-data.zip .hermes \
  -x ".hermes/hermes-agent/*" \
  -x ".hermes/node/*" \
  -x ".hermes/bin/*" \
  -x ".hermes/plugins/memos-local-plugin/node_modules/*" \
  -x ".hermes/hermes-office/*" \
  -x ".hermes/memos-plugin/*" \
  -x ".hermes/logs/*" \
  -x ".hermes/sessions/*" \
  -x ".hermes/cache/*" \
  -x ".hermes/state.db*" \
  -x ".hermes/kanban.db*" \
  -x ".hermes/kanban/*" \
  -x ".hermes/cron/output/*" \
  -x ".hermes/traces/*" \
  -x ".hermes/skills/.curator_backups/*" \
  -x ".hermes/skills/.hub/*" \
  -x "*.pyc" -x "*__pycache__*"
```

```powershell
# On Windows — extract to %USERPROFILE%
Expand-Archive hermes-data.zip -DestinationPath $HOME

# Initialize + configure
hermes setup
```

### Install Node.js global tools (as needed)

```powershell
# ACP (Agent Client Protocol) — for Claude Code / Codex integration
npm install -g @agentclientprotocol/claude-agent-acp

# PM2 (process manager — if used)
npm install -g pm2

# Other packages as needed (check ~/.hermes/node/lib/node_modules/ on source)
```

### Install tirith (optional — security scanner)

```powershell
# tirith is platform-specific (Mach-O arm64 on macOS)
# On Windows, either:
# 1. Download Windows binary from tirith's releases
# 2. Or disable in config.yaml:
#    security:
#      tirith_enabled: false
```

### Docker alternative (simplest, if Docker Desktop available)

```powershell
# Pull the official image (includes ALL tools, Python, Node.js)
docker pull nousresearch/hermes-agent:latest

# Use docker-compose.windows.yml from the repo
docker compose -f docker-compose.windows.yml up -d
```

The Docker image is the simplest path for offline/semi-offline Windows:
- Self-contained (no need to install Python/Node.js/uv separately)
- All tools work out of the box
- `~/.hermes/` is mounted as a volume for data persistence

## Platform-Specific Binaries Checklist

These binaries in `~/.hermes/bin/` are **compiled for the source platform**
(macOS arm64) and will NOT work on Windows:

| Binary | macOS (arm64) | Windows replacement |
|--------|---------------|-------------------|
| `tirith` | Mach-O 64-bit arm64 | Download from GitHub releases, or disable |
| `uv` | Mach-O 64-bit arm64 | `pip install uv` or `winget install astral-sh.uv` |
| `uvx` | Mach-O 64-bit arm64 | Included with uv |
| `node` | Mach-O 64-bit arm64 | `winget install OpenJS.NodeJS.LTS` |

## User Preference: Commands Over Packaging

When the target machine has network access, the user prefers receiving
**installation commands** rather than having the assistant package and transfer
binaries. This was expressed as: "windows 机器可以使用npm及pip 命令连接源挤捏安装
给出我具体命令即可".

**Implication for migration workflow**:
1. Don't package `hermes-agent/`, `node/`, `bin/` — these are rebuildable
2. DO package the data directory (profiles, skills, configs, memories)
3. Provide a clear command sequence for the target OS
4. Only package binaries when the target is truly offline (no PyPI/npm access)

## Verifying Tools Work on Windows

After installation, verify all toolsets are available:

```powershell
hermes tools list
# Should show enabled toolsets: web, browser, terminal, file, code_execution,
# vision, image_gen, tts, skills, todo, memory, session_search, clarify,
# delegation, cronjob, computer_use
```

If tools are missing:
1. Check that `hermes-agent` venv exists and has all deps: `.\venv\Scripts\python.exe -c "import tools.web_tools"`
2. Check `config.yaml` `toolsets:` list — it must include `hermes-cli` at minimum
3. Run `hermes setup tools` to reconfigure tool backends
4. Run `hermes doctor` for diagnostics
