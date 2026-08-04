---
name: hermes-offline-migration
title: Hermes Agent Offline Windows Migration
description: >-
  Package Hermes Agent data directory for offline Windows deployment when the
  target machine can only install via npm/pip sources (no GitHub, no winget).
  Covers the expanded exclude list (walk-and-copy over zip -x), three hidden
  credential leak sources (.hermes_history, migration/, .bak at depth),
  and the full sanitization→verify→zip→MIGRATION-GUIDE workflow.
triggers:
  - "offline migration"
  - "离线迁移"
  - "package for offline windows"
  - "migrate to disconnected machine"
  - "hermes offline deploy"
---

# Hermes Agent Offline Windows Migration

## When to Use

- Migrating Hermes Agent to a **disconnected/offline** Windows machine
- Target can install via **npm/pip sources only** (no GitHub clone, no winget)
- Need to package ALL data (profiles, skills, configs, memories, plugins) with
  zero credential leakage

## Relationship to hermes-agent-migration

This skill is a **specialization** of `hermes-agent-migration` for the offline
case. The parent skill covers four modes (A: personality-only, B:
sanitize-and-include, C: skills-dedup, D: networked fresh install). This skill
covers **Mode B + offline target** — the data package is the same, but the
target lacks GitHub/winget access so installation commands use pip/npm only.

Load `hermes-agent-migration` first for the mode selection logic and
sanitization fundamentals. Use this skill for the **expanded exclude list**,
the **walk-and-copy workflow**, and the **offline Windows deployment guide**.

## Workflow (7 Phases)

### Phase 1: Investigate Source

```bash
du -sh ~/.hermes/*/
du -sh ~/.hermes/profiles/*/
find ~/.hermes -name ".env" -o -name "auth.json" | head -30
```

### Phase 2: Walk-and-Copy to Staging (NOT zip -x)

**Critical**: Do NOT use `zip -x` — it misses files at unexpected depths.
Use `execute_code` with `os.walk()` and explicit exclude sets.

See `references/expanded-exclude-list.md` for the full script and the three
hidden credential leak sources it catches.

Key excludes that `zip -x` misses:
- `migration/` — old openclaw backups with REAL `.env`/`config.yaml`
- `.hermes_history` — shell history with real API keys from past commands
- `*.bak.*` at any depth — `config.yaml.bak.1782786191`, `.env.bak.20260716_*`

### Phase 3: Sanitize Configs

1. `config.yaml` — clear `api_key:` values to `""`, preserve `${VAR}` refs
2. `.env` → `.env.example` — values → `YOUR_<KEY>_HERE`
3. `auth.json` — clear token/key/secret/password fields, preserve JSON structure
4. `profiles.yaml` — clear `api_key:` values to `""`
5. `.env.common` → `.env.common.example`

See `hermes-agent-migration` skill's `references/credential-sanitization.md`
for the Python sanitization code.

### Phase 4: Global Redaction

Run generic + targeted regex patterns on ALL text files:
- `sk-[a-zA-Z0-9]{20,}` → `sk-REDACTED`
- `gho_[a-zA-Z0-9]{20,}` → `gho_REDACTED`
- `syt_[a-zA-Z0-9]{20,}` → `syt_REDACTED`
- `desk-[a-zA-Z0-9]{20,}` → `desk-REDACTED`
- `m0-[a-zA-Z0-9]{20,}` → `m0-REDACTED`
- Targeted: `sk-f9d*`, `sk-ezi*`, `sk-eGx*`, `gho_pW*`, `syt_dGVz*`, `desk-12fe8aa6*`

### Phase 5: Path Replacement

Replace macOS absolute paths with portable forms:
- `/Users/<user>/.hermes` → `$HERMES_HOME` (in docs/rules)
- `/Users/<user>` → `$HOME` (in configs/scripts)

See `hermes-agent-migration` skill's `references/path-portability.md` for the
full `~` vs `${HOME}` vs `$HOME` matrix.

### Phase 6: Verify Zero Credentials

Scan staging for ALL known real key prefixes. Must find ZERO matches.
If any found, identify the file, add to exclude list or delete, re-verify.

### Phase 7: Generate MIGRATION-GUIDE.md + Zip

Create a deployment guide covering:
1. Prerequisites (Python 3.11, Node.js 22, uv, pip)
2. `pip install hermes-agent[all]` (from PyPI)
3. Extract data to `%USERPROFILE%`
4. Fill credentials (`.env.example` → `.env`)
5. `hermes setup` → `hermes doctor` → `hermes tools list`
6. Offline model config (Ollama `base_url: http://localhost:11434/v1`)
7. Profile list verification (15 profiles expected)

```bash
cd /tmp
zip -r '/target/path/hermes-offline-windows.zip' hermes-offline-pkg/ \
  -x '*/.DS_Store' -x '*__pycache__*' -x '*.pyc'
```

## Offline Windows Installation Commands

```powershell
# 1. Prerequisites (from pip/npm sources only — no winget/GitHub needed)
pip install uv
winget install Python.Python.3.11      # if Python not yet installed
winget install OpenJS.NodeJS.LTS        # if Node.js not yet installed

# 2. Install hermes-agent from PyPI
pip install hermes-agent[all]
# OR: uv tool install hermes-agent

# 3. Extract data package
Expand-Archive hermes-offline-windows.zip -DestinationPath $HOME

# 4. Fill in credentials
cd $HOME\.hermes
copy .env.example .env
notepad .env

# 5. Initialize + verify
hermes setup
hermes doctor
hermes tools list
hermes profile list

# 6. Configure local model (offline — no cloud API)
# In config.yaml:
#   model:
#     default: local-model
#     provider: custom
#     base_url: http://localhost:11434/v1
#     api_key: ""
```

## Pitfalls

### 1. `.hermes_history` contains real API keys
Shell command history files (`profiles/orchestrator/.hermes_history`) capture
full commands including `export API_KEY=sk-xxx`. Must exclude from package.

### 2. `migration/` contains old openclaw backups with real secrets
`~/.hermes/migration/openclaw/*/backups/` has full copies of original `.env`
and `config.yaml` with REAL API keys. Must exclude the entire `migration/` dir.

### 3. `.bak` files use varied naming schemes
`config.yaml.bak.1782786191`, `.env.bak.20260716_181849`,
`config.yaml.bak-20260702-140451` — the glob `*.bak` doesn't catch these.
Use `'.bak' in filename` substring check or `fnmatch(f, '*.bak*')`.

### 4. `config.yaml` contains ability settings, not just API keys
When the user says "remove sensitive info", don't exclude `config.yaml`
entirely — it contains `toolsets:`, `agent:` behavior params, and `kanban:`
routing config. Sanitize-and-include (Mode B) preserves these settings.

### 5. Post-copy cleanup pass is mandatory
Even with a good exclude list, some `.bak` files slip through. Run a second
pass: `if '.bak' in f or '.corrupt' in f: os.remove(...)`. In the 2026-07-23
session, this caught 62 backup files that the initial walk missed.

## Reference Files

- `references/expanded-exclude-list.md` — Full walk-and-copy script with
  exhaustive EXCLUDE_DIRS/EXCLUDE_FILES/EXCLUDE_FILE_PATTERNS sets, and
  documentation of the three hidden credential leak sources.

## Related Skills

- **hermes-agent-migration** — Parent skill with 4 packaging modes (A/B/C/D),
  full sanitization reference, path portability matrix, and Hindsight offline
  deployment. Load first for mode selection.
- **hermes-docker-sandbox** — Docker-based Hermes deployment (alternative to
  bare-metal Windows install).
