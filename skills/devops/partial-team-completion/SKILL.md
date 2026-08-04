---
name: partial-team-completion
description: >-
  Complete a partially-created agent team when a board and some profiles
  already exist but are missing SOUL.md, rules.md, profiles.yaml entries,
  or have config defects (null default_workdir). Covers the audit-then-fill
  pattern, conda-python for generate-configs.py, and the research-to-deploy
  sequence. Use when completing an [已移除]/product/ops team that was started but
  never finished, or when a board exists but tasks fail due to missing
  default_workdir.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [kanban, multi-board, profile-creation, audit, completion]
    related_skills:
      - multi-board-expansion
      - hermes-worker-lifecycle
      - deep-research-workflow
      - scope-discipline
---

# Partial Team Completion

Complete a partially-created agent team when a Kanban board and some
profiles already exist but the setup was never finished. This is the
most common real-world scenario — boards get created early as
placeholders, profiles get config.yaml from a clone, but SOUL.md,
rules.md, and profiles.yaml entries are missing.

## When to Use

- A board exists in `~/.hermes/kanban/boards/<slug>/` but tasks fail
  due to `default_workdir: null`
- Some profiles have `config.yaml` but no `SOUL.md` or `*_rules.md`
- `profiles.yaml` has no entries for profiles that exist on disk
- User says "调研完成后再创建团队" and you discover the team was
  partially created in a prior session
- After deep research, you need to set up the team based on real data
  but find partial infrastructure already exists

## The Audit-Then-Fill Pattern

### Step 1 — Audit what exists

Before creating anything, check what's already there:

```python
from hermes_tools import terminal
import os, json

# Check board
board_path = os.path.expanduser(f"~/.hermes/kanban/boards/<slug>/board.json")
if os.path.exists(board_path):
    board = json.load(open(board_path))
    print(f"Board: {board.get('slug')}")
    print(f"  default_workdir: {board.get('default_workdir')}")  # null = problem
    print(f"  profile_scope: {board.get('profile_scope')}")

# Check each profile
expected = ["[已移除]", "[已移除]", "[已移除]", "[已移除]",
            "[已移除]", "[已移除]"]
for p in expected:
    base = os.path.expanduser(f"~/.hermes/profiles/{p}")
    has_config = os.path.exists(f"{base}/config.yaml")
    has_soul = os.path.exists(f"{base}/SOUL.md")
    has_rules = os.path.exists(f"{base}/{p}_rules.md")
    print(f"  {p}: config={has_config} soul={has_soul} rules={has_rules}")

# Check profiles.yaml
r = terminal(f"grep -c '<profile-name>' ~/.hermes/shared/profiles.yaml")
print(f"profiles.yaml entries: {r['output'].strip()}")
```

### Step 2 — Fix board.json default_workdir

If `default_workdir` is null, ALL workspace_kind=worktree tasks will fail.
Fix immediately:

```python
import json, pathlib
p = pathlib.Path.home() / '.hermes/kanban/boards/<slug>/board.json'
data = json.loads(p.read_text())
data['default_workdir'] = '/Users/<user>/hermes-docker-sandbox/workspace'
p.write_text(json.dumps(data, ensure_ascii=False, indent=2))
```

### Step 3 — Add missing profiles.yaml entries

For each profile missing from `profiles.yaml`, add a block under
`profiles:`. Copy from an existing worker and change:
- Profile name (key)
- `default_assignee`
- `environment_hint` path
- `skills_enabled` categories

```yaml
  [已移除]:
    api_server: { enabled: false }
    matrix: { enabled: false }
    toolsets: [hermes-cli, acp, kanban, memory]
    kanban: { default_assignee: [已移除] }
    environment_hint: ~/.hermes/profiles/[已移除]/[已移除].md
    env_extra: { API_SERVER_ENABLED: 'false' }
    plugins: [acp-client, hindsight, observability/langfuse, run-trace]
    skills_enabled: [software-development, devops, github, research, ...]
```

Use the `patch` tool with `mode='patch'` for multi-point YAML insertion,
or read the full file and use `write_file` to replace it.

### Step 4 — Create missing SOUL.md files

Delegate to subagents (2-3 per batch for parallelism). Each subagent:
- Reads a reference SOUL.md (e.g. `[已移除]/SOUL.md`) for format
- Creates the new SOUL.md with domain-specific content
- Uses `write_file` with `cross_profile=True`

Pass in the delegation context:
- The reference SOUL.md path to read
- The research report paths for domain data
- The ACP强制规则块 template (must be identical across all profiles)
- The specific domain responsibilities (from research data)

### Step 5 — Create missing rules.md files

Delegate to subagents. Each rules.md needs:
- Board configuration (slug, assignee, max_in_progress)
- Task execution norms (kanban_show → cd → ACP → verify → complete)
- Domain-specific verification standards (e.g., numerical convergence
  for physics, waveform correctness for IP cores, loss curves for AI)

### Step 6 — Add orchestrator routing rules

Add to `orchestrator_rules.md`:
1. A `read_file` pointer to a new `references/<slug>-routing-rules.md`
2. Update §0.5.6 routing priority to include the new board's keyword level

Create the reference file with keyword table, assignee mapping, and
task creation template.

### Step 7 — Regenerate configs with conda python

**Critical**: On macOS, homebrew `python3` lacks the `yaml` module.
Use conda python:

```bash
/opt/anaconda3/bin/python3 ~/.hermes/shared/generate-configs.py
```

The script regenerates ALL profile config.yaml files from profiles.yaml
+ shared_config. Verify the output shows all new profiles generated
successfully.

### Step 8 — Verify

```python
from hermes_tools import terminal

for p in expected_profiles:
    r = terminal(f"grep -c 'glm-5.2' ~/.hermes/profiles/{p}/config.yaml && "
                 f"grep 'acp' ~/.hermes/profiles/{p}/config.yaml | head -1")
    print(f"{p}: {r['output']}")
```

Check: all profiles have the right model, toolsets (acp+kanban+memory),
and environment_hint pointing to their rules.md.

## Key Lessons

### "调研完成后再创建团队" means: research first, THEN set up the team

The user explicitly constrains: "基于真实调研数据决定团队规模和角色划分".
This means:
1. Complete all research (subagents + web_search + GitHub surveys)
2. Present findings to user
3. THEN audit existing infrastructure and complete the team
4. Team structure must be grounded in research data, not assumptions

### Do NOT second-guess user-specified parameters

User says "全部使用glm-5.2模型" → ALL roles use glm-5.2. No exceptions,
no "but what about important roles?", no "关键角色用k3?" follow-up.

### Do NOT push scope with "需要你确认" questions

When user says "先不开发" or "只作调研", do NOT ask "是否现在开始创建?".
Complete the current step, state what's pending, and wait.

### Partial completion is more common than greenfield

In practice, most team setups are partial completions:
- A board was created as a placeholder
- Some profiles were cloned but not customized
- config.yaml exists but SOUL.md doesn't
- profiles.yaml wasn't updated

Always audit before creating. Filling gaps is faster and safer than
recreating from scratch.

### generate-configs.py conda python pitfall

```bash
# WRONG — fails with ModuleNotFoundError
python3 ~/.hermes/shared/generate-configs.py

# RIGHT — conda has yaml module
/opt/anaconda3/bin/python3 ~/.hermes/shared/generate-configs.py
```

Probe for the right interpreter before running:
```bash
python3 -c 'import yaml' 2>&1 || \
/opt/anaconda3/bin/python3 -c 'import yaml' 2>&1 || \
~/.hermes/hermes-agent/venv/bin/python3 -c 'import yaml' 2>&1
```

## Case Study: [已移除] Team Completion (2026-07-26)

### Situation

User asked for deep research on 3 WeChat articles about [已移除] technology,
then said "调研完成后再创建团队 — 基于真实调研数据决定团队规模和角色划分".

### Research phase

1. Fetched 3 WeChat articles (curl + regex)
2. Dispatched 2 research subagents (industry survey + technical deep-dive)
3. Both subagents hit provider errors but transcripts were mined for data
4. Used `gh search repos` (authenticated) to collect 194 GitHub repos
5. Used `gh api` for individual repo metadata
6. Used Python urllib for Wikipedia articles (no rate limit)
7. Produced 3 reports totaling 90KB:
   - `[已移除].md` (32KB, main report)
   - `[已移除].md` (34KB, supplementary)
   - `[已移除].md` (24KB, algorithm details)

### Team completion phase

Audit revealed:
- Board `[已移除]` existed with 7 profile_scope entries ✓
- `default_workdir` was null → fixed ✗→✓
- 3 profiles had SOUL.md ([已移除]/toolchain/optics) ✓
- 3 profiles missing SOUL.md ([已移除]/ipcore/multiphysics) → created ✗→✓
- 0 profiles had rules.md → created all 6 ✗→✓
- profiles.yaml had 0 [已移除] entries → added 6 ✗→✓
- orchestrator_rules.md had no [已移除] routing → added §0.5.9 ✗→✓

### Result

6 [已移除] profiles, all glm-5.2, all ACP+kanban+memory, all with SOUL.md
(240-307 lines) and rules.md (188-199 lines). Board fully operational.

## Related Skills

- **multi-board-expansion** (default profile) — full greenfield board
  creation. This skill covers the partial-completion variant.
- **hermes-worker-lifecycle** (default profile) — single profile create/
  remove. This skill covers batch completion of multiple profiles.
- **deep-research-workflow** (orchestrator) — the research phase that
  precedes team creation.
- **scope-discipline** (orchestrator) — prevents proposing team before
  research is complete.
