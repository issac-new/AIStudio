---
name: open-source-architecture-research
description: "Deep architectural analysis of open-source projects by cloning the repo and reading source — architecture/modules, capabilities/tools, workflow/pipeline design, unique features, and tech stack. Use when the user asks to research, evaluate, or compare the internal design of a GitHub project (not just its metadata). Distinct from github-repo-survey (metadata/stars) and codebase-inspection (LOC metrics)."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [research, architecture, open-source, codebase-analysis, security-agents, github]
    related_skills: [github-repo-survey, codebase-inspection, evidence-based-research]
---

# Open-Source Architecture Research

Deep architectural analysis of an open-source project by cloning its repository
and reading the actual source code, docs, and config. Produces structured
findings covering architecture/modules, capabilities/tools, workflow/pipeline
design, unique features, and tech stack.

## When to Use

- "Research the architecture of project X on GitHub"
- "How does project Y work internally — modules, workflow, tech stack?"
- "Compare the design of these two open-source security tools"
- "Find the agent modules, session handling, and pipeline design of project Z"
- Any task requiring reading a project's **source code** to understand its
  internal design — not just its README or star count.

**Not for:** metadata-only surveys (use `github-repo-survey`), LOC counting
(use `codebase-inspection`), or shallow README summaries (read the source).

## Prerequisites

- `git` installed (for `git clone --depth 1`)
- The target repo URL(s)

## Core Workflow

### 1. Shallow-clone repos in parallel

Clone with `--depth 1` — you only need the current tree, not history. Clone
multiple repos in a single tool batch (parallel) to save wall-clock time:

```bash
mkdir -p ~/research && cd ~/research
git clone --depth 1 https://github.com/owner/project.git
```

When researching 2+ projects, issue all clone commands in one tool call batch
(independent calls → parallel execution).

### 2. Map the directory structure

Use `find` to get the lay of the land before reading anything:

```bash
cd /path/to/clone
find . -maxdepth 3 -type f | grep -v '.git/' | head -100
```

For Python projects, filter to source files:

```bash
find . -type f -name '*.py' | grep -v __pycache__ | grep -v '/tests/' | sort
```

Identify: entry points (`main.py`, `cli.py`), core modules, config files
(`pyproject.toml`, `Cargo.toml`, `package.json`), and docs (`docs/`, `README.md`).

### 3. Read high-signal files first

Read in this order, batching independent reads in a single tool call:

1. **README.md** — public-facing overview, features, install/usage
2. **Architecture/design docs** — `docs/architecture.md`, `ARCHITECTURE.md`,
   `CONTEXT.md`, `AGENT.md`, `CLAUDE.md` — internal design rationale
3. **Package manifest** — `pyproject.toml`, `Cargo.toml`, `package.json` —
   dependencies, build system, entry-point scripts, Python version
4. **Core source modules** — the files the README/docs point to as the main
   loop, agent, or orchestrator
5. **Prompt/instruction files** — system prompts reveal agent design

### 4. Grep for patterns across the codebase

After reading key files, use `grep -rEn` (via `terminal`) to find how concepts
thread through the code:

```bash
# Find agent roles, task kinds, pipeline stages
grep -rEn "class .*Agent|TaskKind|SpecialistRole|phase|stage" src/

# Find tool definitions and risk classification
grep -rEn "class .*Tool|RiskClass|tool_call|run_command" src/

# Find session/checkpoint/approval patterns
grep -rEn "checkpoint|interrupt|approval|session" src/
```

Batch multiple grep commands in one tool call when they're independent.

### 5. Synthesize structured findings

Produce output with these sections per project (adapt as the user requests):

1. **Architecture & modules** — agent roles, session handling, reasoning/parsing,
   memory/storage, deterministic vs LLM-owned boundaries
2. **Key capabilities & tools** — what the agent can actually do, tool execution
   model, sandbox/safety approach
3. **Workflow/pipeline design** — stages, task decomposition, TODO tree / DAG,
   evidence/verification gates, retry/failure handling
4. **Unique features** — what distinguishes this project from alternatives
5. **Tech stack** — languages, frameworks, storage, build system, key dependencies

When comparing 2+ projects, add a summary table at the end.

## File-Reading Prioritization by Project Type

| Project type | High-signal files | Skip (low signal) |
|---|---|---|
| Python agent/CLI | `pyproject.toml`, `src/*/agents.py`, `*/loop.py`, `*/main.py`, `*/cli.py` | `__pycache__`, `tests/` (unless verifying behavior) |
| Python web app | `pyproject.toml`, `*/api.py`, `*/app.py`, `*/models.py`, `*/settings.py` | migrations, static assets |
| Rust desktop | `Cargo.toml`, `src/main.rs`, `src/lib.rs`, `src-tauri/` | `Cargo.lock`, `target/` |
| JS/TS app | `package.json`, `src/App.tsx`, `src/main.ts`, `vite.config.ts` | `node_modules/`, `dist/` |

## Pitfalls

1. **Don't stop at the README.** Many projects have rich internal docs
   (`docs/architecture.md`, `CONTEXT.md`, `AGENT.md`) that are far more
   informative than the public README. Always `find . -name '*.md'` to discover
   them, then read the ones that look like design docs.

2. **Shallow clone loses history** — `--depth 1` is correct for architecture
   research (you want the current design, not the evolution). But if the user
   asks about a specific past version or migration history, clone full depth.

3. **Root vs nested projects** — some repos have a nested sub-project with its
   own `pyproject.toml`/`Cargo.toml` (e.g. PentestGPT has `pentestgpt_agent/`
   as a nested uv project). The root manifest may list different dependencies
   than the nested one. Read both.

4. **Compatibility/legacy copies** — repos may retain obsolete copies of
   packages for packaging compatibility (PentestGPT has a root `unified_agent/`
   that the maintained code doesn't import). Check which copy is actually
   imported by the runtime, not just which exists on disk.

5. **`find` on large repos** — cap with `| head -100` or filter by extension
   to avoid flooding context. Never `find` without a maxdepth or extension
   filter on a monorepo.

6. **Reading test files for behavior** — tests reveal intended behavior and
   invariants, but they're secondary to source for architecture. Read them
   when verifying a claim or understanding edge cases, not for the overview.

7. **Model IDs and API details go stale fast** — when documenting provider
   support, note the verification date. Provider model IDs change frequently;
   a snapshot is a point-in-time reference, not a durable fact.

## Output Format

When returning findings, use clearly separated sections per project with
numbered sub-headers matching the user's questions. For multi-project
comparisons, end with a summary table:

```markdown
## 1. ProjectName (github.com/owner/repo)

### 1) Architecture & Agent Modules
...

### 2) Key Capabilities & Tools
...

### 3) Workflow / Pipeline Design
...

### 4) Unique Features
...

### 5) Tech Stack
...

## Comparison Summary
| Dimension | Project A | Project B |
|---|---|---|
| Shape | ... | ... |
```

## Reference Files

| File | Content |
|------|---------|
| `references/security-agent-architecture.md` | Condensed findings on PentestGPT and Nebula security agents — architecture, modules, workflow, tech stack, and comparison. Reusable as a knowledge bank when evaluating security-agent projects. |

## Related Skills

- **github-repo-survey** — use first for metadata-level discovery (stars, descriptions, topic search) to identify candidate repos, then apply this skill for deep analysis.
- **codebase-inspection** — use for quantitative metrics (LOC, language breakdown) as a complement to this qualitative analysis.
- **evidence-based-research** — anti-hallucination method; applies when architecture claims need source-code grounding (they always do here — every claim should cite a file path).
