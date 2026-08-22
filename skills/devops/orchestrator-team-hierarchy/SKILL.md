---
name: orchestrator-team-hierarchy
description: "Use when a team has its own orchestrator profile."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [kanban, multi-board, orchestrator, hierarchy, team-orchestrator, gateway, routing]
    related_skills: [multi-board-expansion, orchestrator-board-routing, hermes-gateway-operations, gateway-multi-account-deployment]
---

# Orchestrator Team Hierarchy

Pattern for the relationship between the main orchestrator (Hermes cluster
routing entry) and a domain team's own orchestrator profile (e.g.
`[已移除]-orchestrator`) that runs on a dedicated gateway (second WeChat,
own api_server port).

## When to Use

- User asks: "[已移除]-orchestrator 必须要和 orchestrator 独立么?" /
  "所有 team 都可以被 orchestrator 调度吧? 它应该在所有 team 的 scope 里"
- A domain team ([已移除], or any future team) has its own orchestrator
  profile + own gateway, and you must decide/encode who schedules what.
- Auditing a multi-board deployment where one board has a sub-orchestrator
  and the main orchestrator's SOUL scope line is stale (says "5 boards"
  when there are 7).

## Core Answer: Independence is Per-Layer, Not Binary

| Layer | Owner | Independent? |
|-------|-------|--------------|
| Gateway (second account / own port) | team-orchestrator profile | ✅ MUST be independent — it holds a separate messaging identity (second WeChat). Can't be replaced by the main orchestrator. |
| Domain context (child profile, location, family rules, team-specific skills) | team-orchestrator SOUL / references | ✅ Should stay independent — don't bloat the main orchestrator's SOUL with domain logic. |
| **Scheduling authority (kanban boards)** | **main orchestrator** | ❌ NOT independent — the main orchestrator's scope covers ALL teams. It can cross-board `kanban_create(board="[已移除]", assignee="[已移除]")` for any domain. |

So the answer to "must [已移除]-orchestrator be independent?" is: **the
gateway must be independent, the scheduling must NOT be**. The team
orchestrator is a **领域网关延伸 (domain gateway extension)**, not a
parallel independent body.

## Evidence Checklist (verify before asserting)

```bash
# 1. kanban_create accepts ANY board slug — board is data isolation, not capability isolation
grep -n "_connect(board" ~/.hermes/hermes-agent/tools/kanban_tools.py
# 2. Dispatcher enumerates ALL boards and dispatches by assignee profile
grep -n "boards\|_dispatch_all" ~/.hermes/hermes-agent/hermes_cli/kanban_watchers.py | head
# 3. The team orchestrator's own config declares the main orchestrator as its superior
python3 -c "import yaml; c=yaml.safe_load(open('$HOME/.hermes/profiles/<team>-orchestrator/config.yaml')); print(c.get('kanban',{}).get('orchestrator_profile'))"
# 4. Two gateways ticking the same board do NOT double-spawn (dispatcher dispatches per assignee profile)
# 5. Active profile + current board
cat ~/.hermes/active_profile; cat ~/.hermes/kanban/current
```

## Files to Patch (4 places, keep in sync)

When the user picks "unify scheduling, keep gateway/context isolation":

1. **`orchestrator/SOUL.md`** — scope line: enumerate ALL boards (7 not 5);
   state the team-orchestrator is a 领域网关延伸, not parallel; show the
   cross-board call `kanban_create(board="[已移除]", assignee="[已移除]")`.
   Also update the "路由器，不是执行器" bullet to include the domain
   team's messages in the main orchestrator's routing duty.
2. **`orchestrator/orchestrator_rules.md`** — the board routing note for
   the team board: "调度权统一在主 orchestrator".
3. **`orchestrator/references/<team>-routing-rules.md`** — overview +
   "网关架构" section: "独立性仅限网关层, 调度权不独立"; explain the
   two-gateways-one-board tick is safe.
4. **`<team>-orchestrator/SOUL.md`** — self-positioning paragraph:
   "主 orchestrator 的领域网关延伸"; division of labor — daily domain
   messages self-routed, heavy/cross-domain tasks escalated to main
   orchestrator or created directly by it.

No gateway restart needed — SOUL/rules are read per session; the next
gateway message loop picks them up.

## Pitfalls

- **Only update SOUL.md, forget rules.md + references**: the routing
  decision layer reads rules.md; the reference file still says "独立
  gateway 管理" and misleads future routing. Update all 4.
- **Scope line drift**: main orchestrator SOUL said "29 profiles in 5
  boards" while platform/[已移除] boards existed. When adding boards,
  re-check the scope enumeration line.
- **Shared-layer skill ownership**: skills under `~/.hermes/skills/`
  (shared/default layer) cannot be patched from the orchestrator profile
  via skill_manage — `skill_manage` reports "not found in active profile"
  and points to `default`. Create companion skills in the orchestrator
  profile's own namespace, or patch from the owning profile.

## Related Skills

- **multi-board-expansion** (shared layer) — adding N boards; this skill
  covers the sub-orchestrator hierarchy on top of that.
- **orchestrator-board-routing** (shared layer) — keyword routing tables
  in SOUL.md + rules.md.
- **hermes-gateway-operations** (shared layer) — multi-board Kanban
  architecture, dispatcher mechanics.
- **gateway-multi-account-deployment** (shared layer) — second account on
  its own gateway under multiplex.
