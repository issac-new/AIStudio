---
name: hermes-credential-scoping
description: >-
  Scope platform-specific credentials (MATRIX_*, EMAIL_*) to only the profiles
  that use them, via profiles.yaml env_extra — NOT the shared .env.common.
  Covers the generate-configs.py pipeline, the .env.common→all-profiles
  distribution pitfall, and verification patterns. Use when setting up or
  auditing credentials for Matrix, Email, or any platform channel that only
  one profile needs.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [credentials, env, env-extra, profiles-yaml, security, scoping, matrix, email]
    related_skills: [hermes-profile-config, matrix-synapse-admin, email-channel-configuration, gateway-platform-management]
---

# Hermes Credential Scoping

Ensure platform-specific credentials reach ONLY the profiles that need them.
The core principle: `.env.common` is shared by ALL profiles; `env_extra` in
`profiles.yaml` is per-profile. Put credentials where they belong.

## When to Use

- Setting up or modifying Matrix, Email, or any platform-specific credentials
- Auditing which profiles have access to which credentials
- After a user points out credentials are spread too widely
- Before migration or security review
- Any time you add a new platform channel to Hermes

## Core Concept: .env.common vs env_extra

```
~/.hermes/shared/.env.common        → distributed to ALL profiles' .env
~/.hermes/shared/profiles.yaml      → per-profile env_extra section
         ↓
generate-configs.py reads both, outputs per-profile .env
         ↓
~/.hermes/profiles/<profile>/.env   = .env.common vars + profile env_extra
```

**Rule**: If a credential is only used by ONE profile (e.g. only orchestrator
has `matrix.enabled: true`), it goes in that profile's `env_extra` — NOT in
`.env.common`.

| Credential type | Belongs in | Why |
|----------------|-------------|-----|
| Model API keys (DAMOXING_API_KEY, DEEPSEEK_API_KEY) | `.env.common` | All profiles use the model provider |
| Gateway tokens (HERMES_GATEWAY_TOKEN) | `.env.common` | All profiles may need gateway auth |
| Dashboard config (HERMES_DASHBOARD_*) | `.env.common` | Shared infrastructure |
| Terminal/browser config | `.env.common` | Shared infrastructure |
| MATRIX_* (access token, user_id, homeserver, etc.) | `env_extra` for orchestrator | Only orchestrator has matrix.enabled: true |
| EMAIL_* (address, password, IMAP/SMTP) | `env_extra` for the profile with email.enabled | Only that profile uses email |

## The Pitfall: Credentials in .env.common Leak Everywhere

Putting `MATRIX_ACCESS_TOKEN` in `.env.common` causes it to appear in ALL 15+
profiles' `.env` files, even though only `orchestrator` has
`matrix.enabled: true`. This is:

1. **A security concern** — credentials spread to profiles that don't need them
2. **A correctness issue** — the user will rightly flag it as wrong
3. **Misleading** — makes it look like every profile uses Matrix

### How to check if this is happening

```bash
# Count which profiles have platform-specific creds they shouldn't
for d in ~/.hermes/profiles/*/; do
    p=$(basename "$d")
    has_matrix=$(grep -c "MATRIX_" "$d/.env" 2>/dev/null)
    has_email=$(grep -c "EMAIL_" "$d/.env" 2>/dev/null)
    [ "$has_matrix" -gt 0 ] && echo "$p: MATRIX=$has_matrix"
    [ "$has_email" -gt 0 ] && echo "$p: EMAIL=$has_email"
done

# Check .env.common for platform-specific vars
grep -E "^(MATRIX_|EMAIL_)" ~/.hermes/shared/.env.common
```

## Fix: Move Platform Credentials to env_extra

### Step 1: Remove from .env.common

In `~/.hermes/shared/.env.common`, replace the platform credential block with
a comment:

```bash
# Before:
MATRIX_ACCESS_TOKEN=syt_xxx
MATRIX_HOMESERVER=http://localhost:8008
MATRIX_USER_ID=@swarm:matrix.test
MATRIX_HOME_ROOM=!roomid:matrix.test
MATRIX_HOME_ROOM_THREAD_ID=$threadid

# After:
# --- Matrix (orchestrator 专属，仅写入 orchestrator env_extra) ---
# 变量已移至 profiles.yaml 的 orchestrator.env_extra，避免分发给所有 profile
```

### Step 2: Add to profiles.yaml env_extra

In `~/.hermes/shared/profiles.yaml`, under the orchestrator profile:

```yaml
profiles:
  orchestrator:
    matrix:
      enabled: true
    env_extra:
      MATRIX_ACCESS_TOKEN: syt_xxx
      MATRIX_HOMESERVER: http://localhost:8008
      MATRIX_USER_ID: '@swarm:matrix.test'           # quote — contains @
      MATRIX_HOME_ROOM: '!roomid:matrix.test'        # quote — contains !
      MATRIX_HOME_ROOM_THREAD_ID: '$threadid'         # quote — contains $
    # ... rest of orchestrator config

  worker-coder:
    matrix:
      enabled: false
    env_extra:
      API_SERVER_ENABLED: 'false'
    # NO MATRIX_* vars — worker doesn't use Matrix
```

**YAML quoting reminder**: Values containing `@`, `!`, `$`, or starting with
special chars MUST be single-quoted in YAML to avoid parsing issues.

### Step 3: Clean root ~/.hermes/.env

The root `.env` may contain stale platform credentials from before the config
generator was adopted. Remove them:

```bash
# Remove a contiguous block (from comment header to last MATRIX var)
sed -i '' '/^# --- Matrix/,/^MATRIX_HOME_ROOM_THREAD_ID=/d' ~/.hermes/.env

# Or remove individual lines
sed -i '' '/^MATRIX_/d' ~/.hermes/.env
```

### Step 4: Regenerate all configs

```bash
# Use Hermes venv python — has PyYAML
~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/generate-configs.py
```

### Step 5: Verify

```bash
# Only orchestrator should have MATRIX_* vars
for d in ~/.hermes/profiles/*/; do
    p=$(basename "$d")
    has=$(grep -c "MATRIX_" "$d/.env" 2>/dev/null)
    [ "$has" -gt 0 ] && echo "$p: $has MATRIX lines"
done
# Expected: orchestrator: 5, all others: 0

# Root .env should be clean
grep "MATRIX_" ~/.hermes/.env && echo "❌ still has MATRIX" || echo "✅ clean"
```

## How generate-configs.py Works

The config generator's `generate_env()` function:

```python
def generate_env(profile_name, profile_cfg, common_env):
    lines = [...]
    # 1. Write ALL vars from .env.common (sorted)
    for k in sorted(common_env.keys()):
        lines.append(f"{k}={common_env[k]}")
    # 2. Append profile-specific env_extra (sorted)
    extra = profile_cfg.get("env_extra", {})
    if extra:
        lines.append(f"# --- {profile_name} specific ---")
        for k in sorted(extra.keys()):
            lines.append(f"{k}={extra[k]}")
    return "\n".join(lines)
```

This means:
- `.env.common` vars appear in the "Shared" section of EVERY profile
- `env_extra` vars appear in the "profile specific" section of only THAT profile
- If a var exists in BOTH, the env_extra version wins (it appears later)

## env_extra Override Pattern

Sometimes a variable needs a DIFFERENT value per profile. Put the default in
`.env.common` and the override in `env_extra`:

```yaml
# .env.common:
API_SERVER_ENABLED=true

# profiles.yaml — worker-coder:
worker-coder:
  env_extra:
    API_SERVER_ENABLED: 'false'   # overrides the .env.common value
```

The generated `.env` will have both lines, but the second one (from env_extra)
wins because shell sourcing uses the last value:

```bash
# worker-coder/.env:
API_SERVER_ENABLED=true      # from .env.common
# --- worker-coder specific ---
API_SERVER_ENABLED=false     # from env_extra — THIS WINS
```

This is expected behavior, not a bug.

## Related Skills

- **hermes-profile-config** (default profile) — config generator workflow,
  write-guard rules, .env management. This skill extends it with the
  credential scoping pattern.
- **matrix-synapse-admin** (default profile) — Matrix server administration.
  The user rename workflow in that skill references this scoping pattern for
  Step 7 (updating Hermes config references).
- **email-channel-configuration** (default profile) — email channel setup.
  The same scoping principle applies: EMAIL_* vars should go in the email
  profile's env_extra, not .env.common.
- **gateway-platform-management** — adding messaging platforms to Hermes
  gateway. Complements this skill: that's platform config, this is credential
  distribution.
