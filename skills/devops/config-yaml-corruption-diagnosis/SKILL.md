---
name: config-yaml-corruption-diagnosis
title: Diagnose config.yaml Structural Corruption Across Hermes Profiles
description: "Use when config.yaml corruption causes 401 or toolset loss."
triggers:
  - "HTTP 401"
  - "Missing Authentication header"
  - "did not find expected key"
  - "Failed to load cli-config.yaml"
  - "toolsets 重复"
  - "YAML parse error"
  - "config.yaml broken"
  - "provider misrouting"
  - "unexpected provider"
  - "config load failure"
---

# Config YAML Corruption Diagnosis

Diagnose and fix structural defects in Hermes profile `config.yaml` files
that cause silent failures — 401 errors, toolset loss, provider misrouting.

## When to Use

- A profile gets `HTTP 401: Missing Authentication header` from a provider
  it should NOT be using (e.g. openrouter when `model.provider: damoxing`)
- `hermes tools list` shows toolsets that should be present are missing
- After a refactoring / batch-edit session that touched multiple
  `config.yaml` files, profiles behave unexpectedly
- Log shows `WARNING cli: Failed to load cli-config.yaml: while parsing a
  block mapping ... did not find expected key`
- A session that was working starts failing after a config edit

## The Failure Cascade (CRITICAL)

YAML corruption produces **misleading symptoms**. The 401 error says
"Missing Authentication header" — it does NOT say "YAML parse error".
The cascade:

```
1. YAML parse failure (duplicate block, broken indentation)
   ↓
2. Config load failure → model.provider NOT read
   ↓
3. Provider resolution falls through to built-in default (openrouter)
   ↓
4. No OpenRouter credentials in auth.json / env vars
   ↓
5. Request sent with EMPTY Authorization header
   ↓
6. 401 Missing Authentication header (looks like auth, is actually config)
```

The YAML warning appears EARLIER in the log as `WARNING cli: Failed to
load cli-config.yaml` — easy to miss because the 401 error dominates
attention.

## Diagnosis: Batch-Validate ALL Profile Configs

When any profile shows an unexpected 401 or missing toolsets, sweep ALL
profiles at once — corruption from a refactoring usually hits multiple
files:

```bash
cd ~/.hermes
for d in profiles/*/; do
  p="${d}config.yaml"
  [ -f "$p" ] || continue
  name=$(basename "$d")
  result=$(./hermes-agent/venv/bin/python3 -c "
import yaml
try:
    yaml.safe_load(open('$p'))
    print('OK')
except yaml.YAMLError as e:
    print('ERR')
" 2>&1)
  [ "$result" != "OK" ] && echo "$name: $result"
done
```

Empty output = all configs valid. Any `ERR` lines need fixing.

**Always use the Hermes venv Python** (`./hermes-agent/venv/bin/python3`) —
the system Python may not have PyYAML installed.

## Common Corruption Pattern: Duplicate toolsets Block

The most frequent corruption from refactoring: a `toolsets:` section
appears twice — once with correct indented entries, once with unindented
duplicates that break the YAML block mapping.

**Broken shape**:
```yaml
toolsets:
  - hermes-cli      # ← indented (correct)
  - kanban
  - memory
  - messaging
- hermes-cli        # ← unindented duplicate (breaks YAML)
- kanban
- memory
- messaging
agent:              # ← parser reports "did not find expected key" here
```

**Log signature**:
```
WARNING cli: Failed to load cli-config.yaml: while parsing a block mapping
  in ".../config.yaml", line 1, column 1
did not find expected key
  in ".../config.yaml", line 33, column 1
```

The line number in the error points to the FIRST top-level key AFTER the
corruption (e.g. `agent:` at line 33) — not the corrupted lines
themselves.

## Fix: Batch Dedup Script

Fix all corrupted profiles in one pass. The script finds the `toolsets:`
header, keeps the indented entries, removes any immediately-following
unindented `- xxx` duplicates, then verifies YAML validity:

```python
# Save as fix_duplicate_toolsets.py, run with Hermes venv python
import yaml, os, glob, shutil

profiles_dir = os.path.expanduser("~/.hermes/profiles")
fixed = []

for d in sorted(glob.glob(os.path.join(profiles_dir, "*/"))):
    name = os.path.basename(d.rstrip("/"))
    p = os.path.join(d, "config.yaml")
    if not os.path.exists(p):
        continue

    # Skip if YAML already valid
    try:
        yaml.safe_load(open(p))
        continue
    except yaml.YAMLError:
        pass  # needs fixing

    shutil.copy(p, p + ".bak.yamlfix")
    with open(p) as f:
        lines = f.readlines()

    ts_idx = None
    for i, line in enumerate(lines):
        if line.rstrip() == "toolsets:":
            ts_idx = i
            break

    if ts_idx is None:
        print(f"{name}: no toolsets: found, skip (different corruption)")
        continue

    j = ts_idx + 1
    while j < len(lines) and lines[j].startswith("  - "):
        j += 1
    dup_start = j
    while j < len(lines) and lines[j].startswith("- ") and not lines[j].startswith("  "):
        j += 1

    if j > dup_start:
        new_lines = lines[:dup_start] + lines[j:]
        with open(p, "w") as f:
            f.writelines(new_lines)
        try:
            yaml.safe_load(open(p))
            print(f"{name}: FIXED (removed {j - dup_start} dup lines)")
            fixed.append(name)
        except yaml.YAMLError as e:
            shutil.copy(p + ".bak.yamlfix", p)
            print(f"{name}: STILL BROKEN after fix, restored: {e}")

print(f"\nTotal fixed: {len(fixed)}")
```

## Verification After Fix

1. **Re-run the batch validation sweep** — all profiles should show OK.
2. **Check the error log** — no new `Failed to load cli-config.yaml`
   warnings after the fix.
3. **Start a NEW session** — the corrupted session is still running with
   the old broken config in memory. Use `/new` or restart the TUI/gateway.
   The new session will load the fixed config and route to the correct
   provider.

## Log Diagnosis: Distinguishing Corruption-401 from Auth-401

| Signal | Corruption-401 | Real Auth-401 |
|--------|---------------|---------------|
| `WARNING cli: Failed to load cli-config.yaml` in log | ✅ Present | ❌ Absent |
| Provider in 401 error | `openrouter` (built-in fallback) | The configured provider |
| `model.provider` in config | Correct (e.g. `damoxing`) | May be wrong or key missing |
| `auth.json` credential_pool | Has the configured provider, NOT openrouter | May be missing the key |
| Request dump `Authorization` header | Empty string `''` | Present but rejected |
| Started after | Config edit / refactoring | Key expiry / provider change |

**Key grep command** — check for the YAML warning alongside the 401:

```bash
grep -E 'Failed to load cli-config.yaml|did not find expected key|HTTP 401' \
  ~/.hermes/profiles/<name>/logs/errors.log | tail -10
```

If `Failed to load cli-config.yaml` appears BEFORE the 401, it's
corruption-induced — fix the YAML, not the credentials.

## Pitfall: Orchestrator fallback_providers Drift

During a refactoring, the orchestrator profile may lose its second
fallback hop while all worker profiles retain it. Always compare the
orchestrator's `fallback_providers` against a known-good worker profile
after any config batch-edit:

```bash
~/.hermes/hermes-agent/venv/bin/python3 -c "
import yaml
orc = yaml.safe_load(open('profiles/orchestrator/config.yaml'))
worker = yaml.safe_load(open('profiles/worker-coder/config.yaml'))
print('orchestrator fallback:', orc.get('fallback_providers'))
print('worker-coder fallback:', worker.get('fallback_providers'))
"
```

If the orchestrator is missing a fallback hop that workers have (e.g.
`deepseek:deepseek-v4-flash`), add it back — the orchestrator handles
gateway messages and needs the same degradation chain as workers.

## Related Skills

- **model-switch-troubleshooting** (default profile) — covers /model
  command failures, fallback chain credential issues, and provider
  resolution. The YAML-corruption pitfall here complements that skill's
  resolver-path analysis — when the resolver can't even read the config,
  the fallback chain is irrelevant.
- **hermes-profile-config** (default profile) — covers write-guard rules,
  config generator workflow, and multi-profile config management. The
  batch-validation sweep here is the diagnostic complement to that skill's
  editing workflows.
- **hermes-redundancy-cleanup** — covers root-vs-profile config divergence
  (hardcoded keys, provider name drift). This skill covers STRUCTURAL
  corruption; that one covers VALUE divergence.
- **multi-profile-system-audit** — structural health audit of the whole
  deployment. Batch YAML validation (from this skill) should be one of the
  probes in that audit.
