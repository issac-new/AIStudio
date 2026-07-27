# Personality-Only Migration Package (Mode A)

## Use Case

When the user wants to migrate **agent personality, behavior rules, and skills**
(SOUL.md, *_rules.md, skills/, plugins/, memories/) but NOT any sensitive
configuration files. This is the default and preferred mode.

**Key difference from Mode B (full): sensitive config files are EXCLUDED
entirely, not sanitized-and-included.** The target-environment user creates
their own `.env`, `auth.json`, `config.yaml` on the other side.

This is smaller (~71 MB zipped for 9 profiles) and faster to produce, because
it excludes all runtime data AND all config/credential files.

## What to EXCLUDE (never package in Mode A)

| File | Why |
|------|-----|
| `.env`, `.env.example`, `.env.common`, `.env.common.example` | Contains API keys/tokens |
| `auth.json` | Contains GitHub tokens, credential pools |
| `config.yaml` (global, per-profile, AND nested in `plugins/*/`) | May have hardcoded `api_key:` |
| `profiles.yaml` (in `shared/`) | Contains provider definitions with keys |
| Any `*.bak` / `*.corrupt` files | Contain same secrets as originals |

**⚠️ Nested config.yaml pitfall**: plugins can have their own `config.yaml`
(e.g. `profiles/<prof>/plugins/acp-client/config.yaml`). The exclude filter
must match `config.yaml` at **any depth**, not just the profile root. The
`config.yaml.example` files in the same dirs are fine to keep (templates, no
secrets) — only exclude the real `config.yaml`.

## What to INCLUDE

```
hermes-agent-personality/
├── SOUL.md                       # Global personality
├── global_kanban_rules.md        # Global routing rules
├── MIGRATION-GUIDE.md            # Deployment instructions
├── shared/
│   ├── generate-configs.py       # Config generator script (for target env)
│   └── README.md
└── profiles/
    └── <profile-name>/           # One per agent (9 total)
        ├── SOUL.md
        ├── <profile-name>_rules.md
        ├── profile.yaml           # Profile metadata (non-orchestrator only)
        ├── skills/                # Full skill library
        ├── plugins/               # Plugin code (no config.yaml)
        ├── memories/              # MEMORY.md + USER.md
        └── hindsight/             # config.json + start.sh only (if present)
```

## Proven Workflow (execute_code + zip)

### Phase 1: Copy to staging (Python via execute_code)

```python
import os, shutil

SRC = os.path.expanduser("~/.hermes")
STAGING = "/tmp/hermes-agent-personality-clean"

if os.path.exists(STAGING):
    shutil.rmtree(STAGING)
os.makedirs(STAGING)

# --- Sensitive files to EXCLUDE entirely ---
SENSITIVE_FILES = {
    '.env', '.env.example', '.env.common', '.env.common.example',
    'auth.json', 'config.yaml', 'profiles.yaml',
}

def is_sensitive(filename):
    return filename in SENSITIVE_FILES or '.bak' in filename

# Global files — personality only, NO config
for f in ['SOUL.md', 'global_kanban_rules.md']:
    src = os.path.join(SRC, f)
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(STAGING, f))

# shared/ — only generate-configs.py and README.md, skip .env.common + profiles.yaml
shared_src = os.path.join(SRC, "shared")
if os.path.isdir(shared_src):
    for item in os.listdir(shared_src):
        if is_sensitive(item) or item.startswith('.') or item == '__pycache__':
            continue
        s = os.path.join(shared_src, item)
        d = os.path.join(STAGING, "shared", item)
        if os.path.isdir(s):
            shutil.copytree(s, d, dirs_exist_ok=True)
        else:
            shutil.copy2(s, d)

# Per-profile files — personality/behavior/capability only
profile_includes = [
    'SOUL.md', 'profile.yaml', 'skills', 'plugins', 'memories', 'hindsight',
]

profiles = sorted([d for d in os.listdir(os.path.join(SRC, "profiles"))
                   if os.path.isdir(os.path.join(SRC, "profiles", d))])

for prof in profiles:
    prof_src = os.path.join(SRC, "profiles", prof)
    prof_dst = os.path.join(STAGING, "profiles", prof)
    os.makedirs(prof_dst, exist_ok=True)

    for item in profile_includes:
        src = os.path.join(prof_src, item)
        if os.path.exists(src):
            dst = os.path.join(prof_dst, item)
            if os.path.isdir(src):
                if item in ('skills', 'plugins'):
                    shutil.copytree(src, dst, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns(
                            '__pycache__', '*.pyc', '.DS_Store', '.git',
                            'node_modules', '*.log', '*.tmp'))
                elif item == 'memories':
                    shutil.copytree(src, dst, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('*.lock', '.DS_Store'))
                elif item == 'hindsight':
                    # Only config.json + start.sh, not pgdata/data/logs
                    os.makedirs(dst, exist_ok=True)
                    for hf in ['config.json', 'start.sh']:
                        hsrc = os.path.join(src, hf)
                        if os.path.exists(hsrc):
                            shutil.copy2(hsrc, os.path.join(dst, hf))
                else:
                    shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)

    # Copy *_rules.md files
    for f in os.listdir(prof_src):
        if f.endswith('_rules.md') and not is_sensitive(f):
            shutil.copy2(os.path.join(prof_src, f), os.path.join(prof_dst, f))
```

### Phase 2: Sweep for residual sensitive files + key examples in docs

Even though config files are excluded, skill documentation (`.md` files) can
contain real API key examples from session notes. Two cleanup passes:

```python
import os, re, shutil

WORK_DIR = STAGING  # reuse the staging dir

# 2a. Remove any .bak files and residual config files at any depth
for root, dirs, files in os.walk(WORK_DIR):
    dirs[:] = [d for d in dirs if d != '__pycache__']
    for f in files:
        if '.bak' in f or f in ('.env', 'auth.json', 'config.yaml',
                                 'profiles.yaml', '.env.common'):
            os.remove(os.path.join(root, f))

# 2b. Redact API key examples in ALL text files (skill docs, references, etc.)
redact_patterns = [
    (re.compile(r'sk-[a-zA-Z0-9]{20,}'), 'sk-REDACTED'),
    (re.compile(r'gho_[a-zA-Z0-9]{20,}'), 'gho_REDACTED'),
    (re.compile(r'syt_[a-zA-Z0-9]{20,}'), 'syt_REDACTED'),
    (re.compile(r'desk-[a-zA-Z0-9]{20,}'), 'desk-REDACTED'),
]
for root, dirs, files in os.walk(WORK_DIR):
    dirs[:] = [d for d in dirs if d != '__pycache__']
    for f in files:
        path = os.path.join(root, f)
        if f.endswith(('.md', '.yaml', '.yml', '.json', '.py', '.sh', '.txt')):
            try:
                with open(path, 'r', errors='ignore') as fh:
                    content = fh.read()
                original = content
                for pattern, replacement in redact_patterns:
                    content = pattern.sub(replacement, content)
                if content != original:
                    with open(path, 'w') as fh:
                        fh.write(content)
            except:
                pass

# 2c. Replace macOS paths with portable variables
for root, dirs, files in os.walk(WORK_DIR):
    dirs[:] = [d for d in dirs if d != '__pycache__']
    for f in files:
        path = os.path.join(root, f)
        if f.endswith(('.md', '.yaml', '.yml', '.json', '.py', '.sh', '.txt')):
            try:
                with open(path, 'r', errors='ignore') as fh:
                    content = fh.read()
                new = content.replace("~/.hermes", "$HERMES_HOME") \
                            .replace("~", "$HOME")
                if new != content:
                    with open(path, 'w') as fh:
                        fh.write(new)
            except:
                pass
```

### Phase 3: Verify zero residual credentials

```python
import re
# Scan for any non-redacted sk-/gho_/syt_/desk- patterns
generic_patterns = [
    re.compile(r'sk-[a-zA-Z0-9]{20,}'),
    re.compile(r'gho_[a-zA-Z0-9]{20,}'),
    re.compile(r'syt_[a-zA-Z0-9]{20,}'),
    re.compile(r'desk-[a-zA-Z0-9]{20,}'),
]
issues = []
for root, dirs, files in os.walk(STAGING):
    dirs[:] = [d for d in dirs if d != '__pycache__']
    for f in files:
        path = os.path.join(root, f)
        try:
            content = open(path, 'r', errors='ignore').read()
            for p in generic_patterns:
                for m in p.finditer(content):
                    if 'REDACTED' not in m.group():
                        issues.append((os.path.relpath(path, STAGING), m.group()[:30]))
        except:
            pass
assert not issues, f"Found {len(issues)} residual credentials!"
# Also verify no sensitive config files exist
sensitive_found = []
for root, dirs, files in os.walk(STAGING):
    for f in files:
        if f in ('.env', 'auth.json', 'config.yaml', 'profiles.yaml', '.env.common'):
            sensitive_found.append(f)
assert not sensitive_found, f"Sensitive files still present: {sensitive_found}"
```

### Phase 4: Write MIGRATION-GUIDE.md and zip

The MIGRATION-GUIDE.md should:
- Explicitly state that config files are NOT included
- List which files the target user must create (`.env`, `auth.json`, `config.yaml`)
- Point to `shared/generate-configs.py` as the config generation tool
- Include Windows deployment steps

```bash
cd /tmp/hermes-agent-personality-clean
zip -r '/target/dir/hermes-agent-personality.zip' . \
  -x '__pycache__/*' '*.pyc' '.DS_Store' '*/.DS_Store' '*.bak*'
```

### Phase 5: Final zip verification

```bash
# Verify no sensitive files in the zip
unzip -l /target/dir/hermes-agent-personality.zip | grep -iE '\.env$|auth\.json|config\.yaml$|profiles\.yaml$'
# Should return nothing (config.yaml.example is OK to keep)
```

## When to use Mode A vs Mode B

| Scenario | Mode |
|----------|------|
| Migrate agent personality/skills — user prefers no config files | **Mode A** (this) |
| Target machine already has Hermes installed | **Mode A** |
| Share skill library with teammate | **Mode A** |
| Fresh install, user explicitly asks for configs included | Mode B (sanitize) |
| Full backup including credential templates | Mode B (sanitize) |

## Proven sizes (9-profile environment, Mode A)

- Staging dir: ~110 MB, ~5600 files
- Final zip: ~71 MB, ~7400 entries (zip counts dir entries too)
- Time: <30 seconds for copy + sweep + zip
