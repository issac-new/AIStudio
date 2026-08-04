---
name: profile-config-sibling-reuse
description: >-
  Clone a sibling profile's config.yaml by string replacement when creating
  the Nth profile in an existing team, instead of `hermes profile create
  --clone-from worker-coder`. Preserves clearances, mcp_servers env,
  platform_toolsets, _config_version, and skills.disabled that a generic
  worker clone loses. Use when a team-sibling profile already exists and
  shares the same model provider, clearances, and mcp_servers wiring.
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [hermes, profiles, config, lifecycle, multi-agent]
    related_skills: [agent-profile-lifecycle, hermes-worker-lifecycle, hermes-profile-config]
---

# Profile Config Sibling-Template Reuse

When creating the Nth profile in an existing team (e.g. the 2nd or 3rd
profile in the `platform-*` team), clone a sibling's `config.yaml` by
string replacement rather than using `hermes profile create --clone-from
worker-coder`. A generic worker clone loses team-specific field placement
that is painful to reconstruct by hand.

## When to Use

- A sibling profile in the **same team** already exists (e.g.
  `platform-skill-miner` exists, creating `platform-ontology-curator`).
- The sibling shares the same: model provider, `clearances` block,
  `mcp_servers` SwarmStudio wiring, `platform_toolsets`, `_config_version`.
- Only `skills_enabled_by_category` and the profile name string differ.

Do NOT use when: the new profile needs a different model provider, different
clearances, or different mcp_servers than any existing sibling — fall back to
`hermes profile create` + manual edits.

## What Sibling-Reuse Preserves

| Field / block | Why it matters | Example |
|---------------|----------------|---------|
| `clearances:` | team-scoped marking permissions; placed after `privacy:` | `EYES-ONLY:platform` for platform team |
| `mcp_servers.<name>.env.HERMES_WEB_UI_PROFILE` (×4 servers) | SwarmStudio per-profile wiring; all 4 must match profile name | `hermes-studio-api/browser/devices/use` |
| `platform_toolsets.cli` | which CLI tools the profile may use | `kanban`, `terminal`, `delegation`, ... |
| `_config_version` | schema version the generator expects | `29` |
| `skills.disabled` denylist | the ~200-entry blocklist; regenerating from scratch loses it | per-profile taste |

## Workflow

Run in `execute_code` (needs read + write + assert in one atomic step):

```python
from hermes_tools import terminal
import os

sibling = "platform-skill-miner"
new_name = "platform-ontology-curator"

with open(f"$HOME/.hermes/profiles/{sibling}/config.yaml") as f:
    tpl = f.read()

new = tpl.replace(sibling, new_name)

# Hand-edit ONLY skills_enabled_by_category for the new role:
old_cats = """extra:
  skills_enabled_by_category:
    - devops
    - software-development
    - github
    - mlops                # sibling's category
    - autonomous-ai-agents
    - productivity
    - mcp"""
new_cats = """extra:
  skills_enabled_by_category:
    - devops
    - software-development
    - github
    - research             # new role's category
    - autonomous-ai-agents
    - productivity
    - mcp"""
assert old_cats in new, "category block not found verbatim"
new = new.replace(old_cats, new_cats)

out = f"$HOME/.hermes/profiles/{new_name}/config.yaml"
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w") as f:
    f.write(new)

# Verify identity replacement + no leftover sibling references
for kw in [f"{new_name}_rules.md", f"default_assignee: {new_name}",
           f"HERMES_WEB_UI_PROFILE: {new_name}"]:
    assert kw in new, f"missing: {kw}"
assert sibling not in new, f"leftover sibling reference: {sibling}"
```

## What This Does NOT Do

Only writes `config.yaml`. You still must separately create:

1. **`SOUL.md`** — role identity, mandatory ACP block, front-line recon step,
   output contract (referencing `_shared/ontology.md`), exit protocol.
2. **`<new-name>_rules.md`** — detailed rules, referenced via
   `agent.environment_hint`.
3. **`profile.yaml`** — `description:` + `description_auto: false`.
4. **Register in `profiles.yaml`** — the canonical source for
   `generate-configs.py`.
5. **Skill-category symlinks** — if new categories are needed.
6. **`generate-configs.py` + `gateway restart` + `hermes profile list`**.
7. **Hindsight bank** — auto-creates on first recall (see
   `agent-profile-lifecycle` step 7).

## SOUL.md Mandatory Blocks (for the companion file)

When writing the SOUL.md alongside a sibling-reused config, ensure these
blocks are present (the platform team's `_shared/forward-deployed-protocol.md`
and `_shared/ontology.md` define the contract):

1. **🔴 强制规则：编码开发必须通过 ACP 调用 Claude Code** — top of file,
   references `_shared/mandatory-acp.md`.
2. **🔴 强制规则：认知自检** — `skill_view('cognition-self-check')` before
   execution, with role-specific bias checks.
3. **角色定义** — who you are, 4-5 bullets with scope boundaries.
4. **标准作业循环 (含前线侦察)** — kanban_show → cd workspace → **前线侦察**
   (parallel: read_file ontology/marking-rules/forward-deployed-protocol +
   search_files + session_search + hindsight_recall + skills_list) →
   kanban_comment(侦察摘要) → execute → verify → kanban_complete.
5. **输出契约 (引用 ontology.md)** — metadata template referencing
   `_shared/ontology.md` object types (Artifact/Decision/Finding/Report)
   and CompletionHandoff interface.
6. **退出协议** — every run ends with `kanban_complete` or `kanban_block`.
7. **Loop Engineering 验证门** — reference `_shared/loop-engineering-gates.md`.
8. **隐私保护规则** — reference `_shared/mandatory-privacy.md` + role-specific
   read-scope exception declaration.

## Decision Table: Sibling-Reuse vs `hermes profile create`

| Situation | Use |
|-----------|-----|
| First profile in a brand-new team | `hermes profile create --clone-from worker-coder` |
| Nth profile, sibling shares model+clearances+mcp | **sibling-reuse** (this skill) |
| Nth profile, but model/clearances differ from all siblings | `hermes profile create` + manual edit |

## Pitfalls

- **`skill_manage` cannot edit symlinked skills** — `agent-profile-lifecycle`
  and other devops skills are symlinked from `~/.hermes/skills/` into each
  profile's `skills/` dir. `skill_manage` fails with "not found in active
  profile" even with `cross_profile=True`. This is why this companion skill
  exists as a separately-creatable skill rather than a patch to
  `agent-profile-lifecycle`.
- **Leftover sibling references** — always assert `sibling not in new` after
  replacement. The string replacement is global; if the sibling name appears
  in a comment or description you didn't expect, it gets replaced too (usually
  fine, but verify).
- **`skills_enabled_by_category` block must match verbatim** — the
  `assert old_cats in new` check fails if even one whitespace character
  differs. Read the sibling's config first and copy the exact block.
- **Only `config.yaml` is produced** — forgetting SOUL.md/rules.md/profiles.yaml
  registration leaves the profile half-created. See "What This Does NOT Do".

## Related Skills

- **agent-profile-lifecycle** — the canonical create/delete/optimize workflow
  (symlinked; cannot be patched from orchestrator). This skill is a focused
  companion for the config.yaml creation step when a sibling exists.
- **hermes-worker-lifecycle** — covers the full NEW-profile lifecycle including
  profiles.yaml registration and Hindsight setup.
- **hermes-profile-config** — covers config editing patterns for EXISTING
  profiles.
- **kanban-soul-authoring** — the 9-section SOUL.md template for Kanban workers.

## Overlap Note

`agent-profile-lifecycle`, `hermes-worker-lifecycle`, and this skill all
touch profile creation. `agent-profile-lifecycle` is the umbrella (create →
SOUL → rules → profiles.yaml → generate → hindsight). `hermes-worker-lifecycle`
duplicates much of the same lifecycle. This skill narrows in on the
config.yaml cloning technique that the other two don't cover. Future
consolidation could merge all three into a single `agent-profile-lifecycle`
with this as a `references/` file.
