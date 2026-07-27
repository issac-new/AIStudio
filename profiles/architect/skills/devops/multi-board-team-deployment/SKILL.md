---
name: multi-board-team-deployment
description: >-
  Deploy a specialized agent team (e.g. hack team) on a dedicated Kanban board,
  batch-create multiple profiles, configure board-level profile_scope, rename
  board slugs, and verify decomposer roster isolation. Covers the full workflow
  from directory creation to gateway restart.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [kanban, multi-board, team-deployment, profile-scope, board-rename]
    related_skills: [hermes-gateway-operations, hermes-worker-lifecycle, kanban-board-profile-scoping]
---

# Multi-Board Team Deployment

Procedures for deploying a whole team of specialized agents on a dedicated
Kanban board, renaming board slugs, and verifying decomposer isolation.

## When to Use

- Creating a specialized team (security/hack, data-science, DevOps) on its own board
- Renaming a board slug (the `rename` CLI only changes display name, not slug)
- Verifying decomposer profile_scope isolation between boards
- Batch-creating 3+ agent profiles at once

## Batch Team Creation

### Step 1 — Create directories + role files

```bash
for p in hack-recon hack-exploit hack-forensics hack-auditor hack-c2; do
    mkdir -p ~/.hermes/profiles/$p/skills

    # profile.yaml with description (CRITICAL for decomposer LLM)
    cat > ~/.hermes/profiles/$p/profile.yaml << EOF
description: "<one-line role description in Chinese>"
description_auto: false
EOF

    # SOUL.md: role identity, capabilities, work cycle, output contract
    # rules.md: red lines, methodology, collaboration, exit protocol
done
```

**Key**: The `description` field in `profile.yaml` is what the auto-decomposer
LLM sees when deciding which agent to assign a task to. Without it, the LLM
sees "(no description; profile named 'hack-recon')" and can't make intelligent
assignments.

### Step 2 — Symlink skills from a sibling profile

```bash
for p in hack-recon hack-exploit hack-forensics hack-auditor hack-c2; do
    rm -rf ~/.hermes/profiles/$p/skills
    ln -s ~/.hermes/profiles/<source-profile>/skills ~/.hermes/profiles/$p/skills
done
```

### Step 3 — Register ALL profiles in profiles.yaml

Add each profile as a top-level key under `profiles:` with:
- `api_server: { enabled: false }` (no independent gateway)
- `matrix: { enabled: false }` (no direct Matrix access)
- `toolsets: [hermes-cli, kanban, memory]` (add `acp` if coding agent needed)
- `kanban: { default_assignee: <profile-name> }`
- `environment_hint: ~/.hermes/profiles/<name>/<name>_rules.md`
- `plugins: [acp-client, hindsight, memtensor, observability/langfuse, run-trace]`
- `skills_enabled: [software-development, devops, github, research, cybersecurity, ...]`

### Step 4 — Generate configs + verify

```bash
~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/generate-configs.py
hermes profile list
```

### Step 5 — Set board profile_scope

```python
import json, pathlib
p = pathlib.Path.home() / '.hermes/kanban/boards/<board-slug>/board.json'
data = json.loads(p.read_text())
data['profile_scope'] = ['hack-recon', 'hack-exploit', 'hack-forensics', 'hack-auditor', 'hack-c2']
p.write_text(json.dumps(data, ensure_ascii=False, indent=2))
```

Also update the OTHER board's `profile_scope` to exclude the new team:
```python
data['profile_scope'] = ['orchestrator', 'architect', 'worker-coder', ...]  # no hack-* profiles
```

### Step 6 — Verify decomposer roster isolation

```bash
~/.hermes/hermes-agent/venv/bin/python3 -c "
import sys, os; sys.path.insert(0, '$HOME/.hermes/hermes-agent')
os.environ['HERMES_KANBAN_BOARD'] = 'hack'
from hermes_cli import kanban_decompose as _d
roster, valid = _d._build_roster()
print(f'{len(roster)} profiles:', [r['name'] for r in roster])
"
```

Must show ONLY the hack team profiles. Switch `HERMES_KANBAN_BOARD` to
the collaboration board and verify hack-* profiles are absent.

### Step 7 — Restart gateway

```bash
launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-orchestrator
```

## Board Slug Rename Procedure

`hermes kanban boards rename <slug> "New Name"` only changes the display
name — the slug is immutable via CLI. To rename the slug:

```bash
OLD=kanban001
NEW=swarm

# 1. Rename board directory
mv ~/.hermes/kanban/boards/$OLD ~/.hermes/kanban/boards/$NEW

# 2. Update board.json slug field
python3 -c "
import json, pathlib, os
p = pathlib.Path.home() / f'.hermes/kanban/boards/{os.environ[\"NEW\"]}/board.json'
data = json.loads(p.read_text())
data['slug'] = os.environ['NEW']
p.write_text(json.dumps(data, ensure_ascii=False, indent=2))
"

# 3. Update current symlink
echo "$NEW" > ~/.hermes/kanban/current

# 4. Rename DB lock files
mv ~/.hermes/kanban/boards/$NEW/${OLD}.db ~/.hermes/kanban/boards/$NEW/${NEW}.db 2>/dev/null
mv ~/.hermes/kanban/boards/$NEW/${OLD}.db.dispatch.lock ~/.hermes/kanban/boards/$NEW/${NEW}.db.dispatch.lock 2>/dev/null

# 5. Bulk-replace old slug in ALL config/SOUL/rules files
sed -i '' "s/$OLD/$NEW/g" \
  ~/.hermes/profiles/orchestrator/SOUL.md \
  ~/.hermes/profiles/orchestrator/orchestrator_rules.md \
  ~/.hermes/profiles/orchestrator/email_kanban_rules.md \
  ~/.hermes/profiles/orchestrator/scripts/*.py \
  ~/.hermes/profiles/*/SOUL.md \
  ~/.hermes/profiles/*/*_rules.md

# 6. Delete residual directory (dispatcher may recreate old slug as empty DB)
rm -rf ~/.hermes/kanban/boards/$OLD
rm -f ~/.hermes/kanban/boards/${OLD}.db

# 7. Verify no stale references (rc=1 = no matches = good)
grep -rn "$OLD" ~/.hermes/profiles/*/SOUL.md ~/.hermes/profiles/*/*_rules.md \
  ~/.hermes/profiles/orchestrator/orchestrator_rules.md 2>/dev/null

# 8. Restart gateway
launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-orchestrator
```

## Pitfalls

### profile.yaml descriptions require Hermes venv Python

`read_profile_meta()` in `profiles.py` needs the `yaml` module to parse
`profile.yaml`. The system Python may lack it. Always verify with:

```bash
~/.hermes/hermes-agent/venv/bin/python3  # NOT python3
```

Symptom: `list_profiles()` returns empty descriptions. The decomposer LLM
sees "(no description; profile named 'hack-recon')" instead of the actual
role description, making intelligent task assignment impossible.

### Dispatcher recreates stale board directory

The dispatcher runs every 60s. If it ticks during a board rename window,
it recreates `~/.hermes/kanban/boards/<old-slug>/` with an empty
`kanban.db`. Always delete residual directories after rename, then restart.

### boards list shows both old and new slugs

`hermes kanban boards list` scans disk for directories. Residual files
cause both slugs to appear. Remove them and the stale entry disappears.

### sed on macOS vs Linux

macOS `sed` requires `-i ''` (empty string after `-i`), not GNU `sed -i`.

### skill_manage cross_profile patch doesn't work

Skills in the `default` profile (symlinked into `orchestrator`) cannot be
patched via `skill_manage(cross_profile=True)` — it reports "not found in
active profile". Use absolute file paths with the `patch` tool instead,
or create a new skill in the active profile.

## SOUL.md Design for Specialized Teams

When writing SOUL.md for a specialized team (e.g. security), reference
open-source project architectures as design inspirations. This gives the
decomposer LLM context about the agent's role and capabilities.

### Structure

```markdown
# <Role Name> (<Profile-Name>)

You are **<Board> <Role>**. When <board> assigns you a task...

## You Are
- <3-5 identity bullets, what you do vs. what others do>

## Core Capability Domains
### Domain 1 (with tools and techniques)
### Domain 2 ...

## Standard Work Cycle
<kanban_show → cd workspace → work phases → kanban_comment → kanban_complete>

## Output Contract
<metadata JSON shape with domain-specific fields>

## Red Lines
<authorization, evidence, collaboration boundaries>
```

### Enriching with open-source research

After researching open-source projects (via delegate_task subagents),
embed key design patterns into each agent's SOUL.md:

- Reference specific project architectures (e.g. "借鉴 Shannon proof-by-exploitation")
- Add concrete workflow phases from project pipelines
- Include output metadata shapes inspired by project data models
- Add collaboration protocols that mirror the project's inter-agent messaging

## Related Skills

- **hermes-gateway-operations** — gateway+dashboard startup, multi-board
  enumeration, session pruning
- **hermes-worker-lifecycle** — single profile creation (this skill covers
  batch team creation)
- **kanban-board-profile-scoping** — the `_build_roster()` patch and
  `profile_scope` field details
