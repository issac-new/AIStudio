---
name: prompt-catalog-analysis
description: "Analyze projects that are prompt catalogs + orchestration doctrine (not runtime frameworks): agent .md files with frontmatter, strategy/ dirs with pipeline playbooks, divisions.json/tools.json config. Use when researching projects like agency-agents, awesome-ai-agents, or any repo that ships agent definitions without runtime code."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [research, open-source, architecture, prompt-catalog, orchestration, multi-agent]
    related_skills: [open-source-architecture-analysis, open-source-project-deep-analysis, multi-agent-orchestration-design]
---

# Prompt-Catalog Analysis

A specialized variant of open-source-architecture-analysis for projects that
ship **agent prompt definitions + orchestration doctrine** but NOT runtime
code. These projects have no `src/`, no `internal/`, no agent factory —
just `.md` files and strategy docs.

## When to Use

- Repo has agent `.md` files but no source code directory (`src/`, `internal/`)
- User asks to analyze a "prompt collection" or "agent library" project
- Project ships orchestration playbooks/runbooks but no runtime framework
- You see `strategy/`, `playbooks/`, `runbooks/` directories instead of code

## How to Recognize a Prompt-Catalog Project

Signals (any one is sufficient):

1. **Agent files are `.md` with YAML frontmatter** (name, description, emoji/color)
   — not `.py`, `.go`, or `.ts` agent factory code
2. **No `src/`, `internal/`, `pkg/`, `lib/` code directories** — only content dirs
3. **`strategy/` or `docs/` directory** contains orchestration doctrine, not API docs
4. **`divisions.json` or `categories.json`** at repo root mapping divisions to
   metadata (label, icon, color)
5. **`tools.json`** at repo root defining how agents convert for different tools
6. **`package.json` with no runtime dependencies** — only scripts for
   linting/counting/converting
7. **CI workflows** are `lint-agents.yml`, `check-divisions.yml`, `check-tools.yml`
   — not `test.yml`, `build.yml`

## Discovery Ladder for Prompt-Catalog Projects

| Step | What to read | What you learn |
|------|-------------|----------------|
| 1 | `README.md` | Project scope, agent count, tool support, sponsor info (ZH forks) |
| 2 | `AGENT-LIST.md` or `CATALOG.md` | Complete agent roster with IDs, names, descriptions, source (original/translated) |
| 3 | `divisions.json` | Source of truth for department/division set, icons, colors |
| 4 | `tools.json` | Supported coding tools, install formats, per-agent vs roster, scope |
| 5 | `UPSTREAM.md` (forks only) | Translation coverage, original-vs-fork agent counts, sync status |
| 6 | `CONTRIBUTING.md` | Agent file format template, content guidelines, red lines |
| 7 | `package.json` | Scripts (check-counts, convert, install), npm package metadata |
| 8 | `strategy/` directory listing | Orchestration doctrine structure |
| 9 | `strategy/nexus-strategy.md` (or equivalent) | Full orchestration playbook — phases, gates, handoffs, agent matrix |
| 10 | `strategy/playbooks/phase-*.md` | Per-phase activation sequences, quality gates |
| 11 | `strategy/coordination/` | Activation prompts, handoff templates |
| 12 | `strategy/runbooks/` + `runbooks.json` | Preset scenario team rosters (machine-readable) |
| 13 | Sample agent `.md` files (3-5 from different divisions) | Prompt structure, identity/memory/mission/rules/deliverables/workflow/metrics |
| 14 | `integrations/<tool>/README.md` | Per-tool integration details (especially `integrations/hermes/README.md` for Hermes) |
| 15 | `scripts/` directory | Convert, install, lint scripts — reveal the toolchain |

**Batch reads.** Steps 1-7 are independent — issue in parallel. Steps 8-12
depend on knowing strategy/ exists (from step 1 or 2). Step 13 can be batched
with any other step.

## Key Differences from Runtime-Framework Analysis

| Dimension | Runtime Framework (e.g. PentAGI, Strix) | Prompt Catalog (e.g. agency-agents) |
|---|---|---|
| Agent definitions | Code (factory, class, config) | `.md` files with frontmatter |
| Orchestration | In source code (controller, runner) | In `strategy/` docs (playbooks, runbooks) |
| Tool registry | `tools/registry.go`, `tools/*.py` | `tools.json` at root |
| Agent roster source | Agent factory constants | `AGENT-LIST.md` + directory listing |
| Model allocation | Config files, code | None (model-agnostic by design) |
| Task routing | Runtime dispatcher | Manual activation via copy-paste prompts |
| State management | DB, checkpoints, graph state | None (stateless prompt catalog) |
| Config | `.env.example`, `config.yaml` | `divisions.json`, `package.json` |

## Structured Findings Framework

For prompt-catalog projects, use this 8-dimension framework:

### 1) Complete Agent Roster
- Total count, per-department breakdown, original vs translated (for forks)
- Agent ID naming convention (e.g. `division-role-name`)

### 2) Department/Division Organization
- Division system (divisions.json), icon/color mapping
- CI guards (check-divisions.sh, check-tools.sh)

### 3) Agent Prompt Structure
- Frontmatter fields (name, description, emoji, color, vibe)
- Body sections (identity, mission, rules, deliverables, workflow, metrics)
- What makes a good vs bad agent definition (per CONTRIBUTING.md)

### 4) Orchestration Doctrine
- Pipeline phases and sequence
- Quality gates (gatekeepers, criteria, evidence requirements)
- Dev-QA loop design (retry limits, escalation)
- Deployment modes (full/sprint/micro or equivalent)
- Command structure (who reports to whom)

### 5) Inter-Agent Coordination
- Handoff templates (types, fields, when to use each)
- Activation prompts (ready-to-use templates per agent per phase)
- Cross-department dependency matrix
- Scenario runbooks (preset teams, activation timing)

### 6) Multi-Tool Integration
- Supported tools count and list
- Install kinds (per-agent, roster, plugin)
- Formats (identity, codex-toml, gemini-md, cursor-mdc, etc.)
- Lazy-loading plugin pattern (if applicable)

### 7) Model Allocation (usually "none")
- Check for any model references in agent files or config
- Usually model-agnostic by design

### 8) Patterns Applicable to Hermes
- What this project does better than Hermes
- What Hermes does better
- Specific patterns to adopt (with mapping to Hermes equivalents)

## Pitfalls

1. **Don't look for source code.** These projects have none. If you waste time
   searching for `src/agents/` or `pkg/factory/`, you've misidentified the
   project type. Check `find . -maxdepth 1 -type d` first — if you see content
   directories (academic/, engineering/, marketing/) and no code directories
   (src/, internal/, pkg/), it's a prompt catalog.

2. **`strategy/` is the architecture.** In runtime frameworks, architecture is
   in source code. In prompt catalogs, architecture is in `strategy/` docs.
   Read `strategy/nexus-strategy.md` (or equivalent) the same way you'd read
   `internal/controller/flow.go` — it defines the pipeline, phases, gates,
   and agent coordination.

3. **`divisions.json` and `tools.json` are source-of-truth configs.** They're
   the equivalent of `go.mod` and `config.yaml` for runtime projects. They
   define the agent roster and tool integration surface. CI guards enforce
   consistency between these files and on-disk directories.

4. **Forks add original agents.** The ZH fork (`agency-agents-zh`) adds 53
   China-market-specific agents not in the EN upstream. When analyzing a fork,
   read `UPSTREAM.md` to understand what's translated vs original, and note
   the fork's unique additions separately.

5. **Agent file format is documented in CONTRIBUTING.md.** The format template
   (frontmatter fields, body sections) is in CONTRIBUTING.md, not inferred
   from reading individual agents. Read it first to understand the schema.

6. **Runbooks may have both `.md` and `.json` versions.** The `.md` is the
   human-readable scenario playbook; the `.json` is the machine-readable
   roster for tooling. Read both — the JSON has the exact agent slug arrays
   and activation timing that the markdown describes in prose.

## Reference Files

| File | Content |
|------|---------|
| `references/agency-agents-nexus-pattern.md` | Full session detail from 2026-07-24 analysis of agency-agents-zh (268 agents, NEXUS 7-phase pipeline, handoff templates, runbook rosters, Hermes lazy-loading plugin, tools.json) |
