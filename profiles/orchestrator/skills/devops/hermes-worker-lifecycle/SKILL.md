---
name: hermes-worker-lifecycle
description: >-
  Add, remove, and manage Hermes worker profiles in a multi-profile
  deployment. Covers the full lifecycle: cloning, role file creation,
  profiles.yaml registration, ALL_CATEGORIES updates, skill symlinks,
  Hindsight bank setup, and the environment_hint injection bug.
  Complements hermes-profile-config (which covers config changes to
  existing profiles) with the specific workflow for NEW profiles.
---

# Hermes Worker Profile Lifecycle

## When to Use

- Adding a new agent profile (e.g. `worker-security`, `worker-data-engineer`)
  to an existing multi-profile Hermes deployment.
- Removing or renaming a worker profile.
- Debugging why a new profile's `environment_hint` or skills aren't loading.

## Prerequisites

- A working `generate-configs.py` + `profiles.yaml` setup (see
  `hermes-profile-config` skill for background).
- The `hermes` CLI available in PATH.
- Hindsight service running on `localhost:8888` (if using hindsight memory).

## Full Workflow: Adding a New Worker Profile

### Step 1 — Clone from an existing profile

```bash
hermes profile create <new-name> --clone-from <existing-worker>
# e.g. hermes profile create worker-security --clone-from worker-coder
```

Creates `~/.hermes/profiles/<new-name>/` with the source profile's
directory structure. The cloned `config.yaml` will be overwritten in
Step 7 — don't edit it manually.

### Step 2 — Create three role files

| File | Purpose |
|------|---------|
| `SOUL.md` | Role identity, responsibilities, workflow, collaboration protocol |
| `<new-name>_rules.md` | Detailed rules: methodology, quality gates, output contract |
| `profile.yaml` | Profile description (`description:` field) |

**SOUL.md** (2–15 KB): role-specific identity, standard work cycle,
collaboration protocol with other roles, output contract.

**rules.md**: red lines, methodology, tool usage norms, blocking
scenarios. Referenced via `agent.environment_hint`.

### Step 3 — Register in `profiles.yaml`

Add a new entry under `profiles:` in `~/.hermes/shared/profiles.yaml`:

```yaml
  worker-<name>:
    api_server: { enabled: false }
    matrix: { enabled: false }
    toolsets: [hermes-cli, acp, kanban, memory]
    kanban: { default_assignee: worker-<name> }
    environment_hint: ~/.hermes/profiles/worker-<name>/worker-<name>_rules.md
    env_extra: { API_SERVER_ENABLED: 'false' }
    plugins: [acp-client, hindsight, memtensor, observability/langfuse, run-trace]
    skills_enabled: [software-development, devops, ...]
```

### Step 4 — Register new skill categories in ALL_CATEGORIES

**CRITICAL pitfall**: If the new profile uses a skill category not
in `ALL_CATEGORIES` (the list in `generate-configs.py`), the generator
emits `PLATFORM-DRIFT` and silently blocks that category. Skills exist
on disk but won't be enabled.

```bash
# Check if the category is registered
grep 'ALL_CATEGORIES' ~/.hermes/shared/generate-configs.py
```

If missing, add it:
```python
ALL_CATEGORIES = [
    "apikey-image-gen", "apple", "autonomous-ai-agents", "computer-use",
    "creative", "cybersecurity",  # ← add new categories here
    "data-science", "devops", ...
]
```

### Step 5 — Create skill symlinks for shared categories

```bash
ln -s ~/.hermes/skills/<category> \
      ~/.hermes/profiles/<new-name>/skills/<category>
```

The skill scanner follows symlinks (`followlinks=True`).

### Step 6 — Set up Hindsight memory

The clone may not include `hindsight/`. Create it:

```bash
mkdir -p ~/.hermes/profiles/<new-name>/hindsight
cp ~/.hermes/profiles/worker-coder/hindsight/config.json \
   ~/.hermes/profiles/<new-name>/hindsight/config.json
```

The bank is auto-created on first `recall` call. Verify:
```bash
# Get MAC for bank ID
MAC=$(ifconfig en0 | grep ether | awk '{print $2}' | tr -d ':')

# Trigger auto-creation
curl -s -X POST \
  "http://localhost:8888/v1/default/banks/hermes-${MAC}-<new-name>/memories/recall" \
  -H "Content-Type: application/json" \
  -d '{"query": "init"}' | python3 -m json.tool

# Verify bank exists
curl -s "http://localhost:8888/v1/default/banks/hermes-${MAC}-<new-name>/stats" \
  | python3 -m json.tool
```

### Step 7 — Regenerate and restart

```bash
# Generate all configs
~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/generate-configs.py

# Verify new profile appears
hermes profile list

# Verify environment_hint is set (see pitfall below!)
grep 'environment_hint' ~/.hermes/profiles/<new-name>/config.yaml

# Restart gateway so dispatcher recognizes the new profile
hermes -p orchestrator gateway restart
```

## Pitfalls

### environment_hint silently dropped (BUG)

**Found 2026-07-22**: When `shared_config.agent` in `profiles.yaml`
is a non-empty dict (which it usually is — it has `max_turns`,
`reasoning_effort`, etc.), the generator uses it as-is for
`cfg["agent"]`. The per-profile `environment_hint` is only injected
in the fallback branch (when `agent_cfg` is empty), so profiles that
declare `environment_hint` but share the `agent` config silently
lose it.

**Symptom**: `grep 'environment_hint' config.yaml` returns nothing.
The agent runs without its rules file — no role-specific guidance
is loaded.

**Fix** in `generate_config_yaml()`, after the `cfg` dict is built:

```python
# After cfg["agent"] is set from shared_config.agent:
if agent_cfg and profile_cfg.get("environment_hint"):
    cfg["agent"]["environment_hint"] = profile_cfg["environment_hint"]
```

**Verify**: after regenerating, ALL profiles should show
`environment_hint`:
```bash
grep -l 'environment_hint' ~/.hermes/profiles/*/config.yaml
# Should list ALL profiles
```

### YAML boolean trap for approvals.mode

In YAML 1.1, unquoted `off` is parsed as `False`, not the string
`"off"`. Always quote: `mode: 'off'`. See `hermes-profile-config`
skill for full detail.

### PLATFORM-DRIFT warning means skills are blocked

If the generator prints `⚠ PLATFORM-DRIFT <profile>: 磁盘出现未登记类目
['<category>']`, the category's skills are being silently blocked.
Add the category to `ALL_CATEGORIES` and regenerate.

### Cloned profile missing hindsight/ directory

`hermes profile create --clone-from` does not always copy the
`hindsight/` directory. Create it manually (Step 6 above).

### Hindsight bank API endpoints

The Hindsight API uses `/v1/default/banks/{bank_id}/...` (not
`/api/v1/...`). Banks are auto-created on first access — no explicit
creation endpoint needed.

## Designing Role Files

### SOUL.md template structure

```markdown
# <Role Name> (Worker-<Name>)

You are **Hermes Kanban <Role>**. When kanban001 assigns you a task...

## You Are
- <role identity, 3-5 bullets>
- <what you do vs. what other roles do>

## Standard Work Cycle
<kanban_show → cd workspace → work → verify → kanban_comment → kanban_complete>

## Collaboration
<table: scenario → your action → downstream role>

## Output Contract
<kanban_complete summary + metadata shape>
```

### Rules file template structure

```markdown
# Worker-<Name> Agent Rules

## 1. Core Responsibilities
<what you do, what you don't do>

## 2. Methodology Red Lines
<authorization, evidence, quality gates>

## 3. Standard Process
<step-by-step workflow for your domain>

## 4. Tool Usage
<installation priorities, background execution, context management>

## 5. Collaboration
<handoff table>

## 6. Output Contract
<metadata JSON shape>
```

## Removing a Worker Profile

```bash
# 1. Remove from profiles.yaml
# (delete the profile's entry under profiles:)

# 2. Regenerate configs (the profile's config.yaml becomes stale but harmless)
~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/generate-configs.py

# 3. Remove the profile directory
rm -rf ~/.hermes/profiles/<name>

# 4. Verify it's gone
hermes profile list

# 5. Restart gateway
hermes -p orchestrator gateway restart
```

## Related Skills

- **hermes-profile-config** — config changes to EXISTING profiles
  (write guards, provider routing, environment_hint, approvals).
  This skill complements it by covering the NEW profile creation
  lifecycle.
- **kanban-orchestrator** — decomposition and dispatch rules for
  the orchestrator that routes work to worker profiles.
