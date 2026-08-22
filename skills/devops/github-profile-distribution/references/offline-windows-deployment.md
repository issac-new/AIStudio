# Offline Windows Deployment (pip + npm only, no bash)

## Scenario

Target: Windows 10 x64, offline environment that can ONLY reach pip and npm
package sources. No GitHub access, no bash/WSL/Git Bash, no curl installer.

## Strategy: Hybrid (framework via pip, customizations bundled)

Ship a ~5 MB ZIP containing ONLY SwarmTeam customizations. The Hermes Agent
framework itself (~200 MB installed) is pulled from pip on the target machine.

**Do NOT ship the framework.** The venv (1.8 GB) + node_modules (1.3 GB) is
far too large. The offline machine has pip access — let pip do the heavy lifting.

## Package structure

```
SwarmTeam-offline.zip (~5 MB)
├── install-windows.bat              ← Double-click entry point
├── install-windows.ps1              ← 7-step PowerShell installer
├── requirements.txt                 ← pip install hermes-agent[all]>=0.20.0
├── ui-tui-package.json              ← Optional TUI npm deps
├── WINDOWS-OFFLINE-INSTALL.md       ← User-facing guide
├── profiles/                        ← 12 profiles + _shared + plugins
├── skills/                          ← 278 custom skills (~12 MB)
├── patches/                         ← PowerShell patch scripts (.ps1 ONLY)
└── shared/                          ← profiles.yaml + generate-configs.py
```

## PowerShell patch scripts (NOT bash)

ALL patch scripts must be `.ps1`, not `.sh`. The target machine has no bash.

| Bash original | PowerShell replacement |
|---------------|----------------------|
| `apply-kanban-worktree-default.sh` | `apply-kanban-worktree-default.ps1` |
| `apply-acp-client-codex-fix.sh` | `apply-acp-client-codex-fix.ps1` |
| `apply-tui-patches.sh` | `apply-tui-patches.ps1` |
| `post-update-hook.sh` | `post-update-hook.ps1` |

Key conversion patterns:
- `grep -q 'pattern' file` → `(Get-Content $file -Raw) -match 'pattern'`
- `perl -i -pe 's/old/new/'` → `$c = Get-Content $file -Raw; $c = $c.Replace('old','new'); Set-Content $file -Value $c`
- `md5 -q file` → `(Get-FileHash $file -Algorithm MD5).Hash`
- `for d in $PROFILES_DIR/*/` → `Get-ChildItem $ProfilesDir -Directory`
- `cp src dst` → `Copy-Item src dst -Force`

## Installer: 7-step automated PowerShell

The `install-windows.ps1` script does:

1. **Check prerequisites**: Python, pip, (optional: git, Node.js)
2. **pip install**: `pip install "hermes-agent[all]>=0.20.0"` — pulls framework
3. **hermes setup**: initializes `~/.hermes/`
4. **Profile install**: loops `profiles/*/`, calls `hermes profile install <dir> --alias -y` for each
5. **Skills copy**: `Copy-Item skills/* ~/.hermes/skills/ -Recurse`
6. **Protocols/plugins/patches**: copy _shared, plugins, patches to `~/.hermes/`
7. **Workspace repo**: `git init ~/hermes-docker-sandbox/workspace` + apply patches

## hermes profile install: local directory mode

`hermes profile install <source>` accepts a **local directory** (not just git URLs).
The directory MUST contain `distribution.yaml` at its root. Each `profiles/<name>/`
in the repo has its own `distribution.yaml`, so the installer passes each
subdirectory individually:

```powershell
hermes profile install .\profiles\worker-coder --alias -y
```

This is the **Hermes native import** path — it creates the profile with correct
ownership semantics (distribution-owned vs user-owned paths), generates `.env.EXAMPLE`,
and sets up the manifest for future `hermes profile update`.

**Pitfall**: `hermes profile install <git-url>` needs `distribution.yaml` at the
repo ROOT, but our repo is multi-profile. Don't try to install the whole repo as
one distribution — install each profile subdirectory individually.

## distribution.yaml is REQUIRED

Every profile directory MUST have `distribution.yaml` for `hermes profile install`
to work. When adding new profiles to the repo, create a minimal one:

```yaml
name: <profile-name>
version: 2.0.0
description: "SwarmTeam distribution — <profile-name>"
hermes_requires: ">=0.12.0"
author: "SwarmTeam"
license: "MIT"
env_requires:
  - name: GLM_API_KEY
    description: "Z.AI/GLM API key (primary LLM)"
    required: true
    default: ""
```

## .bat wrapper for double-click install

Some Windows users prefer double-click over PowerShell. Provide a `.bat` wrapper:

```bat
@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1"
pause
```

## What NOT to ship

- `memories/` — contains Matrix mappings, MAC addresses, credential test results
- `.env` — real API keys
- `auth.json` — OAuth tokens
- `state.db*`, `kanban.db` — runtime state
- `sessions/`, `logs/` — ephemeral
- `cybersecurity/` skills (410) — forbidden
- `hack-team/` skills — forbidden
- `.hub/` (40 MB) — internal curator artifacts
- `wechat-article-extractor/` (3656 files) — bloated node_modules

## Building the ZIP

```bash
cd /tmp/SwarmTeam
zip -r /tmp/SwarmTeam-offline.zip . \
  -x '.git/*' '*.pyc' '__pycache__/*' '.DS_Store' 'node_modules/*'
```

Size should be ~4-5 MB. Verify with:
- `unzip -l | grep '\.sh$'` — should be ZERO patch/installer .sh files
  (some .sh inside skills/ are OK — they're tool setup scripts, not core)
- `unzip -l | grep '\.ps1$'` — should show 4-5 patch scripts
- `unzip -l | grep '\.bat$'` — should show install-windows.bat

## Secret scan before packaging

Critical for offline packages that might be shared via USB. Scan for:

```python
PATTERNS = {
    "sk- API keys":  r'sk-[a-zA-Z0-9]{20,}',
    "real email":    r'HK_MAIL@qq\.com|swarmstudio@agent\.qq\.com',
    "username path": r'$HOME',
    "weixin token":  r'<WEIXIN_BOT_ID>',
    "matrix token":  r'syt_[a-zA-Z0-9_]{20,}',
    "password":      r'(?:Test|Sys)Pass\d+',
}
```

Skills frequently contain PII (devops skills reference real emails/paths in
examples). Sanitize ALL files, not just profiles.
