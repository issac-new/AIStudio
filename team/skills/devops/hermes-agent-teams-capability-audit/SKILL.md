---
name: hermes-agent-teams-capability-audit
description: "Audit Hermes fleet profiles, skills, models, clearances."
version: "1.0.0"
metadata:
  hermes:
    tags: [audit, capabilities, profiles, skills, inventory]
    related_skills: [cluster-integrity-audit, skill-library-maintenance, agent-profile-lifecycle]
---

# Hermes Agent Teams Capability Audit

Class-level audit for the entire Hermes fleet: profiles, skills, models, clearances, and runtime loadability. Produces an evidence-backed inventory. Use after team changes, skill fusion, or when capability gaps are suspected.

## When to Use

- Before RSI（功能链） triage or capability-ladder work
- After skill fusion, profile creation/deletion, or large-scale skill install
- When the user asks for 本机 agents 能力盘点 or teams 能力吸收完善
- Quarterly entropy review

## Procedure

### 1. Inventory profiles

List profiles and read config.yaml for model, provider, clearances, and SOUL presence.

```bash
# Count profiles
ls ~/.hermes/profiles | grep -v "^_\|^\\.\|trash" | wc -l

# Model/provider distribution
for p in ~/.hermes/profiles/*/config.yaml; do
  python3 -c "import yaml,os,sys; c=yaml.safe_load(open('$p')); n=os.path.basename(os.path.dirname('$p')); print(f'{n}: model={c.get(\"model\")} provider={c.get(\"provider\")}')"
done
```

Record profile count, model/provider distribution, SOUL presence, clearances.

### 2. Inventory skill library

Count categories, symlinks vs physical dirs, total skills.

```bash
# Categories
ls -d ~/.hermes/skills/*/ | wc -l

# Symlinks vs physical
find ~/.hermes/skills -maxdepth 1 -type l | wc -l
find ~/.hermes/skills -mindepth 2 -name SKILL.md | wc -l
```

Record category breakdown.

### 3. Detect duplicates

Use content hashing on SKILL.md files.

```python
from pathlib import Path; import hashlib
SKILLS = Path.home()/'.hermes/skills'
seen = {}
for p in SKILLS.rglob('SKILL.md'):
    h = hashlib.sha256(p.read_bytes()).hexdigest()
    seen.setdefault(h, []).append(p)
for h, paths in seen.items():
    if len(paths) > 1:
        print('DUPLICATE:', [str(p) for p in paths])
```

Pitfall: hash match → verify same location intent. Same name ≠ duplicate.

### 4. Verify runtime loadability

Config skills_enabled is dormant. Real switch is symlink presence.

```bash
# Check what loads
hermes -p <profile> prompt-size --json | jq '.skills_breakdown[] | .path'

# Profile-to-symlink mapping
python3 -c "import yaml,os; p='<profile>'; c=yaml.safe_load(open(f'~/{p}/config.yaml')); print(c.get('skills_enabled_by_category', []))"
```

### 5. Report

Output structured report with evidence anchors:
- Profiles Found
- Skills Library Statistics
- Category Breakdown
- Duplicates
- Model/Provider matrix

## Pitfalls

- Do not trust skills_enabled_by_category as evidence. Symlink presence = loadability.
- Model divergence is intentional: orchestrator uses glm-5.3-flash for cost, domain teams use aim via cc-switch. Document, do not flag as drift.
- Duplicate detection must be content-based, not path-based.
- Trash/legacy profiles (_trash_*, _shared) excluded from capability counts.

## References

- cluster-integrity-audit：per-profile skill loadability checks
- skill-library-maintenance：去重/归档 procedure
