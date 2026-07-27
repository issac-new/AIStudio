# Worker .env Missing Provider Keys — Reproduction & Fix

## Scenario

Worker profile (worker-researcher) reports:

```
Error: Provider 'deepseek' is set in config.yaml but no API key was found.
Set the DEEPSEEK_API_KEY environment variable
```

## Root Cause

The worker's `.env` file is missing one or more API keys that exist in other
profiles (orchestrator, worker-coder). Worker `.env` files start empty and
must be populated explicitly — they do NOT inherit from the orchestrator.

## Diagnosis

### Option A: List all vars per profile (broad overview)

```python3 -c "
import os
profiles_dir = os.path.expanduser('~/.hermes/profiles')
for p in os.listdir(profiles_dir):
    env_path = os.path.join(profiles_dir, p, '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            vars_in_file = set(l.split('=')[0] for l in f if '=' in l)
        print(f'{p}: {sorted(vars_in_file)}')
"
```

### Option B: Diff two profiles to find exactly what's missing

Use a set-difference to spot ALL gaps at once — better than checking keys
one by one:

```python3 -c "
src = '~/.hermes/profiles/worker-coder/.env'
dst = '~/.hermes/profiles/worker-researcher/.env'

with open(src) as f:
    src_vars = set(l.split('=')[0] for l in f if '=' in l)
with open(dst) as f:
    dst_vars = set(l.split('=')[0] for l in f if '=' in l)

missing = src_vars - dst_vars
extra = dst_vars - src_vars

if missing:
    print('MISSING in destination:')
    for v in sorted(missing):
        print(f'  {v}')
if extra:
    print('EXTRA in destination:')
    for v in sorted(extra):
        print(f'  {v}')
if not missing and not extra:
    print('Env vars are identical between profiles.')
"
```

## Fix

### Single key copy

Copy one specific variable:

```
python3 -c "
src_key = 'DEEPSEEK_API_KEY'
src = '~/.hermes/profiles/worker-coder/.env'
dst = '~/.hermes/profiles/worker-researcher/.env'

with open(src) as f:
    src_lines = f.read().splitlines()
with open(dst) as f:
    dst_lines = f.read().splitlines()

val = next((l for l in src_lines if l.startswith(src_key+'=')), None)
if val and not any(l.startswith(src_key+'=') for l in dst_lines):
    dst_lines.append(val)
    with open(dst, 'w') as f:
        f.write('\\n'.join(dst_lines) + '\\n')
    print(f'Copied {src_key} to {dst}')
"
```

### Batch copy by prefix

Copy all variables matching a prefix (e.g. `ANTHROPIC_*`) in one pass:

```python3 -c "
src = '~/.hermes/profiles/worker-coder/.env'
dst = '~/.hermes/profiles/worker-researcher/.env'

with open(src) as f:
    src_lines = f.read().splitlines()

# Collect all vars matching prefix(es)
needed = {}
for line in src_lines:
    if line.startswith('DEEPSEEK_API_KEY=') or line.startswith('ANTHROPIC_'):
        key, val = line.split('=', 1)
        needed[key] = val

# Read destination
with open(dst) as f:
    dst_lines = f.read().splitlines()

# Add only missing ones
for key, val in needed.items():
    if not any(l.startswith(key + '=') for l in dst_lines):
        dst_lines.append(f'{key}={val}')
        print(f'Added {key}')

with open(dst, 'w') as f:
    f.write('\\n'.join(dst_lines) + '\\n')
print('Done')
"
```

### Full sync: copy all vars from one profile to another

⚠️ Only use this for initial setup — it replaces ALL destination vars:

```python3 -c "
import shutil
shutil.copy2(src_path, dst_path)
print(f'Copied {src_path} → {dst_path}')
"
```

## Verification

```
python3 -c "
with open('~/.hermes/profiles/worker-researcher/.env') as f:
    for l in f.read().splitlines():
        if l.strip():
            k = l.split('=')[0]
            print(f'{k}=***' if 'KEY' in k or 'TOKEN' in k or 'SECRET' in k else l)
"
```

## Related: Kanban Worker Pitfall

The `kanban-worker` skill documents the same lesson under its Pitfalls section:

> **Worker `.env` does not inherit from orchestrator.** If your worker profile
> is a separate Hermes profile, its `.env` file starts empty. You must
> explicitly copy required API keys from the orchestrator's `.env`.

## Key Insight

Terminal output redacts secrets as `***`. Shell commands like `grep >>`
write the redacted value (`***`) to the target file, not the actual secret.
Always use Python file I/O (which reads raw bytes) to copy env vars between
profiles.
