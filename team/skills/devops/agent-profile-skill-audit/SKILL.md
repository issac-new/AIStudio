---
name: agent-profile-skill-audit
description: "Audit profile skills for domain misplacement."
version: 1.0.0
metadata:
  hermes:
    tags: [audit, skills, profiles, multi-agent, misplacement]
    related_skills: [skill-library-maintenance, multi-profile-system-audit, skill-board-scoping, tool-inventory-baseline]
---

# Agent Profile × Skill Audit

Inventory every profile's skills and find **domain-skill misplacement** — the
failure where skills end up in the wrong team, or never reach the team that
owns the domain. Complements `skill-library-maintenance` (dedup/symlink
repair) and `multi-profile-system-audit` (SOUL/config/board health) by
focusing on the **ownership lens**: does each team have its domain skills,
and only its own?

## When to Use

- User asks "列出所有profile及其对应的skills" / "分析错配/mismatch"
- Before assigning or re-routing skills to a team (validate the target first)
- Before a team restructure — establish the skills baseline
- After a batch skill install or profile copy — check for template pollution

## Audit Procedure (10 commands, no LLM guessing)

Run these in order. Every finding must trace to a command output.

1. **List all profiles**: `ls -d ~/.hermes/profiles/*/ | xargs -I{} basename {} | sort`
2. **Per-profile SKILL.md + symlink count**:
   ```bash
   for p in ~/.hermes/profiles/*/; do name=$(basename "$p");
     [ -d "$p/skills" ] && echo "$name: dir=$(find "$p/skills" -name SKILL.md | wc -l) links=$(find "$p/skills" -maxdepth 1 -type l | wc -l)"; done
   ```
3. **Symlink targets per profile** (which shared categories each team links):
   ```bash
   find ~/.hermes/profiles/<p>/skills -maxdepth 1 -type l -exec basename {} \;
   ```
4. **Real (non-link) dirs per profile** — these are the profile's OWN skills:
   ```bash
   find ~/.hermes/profiles/<p>/skills -maxdepth 1 -type d ! -name skills | xargs -I{} basename {} | sort
   ```
5. **Broken symlinks** (link target missing):
   ```bash
   for p in ~/.hermes/profiles/*/; do find "$p/skills" -maxdepth 1 -type l | while read l; do
     [ ! -e "$l" ] && echo "BROKEN: $p$(basename "$l")"; done; done
   ```
6. **Local-dir vs shared drift**: `diff -rq ~/.hermes/profiles/<p>/skills/<cat> ~/.hermes/skills/<cat>` — empty = identical copy (duplication, will drift).
7. **Domain-skill ownership per team**: for each team, ask "does the domain skill exist in shared, and is it linked into every member profile that needs it?" e.g. `find ~/.hermes/profiles/[已移除]-*/skills -name "[已移除]*"`.
8. **Model cross-check**: `python3 -c "import yaml; print(yaml.safe_load(open('$HOME/.hermes/profiles/<p>/config.yaml')).get('model'))"` per profile, compare to the user's baseline rule.
9. **Toolsets cross-check**: same yaml read for `toolsets` — does the role have terminal/web/computer-use to actually USE its skills?
10. **Report P0/P1/P2** (see Failure Modes).

## Failure Modes (classify findings by severity)

| P | Failure | Detected how | Example (2026-08 audit) |
|---|---------|--------------|--------------------------|
| P0 | **Foreign skills in team profile** (template-copy pollution) | grep for obviously-foreign skill names across all profiles | `[已移除]-parent-request-handling`, `optical-computing`, `weapon-generation`, `sprint-prioritization` present in ALL 4 hack profiles |
| P0 | **Domain skill missing from owning team** | skill exists but only under a non-owner profile | `[已移除]` only in orchestrator; [已移除]×4 have none |
| P0 | **Domain skill unreachable by consumers** | skill in team orchestrator only, members lack link | `[已移除]` only in [已移除]-orchestrator; 6 teachers have no access |
| P1 | **Team skills piled on orchestrator** | orchestrator real dirs include team-domain skills | orchestrator owns [已移除] + hack-team/ |
| P1 | **Physical copies + symlink dual track** | dir count > link count per profile; diff empty | 10 categories duplicated per profile; `.curator_backups` 10M + `.hub` 1.8M junk in worker profiles |
| P2 | **Model divergence from baseline** | model dict differs from user's unified rule | hack×4 still `kimi-k3`, rest of fleet `glm-5.2` |
| P2 | **Toolsets don't match role** | config toolsets lack the tools the skills need | hack/[已移除]/ops have no terminal/web/computer-use; [已移除] teachers have no web |

## Report Shape

Lead with the 全局结构总览 table (team → profiles → skill form factor:
real dirs / symlinks / both). Then the mismatches ordered P0→P2, each with
a one-line detection evidence. End with a prioritized fix list. Offer to
execute the fixes — P0 cleanup first, symlink conversion only after backup.

## Pitfalls

1. **Template-copy pollution is silent**: batch-generated profiles copy a
   sibling's whole skills dir, dragging in unrelated domains (hack got [已移除]
   and productivity-management skills). Always grep for foreign skill names
   across the team before trusting a profile's inventory.
2. **Ownership = consumer, not creator**: `[已移除]` lives in
   orchestrator because a prior session created it there — but the [已移除] team
   is the consumer and couldn't load it. After creating a domain skill,
   LINK IT to the owning team's profiles; orchestrator is the router, not
   the library.
3. **Local copies drift from shared**: audit-time `diff` may show identical
   content, but once shared is updated (fusion/clawskills), physical copies
   go stale. Prefer symlinks (see skill-library-maintenance) or schedule
   re-sync.
4. **`skill_manage` can't patch shared-layer skills from orchestrator**:
   skills under `~/.hermes/skills/` resolve to the `default` profile and are
   refused; patch them via file tools with `cross_profile=true` or
   `hermes -p default`.
5. **Check `.curator_backups`/`.hub`**: curator junk inside profile skills
   dirs inflates `du` totals (worker-coder was 12M: 1.8M .hub + 10M backups).

## Reference Files

- `references/2026-08-profile-skill-audit-findings.md` — full worked
  example: exact commands, per-profile inventory table, and the concrete
  P0/P1/P2 findings from the 30-profile audit.

## Related Skills (overlap note for curator)

- **skill-library-maintenance** (shared, default profile) — dedup/symlink
  repair; overlaps on the physical-copy finding (P1 above).
- **multi-profile-system-audit** (shared, default profile) — structural
  health; overlaps on model/toolsets cross-check (P2 above).
- **skill-board-scoping** — restrict which profiles get which skills; the
  fix-side of this audit's P0 findings.
- **tool-inventory-baseline** — CLI tool inventory; complements the skills
  inventory.
