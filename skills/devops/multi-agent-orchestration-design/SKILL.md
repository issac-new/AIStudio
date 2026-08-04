---
name: multi-agent-orchestration-design
description: "Orchestrator profile configuration and skill-category gap analysis: which skill categories the orchestrator/worker profiles should enable, grounded in a comparative survey of AutoGen, CrewAI, LangGraph, and OpenHands orchestration patterns. Load when setting up or auditing a multi-profile Hermes deployment, when deciding which skills the orchestrator needs, or when comparing Hermes orchestration to industry frameworks."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [orchestration, multi-agent, skills, config, auto, crewai, langgraph, openhands]
    related_skills: [kanban-orchestrator, hermes-worker-lifecycle, hermes-profile-config]
---

# Multi-Agent Orchestration Design

## When to Use

- Setting up or auditing a multi-profile Hermes deployment (orchestrator + workers).
- Deciding which skill categories the orchestrator or worker profiles should enable.
- Comparing Hermes orchestration patterns to industry frameworks (AutoGen, CrewAI, LangGraph, OpenHands).
- Debugging why the orchestrator profile "doesn't know" decomposition patterns it should.

## The Core Finding (2026-07-22)

The orchestrator profile had **zero** `skills_enabled_by_category` in its `config.yaml`.
It relied entirely on toolsets (hermes-cli, kanban, memory, messaging). This meant
critical skills like `kanban-orchestrator` (the decomposition playbook), `kanban-acp-delegation`
(ACP delegation patterns), and `kanban-handoff-contract` (completion handoff contract)
were on disk but **not loaded** into the orchestrator's system prompt.

**Root cause**: Skills are category-gated. A skill on disk in
`~/.hermes/profiles/<profile>/skills/<category>/` is only discovered if `<category>`
appears in `extra.skills_enabled_by_category` in `config.yaml`. The orchestrator
had toolsets configured but no skill categories.

## Recommended Skill Categories

### Orchestrator (priority order)

| Priority | Category | Key skills | Why |
|---|---|---|---|
| CRITICAL | `devops` | `kanban-orchestrator`, `kanban-worker`, `hermes-worker-lifecycle`, `webhook-subscriptions` | Decomposition playbook, worker pitfalls, profile management, event-driven automation |
| CRITICAL | `autonomous-ai-agents` | `acp-delegation`, `coding-agent-clis`, `kanban-acp-delegation` | ACP delegation is the orchestrator's primary coding-delegation mechanism |
| HIGH | `software-development` | `kanban-goal-mode`, `kanban-handoff-contract`, `plan`, `writing-plans`, `subagent-driven-development` | Handoff discipline, goal-mode for persistent workers, plan writing |
| HIGH | `github` | `github-issues`, `github-pr-workflow`, `github-code-review` | TUI-mode repo work, issue tracking, PR lifecycle |
| USEFUL | `productivity` | `hermes-messaging`, `linear`, `notion` | Human-facing coordination and documentation |
| USEFUL | `research` | `evidence-based-research`, `research-tools` | TUI-mode research; informs how to brief researcher workers |
| USEFUL | `mcp` | `native-mcp`, `mcporter` | Tool integration for extended capabilities |

**Not recommended for orchestrator**: `data-science` (no skills installed), `mlops`
(ML training/serving, not orchestrator's job), `creative` (only ideation), `email`
(platform disabled in config).

### Worker-Coder (currently 9 categories)

Current: `software-development, devops, github, research, data-science, mlops,
autonomous-ai-agents, note-taking, productivity`

**Add**: `mcp` — coder may need to configure/use MCP servers when implementing
integrations (`mcporter`, `native-mcp` skills available).

### Worker-Researcher (currently 9 categories)

Current: `research, data-science, software-development, github, mlops, devops,
autonomous-ai-agents, note-taking, productivity`

**Add**: `mcp` — researcher may need to query MCP servers for data retrieval or
use `mcporter` during research.

## How to Apply

### Option A: Via profiles.yaml (recommended for multi-profile deployments)

```yaml
# In ~/.hermes/shared/profiles.yaml → profiles: → orchestrator:
  orchestrator:
    skills_enabled:
      - devops
      - autonomous-ai-agents
      - software-development
      - github
      - productivity
      - research
      - mcp
```

Then regenerate and restart:
```bash
~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/generate-configs.py
hermes -p orchestrator gateway restart
```

### Option B: Direct config.yaml edit

Add to `~/.hermes/profiles/orchestrator/config.yaml`:

```yaml
extra:
  skills_enabled_by_category:
    - devops
    - autonomous-ai-agents
    - software-development
    - github
    - productivity
    - research
    - mcp
```

For worker profiles, add `mcp` to their existing `skills_enabled_by_category` list.

## Industry Framework Survey

All four major frameworks converge on the same core orchestration primitives
that Hermes Kanban implements. Hermes encodes these as loadable skills; frameworks
that lack this layer force the pattern into code.

| Pattern | AutoGen | CrewAI | LangGraph | OpenHands | Hermes |
|---|---|---|---|---|---|
| Role-based agents | AssistantAgent | role/goal/backstory | node config | agent backends | profiles + SOUL.md |
| Task decomposition | AgentTool | Crew tasks | Subgraphs | Issue-to-task | kanban_create(parents=...) |
| Dependency gating | Termination conditions | context= | Graph edges | Automation triggers | parents auto-promotion |
| Human-in-the-loop | max_turns | human_review | interrupts | automations | kanban_block(needs_input) |
| Persistent memory | per-agent | per-crew | checkpoints | agent state | Hindsight per-profile |
| External tool integration | MCP Workbench | Tools | Tools | ACP agents | acp_send + skills |
| Event-driven triggers | event runtime | Flows | edges | Automation Server | cron + webhook-subscriptions |

**Hermes's closest analog**: LangGraph's graph model (explicit dependency edges,
durable state) combined with OpenHands' multi-backend agent execution (ACP
delegation, automation triggers).

### Framework-specific patterns

**AutoGen**: Agent-as-Tool (`AgentTool`) = coordinator wraps specialist as callable
tool. Group Chat / Teams with termination conditions. Layered: Core API → AgentChat
→ Extensions. Now in maintenance mode → Microsoft Agent Framework.

**CrewAI**: Crews (role-based agent teams) + Flows (event-driven workflows with
state management). Ships its own skill pack for coding agents — directly parallels
Hermes skills concept.

**LangGraph**: Graph-based orchestration inspired by Pregel/Apache Beam. Durable
execution through failures. Subgraphs = nested orchestration. Comprehensive memory
(short-term + long-term).

**OpenHands**: Agent Canvas = developer control center across local/Docker/VM/cloud
backends. ACP-compatible (runs any agent). Automation Server for scheduled/webhook
triggers. Integrates Slack, GitHub, Linear, Notion.

## Pitfalls

**Skills on disk but not loaded.** The skill scanner only discovers skills in
categories listed in `skills_enabled_by_category`. A skill at
`~/.hermes/profiles/orchestrator/skills/devops/kanban-orchestrator/SKILL.md` is
invisible if `devops` is not in the enabled list. This is the #1 cause of
"the orchestrator doesn't know the decomposition playbook."

**Orchestrator SOUL.md is a thin Matrix router.** The orchestrator's SOUL.md may
only contain Matrix-to-Kanban routing rules and TUI direct-execution rules. The
decomposition playbook lives in the `kanban-orchestrator` skill — if the `devops`
category isn't enabled, the orchestrator improvises routing without the accumulated
operational knowledge.

**Worker profiles missing `mcp`.** Both worker-coder and worker-researcher may need
to configure or query MCP servers during implementation or research. Without the
`mcp` category enabled, `mcporter` and `native-mcp` skills are invisible to them.

## Reference

For the full session detail (framework README excerpts, config.yaml analysis,
per-profile skill category lists), see
`references/multi-agent-orchestration-patterns.md`.
