---
name: agent-profile-lifecycle
description: >-
  Create, delete, and optimize Hermes agent profiles — covers the complete
  workflow from `hermes profile create` through SOUL/rules authoring,
  skills_enabled optimization, Hindsight bank setup, and config regeneration.
  Complements hermes-profile-config (which covers config editing patterns).
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [hermes, profiles, skills, optimization, lifecycle, multi-agent]
    related_skills: [hermes-profile-config, hermes-agent]
---

# Agent Profile Lifecycle Management

Create, delete, and optimize Hermes agent profiles in a multi-profile deployment
that uses `profiles.yaml` + `generate-configs.py` as the single source of truth.

## When to Use

- Adding a new worker/specialist agent (e.g. `worker-security`, `hack-recon`)
- Deleting a profile that's been split or retired
- Optimizing `skills_enabled` across all profiles based on role research
- Setting up Hindsight memory bank for a new profile

## Creating a New Profile (Complete Workflow)

### 1. Create via `hermes profile create`

```bash
# Clone from an existing worker to inherit toolsets/plugins/skills structure
hermes profile create <new-name> --clone-from worker-coder
```

Creates `~/.hermes/profiles/<new-name>/` with config.yaml, SOUL.md,
skills/ (symlinks to global), etc.

### 2. Write SOUL.md (role identity)

Write a role-specific SOUL.md — NOT the generic 513B default. Must include:

1. **Role identity** ("You are Hermes Kanban <role>")
2. **Core responsibilities** (3-5 bullets with clear scope boundaries)
3. **Standard work cycle** (kanban_show → cd workspace → execute → kanban_complete)
4. **Collaboration protocol** (upstream/downstream handoffs — which agents feed you, which you feed)
5. **Exit protocol** — every run MUST end with `kanban_complete` or `kanban_block`. Ending with plain text = protocol violation = wastes a failure-limit slot.

### 3. Write `<new-name>_rules.md` (detailed rules)

Detailed methodology, quality gates, output format, blocking scenarios.
Referenced via `agent.environment_hint` in config.yaml.

### 4. Write `profile.yaml` (description)

```yaml
description: "简短角色描述"
description_auto: false
```

### 5. Add to `profiles.yaml`

```yaml
  <new-name>:
    api_server:
      enabled: false
    matrix:
      enabled: false
    toolsets:
    - hermes-cli
    - acp          # include if ACP delegation needed
    - kanban
    - memory
    kanban:
      default_assignee: <new-name>
    environment_hint: ~/.hermes/profiles/<new-name>/<new-name>_rules.md
    env_extra:
      API_SERVER_ENABLED: 'false'
    plugins:
    - acp-client
    - hindsight
    - memtensor
    - observability/langfuse
    - run-trace
    skills_enabled:
    - <relevant skill categories — see optimization section below>
```

### 6. Create skill category symlinks (if new categories needed)

```bash
ln -s $HOME/.hermes/skills/<category> \
      ~/.hermes/profiles/<new-name>/skills/<category>
```

**CRITICAL**: If the category is entirely new on disk, also add it to
`ALL_CATEGORIES` in `generate-configs.py`. Otherwise the generator prints
a `PLATFORM-DRIFT` warning and the category's skills are silently blocked
even if listed in `skills_enabled`.

### 7. Set up Hindsight memory

```bash
# Copy hindsight config from an existing profile
mkdir -p ~/.hermes/profiles/<new-name>/hindsight
cp ~/.hermes/profiles/worker-coder/hindsight/config.json \
   ~/.hermes/profiles/<new-name>/hindsight/config.json

# Bank is auto-created on first recall — test it:
curl -s -X POST \
  "http://localhost:8888/v1/default/banks/hermes-<MAC>-<new-name>/memories/recall" \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}'
# Returns {"results": [], ...} — bank now exists.
```

**Key**: Hindsight banks are NOT created via `POST /banks` (returns 405 Method
Not Allowed). They auto-create on first `recall` or `retain` call. The API path
is `/v1/default/banks/{bank_id}/memories/recall`.

The `<MAC>` is the machine's primary MAC address without colons, lowercase
(e.g. `b24d7ac5d9c4`). Detect with:
```bash
ifconfig en0 | grep ether | awk '{print $2}' | tr -d ':' | tr 'A-F' 'a-f'
```

### 8. Regenerate configs and restart

```bash
~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/generate-configs.py
hermes -p orchestrator gateway restart
hermes profile list   # verify new profile appears
```

## Deleting a Profile

```bash
# Interactive prompt requires confirmation — pipe the profile name:
echo "<profile-name>" | hermes profile delete <profile-name>

# Then remove the profile block from profiles.yaml and regenerate:
~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/generate-configs.py
hermes -p orchestrator gateway restart
hermes profile list   # verify profile is gone
```

## Optimizing `skills_enabled` Across All Profiles

### Workflow

1. **Survey current state** — parse `profiles.yaml` to see each profile's
   `skills_enabled` and list all on-disk categories with skill counts.
2. **Research per-role** — dispatch parallel subagents to investigate
   mainstream GitHub projects/tools for each role domain. Map tools to
   Hermes skill categories.
3. **Update `profiles.yaml`** — set `skills_enabled` per profile based on
   research recommendations.
4. **Regenerate + verify** — run `generate-configs.py`, check the
   `skills: mode=allowlist enabled=N disabled=M` output per profile.

### Key principles (research-validated)

- **Every worker needs `autonomous-ai-agents`** — ACP delegation to Claude
  Code/Codex is universally valuable for code generation/analysis.
- **Orchestrator needs `devops` + `software-development`** — for
  `kanban-orchestrator` (decomposition playbook), `kanban-handoff-contract`,
  `kanban-goal-mode`.
- **Role-specific categories matter**:
  - reviewer + `cybersecurity` (SAST/OWASP/vulnerability context)
  - tester + `data-science` (coverage analysis, flaky test statistics)
  - deployer + `mcp` (cloud API access, K8s querying)
  - architect + `creative` (architecture diagrams, excalidraw)
  - PM + `email` (stakeholder communication)
  - requirement-analyst + `mcp` (OpenAPI validators, Gherkin parsers)
- **data-science and mlops are NOT universal** — only enable for roles that
  actually do data analysis or ML work.

### Research methodology that worked

Dispatch 3 parallel `delegate_task` subagents, each covering 3 roles:
- Subagent 1: architect + PM + requirement-analyst (roles with 0 skills_enabled)
- Subagent 2: deployer + reviewer + tester (roles with minimal skills)
- Subagent 3: orchestrator + coder + researcher (assess existing config)

Each subagent queries GitHub API for star counts, descriptions, and searches
for top repos per category. Maps findings to Hermes skill categories with
rationale. Total research time ~15-20 minutes for all 3 in parallel.

## Bug: `environment_hint` Lost When Shared `agent` Config Exists

### Symptom

After regenerating configs, profiles have no `environment_hint` in their
`config.yaml`. Workers can't find their `_rules.md` file.

### Root cause

`generate_config_yaml()` used:
```python
"agent": agent_cfg if agent_cfg else {
    ...,
    "environment_hint": profile_cfg.get("environment_hint", ""),
},
```
When `shared_config.agent` exists (always true in this setup), the `else`
branch never runs, so `environment_hint` is never set.

### Fix

After the `cfg` dict construction, inject `environment_hint` separately:
```python
if agent_cfg and profile_cfg.get("environment_hint"):
    cfg["agent"]["environment_hint"] = profile_cfg["environment_hint"]
```

**Caution when patching `generate-configs.py`**: The `cfg` dict was originally
a single inline literal. Extracting the injection requires breaking subsequent
keys into separate `cfg["key"] = { ... }` assignments. Watch for indentation
errors and unmatched braces — lint after every patch step.

### Verification

```bash
grep -l 'environment_hint' ~/.hermes/profiles/*/config.yaml | wc -l
# Should equal the number of profiles
```

## Bug: `ALL_CATEGORIES` Missing New Skill Categories

### Symptom

Generator prints `PLATFORM-DRIFT` warnings. Skills from the missing category
don't load in any profile, even when listed in `skills_enabled`.

### Fix

Add the new category to `ALL_CATEGORIES` in `generate-configs.py`:
```python
ALL_CATEGORIES = [
    "apikey-image-gen", "apple", "autonomous-ai-agents", "computer-use",
    "creative", "cybersecurity", "data-science", ...
    #                          ^--- add new categories here
]
```

### Verification

```bash
~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/generate-configs.py 2>&1 | grep DRIFT
# Should show no output (all categories registered)
```

## Pitfalls

- **`hermes profile delete` requires interactive confirmation** — pipe the
  profile name: `echo "<name>" | hermes profile delete <name>`.
- **Hindsight bank API path is `/v1/default/banks/{id}/memories/recall`**,
  NOT `/api/v1/banks` or `/v1/banks`. The `/v1/default/` prefix is required.
- **`skill_manage` cannot edit symlinked skills** — if a skill in the active
  profile is a symlink to the `default` profile's skills dir, `skill_manage`
  fails with "not found in active profile". Use `skill_manage(action='create')`
  to create a new skill in the active profile instead, or edit the source file
  directly from the `default` profile.
- **YAML boolean trap** — `mode: off` becomes `False` in PyYAML. Always quote:
  `mode: 'off'`.
- **`generate-configs.py` dict restructuring** — when adding code between the
  `cfg = { ... }` literal and subsequent `cfg["platforms"] = ...` assignments,
  all keys after the insertion point must be converted from inline dict entries
  to separate assignments. Lint after every step.

## Related Skills

- **hermes-profile-config** — covers config editing patterns, write-guard
  rules, custom provider setup, .env management, gateway restart procedures.
  This skill (agent-profile-lifecycle) focuses on the create/delete/optimize
  workflow and complements hermes-profile-config.
- **hermes-agent** — bundled skill with CLI reference and general configuration.
