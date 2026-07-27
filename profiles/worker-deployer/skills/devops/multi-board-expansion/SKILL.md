---
name: multi-board-expansion
description: >-
  Expand the orchestrator's multi-board deployment beyond the initial
  swarm/hack duo. Covers the full pattern for adding a new board with its
  own team of profiles: board.json profile_scope, orchestrator_rules §0.5.N
  keyword routing, SOUL.md routing update, profile batch creation from a
  template config, and boundary disambiguation between overlapping roles
  across boards. Includes a scaling checklist that works for 3, 4, or N boards.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [kanban, multi-board, orchestrator, routing, profile-creation, board-expansion]
    related_skills: [orchestrator-board-routing, multi-board-team-deployment, kanban-board-profile-scoping]
---

# Multi-Board Expansion

The pattern for adding a new Kanban board with its own dedicated team of
agent profiles to an existing Hermes multi-board deployment. The
orchestrator stays as the single unified router; each new board gets its
own keyword routing rules, profile_scope, and team of workers.

## When to Use

- Adding a 3rd, 4th, or Nth board to a deployment that already has
  swarm + hack (or more)
- Expanding beyond the original 2-board pattern to cover a new domain
  (product management, ops/SRE, data science, etc.)
- Researching external agent taxonomies (e.g. agency-agents repo with
  254 agents across 17 divisions) and wanting to import new role
  specializations as a new board

## The Three-Layer Synchronization Rule

Every new board requires three layers to be updated **in sync**. Missing
any layer causes messages to silently fall through to `swarm`:

| Layer | File(s) | What it does |
|-------|---------|---------------|
| 1. Orchestrator routing | `SOUL.md` + `orchestrator_rules.md` | Decides `board="<slug>"` based on message keywords |
| 2. Board config | `board.json` `profile_scope` | Restricts decomposer roster to this board's profiles |
| 3. Profile creation | `config.yaml` + `SOUL.md` per profile | Gives the board workers their role and tools |

## Step-by-Step: Adding a New Board

### Step 1 — Create the board

```bash
hermes kanban boards create <slug> \
  --name '<中文名>' \
  --description '<描述>' \
  --icon '<emoji>' \
  --color '<hex>'
```

### Step 2 — Set profile_scope in board.json

```python
import json, pathlib

p = pathlib.Path.home() / f'.hermes/kanban/boards/<slug>/board.json'
data = json.loads(p.read_text())
data['profile_scope'] = ['orchestrator', '<profile-1>', '<profile-2>', ...]
data['default_workdir'] = '<workspace-root>'
p.write_text(json.dumps(data, ensure_ascii=False, indent=2))
```

**Critical**: `orchestrator` must be in every board's `profile_scope` —
the orchestrator creates tasks on all boards.

### Step 3 — Create profiles (config.yaml + SOUL.md)

#### config.yaml generation (batch via execute_code)

Clone an existing worker's config.yaml (read via `terminal("cat <path>")`
to avoid read_file line-number prefixes) and modify only:
- `default_assignee: <profile-name>`
- `environment_hint: ~/.hermes/profiles/<name>/<name>_rules.md`
- `skills_enabled_by_category:` — tailored list for the role

```python
import re

def generate_config(profile_info, base_config):
    config = base_config
    config = re.sub(r'default_assignee: .*',
                    f'default_assignee: {profile_info["default_assignee"]}', config)
    config = re.sub(r'environment_hint: ~/.hermes/profiles/worker-researcher/.*',
                    f'environment_hint: ~/.hermes/profiles/{profile_info["name"]}/{profile_info["rules_file"]}', config)
    categories_yaml = '\n'.join(f'  - {c}' for c in profile_info["skills_categories"])
    config = re.sub(r'  skills_enabled_by_category:\n(  - [^\n]+\n)+',
                    f'  skills_enabled_by_category:\n{categories_yaml}\n', config)
    return config
```

Then write each with `write_file`.

#### SOUL.md creation (delegate to subagents, 2-4 per batch)

Each SOUL.md must follow the worker pattern:
- Title: `# 角色名 (English Name)`
- Opening: `你是 Hermes Kanban <角色>. 当 <board> 把一张任务卡派给你时...`
- Reference kanban execution protocol (kanban_show, cd workspace, etc.)
- Sections: `## 你是谁`, `## 核心职责`, `## 工作流程`, `## 质量标准`
- `📚 按需加载的技能库` pointer to relevant skills
- 150-250 lines, Chinese, matching existing SOUL.md style

Pass the full reference SOUL.md path in the delegation context so
subagents can read it and match the pattern.

### Step 4 — Add §0.5.N routing rules to orchestrator_rules.md

For each new board, add a new subsection with:
1. **Keyword table** — categorized CN/EN keywords that trigger routing
2. **Assignee mapping** — keyword category → profile name
3. **Boundary notes** — how this board differs from overlapping boards

### Step 5 — Update routing priority (§0.5.6)

Add the new board's keyword matching level to the priority ladder.

### Step 6 — Update §4.2 worker list

Add a new subsection listing all profiles for the new board.

### Step 7 — Update SOUL.md routing section

The "Matrix routing" section in orchestrator SOUL.md must enumerate ALL
boards — if it still says "hack or swarm", new boards are invisible.

### Step 8 — Bump version

Update the footer version line in orchestrator_rules.md.

### Step 9 — Verify

```bash
hermes profile list   # all new profiles visible
hermes kanban boards  # all boards visible
```

## Boundary Disambiguation

When a new board's domain overlaps with an existing board's, document the
boundary explicitly in `orchestrator_rules.md` §0.5.N:

### Example: worker-deployer (swarm) vs ops-devops (ops)

| Aspect | worker-deployer (swarm) | ops-devops (ops) |
|--------|------------------------|-------------------|
| Focus | Application deployment | Infrastructure/CI-CD |
| Scope | Code上线, env config | Terraform, K8s, Pipeline |
| Trigger | "部署到生产" | "配置CI/CD流水线" |

## Research-to-Deployment Pattern

When researching external agent taxonomies to inform new board design:

1. **Clone + analyze** the external repo via subagents (one per repo)
2. **Map external divisions** to local board concepts (cluster related roles, not 1:1)
3. **Select 3-5 roles per board** — not all 254. Pick roles that fill gaps.
4. **Adapt SOUL.md** — don't copy external prompts verbatim. Rewrite in the
   Hermes Kanban worker pattern with kanban_show/cd/complete protocol.
5. **Use NEXUS pipeline concepts** as inspiration for handoff design, but
   don't import the full NEXUS framework — Hermes Kanban already has its
   own handoff contract skill (`software-development/kanban-handoff-contract`).

## Scaling Checklist (works for N boards)

- [ ] `hermes kanban boards create <slug>`
- [ ] Write `board.json` with `profile_scope` (include `orchestrator`)
- [ ] Generate `config.yaml` for each profile (clone + modify template via regex)
- [ ] Write `SOUL.md` for each profile (delegate to subagents in parallel)
- [ ] Add `§0.5.N` keyword routing + assignee mapping to `orchestrator_rules.md`
- [ ] Update `§0.5.6` routing priority (add new level)
- [ ] Update `§4.2` worker list (add new board's profiles)
- [ ] Update `SOUL.md` Matrix routing section (add new board)
- [ ] Bump version in `orchestrator_rules.md` footer
- [ ] Document boundary with overlapping boards (if any)
- [ ] Verify: `hermes profile list` + `hermes kanban boards`

## Pitfalls

### skill_manage cross_profile doesn't work for default-owned skills

Skills in the `default` profile (symlinked into `orchestrator`) cannot be
patched via `skill_manage(cross_profile=True)` — it reports "not found in
active profile". Use `skill_manage(action='create')` to create a new skill
in the active profile's namespace instead.

### read_file adds line-number prefixes

`read_file` returns content with `N|` line-number prefixes. When generating
config files programmatically, use `terminal("cat <path>")` to get clean
content for regex-based substitution.

### SOUL.md subagent delegation

When delegating SOUL.md creation to subagents, pass the full reference
SOUL.md path (e.g. `worker-researcher/SOUL.md`) in the context so
subagents can read it and match the format. Without a reference, output
is inconsistent.

### Board overlap without boundary documentation

If two boards have overlapping domains (e.g. deployment: swarm's
worker-deployer vs ops's ops-devops), the orchestrator LLM has no way to
decide which board to route to. Always add a boundary note in the §0.5.N
section.

## Related Skills

- **orchestrator-board-routing** (default profile) — the original 2-board
  routing setup (swarm/hack). This skill generalizes it to N boards.
- **multi-board-team-deployment** (default profile) — batch team creation
  for a single board (profiles, configs, board.json).
- **kanban-board-profile-scoping** (default profile) — the `_build_roster()`
  patch and `profile_scope` field mechanics.
- **hermes-gateway-operations** (default profile) — gateway + dashboard
  startup, multi-board Kanban architecture.
