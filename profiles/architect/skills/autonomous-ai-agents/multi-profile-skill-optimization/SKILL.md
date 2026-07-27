---
name: multi-profile-skill-optimization
description: >-
  Audit, research, and optimize skill category assignments across a fleet
  of Hermes agent profiles. Use when profiles have stale or missing
  skills_enabled lists, when adding new profiles, or when doing a periodic
  capability review. Covers the audit→research→map→update cycle, the
  generate-configs.py regeneration flow, and the role→category mapping
  derived from GitHub mainstream-project research.
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [skills, profiles, optimization, multi-agent, configuration]
    related_skills: [hermes-worker-lifecycle, hermes-profile-config, github-repo-survey]
---

# Multi-Profile Skill Optimization

Audit and optimize the `skills_enabled` category lists for every profile
in a multi-agent Hermes deployment. Ensures each agent has the right
capabilities for its role — no more (wasted context) and no less
(missing tools).

## When to Use

- New profiles were created with zero `skills_enabled` (they get ALL
  skills by default — usually wrong for specialized roles).
- Workers have only 4 categories when they need 8+.
- Periodic capability review after adding/removing profiles.
- After installing new skill categories on disk (e.g. `cybersecurity`).

## Prerequisites

- A working `generate-configs.py` + `profiles.yaml` setup.
- `delegate_task` available for parallel research.
- `gh` CLI authenticated for GitHub project research.

## The Audit → Research → Map → Update Cycle

### Step 1 — Audit current state

Read `profiles.yaml` and list each profile's `skills_enabled`:

```python
import yaml
with open('~/.hermes/shared/profiles.yaml') as f:
    data = yaml.safe_load(f)
for name, cfg in data.get('profiles', {}).items():
    skills = cfg.get('skills_enabled', [])
    print(f"{name}: {len(skills)} categories: {skills}")
```

**Red flags:**
- `skills_enabled: []` (empty) → profile gets ALL 520+ skills unfiltered
- Only 4 categories for a specialized worker → likely missing capabilities
- Inconsistency between similar roles (e.g. worker-coder has 9 cats but
  worker-deployer has only 4)

### Step 2 — Research domain tools per role

Dispatch parallel `delegate_task` subagents (up to 3 concurrent) to
research GitHub mainstream projects for each role group. Use the
`github-repo-survey` skill patterns for efficient `gh` CLI queries.

Group roles by similarity to minimize subagent count:

| Group | Roles | Research focus |
|-------|-------|---------------|
| A | architect, project-manager, requirement-analyst | System design, agile tools, BDD/spec tools |
| B | worker-deployer, worker-reviewer, worker-tester | CI/CD, SAST/linters, test frameworks |
| C | orchestrator (standalone) | Multi-agent orchestration patterns (AutoGen, CrewAI) |

Each subagent should:
1. Query GitHub for top repos by stars in each role's domain
2. Identify what capabilities each role needs
3. Map capabilities to Hermes skill categories
4. Return a recommendation table: role → [categories]

### Step 3 — Map tools to skill categories

Apply these principles (derived from 2026-07-22 research covering 80+
GitHub repos):

1. **autonomous-ai-agents** is near-universal — ACP delegation,
   hermes-agent self-config, kanban-acp-delegation.
2. **mcp** for roles that query external APIs (cloud providers, SAST
   tools, test management platforms).
3. **cybersecurity** (410 skills) is heavy — only for security-focused
   roles (worker-security, worker-reviewer for SAST/DAST context).
4. **creative** for diagram-heavy roles (architect, requirement-analyst).
5. **email** only for stakeholder-facing roles (PM, requirement-analyst).
6. **data-science** for roles doing statistical analysis (tester for
   coverage analysis, researcher).
7. **note-taking** and **productivity** are broadly useful for
   documentation-heavy roles.
8. **research** for roles that need evidence-based verification
   (architect for tech evaluation, reviewer for CVE research).

See `references/role-skill-mapping.md` for the concrete per-role
mapping table with rationale.

### Step 4 — Update profiles.yaml and regenerate

Update each profile's `skills_enabled` list in `profiles.yaml`:

```yaml
  worker-deployer:
    # ... other config ...
    skills_enabled:
    - software-development
    - devops
    - github
    - mlops
    - autonomous-ai-agents    # NEW — ACP for IaC generation
    - productivity             # NEW — deploy docs, release notes
    - mcp                      # NEW — cloud provider APIs
    - note-taking              # NEW — runbooks, post-mortems
```

Then regenerate and restart:

```bash
~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/generate-configs.py
hermes -p orchestrator gateway restart
```

### Step 5 — Verify

```bash
# Check enabled/disabled counts per profile
~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/generate-configs.py --dry-run
# Look for "skills: mode=allowlist enabled=N disabled=M" lines

# Verify environment_hint still present (the injection bug)
grep -l 'environment_hint' ~/.hermes/profiles/*/config.yaml
# Should list ALL profiles
```

## Pitfalls

### Empty skills_enabled = ALL skills (not zero)

A profile with `skills_enabled: []` gets every skill on disk enabled
(no `skills.disabled` list is generated). This is the OPPOSITE of what
you want for a specialized role. Always specify at least 1 category.

### Missing skill symlinks

Even if a category is in `ALL_CATEGORIES` and `skills_enabled`, the
profile's `skills/<category>` symlink must exist on disk. The generator
emits `PLATFORM-DRIFT ... 类目磁盘已不存在` if missing.

```bash
ln -s ~/.hermes/skills/<category> ~/.hermes/profiles/<name>/skills/<category>
```

### ALL_CATEGORIES not updated for new categories

If a new skill category appears on disk (e.g. `cybersecurity` was
installed), it must be added to `ALL_CATEGORIES` in `generate-configs.py`
or it will be silently blocked by the allowlist for all profiles.

### environment_hint silently dropped (known bug)

When `shared_config.agent` is a non-empty dict, the generator uses it
as-is and the per-profile `environment_hint` is lost. See
`hermes-worker-lifecycle` skill for the fix.

### generate-configs.py refactor pitfalls

When editing `generate_config_yaml()`, the `cfg` dict construction uses
chained dict literals. Adding a new key requires careful attention to
commas and braces — the linter catches syntax errors but not logic
errors (e.g. a missing key that falls through to the default).

## Related Skills

- **hermes-worker-lifecycle** — adding/removing individual profiles
- **hermes-profile-config** — config changes to existing profiles
- **github-repo-survey** — GitHub project research methodology
- **kanban-orchestrator** — task routing to worker profiles
