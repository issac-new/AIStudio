# Credential Sanitization for Migration Packages

## Overview

When packaging `~/.hermes/` for cross-machine migration, all credential files
must be sanitized **before** upload. This document covers the full procedure.

## Sensitive File Inventory

| File | Location | Contains |
|------|----------|----------|
| `.env` | global + each profile | API keys, tokens, passwords |
| `auth.json` | global + some profiles | GitHub tokens, credential pools |
| `config.yaml` | global + each profile | May have hardcoded `api_key:` values |
| `start.sh` | orchestrator/hindsight/ | macOS absolute paths, DB password |
| `*.md` (skills/docs) | throughout | Example keys from real sessions |

## Sanitization Steps (Python)

Run via `execute_code` in a temp directory — never on live `~/.hermes/`.

### Step 1: .env → .env.example

Replace every `.env` file with a `.env.example` template containing placeholders:

```python
env_template = """# Copy to .env and fill in your actual values
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
```

### Step 2: auth.json → empty template

Clear all credential pools:

```python
auth_template = {
    "version": 1,
    "providers": {},
    "active_provider": None,
    "credential_pool": {},
    "updated_at": "2026-01-01T00:00:00+00:00"
}
for root, dirs, files in os.walk(WORK_DIR):
    for f in files:
        if f == "auth.json":
            with open(os.path.join(root, f), "w") as fh:
                json.dump(auth_template, fh, indent=2)
```

### Step 3: config.yaml — clear api_key values

Regex to match and clear hardcoded keys:

```python
# Match: api_key: sk-xxx, api_key: "sk-xxx", access_token: gho_xxx, etc.
key_pattern = re.compile(
    r'((?:api_key|access_token|password|secret|token)\s*:\s*)'
    r'["\']?(?:sk-|gho_|syt_|m0-|desk-|d53017c3|p9Jh0dJc)[^\s"\']+',
    re.IGNORECASE
)
# Replace with: api_key: ""
new_content, count = key_pattern.subn(r'\1""', content)
```

Also clear email addresses and passwords:

```python
email_pattern = re.compile(r'(EMAIL_ADDRESS\s*[:=]\s*)["\']?[^\s"\']+@', re.IGNORECASE)
pwd_pattern = re.compile(r'(EMAIL_PASSWORD\s*[:=]\s*)["\']?[^\s"\']+["\']?', re.IGNORECASE)
```

### Step 4: Redact keys in all text files

Scan ALL `.md`, `.yaml`, `.json`, `.sh`, `.py` files for real key prefixes:

```python
patterns = {
    r'sk-[a-zA-Z0-9]{10,}': 'sk-REDACTED',
    r'gho_[a-zA-Z0-9]{10,}': 'gho_REDACTED',
    r'syt_[a-zA-Z0-9]{10,}': 'syt_REDACTED',
    r'm0-[a-zA-Z0-9]{10,}': 'm0-REDACTED',
    r'desk-[a-f0-9-]{10,}': 'desk-REDACTED',
    r'p9Jh0dJc[a-zA-Z0-9-]+': 'REDACTED',
    r'd53017c3-f0e5-40b8-b0b7-94d8ac8fbd0f': 'REDACTED',
    r'kzpspubynbwgbbhi': 'REDACTED',
    r'HK_MAIL@qq\.com': 'your@email.com',
    r'cuishi@qq\.com': 'your@email.com',
}
```

### Step 5: Replace macOS paths

```python
content.replace("~/.hermes", "$HERMES_HOME")
content.replace("~", "$HOME")
```

### Step 6: Delete backup/corrupt files

```python
for root, dirs, files in os.walk(WORK_DIR):
    for f in files:
        if ".corrupt." in f or f.endswith(".bak"):
            os.remove(os.path.join(root, f))
```

### Step 7: Verify — scan for real key prefixes

```python
# These are the actual key prefixes found in the source environment.
# After sanitization, grep for these must return 0 matches.
real_prefixes = [
    r'sk-f9d',    # DeepSeek
    r'sk-ezi',    # SiliconFlow
    r'sk-eGx',    # Damoxing
    r'sk-kim',    # Kimi
    r'sk-654',    # Cherry
    r'gho_pW',    # GitHub Copilot
    r'syt_dGVz',  # Matrix
    r'p9Jh0dJc',  # Gateway token
    r'd53017c3',  # ModelScope key
    r'kzpspubynbwgbbhi',  # Email password
    r'm0-18i0Aw7t',       # Mem0 key
    r'desk-12fe8aa6',     # API server key
]
# Run: grep -rl for each pattern → must be 0 files
```

## Common Misses

1. **Skills documentation** — `SKILL.md` files and `references/*.md` contain
   real API key examples from session notes. These are easy to miss because
   they're in deeply nested skill directories.

2. **Multiple config.yaml snapshots** — HuggingFace cache snapshots, state
   snapshots, and `.corrupt.bak` files contain old copies of config with
   real keys. Delete all `.bak` and `.corrupt` files.

3. **config.yaml.bak files** — When `sed -i'.bak'` was used, the backup files
   contain the original unredacted config. Delete them.

4. **Hindsight start.sh** — Contains `~/...` paths AND the database
   password `hindsight:***@localhost` (where `***` is literal, not the real
   password). Replace with `hindsight:hindsight_dev` for the sanitized version.

## Repackage After Sanitization

```bash
cd /tmp/hermes-sanitize
zip -r /output/hermes-agents-migration-sanitized.zip .hermes \
  -x "*.pyc" -x "*__pycache__*" -x "*.log" -x "*.tmp"
```

Upload the sanitized zip — NOT the original.
