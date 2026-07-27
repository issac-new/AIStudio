# Mode B: Sanitized Config Package — Proven Workflow

When the user wants config files included in the migration package (the default
since config.yaml contains toolsets/agent/kanban routing config, not just API
keys). This reference documents the full copy→sanitize→verify→zip workflow.

## Overview

Goal: package all personality files PLUS sanitized config files so the target
agent has its full capability configuration (toolsets, agent behavior, kanban
routing) without leaking any secrets.

## Phase 1: Copy to staging

```python
import os, re, json, shutil

SRC = os.path.expanduser("~/.hermes")
STAGING = "/tmp/hermes-agent-personality-v2"

if os.path.exists(STAGING):
    shutil.rmtree(STAGING)
os.makedirs(STAGING)
```

### Global files
- `SOUL.md` — copy as-is
- `global_kanban_rules.md` — copy as-is
- `config.yaml` — copy, then sanitize (Phase 2)
- `.env` — convert to `.env.example` (Phase 2)
- `auth.json` — copy, then sanitize (Phase 2)

### shared/ directory
- `generate-configs.py` — copy as-is
- `README.md` — copy as-is
- `profiles.yaml` — copy, then sanitize (Phase 2)
- `.env.common` — convert to `.env.common.example` (Phase 2)
- Skip `__pycache__/`, `*.bak*` files

### Per-profile (9 profiles)
For each profile, copy:
- `SOUL.md`, `*_rules.md`, `profile.yaml` — as-is
- `config.yaml` — copy + sanitize
- `.env` → `.env.example`
- `auth.json` — copy + sanitize
- `skills/` — copytree with ignore_patterns(`__pycache__`, `*.pyc`, `.DS_Store`,
  `.git`, `node_modules`, `*.log`, `*.tmp`)
- `plugins/` — same ignore patterns
- `memories/` — ignore `*.lock`, `.DS_Store`
- `hindsight/` — ONLY `config.json` + `start.sh` (no `pgdata/`, `data/`, `logs/`)

## Phase 2: Sanitize

### config.yaml — clear api_key values

```python
def sanitize_config_yaml(path):
    with open(path) as f:
        content = f.read()
    # Clear: api_key: <value> (not ${VAR}, not already empty)
    content = re.sub(
        r'(api_key\s*:\s*)(?!["\']{0,2}\s*$)(?!["\']{0,2}\$\{)(?!["\']{0,2}""\s*$)(?!["\']{0,2}\'\'\s*$)(.+)',
        r'\1""',
        content
    )
    # Also clear access_token, password, secret fields
    for field in ['access_token', 'password', 'secret']:
        content = re.sub(
            rf'({field}\s*:\s*)(?!["\']{{0,2}}\s*$)(?!["\']{{0,2}}\$\{{)(.+)',
            r'\1""',
            content
        )
    with open(path, 'w') as f:
        f.write(content)
```

Key insight: `${VAR}` references are SAFE (they reference env vars, not hardcoded
keys). The regex explicitly skips them. Only hardcoded values get cleared.

### .env → .env.example

```python
def sanitize_env_to_example(src_path, dst_path):
    with open(src_path) as f:
        lines = f.readlines()
    sanitized = []
    for line in lines:
        stripped = line.strip()
        if '=' in stripped and not stripped.startswith('#'):
            key = stripped.split('=', 1)[0]
            val = stripped.split('=', 1)[1]
            if re.match(r'^(sk-|gho_|syt_|m0-|desk-|ghp_|xoxb-)', val) or \
               re.search(r'[A-Za-z0-9]{20,}', val) or \
               any(s in key.upper() for s in ['PASSWORD', 'SECRET', 'TOKEN', 'KEY']):
                sanitized.append(f"{key}=YOUR_{key}_HERE\n")
            else:
                sanitized.append(line)
        else:
            sanitized.append(line)
    with open(dst_path, 'w') as f:
        f.writelines(sanitized)
```

### auth.json — clear tokens, preserve structure

```python
def sanitize_auth_json(path):
    with open(path) as f:
        data = json.load(f)
    # Clear credential pool tokens
    for pool_key, pool_val in data.get("credential_pool", {}).items():
        if isinstance(pool_val, dict):
            for k in list(pool_val.keys()):
                if any(s in k.lower() for s in ['key', 'token', 'secret', 'password']):
                    pool_val[k] = ""
    # Clear provider keys
    for prov_key, prov_val in data.get("providers", {}).items():
        if isinstance(prov_val, dict):
            for k in list(prov_val.keys()):
                if any(s in k.lower() for s in ['key', 'token', 'secret', 'password']):
                    prov_val[k] = ""
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
```

Key insight: preserve the JSON structure (providers dict, credential_pool dict)
rather than replacing with an empty template. The structure carries provider
names and config shape that the target environment needs.

### profiles.yaml — same as config.yaml

```python
def sanitize_profiles_yaml(path):
    with open(path) as f:
        content = f.read()
    content = re.sub(
        r'(api_key\s*:\s*)(?!["\']{0,2}\s*$)(?!["\']{0,2}\$\{)(?!["\']{0,2}""\s*$)(?!["\']{0,2}\'\'\s*$)(.+)',
        r'\1""',
        content
    )
    with open(path, 'w') as f:
        f.write(content)
```

## Phase 3: Global redaction & path replacement

### Redact API key patterns in ALL text files

```python
redact_patterns = [
    (re.compile(r'sk-[a-zA-Z0-9]{20,}'), 'sk-REDACTED'),
    (re.compile(r'gho_[a-zA-Z0-9]{20,}'), 'gho_REDACTED'),
    (re.compile(r'syt_[a-zA-Z0-9]{20,}'), 'syt_REDACTED'),
    (re.compile(r'desk-[a-zA-Z0-9]{20,}'), 'desk-REDACTED'),
    (re.compile(r'm0-[a-zA-Z0-9]{20,}'), 'm0-REDACTED'),
    (re.compile(r'ghp_[a-zA-Z0-9]{20,}'), 'ghp_REDACTED'),
    (re.compile(r'xoxb-[a-zA-Z0-9]{20,}'), 'xoxb-REDACTED'),
]
```

This catches keys in skill documentation (`SKILL.md`, `references/*.md`) that
contain real key examples from session notes.

### Two-pass redaction for documentation files

Some skill docs (especially `hermes-agent-migration/SKILL.md` itself and
`credential-sanitization.md`) contain real key prefixes as literal strings in
documentation ("scan for sk-REDACTED"). The generic 20+ char pattern misses these
because the prefix is short. A targeted second pass is needed:

```python
targeted_patterns = [
    re.compile(r'sk-REDACTED[a-zA-Z0-9]*'),
    re.compile(r'sk-REDACTED[a-zA-Z0-9]*'),
    re.compile(r'sk-REDACTED[a-zA-Z0-9]*'),
    re.compile(r'gho_REDACTED[a-zA-Z0-9]*'),
    re.compile(r'syt_REDACTED[a-zA-Z0-9]*'),
    re.compile(r'desk-REDACTED[a-zA-Z0-9]*'),
    re.compile(r'm0-REDACTED[a-zA-Z0-9]*'),
    # Also catch truncated forms: sk-REDACTED
    re.compile(r'sk-[a-zA-Z0-9]+\.\.\.[a-zA-Z0-9]+'),
]
# Replace all with 'REDACTED'
```

### Replace macOS paths

```python
content = content.replace("~/.hermes", "$HERMES_HOME")
content = content.replace("~", "$HOME")
```

## Phase 4: Verification (CRITICAL)

```python
# Scan for known real key prefixes — must be ZERO matches
real_prefixes = [
    r'sk-REDACTED', r'sk-REDACTED', r'sk-REDACTED',     # LLM provider keys
    r'gho_REDACTED',                             # GitHub tokens
    r'syt_REDACTED',                           # Matrix tokens
    r'desk-REDACTED',                      # API server keys
    r'm0-REDACTED',                            # Mem0 keys
]
# Also scan for any non-redacted generic patterns
generic_patterns = [
    r'sk-[a-zA-Z0-9]{20,}',
    r'gho_[a-zA-Z0-9]{20,}',
    r'syt_[a-zA-Z0-9]{20,}',
    r'desk-[a-zA-Z0-9]{20,}',
]
```

Also verify:
- `.env` files remaining: 0 (all converted to `.env.example`)
- `config.yaml` api_key lines: all should be `api_key: ""` or `api_key: ${VAR}`

## Phase 5: Write MIGRATION-GUIDE.md

Include a deployment guide with:
1. Package contents summary
2. Sanitization table (what was done to each file type)
3. Windows deployment steps (install, extract, fill credentials, fix paths, verify)
4. Profile architecture diagram

## Phase 6: Zip

```bash
cd /tmp/hermes-agent-personality-v2
zip -r '/target/path/hermes-agent-personality.zip' . \
  -x '__pycache__/*' '*.pyc' '.DS_Store' '*/.DS_Store' '*.bak*'
```

## Package stats (9 profiles, Mode B)

- ~5600 files, ~110 MB uncompressed, ~71 MB compressed
- 10 config.yaml (global + 9 profiles), all sanitized
- 11 .env.example (global + 9 profiles + .env.common)
- 9 auth.json (global + 8 profiles), all sanitized
- 1 profiles.yaml, sanitized
- Full skills/ (29-38 categories per profile)
- Full plugins/ (run-trace, acp-client, matrix-chat-info, etc.)
- memories/ (MEMORY.md + USER.md per profile)
- hindsight/ (config.json + start.sh for 3 profiles)
