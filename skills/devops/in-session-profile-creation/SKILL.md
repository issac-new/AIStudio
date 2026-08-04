---
name: in-session-profile-creation
description: >-
  Create Hermes agent profiles from within a running session (no `hermes profile
  create` CLI) by cloning a same-team sibling's config.yaml via read_file →
  name-replace → write_file, then authoring SOUL.md with team-specific
  mandatory sections. Use when the orchestrator session must create a new
  profile for a multi-agent team but cannot shell out to `hermes profile create`.
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [hermes, profiles, multi-agent, config, soul-md]
    related_skills: [agent-profile-lifecycle, hermes-profile-config, kanban-soul-authoring]
---

# In-Session Agent Profile Creation

Create a new Hermes agent profile (config.yaml + SOUL.md) from within a running
orchestrator/worker session, without shell access to `hermes profile create`.
Uses `read_file` + `write_file` + `skill_manage` to clone a same-team sibling's
config and author a role-specific SOUL.md.

## When to Use

- The orchestrator session receives a task to create a new profile (e.g.
  "create platform-tool-builder profile") and cannot shell out to
  `hermes profile create` (e.g. the session runs headless or the CLI is not
  in PATH).
- Adding a profile to an existing multi-agent team where a same-team sibling
  already exists (e.g. creating platform-tool-builder when platform-skill-miner
  already exists).
- The task specifies both config.yaml and SOUL.md as deliverables.

## When NOT to Use

- `hermes profile create --clone-from <template>` is available → use
  `agent-profile-lifecycle` instead (the CLI path handles symlinks, profiles.yaml
  registration, and Hindsight bank setup automatically).
- Deleting or optimizing profiles → use `agent-profile-lifecycle`.
- Editing config of an existing profile → use `hermes-profile-config`.

## Step 1: Generate config.yaml (sibling name-replace technique)

Clone from the **closest same-team sibling** — not a generic template. Same-team
siblings share `clearances`, `skills_enabled` categories, `toolsets`, the
~450-entry `skills.disabled` block, and all MCP server configs. A single
name-replace preserves all of these exactly.

```python
from hermes_tools import read_file, write_file

# 1. Read sibling config (same team)
result = read_file(path="~/.hermes/profiles/<sibling>/config.yaml", offset=1, limit=2000)
content = result["content"]

# 2. Strip line-number prefixes (read_file returns "NN|content" format)
lines = []
for line in content.split("\n"):
    if "|" in line:
        lines.append(line[line.index("|")+1:])
    else:
        lines.append(line)
raw = "\n".join(lines)

# 3. Name-replace: sibling name → new profile name
new_config = raw.replace("<sibling-name>", "<new-name>")

# 4. Write (auto-creates parent dir, runs YAML lint)
write_file(path="~/.hermes/profiles/<new-name>/config.yaml", content=new_config)
```

### Why a single `.replace()` works

The profile name appears in exactly 4 locations in config.yaml, all of which
should change 1:1 to the new name:

1. `agent.environment_hint` → `~/.hermes/profiles/<new-name>/<new-name>_rules.md`
2. `kanban.default_assignee` → `<new-name>`
3. `mcp_servers.<4 servers>.env.HERMES_WEB_UI_PROFILE` → `<new-name>`
4. (No other team-specific fields need changing when cloning same-team)

### Verification grep

```bash
grep -nE "environment_hint|default_assignee|clearances|EYES-ONLY" \
  ~/.hermes/profiles/<new-name>/config.yaml
# Expect: environment_hint + default_assignee + clearances + EYES-ONLY:<team>
```

### Pitfall: don't clone cross-team

Cloning from a different team's profile (e.g. ops-devops for a platform-team
member) requires manually regenerating:
- `clearances` (team-specific: platform = `[TLP:GREEN, TLP:CLEAR, EYES-ONLY:platform]`)
- `skills_enabled` categories (may differ by team)
- The `skills.disabled` block (~450 entries, team-specific security skill exclusions)

Always pick the closest same-team sibling. If none exists yet, clone from the
team's first profile (which was itself cloned from ops-devops + had clearances
added manually).

### Pitfall: read_file line-number format

`read_file` returns content as `"NN|content"` (line number + pipe + content).
Must strip the prefix before processing. The stripping logic:
```python
line[line.index("|")+1:]  if "|" in line  else  line
```
works because YAML content rarely contains `|` at position 2-3 (where line
numbers are). But for YAML block scalars (`|` indicator), the stripping is
safe because those `|` appear after a key name, not at line start.

## Step 2: Author SOUL.md

Write a role-specific SOUL.md using `write_file`. The structure depends on the
team, but all Hermes worker profiles share a common backbone.

### Common backbone (all teams)

1. **🔴 强制规则块 (ACP)** — ACP delegation rule + per-profile exception
2. **角色定义** — "你是 Hermes <team> 的 <role>"
3. **核心职责** — 3-5 bullets with scope boundaries
4. **标准作业循环** — kanban_show → 前线侦察 → execute → kanban_complete/kanban_block
5. **输出契约** — references `ontology.md`, follows `CompletionHandoff` interface
6. **退出协议** — every run ends with `kanban_complete` or `kanban_block`
7. **协作协议** — upstream/downstream handoff table
8. **不要做的事** — anti-pattern block
9. **Loop Engineering 验证门** — verification gates before kanban_complete
10. **隐私保护规则** — references `mandatory-privacy.md`

### Platform-team-specific (5 mandatory sections)

For platform-team profiles, the SOUL.md must include these 5 sections in order.
See `references/platform-team-soul-template.md` for the full template with
copy-paste blocks.

1. **强制规则块 (ACP) + 本 profile 例外说明** — The ACP rule + a per-role
   exception stating what the profile can do directly vs. what must go through ACP.
2. **角色定义** — Includes upstream (who feeds you) and "you don't do X" boundary.
3. **标准作业循环 (含前线侦察)** — 11-step cycle with Forward-Deployed 前线侦察
   as step 2 (see `~/.hermes/profiles/_shared/forward-deployed-protocol.md`).
4. **输出契约 (引用 ontology.md)** — References the shared ontology, produces
   Artifact objects, follows CompletionHandoff interface.
5. **退出协议** — kanban_complete/kanban_block binary, ACP failure handling,
   tool-chain failure handling, provider failure handling.

### ACP exception pattern by role

Each platform-team role has a different ACP exception:

| Role | Core output | Direct (no ACP) | ACP required |
|------|------------|-----------------|--------------|
| platform-skill-miner | SkillProposal (markdown) + skill patch/edit | write_file/patch for proposals & auxiliary files | New/rewrite of skill SKILL.md main logic |
| platform-tool-builder | skill_manage(action='create') | skill_manage for SKILL.md + frontmatter | Executable scripts embedded in skills (Python/Shell) |
| platform-ontology-curator | ontology.md edits | patch for markdown edits | Scripts that validate ontology consistency |

### Shared references all platform-team SOUL.md cite

- `~/.hermes/profiles/_shared/ontology.md` — object model
- `~/.hermes/profiles/_shared/mandatory-acp.md` — ACP rules
- `~/.hermes/profiles/_shared/forward-deployed-protocol.md` — 前线侦察 + Staged Action
- `~/.hermes/profiles/_shared/marking-rules.md` — clearances & marking propagation
- `~/.hermes/profiles/_shared/loop-engineering-gates.md` — verification gates
- `~/.hermes/profiles/_shared/mandatory-privacy.md` — privacy rules

## Step 3: Verify

```bash
# config.yaml key fields
grep -nE "environment_hint|default_assignee|clearances" \
  ~/.hermes/profiles/<new-name>/config.yaml

# SOUL.md mandatory sections
grep -cE "强制规则|角色定义|标准作业循环|前线侦察|输出契约|退出协议|ontology.md" \
  ~/.hermes/profiles/<new-name>/SOUL.md
# Expect: ≥7 (all mandatory sections present)

# File listing
ls -la ~/.hermes/profiles/<new-name>/
# Expect: config.yaml + SOUL.md
```

## Pitfalls

- **skill_manage cannot edit symlinked skills** — if a skill in the active
  profile is a symlink to the `default` profile's skills dir, `skill_manage`
  fails with "not found in active profile". This means you cannot patch
  `agent-profile-lifecycle` from the orchestrator session if it's symlinked.
  Workaround: document the learning in a new skill in the active profile, or
  switch to the default profile to edit the source.
- **Don't clone cross-team** — see Step 1 pitfall above.
- **read_file line-number stripping** — must strip `NN|` prefix before processing.
- **YAML lint auto-runs on write_file** — if the generated config has YAML
  errors, write_file will report them. Fix and re-write.
- **No profiles.yaml registration** — this technique creates files on disk but
  does NOT register the profile in `profiles.yaml` or run `generate-configs.py`.
  If the deployment uses the profiles.yaml pipeline, a follow-up step (from a
  shell with CLI access) is needed to register and regenerate.

## Related Skills

- **agent-profile-lifecycle** — the CLI-based workflow (`hermes profile create`)
  for creating/deleting/optimizing profiles. Use this when CLI is available;
  it handles profiles.yaml, symlinks, and Hindsight automatically.
- **hermes-profile-config** — config editing patterns for existing profiles.
- **kanban-soul-authoring** — the 9-section canonical SOUL.md layout for Kanban
  worker profiles (broader template; this skill adds the in-session technique
  and platform-team specifics).
