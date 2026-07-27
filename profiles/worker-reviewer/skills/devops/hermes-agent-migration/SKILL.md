---
name: hermes-agent-migration
title: Hermes Agent Cross-Machine Migration
description: >-
  Package Hermes Agent profiles, configs, skills, and Hindsight for cross-machine
  migration (e.g. macOS → Windows). Covers credential sanitization, offline model
  packaging, deployment guide generation, and ModelScope/Git LFS upload. Critical:
  always sanitize .env/auth.json/config.yaml BEFORE uploading — never distribute
  real API keys, tokens, or passwords.
triggers:
  - "migrate hermes"
  - "package agents for migration"
  - "zip hermes profiles"
  - "sanitize migration package"
  - "deploy hermes to new machine"
  - "upload agents to modelscope"
  - "cross-machine hermes deployment"
  - "打包 agent 人格"
  - "迁移 agent 能力"
  - "去重打包 skill"
  - "dedup skills"
  - "share skill library"
  - "skills-only package"
---

# Hermes Agent Cross-Machine Migration

## When to Use

- Moving Hermes Agent from one machine to another (e.g. macOS → Windows)
- Packaging profiles + configs + skills for distribution
- Building Hindsight offline deployment package with local models
- Need to sanitize credentials before uploading to a shared repo

## Packaging Modes (read first)

There are two modes. **Mode B (sanitize-and-include) is the DEFAULT and the user's
stated preference.** The user initially asked to exclude all config files, but
upon learning that `config.yaml` contains critical ability settings (toolsets,
agent behavior params, kanban routing config) — not just API keys — explicitly
chose to include them sanitized. See Pitfall #12 for the full reasoning.

### Mode B — Full migration (DEFAULT, preferred by user)

Include ALL config files, but **sanitize them in a temp staging dir first** —
never upload live `.env`/`auth.json`/`config.yaml` unchanged. This preserves
the agent's capability configuration (toolsets, agent, kanban sections) while
stripping all secrets.

Files to INCLUDE (sanitized):
- `.env` → `.env.example` (values → `YOUR_<KEY>_HERE`)
- `auth.json` (clear `access_token`/`api_key` fields, preserve JSON structure)
- `config.yaml` (clear `api_key:` values to `""`, keep everything else)
- `profiles.yaml` (same as config.yaml)
- `.env.common` → `.env.common.example`
- All personality files (SOUL.md, rules, skills, plugins, memories, hindsight)

**⚠️ NEVER upload `~/.hermes/` without sanitizing first.** These files contain
real API keys, tokens, and passwords.

### Mode A — Personality-only (only when user explicitly says "no config files")

**Exclude ALL sensitive config files entirely.** Do not sanitize-and-include;
just leave them out. The target-environment user creates their own `.env`,
`auth.json`, `config.yaml`, `profiles.yaml`, `.env.common` on the other side.

⚠️ **Warning**: This mode loses the agent's `toolsets`, `agent` behavior params,
and `kanban` routing config. The target agent won't know which tools to load or
how to route tasks. Only use when the user explicitly accepts this tradeoff.

Files to EXCLUDE: `.env`, `.env.example`, `.env.common`, `.env.common.example`,
`auth.json`, `config.yaml` (global AND per-profile AND `plugins/*/config.yaml`),\n`profiles.yaml`, any `*.bak`/`*.corrupt` files.

What you DO package: `SOUL.md`, `*_rules.md`, `profile.yaml`, `skills/`,
`plugins/` (code only, no `config.yaml`), `memories/`, `hindsight/`
(`config.json` + `start.sh` only — no `pgdata`/`data`/`logs`),
`shared/generate-configs.py` + `shared/README.md`, and a `MIGRATION-GUIDE.md`.

➡️ Full workflow: `references/personality-only-package.md`

### Mode C — Skills-only dedup (when user asks to "dedup and zip skills")

Package **ONLY the skills library**, deduplicated across all profiles. No
configs, no personality files, no runtime data. Smallest package (~3.8 MB zip
for 139 unique skills from global + 9 profiles).

Use this mode when the user says "去重打包 skill", "deduplicate skills",
"share skill library", or the target machine already has its own configs and
personality — you just want to sync the skills.

**Critical**: Scan BOTH `~/.hermes/skills/` (global, shared by all profiles)
AND `~/.hermes/profiles/*/skills/` (per-profile). The global directory contains
~24 skills not found in any profile (e.g. `feeds/`, `leisure/`, `cognition-lattice/`,
`wechat-article-extractor/`). Scanning only profiles misses them.

Algorithm: scan global + all profiles → find directories containing `SKILL.md`
→ group by relative path → for identical duplicates, prefer GLOBAL version; for
content-different duplicates, prefer GLOBAL, else pick the version with the most
files (most complete) → copy to staging → generate MANIFEST.md → zip.

**No credential sanitization needed** — skills-only packages don't contain
`.env`/`auth.json`/`config.yaml`. Skill docs may contain example keys (`sk-xxx`
in tutorials) but these are illustrative, not real.

➡️ Full workflow + proven results: `references/skills-dedup-package.md`

### Mode D — Networked fresh install (target has internet access)

When the target Windows machine **can reach PyPI, npm, and GitHub**, do NOT
package binaries — provide installation commands instead. The user's stated
preference: "给出我具体命令即可" (just give me the specific commands).

**Key insight**: "Available tools" (`hermes tools list`) are Python source code
inside the hermes-agent package, NOT separate binaries in `~/.hermes/`. If
Windows shows "no available tools", hermes-agent itself wasn't installed
correctly — copying `~/.hermes/` data files alone won't fix it.

What to PACKAGE from source: data directory only (profiles, skills, configs,
memories). What to INSTALL fresh on Windows: hermes-agent source (git clone),
Python venv (uv sync), Node.js (winget), npm packages, tirith (or disable).

➡️ Full command sequence + tool architecture: `references/windows-fresh-install.md`

Always (both modes):
1. Package to a **temp directory** — never modify the live `~/.hermes/` files
2. Mode A: exclude sensitive files. Mode B: sanitize the temp copy (§Sanitization)
3. Verify zero residual credentials (both modes — skill docs can contain key examples)
4. THEN upload

## Migration Workflow

### Step 1: Investigate Source

Before packaging, understand what's in `~/.hermes/`:

```bash
# Profile list and sizes
du -sh ~/.hermes/profiles/*/

# Top-level structure
du -sh ~/.hermes/*/

# Sensitive files inventory
find ~/.hermes -name ".env" -o -name "auth.json" | head -30
grep -rn "api_key:" ~/.hermes/profiles/*/config.yaml | grep -v '""'
```

### Step 2: Package — Copy to Staging, Exclude Runtime

Instead of `zip` directly on `~/.hermes/` (which makes selective exclusion
brittle), copy the personality/config files to a temp staging dir, sanitize
(Mode B), then zip that. This gives full control over what goes in and avoids
accidentally including runtime data.

**Mode B (default) — include**: everything in Mode A PLUS `config.yaml` (→sanitize),
`.env` (→`.env.example`), `auth.json` (→sanitize), `profiles.yaml` (→sanitize),
`.env.common` (→`.env.common.example`), and the entire `shared/` directory.

**Mode A — include**: `SOUL.md`, `*_rules.md`, `profile.yaml`, `skills/`,
`plugins/` (code, no `config.yaml`), `memories/`, `hindsight/`
(`config.json` + `start.sh` only). Globally: `SOUL.md`,
`global_kanban_rules.md`, `shared/generate-configs.py`, `shared/README.md`.

**Mode A — EXCLUDE entirely**: `.env`, `auth.json`, `config.yaml`,
`profiles.yaml`, `.env.common`, any `*.bak`/`*.corrupt` files.

**Exclude (runtime/rebuildable, both modes)**:
- `hermes-agent/` (3G source — `uv tool install` rebuilds)
- `node/` (2G — npm rebuild)
- `bin/`, `lsp/` (hermes setup rebuilds)
- `hermes-office/`, `memos-plugin/` (runtime, rebuildable)
- `logs/`, `sessions/`, `state-snapshots/`, `cache/` (runtime)
- `kanban.db`, `kanban/` (historical task data)
- `state.db`, `response_store.db` (runtime state)
- `cron/output/`, `gateway_state.json`, `traces/`
- `.DS_Store`, `*.pyc`, `__pycache__/`, `*.log`, `*.tmp`

```bash
cd ~
zip -r /output/hermes-agents-migration.zip .hermes \
  -x ".hermes/hermes-agent/*" \
  -x ".hermes/node/*" \
  -x ".hermes/bin/*" \
  -x ".hermes/hermes-office/*" \
  -x ".hermes/memos-plugin/*" \
  -x ".hermes/logs/*" \
  -x ".hermes/state-snapshots/*" \
  -x ".hermes/sessions/*" \
  -x ".hermes/cache/*" \
  -x ".hermes/state.db*" \
  -x ".hermes/kanban.db*" \
  -x ".hermes/kanban/*" \
  -x ".hermes/cron/output/*" \
  -x ".hermes/gateway_state.json" \
  -x ".hermes/traces/*" \
  -x ".hermes/profiles/*/bin/*" \
  -x ".hermes/profiles/*/lsp/*" \
  -x ".hermes/profiles/*/memos-plugin/*" \
  -x ".hermes/profiles/*/logs/*" \
  -x ".hermes/profiles/*/sessions/*" \
  -x ".hermes/profiles/*/state-snapshots/*" \
  -x ".hermes/profiles/*/state.db*" \
  -x ".hermes/profiles/*/home/*" \
  -x "*.pyc" -x "*__pycache__*" -x "*.log" -x "*.tmp"
```

### Step 3: Sanitize (Mode B — CRITICAL, default mode)

In Mode A, sensitive files are excluded entirely — no sanitization needed
for `.env`/`auth.json`/`config.yaml`. But **skill docs can still contain
real API key examples** (e.g. `sk-REDACTED…` in `native-mcp/SKILL.md`), so the
redact pass (step 4 below) and final verification scan are still required
in both modes.

In Mode B (default), sanitize all config files in the staging dir:
- `config.yaml`: clear `api_key:` values to `""`, preserve `${VAR}` refs
- `.env` → `.env.example`: values → `YOUR_<KEY>_HERE`
- `auth.json`: clear `access_token`/`api_key`, preserve JSON structure
- `profiles.yaml`: clear `api_key:` values to `""`
- `.env.common` → `.env.common.example`

➡️ Full Mode B workflow: `references/sanitized-config-package.md`
➡️ Full sanitization reference: `references/credential-sanitization.md`

### Step 4: Package Hindsight Offline (if needed)

For Hindsight offline deployment with local ZH+EN models, see the
`hermes-memory-providers` skill's offline deployment reference:
`skill_view(name="hermes-memory-providers", file_path="references/hindsight-offline-deployment.md")`

### Step 5: Upload to ModelScope/Git LFS

```bash
cd /path/to/modelscope/repo
git add hermes-agents-migration-sanitized.zip
git commit -m "feat: sanitized agent migration package"
git push origin master
```

**⚠️ Large LFS push (>1GB)**: Use `terminal(background=true, notify_on_complete=true)`
with timeout 1800s+. Upload rate ~3 MB/s, so 2.7GB takes ~14 min.

### Step 6: Generate Deployment Guide

Create a `MIGRATION-GUIDE.md` (or `hermes-devli.md`) covering:
1. Prerequisites (Python, Node.js, uv, Git, Docker)
2. Install Hermes Agent (`uv tool install hermes-agent`)
3. Download + extract migration package
4. Run `hermes setup`
5. Configure Hindsight offline (if applicable)
6. Fill in credentials (`.env.example` → `.env`)
7. Replace portable paths → target OS paths (see `references/path-portability.md`)
8. Initialize Kanban (`hermes kanban --board kanban001 init`)
9. Start Gateway (`hermes -p orchestrator gateway run`)
10. Verify

**Path portability**: Before zipping, replace all `/Users/<user>/...` absolute
paths in config/rules/shared files with portable forms. The replacement form
depends on context — see `references/path-portability.md` for the full matrix.
Key rule: use `~` for YAML config values and MCP `command:`, use `${HOME}`
for MCP `env:` values, use `$HOME` for `.env` and shell scripts.

**generate-configs.py regeneration**: If you run `generate-configs.py` to
regenerate configs after path fixes, MCP `env:` values will revert to `~`.
A post-regeneration fix pass is required — see `references/path-portability.md`
§ Post-Regeneration Fix Pass.

## Sanitization

**Always sanitize in a temp directory — never touch live `~/.hermes/` files.**

### What to sanitize

| File type | Count (typical) | Action |
|-----------|----------------|--------|
| `.env` | 10 (global + 9 profiles) | Replace with `.env.example` template |
| `shared/.env.common` | 1 | Same as `.env` — convert to `.env.common.example` (easy to miss!) |
| `auth.json` | 7 (global + 6 profiles) | Clear secret fields (`access_token`, `api_key`, etc.) but **preserve JSON structure** — do NOT replace with empty template |
| `config.yaml` | 11 (global + 10 profiles) | Clear all `api_key:` values to `""` |
| `start.sh` / `launch.py` | 2 | Replace `/Users/xxx` with `$HOME`/`$HERMES_HOME` |
| Skills/docs `.md` | many | Redact example keys (`sk-xxx` → `sk-REDACTED`) |
| `.bak` / `.corrupt` files | varies | Delete entirely |

### Procedure (Python, via execute_code)

```python
import os, re, json, shutil

WORK_DIR = "/tmp/hermes-sanitize"

# 1. .env → .env.example (template with placeholders)
env_template = """# Hermes Agent Environment Variables
# Copy to .env and fill in your actual values
DEEPSEEK_API_KEY=sk-your-deepseek-key
MATRIX_ACCESS_TOKEN=your-matrix-token
SILICONFLOW_API_KEY=sk-your-siliconflow-key
API_SERVER_KEY=desk-your-api-key
EMAIL_ADDRESS=your@email.com
EMAIL_PASSWORD=your-app-password
# ... (see templates/env.example for full template)
"""
for root, dirs, files in os.walk(WORK_DIR):
    for f in files:
        if f == ".env":
            path = os.path.join(root, f)
            with open(path + ".example", "w") as fh: fh.write(env_template)
            os.remove(path)

# 2. auth.json — clear secret fields, preserve structure
#    (Better than replacing with empty template — keeps providers/provider config)
auth_template = {"version":1,"providers":{},"active_provider":None,"credential_pool":{},"updated_at":"2026-01-01T00:00:00+00:00"}
for root, dirs, files in os.walk(WORK_DIR):
    for f in files:
        if f == "auth.json":
            path = os.path.join(root, f)
            try:
                with open(path) as fh: data = json.load(fh)
                # Clear secret fields in providers
                for prov_key, prov_val in data.get("providers", {}).items():
                    if isinstance(prov_val, dict):
                        for k in list(prov_val.keys()):
                            if any(s in k.lower() for s in ['key','token','secret','password']):
                                prov_val[k] = ""
                # Clear tokens in credential_pool
                for pool_key, pool_val in data.get("credential_pool", {}).items():
                    if isinstance(pool_val, dict):
                        pool_val["access_token"] = ""
                        pool_val["refresh_token"] = ""
                with open(path, "w") as fh: json.dump(data, fh, indent=2)
            except Exception:
                with open(path, "w") as fh: json.dump(auth_template, fh, indent=2)

# 3. config.yaml — clear api_key values (preserve ${VAR} references!)
#    The regex skips ${VAR} refs, empty values, and already-cleared "" values.
key_pattern = re.compile(
    r'(api_key\s*:\s*)'
    r'(?!["\']{0,2}\s*$)(?!["\']{0,2}\$\{)(?!["\']{0,2}""\s*$)(?!["\']{0,2}\'\'\s*$)'
    r'(.+)',
    re.IGNORECASE
)
for root, dirs, files in os.walk(WORK_DIR):
    for f in files:
        if f == "config.yaml":
            path = os.path.join(root, f)
            with open(path) as fh: content = fh.read()
            new_content, count = key_pattern.subn(r'\1""', content)
            if count: with open(path, "w") as fh: fh.write(new_content)

# 4. Redact keys in all text files
patterns = {
    r'sk-[a-zA-Z0-9]{10,}': 'sk-REDACTED',
    r'gho_[a-zA-Z0-9]{10,}': 'gho_REDACTED',
    r'syt_[a-zA-Z0-9]{10,}': 'syt_REDACTED',
    # ... add all real key prefixes found in the package
}

# 5. Replace macOS paths
for root, dirs, files in os.walk(WORK_DIR):
    for f in files:
        path = os.path.join(root, f)
        with open(path, "r", errors="ignore") as fh: content = fh.read()
        new = content.replace("~/.hermes", "$HERMES_HOME").replace("~", "$HOME")
        if new != content: with open(path, "w") as fh: fh.write(new)

# 6. Delete .bak/.corrupt files
for root, dirs, files in os.walk(WORK_DIR):
    for f in files:
        if ".corrupt." in f or f.endswith(".bak"):
            os.remove(os.path.join(root, f))

# 7. Verify — scan for real key prefixes
real_prefixes = [r'sk-REDACTED', r'sk-REDACTED', r'gho_REDACTED', r'syt_REDACTED', r'REDACTED', r'desk-REDACTED']
# ... should find 0 matches
```

➡️ Full sanitization reference: `references/credential-sanitization.md`
➡️ `.env.example` template: `templates/env.example`

### Verification

After sanitization, run a final scan for real credential prefixes:

```bash
grep -rl "sk-REDACTED\|sk-REDACTED\|gho_REDACTED\|syt_REDACTED\|desk-REDACTED" /tmp/hermes-sanitize/ | wc -l
# Must be 0
```

### 21. When the target has internet, provide commands instead of packaging binaries

The user's preference when the target Windows machine has network access:
"给出我具体命令即可" (just give me the specific commands). Do NOT spend time
packaging `hermes-agent/` source, `node/`, or `bin/` — these are all rebuildable
on the target via `git clone` + `uv sync` + `npm install`. Only package the
**data directory** (profiles, skills, configs, memories) and provide a clear
PowerShell command sequence for the rest. See Mode D
(`references/windows-fresh-install.md`).

## Pitfalls

### 1. `.env` files contain real API keys
The `.env` file in each profile contains `DEEPSEEK_API_KEY`, `MATRIX_ACCESS_TOKEN`,
`EMAIL_PASSWORD`, etc. These are NOT config templates — they are live secrets.

### 2. `auth.json` contains GitHub Copilot tokens
The `credential_pool` in `auth.json` includes `access_token` fields with real
`gho_*` GitHub tokens. The `secret_fingerprint` fields are hashes (safe to keep)
but `access_token` values must be cleared.

### 3. `config.yaml` may have hardcoded api_key
Some profiles have `api_key: sk-xxx` directly in `config.yaml` (not just in `.env`).
Scan ALL `config.yaml` files, not just the orchestrator's. The `custom_providers`
section in the global `config.yaml` is a common location for hardcoded keys.

### 4. Skills/docs contain example keys
Skills documentation (e.g. `native-mcp/SKILL.md`, `hermes-messaging/references/`)
contains real API key examples from session notes. These must be redacted too.

### 5. `start.sh` has macOS absolute paths
The Hindsight `start.sh` contains `~/.hermes/...` paths. Replace with
`$HERMES_HOME` or `$HOME` before distribution.

### 6. Don't modify live files
Always work in a **temp directory**. Extract the zip, sanitize the copy, repackage.
Never touch the live `~/.hermes/` files.

### 7. Hindsight `start.sh` database password
The `DATABASE_URL` in `start.sh` may contain `hindsight:***@localhost` — the `***`
is literal text (from Hermes' terminal display masking), not a placeholder. In
the sanitized version, use the actual password `hindsight_dev` (matching Docker's
`POSTGRES_PASSWORD`). This bug was found in the live `start.sh` file — the `***`
was NOT from sanitization, it was the original value that had been copied from
a Hermes terminal display where the password was masked. Always check `start.sh`
for this pattern even when not doing migration packaging.

### 8. `shared/.env.common` — the hidden secret file
`~/.hermes/shared/.env.common` is the **template source** for all profile `.env`
files (consumed by `generate-configs.py`). It contains the REAL API keys for
every provider (DeepSeek, Matrix, SiliconFlow, email, etc.). The top-level
`shared/` directory looks innocuous and is easy to miss when scanning for
`.env` files. **Always include `shared/` in the package AND sanitize
`.env.common` the same way as per-profile `.env` files.**

### 9. Skill documentation contains real key prefixes as examples
Even after sanitizing all `.env`/`auth.json`/`config.yaml`, a verification scan
will still find real key prefixes inside skill files — specifically:

- `skills/devops/hermes-agent-migration/SKILL.md` — lists real key prefixes in
  its own sanitization examples (ironic but true)
- `skills/devops/hermes-agent-migration/references/credential-sanitization.md`
  — the same prefixes in the verification regex list

These skill docs are part of the package. They must be run through the same
generic redact pass (`sk-[a-zA-Z0-9]{10,}` → `sk-REDACTED`, etc.) as all other
text files. The redaction is safe: the skill still teaches the procedure, just
with `sk-REDACTED` instead of `sk-REDACTED…`.

### 10. Two-pass redaction is sometimes required
The first generic redact pass catches `sk-`/`gho_`/`syt_`/`desk-` patterns.
But some files contain the real prefixes as **literal strings in documentation**
(e.g. `"scan for sk-REDACTED"`). A targeted second pass that replaces these
specific prefixes (`sk-REDACTED` → `sk-REDACTED`) is needed for a clean
verification. Pattern: after the generic pass, re-scan for any non-redacted
`sk-`/`gho_`/`syt_`/`desk-` occurrence and replace.

### 11. Plugins can have their own `config.yaml` (Mode A exclusion)
When excluding `config.yaml` in Mode A, don't just check the profile root —
plugins can nest their own `config.yaml` too. Found in the wild:
`profiles/<prof>/plugins/acp-client/config.yaml`. The exclude filter must
match `config.yaml` at **any depth**, not just `profiles/<prof>/config.yaml`.
The `config.yaml.example` files in the same dirs are fine to keep (they're
templates with no secrets) — only exclude the real `config.yaml`.

### 12. `config.yaml` contains ability settings, not just API keys
The user initially asked to exclude ALL config files (`.env`, `auth.json`,
`config.yaml`). But `config.yaml` is not purely a secrets file — it contains
critical agent capability configuration:

- `toolsets:` — which toolsets the agent can use (`hermes-cli`, `kanban`,
  `memory`, `messaging`, etc.). Without this, the agent loads no tools.
- `agent:` — behavior params (`max_turns`, `reasoning_effort`,
  `environment_hint` pointing to `*_rules.md`, `tool_use_enforcement`)
- `kanban:` — routing config (`default_assignee`, `auto_decompose`,
  `orchestrator_profile`, `dispatch_in_gateway`)
- `model:` / `providers:` — model selection and provider config
- `platforms:` — gateway/platform integration settings

Excluding `config.yaml` means the target agent has no toolsets, no behavior
config, no kanban routing. **Default to Mode B (sanitize-and-include)** so
these settings survive migration. The sanitization only clears `api_key:`
values to `""` — everything else (toolsets, agent, kanban) is preserved
intact. The user confirmed this preference after understanding the tradeoff.

When the user says "exclude config files," ask: "config.yaml also contains
toolsets/agent/kanban routing config, not just API keys. Include it sanitized
(keep the ability settings, clear only the api_key values)?" Default to yes.

### 13. `profile.yaml` is NOT a config file — it's metadata
`profile.yaml` contains only `description` and `description_auto: false` —
two lines, no secrets, no capability settings. It's the profile's display
metadata. Always include it in both modes. Don't confuse it with
`config.yaml` (which does contain secrets).

### 14. Absolute path portability — `~` vs `${HOME}` vs `$HOME`
When replacing hardcoded `/Users/<user>/...` paths for cross-machine
portability, the correct replacement depends on **where the path is used**
and **which Hermes subsystem reads it**. Using the wrong form silently breaks
the target environment:

| Location | Replace with | Why |
|----------|-------------|-----|
| YAML config values (`cwd:`, `environment_hint:`) | `~/...` | Hermes `terminal.cwd` → `os.path.expanduser()` (config.py:7287). YAML parses `~/path` as a string (not null). |
| MCP `command:` field | `~/...` | `mcp_tool.py:631` calls `os.path.expanduser(str(command))` |
| MCP `env:` values (`HERMES_WEB_UI_HOME`, etc.) | `${HOME}/...` | `_expand_env_vars()` (config.py:6664) expands `${VAR}` but does NOT expand `~`. Using `~` here leaves the literal tilde in the subprocess env. |
| `.env` / `.env.common` files | `$HOME/...` | Shell expands `$HOME` when sourcing |
| Shell scripts (`start.sh`) | `$HOME/...` | Shell expands at runtime |
| `generate-configs.py` output | Literal `~/...` string | The generator writes config values. If it uses `os.path.expanduser("~/...")` at generation time, it bakes the current machine's home into the output. Output the literal string `"~/..."` so the target machine's Hermes expands it at load time. |
| `.md` documentation files | `~/...` or `$HOME/...` | Human-readable, either works |

**Critical gotcha**: After running `generate-configs.py` to regenerate configs,
MCP `env:` values revert to `~` (because profiles.yaml uses `~` and the
generator passes them through). A post-generation fix pass is needed to
convert `~` → `${HOME}` in MCP `env:` sections specifically.

➡️ Full path replacement reference: `references/path-portability.md`

### 15. `.curator_state` files contain runtime paths
Each profile's `skills/.curator_state` file contains a `last_report_path`
field with an absolute `/Users/<user>/...` path. These are runtime state
files, not skill content — exclude them from packages. They'll be
regenerated by the curator on the target machine.

### 16. `auth.json` label fields contain paths
The `label` field in `auth.json` credential pool entries can contain absolute
paths (e.g. `"/Users/<user>/.qwen/oauth_creds.json"`). These aren't secrets
but are machine-specific. Replace `/Users/<user>` with `~` in all JSON
string values during sanitization.

### 17. Skills diverge across profiles — dedup selection matters
In a multi-profile deployment, the same skill path (e.g.
`software-development/systematic-debugging`) can have **different content** in
different profiles. The orchestrator version is usually the most up-to-date,
but worker-specific skills (e.g. `devops/kanban-worker`, `autonomous-ai-agents/claude-code`)
can be more complete in the worker profile that actively uses them. When
deduplicating, always record which version was selected and why in MANIFEST.md
so the user can manually swap if the target environment needs a different variant.

### 18. `.curator_backups` inflates skill directory size massively
Each profile's `skills/.curator_backups/` contains timestamped snapshots of the
entire skills directory (~60 MB each, 5+ snapshots common). Always exclude
`.curator_backups`, `.hub`, and `.curator_state` during any skill scanning or
copying operation — without this filter, a "7 MB deduped" package would be
multi-gigabyte.

### 19. Forgetting to scan the global `~/.hermes/skills/` directory
Hermes has TWO skill locations: `~/.hermes/skills/` (global, shared by all
profiles) AND `~/.hermes/profiles/<profile>/skills/` (per-profile). If you
only scan per-profile directories, you miss ~24 skills that exist only
globally (e.g. `feeds/`, `leisure/`, `cognition-lattice/`,
`wechat-article-extractor/`). The user caught this error by asking "不是公共
的skill目录么？". Always scan global first, then profiles. See
`references/skills-dedup-package.md` Pitfall #1.

### 20. "Most files" is a better completeness signal than "largest size"
When selecting between different-content versions of the same skill, a skill
with 2 files at 21KB can be more complete than 1 file at 24KB — the extra
file (e.g. a `references/` subdirectory) represents real content that size
alone doesn't capture. Use `max(entries, key=lambda e: (e["files"], e["size"]))`
to sort by file count first, then size as tiebreaker.

## Applying Bank Isolation (Multi-Machine)

When Hindsight API serves agents on multiple machines, update
`bank_id_template` in all 9 profiles' `hindsight/config.json` to use
**MAC-based machine isolation**: `hermes-{MAC}-{profile}`. The MAC address
(colons stripped, lowercase) is baked literally into the template — it is
NOT a Hindsight runtime placeholder like `{profile}` or `{user}`.

**Why MAC, not `{user}`?** The `{user}` placeholder comes from the Matrix
event's `sender` field (a full MXID). It is empty for TUI/CLI sessions
(collapses to old bank format) and shared across machines for the same
Matrix user. MAC address is machine-unique, available on all platforms,
and deterministic regardless of session source.

### Automated setup (recommended)

```bash
# Detect MAC and update all profiles
python3 ~/.hermes/shared/setup-hindsight-banks.py

# Or use the skill's copy:
# skill: hermes-agent-migration, path: scripts/setup-hindsight-banks.py
```

### Migrating old memories to new banks

After changing the template, old banks are preserved but unused. To migrate:

```bash
# Run in background (5-10 min for ~200 memories)
python3 scripts/migrate-hindsight-banks.py
# Or: terminal(background=true, notify_on_complete=true)
```

The migration script recalls all memories from each legacy bank and re-writes
them to the corresponding MAC-based bank with migration tags. Proven: 208
memories, 0 failures (2026-07-21 session).

➡️ Full procedure + evolution history: `references/bank-isolation.md`
➡️ Auto-detect script: `scripts/setup-hindsight-banks.py`
➡️ Migration script: `scripts/migrate-hindsight-banks.py`

## Reference Files

- `references/credential-sanitization.md` — detailed sanitization procedure with
  Python code, regex patterns, and verification steps
- `references/personality-only-package.md` — proven workflow for a
  personality/skills-only package (SOUL/rules/skills/plugins/memories, no
  runtime data). Includes copy→sanitize→verify→zip phases, package structure,
  and size guidance (~71 MB for 9 profiles).
- `references/skills-dedup-package.md` — Mode C workflow: scan all profiles
  for skills (directories with SKILL.md), deduplicate by relative path with
  content-aware selection (orchestrator > largest), generate MANIFEST.md, zip.
  ~3 MB for 115 unique skills from 9 profiles.
- `references/windows-fresh-install.md` — Mode D workflow: when the target
  Windows machine has network access, provide installation commands instead of
  packaging binaries. Covers tool architecture (where "available tools" come
  from), what to package vs install fresh, full PowerShell command sequence,
  platform-specific binary checklist, and verification steps.
- `references/sanitized-config-package.md` — Mode B workflow: copy config files
  to staging, sanitize with Python (api_key→"", .env→.env.example,
  auth.json token clearing), redact skill docs, replace macOS paths, verify
  zero residual keys, zip. Includes the complete Python sanitization script.
- `references/path-portability.md` — `~` vs `${HOME}` vs `$HOME` replacement
  matrix, the two Hermes path-expansion mechanisms (`os.path.expanduser` vs
  `_expand_env_vars`), generate-configs.py pitfall, and post-regeneration
  fix pass for MCP env values.
- `templates/env.example` — `.env.example` template for sanitized packages
- `references/all-profile-hindsight-setup.md` — auditing and fixing Hindsight
  memory provider across all 9 profiles (config.json, bank init, recall test)
- `references/bank-isolation.md` — MAC-based machine isolation via
  `bank_id_template: hermes-{MAC}-{profile}`; why MAC instead of `{user}`,
  evolution history, backwards compatibility, verification procedure
- `scripts/setup-hindsight-banks.py` — auto-detect MAC (macOS/Linux/Windows)
  and update all profiles' config.json. Supports `--mac`, `--dry-run`.
- `scripts/migrate-hindsight-banks.py` — recall from legacy banks, re-retain
  to MAC-based banks. Batch processing with rate-limit safety. Run in background.

## TUI Bypass: Direct Execution

**Critical**: When the orchestrator runs in a TUI/CLI session (no `**Source:** Matrix`
in session context), ALL migration tasks are executed **directly** — packaging,
sanitizing, uploading — not routed through Kanban. The kanban routing path is for
Matrix messages only. This matches the user's platform-aware routing preference.

## Related Skills

- **hermes-memory-providers** — Hindsight offline deployment (Docker image + local
  models + start scripts). See `references/hindsight-offline-deployment.md`.
- **hermes-profile-config** — Multi-profile config management, `.env` management
  across profiles, gateway restart procedures.
- **hermes-docker-sandbox** — Docker-based Hermes deployment.
