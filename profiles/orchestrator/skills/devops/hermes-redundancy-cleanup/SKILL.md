---
name: hermes-redundancy-cleanup
description: >-
  Periodic audit and cleanup of ~/.hermes: backup files, rotated logs, stale
  caches, empty DBs, old sessions, OpenClaw residue, and root-vs-profile config
  divergence (hardcoded API keys, provider name drift). Use when ~/.hermes grows
  unexpectedly, before migration, or as routine monthly maintenance.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [cleanup, maintenance, config-hygiene, redundancy]
    related_skills: [hermes-profile-config, token-optimization-v2, hermes-offline-migration, memory-consolidation]
---

# Hermes Redundancy Cleanup

## When to Use

- `~/.hermes` directory grows unexpectedly large (check: `du -sh ~/.hermes`)
- Before migration/packaging (reduces noise and credential leak surface)
- After bulk config changes (backup files accumulate from `sed -i'.bak'`, `config.yaml.bak`)
- Monthly maintenance — entropy accumulates even without major changes
- After SOUL.md enrichment sessions (generate .bak files, research reports)

## Audit: What to Look For

### 1. Quick size overview

```bash
du -sh ~/.hermes
du -sh ~/.hermes/{logs,sessions,cache,state-snapshots,profiles,skills,shared}/ 2>/dev/null | sort -rh | head -10
```

### 2. Backup files (.bak, .corrupt)

```bash
# Count and size
find ~/.hermes \( -name '*.bak*' -o -name '*.corrupt*' \) -type f | wc -l
find ~/.hermes \( -name '*.bak*' -o -name '*.corrupt*' \) -type f -exec du -ch {} + 2>/dev/null | tail -1
```

Found in: `profiles/*/config.yaml.bak*`, `profiles/*/SOUL.md.bak*`, `profiles/*/auth.json.bak*`,
`profiles/*/_rules.md.bak*`, `shared/*.bak*`, `skills/*/*.bak` (directories).

### 3. Rotated and oversized logs

```bash
# Rotated logs (.log.1, .log.2, .log.3)
find logs/ profiles/*/logs/ -name '*.log.[0-9]*' -type f

# Oversized active logs (>5MB)
find logs/ profiles/*/logs/ -name '*.log' -size +5M -exec ls -lh {} \;

# Gateway diagnostic logs (safe to delete — they're snapshots, not live)
find profiles/*/logs/ -name 'gateway-exit-diag.log' -o -name 'gateway-shutdown-diag.log'
```

### 4. Old session files

```bash
# Sessions older than 30 days
find sessions/ -name '*.json' -mtime +30 | wc -l
```

### 5. State snapshots (pre-update backups)

```bash
ls -la state-snapshots/
du -sh state-snapshots/*
```

### 6. Root-level research/report markdown files

```bash
ls *.md
# Keep: SOUL.md, global_kanban_rules.md
# Delete: *-report.md, *-research.md, WORKER_CONFIG_REVIEW_*.md
```

### 7. Empty/stale DBs and cache files

```bash
# Empty DB files (0 bytes)
find . -maxdepth 1 -name '*.db' -size 0

# Stale cache JSONs (regenerated on demand)
ls *cache*.json models.json 2>/dev/null
```

### 8. OpenClaw / migration residue

```bash
ls migration/ 2>/dev/null  # should not exist after migration
ls claw3d-* 2>/dev/null     # old OpenClaw ports
```

### 9. Root-vs-profile config divergence

```bash
# Check provider name alignment
head -3 ~/.hermes/config.yaml
grep '^  provider:' ~/.hermes/profiles/orchestrator/config.yaml

# Check for hardcoded API keys in root config
grep -c 'sk-' ~/.hermes/config.yaml
# Expected: 0 (all should be ${ENV_VAR} references)

# Diff root vs orchestrator provider section
diff <(sed -n '/^providers:/,/^custom_providers:/p' ~/.hermes/config.yaml) \
     <(sed -n '/^providers:/,/^custom_providers:/p' ~/.hermes/profiles/orchestrator/config.yaml)
```

## Cleanup Execution

### Safe-to-delete categories (user confirms scope)

| Category | Command | Risk |
|---|---|---|
| Backup files | `find ~/.hermes \( -name '*.bak*' -o -name '*.corrupt*' \) -type f -delete` | None — backups of files that still exist |
| Rotated logs | `find logs/ profiles/*/logs/ -name '*.log.[0-9]*' -type f -delete` | None — old log rotations |
| Gateway diag logs | `find profiles/*/logs/ -name 'gateway-*-diag.log' -type f -delete` | None — diagnostic snapshots |
| Old sessions | `find sessions/ -name '*.json' -mtime +30 -type f -delete` | Low — old session transcripts |
| State snapshots | `rm -rf state-snapshots/2026*` | Low — pre-update backups |
| Research MDs | `rm -f *-report.md *-research.md WORKER_CONFIG_REVIEW_*.md` | None — one-time research outputs |
| Empty DBs | `rm -f sessions.db` (if 0 bytes) | None — empty file |
| Stale caches | `rm -f *cache*.json models.json` | None — regenerated on demand |
| OpenClaw residue | `rm -rf migration/` | None — old migration dir |
| Stale dotfiles | `rm -f .hermes_history claw3d-* .install_method .scratch_tip_shown` | None — historical artifacts |
| Skills .bak dirs | `find skills/ -name '*.bak' -type d -exec rm -rf {} +` | None — backup skill dirs |
| shared/ backups | `find shared/ -name '*.bak*' -delete` | None — old config generator backups |

### Truncate oversized active logs (don't delete — still in use)

```bash
for f in logs/gateway.error.log profiles/orchestrator/logs/gateway.error.log; do
  if [ -f "$f" ]; then
    sz=$(du -h "$f" | awk '{print $1}')
    echo "Truncating $f ($sz)"
    > "$f"
  fi
done
```

### Clean empty directories

```bash
for d in sandboxes traces whatsapp pets platforms pairing hooks audio_cache image_cache; do
  rmdir "$d" 2>/dev/null && echo "removed empty: $d"
done
```

## Root Config Provider Cleanup (Hardcoded Keys → Env-Vars)

### Problem pattern

Root `config.yaml` uses `custom_providers:` list with hardcoded `sk-*` keys;
profile configs use `providers:` dict with `${ENV_VAR}` references. Root `.env`
lacks `DAMOXING_*` / `KIMI_API_KEY` vars (only profile `.env` files source from
`shared/.env.common`).

### Fix (two-part)

**Part 1**: Replace `custom_providers:` block with `providers:` dict + minimal
`custom_providers:` for entries needing `custom:` prefix. All `api_key:` fields
become `${ENV_VAR}` references. Use the `patch` tool (root config is NOT
write-guarded when edited from a named profile session).

**Part 2**: Add missing env vars to root `.env`. Use `execute_code` (Python
file I/O) to pull values from `shared/.env.common` — never print secrets to
stdout. Append to root `.env`:

```python
import os
with open(os.path.expanduser('~/.hermes/shared/.env.common')) as f:
    env_common = f.read()
needed = ['DAMOXING_API_KEY', 'DAMOXING_BASE_URL', 'DAMOXING_API_MODE', 'KIMI_API_KEY']
extracted = {}
for line in env_common.splitlines():
    if '=' in line and not line.startswith('#'):
        key, _, val = line.partition('=')
        if key.strip() in needed:
            extracted[key.strip()] = val.strip()
with open(os.path.expanduser('~/.hermes/.env'), 'a') as f:
    f.write("\n# --- Provider API keys (migrated from hardcoded to env-var) ---\n")
    for var in needed:
        if var in extracted:
            f.write(f"{var}={extracted[var]}\n")
```

### Verification

```bash
grep -c 'sk-' ~/.hermes/config.yaml           # → 0
head -3 ~/.hermes/config.yaml                   # → provider: damoxing
grep -E '^(DAMOXING_|KIMI_API_KEY)' ~/.hermes/.env  # → 4+ lines
find ~/.hermes -name '*.bak*' -type f | wc -l  # → 0
```

## Pitfalls

- **Root `.env` does NOT source from `shared/.env.common`** — only profile `.env`
  files do. After converting hardcoded keys to `${ENV_VAR}` references in root
  config, you MUST add the env vars to root `.env` manually.
- **Don't delete active log files** — `gateway.error.log`, `agent.log`, etc.
  are still being written to. Truncate with `> "$f"` instead.
- **Skills .bak are directories, not files** — `find -name '*.bak' -type d` then
  `rm -rf`, not `find -delete` (which only hits files).
- **Root config is NOT write-guarded** when edited from a named profile (e.g.
  orchestrator). The `patch` tool works on `~/.hermes/config.yaml`.
- **Provider name drift**: root config may use a different provider name
  (e.g. `xianyu`) than profiles (e.g. `damoxing`) for the same endpoint.
  Unify to match profile configs.

## Related Skills

- **hermes-profile-config** — (default profile) Multi-profile config management,
  write-guard rules, custom provider setup patterns. Contains the detailed
  reference for root-config provider cleanup.
- **token-optimization-v2** — (default profile) Contains the enrichment→optimize
  cycle and compression sync patterns that complement this cleanup skill.
- **hermes-offline-migration** — (default profile) Packaging for cross-machine
  migration; the cleanup here is a prerequisite step.
- **memory-consolidation** — (orchestrator) The memory analogue of this skill:
  cleaning MEMORY.md/USER.md the way this cleans the filesystem.
