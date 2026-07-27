# Config Generator + SOUL/Rules Architecture — Session Detail

## Date: 2026-07-17

## Problem Discovered

During a deep audit of all 9 Hermes profiles, found multiple systemic issues:

### 1. SOUL.md — 6 of 8 workers used generic default template

| Profile | Before | After |
|---------|--------|-------|
| architect | 513B generic | 1496B role-specific |
| project-manager | 513B generic | 2211B role-specific |
| requirement-analyst | 513B generic | 1529B role-specific |
| worker-reviewer | 513B generic | 1442B role-specific |
| worker-tester | 513B generic | 1487B role-specific |
| worker-deployer | 513B generic | 1511B role-specific |
| worker-coder | 2452B (had content) | 2292B (refined) |
| worker-researcher | 1222B (had content) | 1985B (refined) |

**Impact**: Agents with generic SOUL.md had no role identity — they didn't
know their job was architect/PM/tester/etc. They behaved as general-purpose
assistants instead of specialized workers.

### 2. config.yaml — Multiple systemic errors

#### Port conflicts
6 profiles (architect, project-manager, requirement-analyst,
worker-reviewer, worker-tester, worker-deployer) all used port 8651 for
`api_server`. This caused SwarmStudio to spawn 6 gateway processes all
trying to bind the same port.

#### api_server + matrix wrongly enabled on workers
All 6 non-coder/researcher workers had `api_server.enabled: true` and
`matrix.enabled: true`, violating the centralized routing principle.
Workers should receive tasks only via Kanban dispatch, not direct
external messages.

#### default_assignee errors
- `project-manager`: `default_assignee: worker-coder` (should be `""` —
  PM routes tasks manually, doesn't auto-assign to coder)
- `worker-researcher`: `default_assignee: worker-coder` (should be
  `worker-researcher` — a researcher task should be done by the
  researcher, not the coder)

#### environment_hint wrong paths
- `worker-coder`: pointed to `global_kanban_rules.md` (generic workspace
  rules) instead of `worker-coder_rules.md` (role-specific ACP workflow)
- `worker-researcher`: same issue — pointed to `global_kanban_rules.md`
  instead of `worker-researcher_rules.md`

#### Missing rules.md files
- `worker-coder`: had SOUL.md about ACP workflow but no corresponding
  `worker-coder_rules.md` file
- `worker-researcher`: same — SOUL.md existed but no rules.md

### 3. generate-configs.py — PRESERVE_KEYS ordering bug

`PRESERVE_KEYS` was a Python `set`, causing non-deterministic YAML key
ordering in output. Each run of the generator produced config.yaml files
with keys in different order, making diffs noisy and verification
difficult.

**Fix**: Changed to `list` for deterministic ordering:
```python
# Before (non-deterministic):
PRESERVE_KEYS = {"mcp_servers", "platform_toolsets", ...}

# After (stable order):
PRESERVE_KEYS = ["mcp_servers", "platform_toolsets", "known_plugin_toolsets",
                 "onboarding", "updates", "_config_version"]
```

## Resolution Steps

### Step 1: Fix profiles.yaml (single source of truth)

Edited `~/.hermes/shared/profiles.yaml`:
- All 8 worker/specialist profiles: `api_server.enabled: false`,
  `matrix.enabled: false`
- `project-manager`: `default_assignee: ""`
- `worker-researcher`: `default_assignee: worker-researcher`
- `worker-coder`: `environment_hint` → `worker-coder_rules.md`
- `worker-researcher`: `environment_hint` → `worker-researcher_rules.md`

### Step 2: Create missing rules.md files

- `~/.hermes/profiles/worker-coder/worker-coder_rules.md` (3193B)
  — ACP workflow, verification steps, metadata format, collaboration protocol
- `~/.hermes/profiles/worker-researcher/worker-researcher_rules.md` (2935B)
  — Research tools, report format, ACP delegation, collaboration protocol

### Step 3: Rewrite all 8 worker SOUL.md files

Each SOUL.md now contains:
1. Role identity ("You are Hermes Kanban <role>")
2. Core responsibilities (3-5 bullet points)
3. Workflow (numbered steps or flow diagram)
4. Output/document format spec
5. Collaboration protocol (upstream/downstream)
6. Blocking scenarios
7. Pointer to `*_rules.md` for detail

### Step 4: Fix generate-configs.py

Patched `PRESERVE_KEYS` from `set` to `list`.

### Step 5: Regenerate all 9 profiles

```bash
~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/generate-configs.py
```

Output: 9 profiles regenerated, all with correct settings.

### Step 6: Verify

```bash
# Check api_server/matrix disabled on all workers
for p in architect project-manager requirement-analyst worker-coder worker-deployer worker-researcher worker-reviewer worker-tester; do
  api=$(grep -A2 "^  api_server:" ~/.hermes/profiles/$p/config.yaml | grep enabled | awk '{print $2}')
  mat=$(grep -A1 "^  matrix:" ~/.hermes/profiles/$p/config.yaml | grep enabled | awk '{print $2}')
  echo "$p: api=$api matrix=$mat"
done
# Expected: all false

# Check default_assignee
grep "default_assignee" ~/.hermes/profiles/*/config.yaml
# Expected: orchestrator='', architect='architect', PM='', RA='requirement-analyst',
#           coder='worker-coder', deployer='worker-deployer', etc.

# Check environment_hint
grep "environment_hint" ~/.hermes/profiles/*/config.yaml
# Expected: each profile points to its own _rules.md (not global_kanban_rules.md)
```

## Key Lessons

1. **Always use the config generator for bulk changes** — editing 9
   profiles individually is error-prone. The `profiles.yaml` →
   `generate-configs.py` pipeline guarantees consistency.

2. **Centralized routing is the correct architecture** — only
   orchestrator opens external ports. Workers are Kanban-only.

3. **SOUL.md must be role-specific** — the generic 513B template
   gives agents no role identity. Every profile needs a SOUL.md that
   names its role, responsibilities, and workflow.

4. **environment_hint must point to the right rules.md** — a common
   mistake is pointing all workers at a shared global rules file when
   each role needs its own specific rules.

5. **PRESERVE_KEYS in config generators must be ordered** (list, not
   set) for deterministic YAML output.
