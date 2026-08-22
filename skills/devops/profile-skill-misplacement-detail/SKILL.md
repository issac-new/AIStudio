---
name: profile-skill-misplacement-detail
description: "Reference detail for profile-skill audits."
version: 1.0.0
metadata:
  hermes:
    tags: [audit, skills, profiles, reference]
    related_skills: [agent-profile-skill-audit]
---

# Reference: 2026-08 Profile × Skill Audit Findings

Support file for `agent-profile-skill-audit`. Full worked example of the
profile×skills audit on a 30-profile Hermes deployment.

## Fleet shape (30 profiles, 7 teams + orchestrator + workers)

| Team | Profiles | Skill form factor |
|------|----------|-------------------|
| _shared | (6 skills) | real dirs: apikey-image-gen, bailian-image-gen, grok-image-to-video, hyperframes, markdown-viewer, remotion |
| orchestrator | 1 | 56 real dirs + 19 shared symlinks (54M, biggest) |
| hack | auditor/exploit/forensics/recon | 61 SKILL.md each: 10 local dirs + 11–13 symlinks (6.1M ×4) |
| [已移除] | ai/ipcore/physics/toolchain | 8 local dirs + 5 symlinks (NO domain skills) |
| ops | devops/eval/incident-commander/sre | 8 local dirs + 5 symlinks |
| platform | ontology-curator/skill-miner | 8–9 local dirs + 4 symlinks |
| product | manager/researcher | 8 local dirs + 4 symlinks |
| [已移除] | orchestrator + 6 teachers | 9 symlinks; only [已移除]-orchestrator has [已移除] |
| worker | coder/researcher/tester | 8 symlinks + .hub (1.8M) + .curator_backups (10M) |

116 symlinks total, **zero broken** (verified with the broken-symlink loop).
Local dirs (apple/creative/email/media/mlops/note-taking/productivity/
smart-home/social-media/autonomous-ai-agents) are **byte-identical copies**
of shared (diff -rq empty) — physical duplication, not links.

## Key commands that produced the findings

```bash
# per-profile SKILL.md + symlink count
for p in ~/.hermes/profiles/*/; do name=$(basename "$p"); [ -d "$p/skills" ] && \
  echo "$name: dir=$(find "$p/skills" -name SKILL.md | wc -l) links=$(find "$p/skills" -maxdepth 1 -type l | wc -l)"; done

# real (non-link) dirs = profile's own skills
find ~/.hermes/profiles/hack-auditor/skills -maxdepth 1 -type d ! -name skills | xargs -I{} basename {} | sort

# which profiles carry a given skill (ownership check)
find ~/.hermes/profiles -path "*productivity/<skill>/SKILL.md" | sed 's|$HOME/.hermes/profiles/||;s|/skills/productivity/.*||' | sort -u

# model baseline check (user rule: all profiles glm-5.2)
python3 -c "import yaml; c=yaml.safe_load(open('$HOME/.hermes/profiles/<p>/config.yaml')); print(c.get('model'))"

# toolsets check — does the role have the tools to USE its skills?
python3 -c "import yaml; c=yaml.safe_load(open('$HOME/.hermes/profiles/<p>/config.yaml')); print(c.get('toolsets'))"

# duplicate-name check in shared
ls ~/.hermes/skills/devops/ | grep -E 'api-server-third-party-clients(-v2)?'
```

## Findings (severity-ordered)

### P0 — Foreign skills in hack profiles (template-copy pollution)
`[已移除]-parent-request-handling`, `optical-computing`, `weapon-generation`,
`sprint-prioritization`, `requirement-analysis`, `mission-coordination`
all present in the LOCAL productivity/ dir of ALL 4 hack profiles
(auditor/exploit/forensics/recon) and NOWHERE else. Not in shared. A prior
batch copy dragged a sibling profile's skills into the security team.

### P0 — Domain skills missing from owning teams
- `[已移除]` (with SKILL.md) exists ONLY in orchestrator's
  skills; [已移除]×4 have no domain skills at all. Creator ≠ consumer.
- `[已移除]` exists only in [已移除]-orchestrator; the 6 teachers
  ([已移除]/character/chinese/language/physical/stem) have NO domain skills
  and no link to it. Shared layer has zero [已移除] skills.

### P1 — Team skills piled on orchestrator
orchestrator owns [已移除] + hack-team/ (owasp-security,
security-auditor, pentest-methodology-fusion) — the router profile carries
team domain skills instead of the teams themselves.

### P1 — Physical copies + symlink dual track
10 categories duplicated per profile (each 4–12M). worker-coder/researcher
12M each, mostly `.curator_backups` (10M) + `.hub` (1.8M). Duplicated copies
drift when shared is updated.

### P2 — Model divergence
User baseline: ALL profiles glm-5.2 (custom:cc-switch). hack×4 still
kimi-k3 — the only team not migrated. All other 25 profiles glm-5.2.

### P2 — Toolsets don't match role
- hack/[已移除]/ops/worker: `['hermes-cli','acp','kanban','memory']` — no
  terminal/web/computer-use, yet hack claims security execution.
- [已移除] teachers: no web — research symlink is a dead capability for
  lesson research.
- platform-skill-miner correctly has `skills` toolset.
- Duplicate-name overlap: `api-server-third-party-clients` + `-v2` both
  exist in shared devops; `mlops/hf-model-download-china` overlaps
  hermes-offline-migration scope.

## Recommended fix order
1. Remove the 6 foreign skills from hack×4 (or move to the owning team).
2. Symlink [已移除] → [已移除]×4; [已移除] → teachers×6.
3. Convert duplicated local dirs to shared symlinks; clean .curator_backups/.hub.
4. Align hack models to glm-5.2; calibrate toolsets per role.
