# All-Profile Memory Provider Diagnostic

## Symptom: Profiles silently lack Hindsight memory

Profiles have `memory.provider: hindsight` in their `config.yaml` and
`hindsight` in `plugins.enabled`, but memories are never stored or — worse —
no error is raised. Hindsight simply returns empty recalls.

## Root Cause

The Hindsight client resolves its config by checking `$HERMES_HOME/hindsight/config.json`.
For each profile, `$HERMES_HOME` is that profile's directory
(e.g. `~/.hermes/profiles/worker-coder/`), NOT the orchestrator's.

If the file is missing at the profile-scoped path, the fallback chain is:

1. `~/.hermes/profiles/<profile>/hindsight/config.json` ← THIS is the one needed
2. `~/.hindsight/config.json` (legacy shared path, typically absent)
3. Environment variables (default to cloud mode, no API key → silent fallback)

Result: Hindsight "works" (no crash) but uses cloud defaults with no API key,
effectively returning empty results.

## Full 9-Profile Audit (run this first)

```python
import os, yaml, json

HERMES = os.path.expanduser("~/.hermes")
profiles = sorted([d for d in os.listdir(os.path.join(HERMES, "profiles"))
                   if os.path.isdir(os.path.join(HERMES, "profiles", d))])

for prof in profiles:
    prof_dir = os.path.join(HERMES, "profiles", prof)
    cfg = yaml.safe_load(open(os.path.join(prof_dir, "config.yaml")))

    mem_provider = (cfg.get("memory", {}) or {}).get("provider", "")
    mem_enabled = (cfg.get("memory", {}) or {}).get("memory_enabled", False)
    plugins_enabled = (cfg.get("plugins", {}) or {}).get("enabled", [])
    has_hindsight_plugin = "hindsight" in plugins_enabled
    has_config = os.path.exists(os.path.join(prof_dir, "hindsight", "config.json"))
    has_memory_toolset = "memory" in cfg.get("toolsets", [])

    print(f"{prof}:")
    print(f"  memory.provider: {mem_provider} {'OK' if mem_provider == 'hindsight' else 'MISSING'}")
    print(f"  memory_enabled: {mem_enabled} {'OK' if mem_enabled else 'MISSING'}")
    print(f"  hindsight plugin: {has_hindsight_plugin} {'OK' if has_hindsight_plugin else 'MISSING'}")
    print(f"  hindsight/config.json: {has_config} {'OK' if has_config else 'MISSING'}")
    print(f"  memory in toolsets: {has_memory_toolset} {'OK' if has_memory_toolset else 'MISSING'}")
```

All 5 checks must pass for every profile. A profile with 4/5 will silently fail.

## Fix: Create hindsight/config.json for all missing profiles

```python
import os, json

HERMES = os.path.expanduser("~/.hermes")
src_config = os.path.join(HERMES, "profiles", "orchestrator", "hindsight", "config.json")
config = json.load(open(src_config))

# Copy to every profile that's missing it
for prof in sorted(os.listdir(os.path.join(HERMES, "profiles"))):
    prof_dir = os.path.join(HERMES, "profiles", prof)
    if not os.path.isdir(prof_dir):
        continue
    dst = os.path.join(prof_dir, "hindsight", "config.json")
    if not os.path.exists(dst):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        json.dump(config, open(dst, 'w'), indent=2)
        print(f"  Created {prof}/hindsight/config.json")
```

## Bank Isolation Strategy

The `bank_id_template` in config.json determines bank isolation scope. Two
strategies depending on deployment topology:

### Machine-level isolation (multi-machine shared Hindsight API)

```json
{
  "bank_id_template": "hermes-32767c6fad0f-{profile}"
}
```

The MAC address (colons stripped, lowercase) is baked literally into the
template — it is NOT a Hindsight runtime placeholder. This ensures different
machines get different banks even for the same profile name. Use
`scripts/setup-hindsight-banks.py` from the `hermes-agent-migration` skill
to auto-detect MAC and update all profiles. To migrate old memories to the
new banks, use `scripts/migrate-hindsight-banks.py`.

### Profile-only isolation (single-machine)

```json
{
  "bank_id_template": "hermes-{profile}"
}
```

Sufficient when all agents run on one machine. The `{profile}` placeholder is
resolved at runtime by `_resolve_bank_id_template()` (hindsight plugin
`__init__.py:584`).

## Fix: Initialize banks for profiles that have no memories yet

Banks are auto-created on first memory write. For profiles that have never been
used, trigger bank creation by writing a test memory via the Hindsight API:

```python
import json, urllib.request

profiles = ["architect", "project-manager", "requirement-analyst",
            "worker-coder", "worker-deployer", "worker-researcher",
            "worker-reviewer", "worker-tester"]

for prof in profiles:
    bank = f"hermes-{prof}"
    data = json.dumps({"items": [{"content": f"Bank initialization for {bank}"}]}).encode()
    req = urllib.request.Request(
        f"http://localhost:8888/v1/default/banks/{bank}/memories",
        data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            print(f"  {'OK' if result.get('success') else 'FAIL'} {bank}")
    except Exception as e:
        print(f"  FAIL {bank}: {e}")
```

## Fix: Also fix the start.sh `***` password bug

The `DATABASE_URL` in `start.sh` may contain `hindsight:***@localhost` — the
`***` is literal text (from Hermes' display masking), not a placeholder. This
causes Hindsight to crash with `password authentication failed for user
"hindsight"`. Fix:

```bash
# In start.sh, change:
export HINDSIGHT_API_DATABASE_URL="postgresql://hindsight:***@localhost:5432/hindsight"
# To:
export HINDSIGHT_API_DATABASE_URL="postgresql://hindsight:hindsight_dev@localhost:5432/hindsight"
```

The `MIGRATION_DATABASE_URL` should already use `hindsight_dev` — verify both.

## Verify: Recall test on all 9 banks

```python
import json, urllib.request

profiles = ["architect", "orchestrator", "project-manager", "requirement-analyst",
            "worker-coder", "worker-deployer", "worker-researcher",
            "worker-reviewer", "worker-tester"]

for prof in profiles:
    bank = f"hermes-{prof}"
    data = json.dumps({"query": "test memory", "limit": 3}).encode()
    req = urllib.request.Request(
        f"http://localhost:8888/v1/default/banks/{bank}/memories/recall",
        data=data, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            count = len(result.get("results", []))
            print(f"  OK {prof}: recall OK, {count} results")
    except Exception as e:
        print(f"  FAIL {prof}: {e}")
```

All 9 must return successfully. New banks will have 0-1 results (just the
init memory); established banks (orchestrator, worker-coder) may have 50+.

## Root Config File

Full working config (`hindsight/config.json`):

```json
{
  "mode": "local_external",
  "api_url": "http://localhost:8888",
  "bank_id": "hermes",
  "recall_budget": "mid",
  "recall_method": "recall",
  "auto_recall": true,
  "auto_retain": true,
  "retain_async": true,
  "retain_every_n_turns": 1,
  "memory_mode": "hybrid",
  "recall_types": "observation,world,experience",
  "recall_max_tokens": 4096,
  "bank_id_template": "hermes-{MAC}-{profile}"
}
```

Replace `{MAC}` with the actual machine MAC (e.g. `32767c6fad0f`), or use
the `setup-hindsight-banks.py` script from the `hermes-agent-migration` skill
to auto-detect and bake it in.
