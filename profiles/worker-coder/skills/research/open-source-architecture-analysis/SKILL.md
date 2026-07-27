---
name: open-source-architecture-analysis
description: "Deep-dive analysis of open-source projects: clone shallow, read source files in a discovery ladder, and produce structured findings on architecture, agent roles, capabilities, workflow, unique features, and tech stack. Use when the user asks to 'research project X', 'compare these two open-source projects', or needs architecture-level findings beyond metadata (stars/description). Complements github-repo-survey (breadth metadata) with depth source reading."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [research, github, architecture, open-source, deep-dive, comparison, tool-evaluation]
    related_skills: [github-repo-survey, evidence-based-research]
---

# Open-Source Architecture Analysis

Go beyond stars and descriptions: clone a repo, read its source, and produce
structured findings on architecture, capabilities, workflow, and tech stack.
This is the **depth** complement to `github-repo-survey` (which handles
**breadth** metadata surveys).

## When to Use

- "Research project X" or "analyze the architecture of Y"
- "Compare these two open-source projects" (needs architecture, not just stars)
- "Find the architecture and agent roles of Z"
- Any task requiring understanding of a project's internal design, not just
  its popularity or description

## Prerequisites

- `gh` CLI installed and authenticated
- Disk space for shallow clones (~50MB per project)

## Workflow

### 1. Find the canonical repo

Try 2–3 search phrasings when you don't know the exact `owner/repo`:

```bash
gh search repos "project-name" --limit 10
gh search repos "alternate-spelling" --limit 10
gh search repos "product-name domain-keyword" --limit 10
```

Verify canonical (not a fork/clone):

```bash
gh repo view owner/repo --json name,description,stargazerCount,primaryLanguage,repositoryTopics,homepageUrl,createdAt,parent
```

Canonical signals: highest stars, earliest `createdAt`, has `repositoryTopics`,
non-empty `homepageUrl`, `parent` is null.

### 2. Clone shallow

```bash
cd /tmp && mkdir project_research && cd project_research
gh repo clone owner/repo -- --depth=1
```

`--depth=1` — you only need the working tree, not git history.

### 3. Discovery ladder — read in order, batch independent reads

| Step | What to read | What you learn |
|------|-------------|----------------|
| 1 | `README.md` (first 200 lines) | Purpose, highlights, feature list |
| 2 | `ls -la` top-level dirs | Monorepo vs single app, language, entry points |
| 3 | Agent/role definition files | Agent roster, orchestration patterns |
| 4 | Config files (`config.example.yaml`, `.env.example`) | Integrations, model providers, feature flags |
| 5 | Dependency manifests (`go.mod`, `package.json`, `requirements.txt`) | Real tech stack, frameworks, key libraries |
| 6 | Internal source dir listing (`ls internal/`, `ls src/`) | Module boundaries, architecture hotspots |
| 7 | Key source files (head 80–120 lines each) | Implementation patterns, middleware, execution model |
| 8 | Docs directory (`docs/`, `ls docs/en-US/`) | Architecture docs, security model, feature guides |
| 9 | Prompt/agent template files | Pipeline design, phase structure, agent instructions |

**Batch reads.** Steps 3–9 are often independent — issue multiple `terminal`
calls in one turn. Only serialize when a later read depends on a path
discovered in an earlier one.

### 4. Produce structured findings

Use the 5-dimension framework:

```
## 1) Architecture & Agent Roles
  - Orchestration modes/patterns
  - Agent roster (names, roles, specialization)
  - Role/prompt system

## 2) Key Capabilities & Tools
  - Tool categories and specific tools
  - Integration points (MCP, plugins, extensions)
  - High-risk capabilities

## 3) Workflow/Pipeline Design
  - Request path / execution model
  - Multi-agent coordination pattern
  - State management, retry, resume

## 4) Unique Features
  - What distinguishes this from similar projects
  - Novel techniques or design choices

## 5) Tech Stack
  - Language, framework, key dependencies
  - LLM provider, agent framework
  - Infrastructure (Docker, Temporal, etc.)
```

For two-project comparisons, add a summary comparison table:

| Dimension | Project A | Project B |
|---|---|---|
| Focus | ... | ... |
| Approach | ... | ... |
| Agent framework | ... | ... |
| Multi-agent pattern | ... | ... |
| Tooling | ... | ... |
| Orchestration | ... | ... |
| Stars | ... | ... |
| Unique | ... | ... |
| Maturity | ... | ... |

## Key Source Files to Look For

| File | What it reveals | Notes |
|---|---|---|
| `README.md` | Purpose, highlights, quick start | First 200 lines usually sufficient |
| `agents/*.md` | Agent definitions (Go projects) | YAML frontmatter: id, name, description, tools |
| `session-manager.ts` / `agents.ts` | Agent definitions (TS projects) | Typed constants: prerequisites, model tiers, deliverables |
| `config.example.yaml` | All integrations, providers, flags | More complete than README highlights |
| `.env.example` | Required credentials, provider options | Shows supported LLM providers |
| `go.mod` / `package.json` | Real tech stack | More honest than README — actual frameworks, SDKs |
| `ls internal/` (Go) | Module boundaries | Dir names = subsystem map (hitl/, c2/, workflow/, etc.) |
| `ls src/` (TS) | Module boundaries | Same principle |
| `CLAUDE.md` / `AGENTS.md` | Detailed architecture for LLMs | **Gold** — often the most complete architecture doc |
| `docs/architecture.md` | Request path, design trade-offs | May have Mermaid diagrams |
| Prompt templates (`prompts/*.txt`) | Pipeline phases, agent instructions | Reveals execution order and phase structure |

## Pitfalls

1. **Agent definition format varies by project.** Go projects (e.g.
   CyberStrikeAI) use Markdown with YAML frontmatter (`agents/*.md`).
   TS projects (e.g. Shannon) use typed constants in code
   (`session-manager.ts` → `AGENTS` record). Read both the prompt files
   AND the loader code — code reveals prerequisites, model tiers, and
   execution order that prompts alone don't show.

2. **`go.mod` / `package.json` reveal the real tech stack** more honestly
   than the README. A README may say "AI-native" but `go.mod` tells you
   the actual agent framework (`cloudwego/eino`), MCP SDK version, and
   LLM adapter. Always read dependency manifests.

3. **Internal directory structure = architecture map.** `ls internal/`
   in a Go project or `ls src/` in a TS project reveals module boundaries
   better than any diagram. Directory names like `hitl/`, `attackchain/`,
   `c2/`, `workflow/` tell you what subsystems exist without reading a
   single line of code.

4. **Config example files show real integrations.** `config.example.yaml`
   lists every integration the project supports (FOFA, ZoomEye, Quake,
   Shodan, DingTalk, Lark, Discord, etc.) — more complete than the
   README's highlights section.

5. **`CLAUDE.md` / `AGENTS.md` / `.cursor/rules` are gold.** Projects
   that target AI coding agents include these files with detailed
   architecture explanations written for LLM consumption. Shannon's
   `CLAUDE.md` (21KB) contained the most complete architecture description
   in the repo — more detailed than the README or any doc. Always check
   for these files at the repo root.

6. **Don't clone full history for architecture research.** `--depth=1`
   is sufficient. Full clone wastes time and disk for no architecture
   insight. Only deep-clone if you need commit history or blame.

7. **Parallelize across projects.** When researching two projects
   simultaneously, search for both in parallel (batched terminal calls),
   then clone both in parallel. The discovery and reading phases can
   also be parallelized — issue reads for both repos in the same turn.

8. **Popular projects spawn many forks.** Distinguish the original by:
   highest star count, earliest `createdAt`, presence of `repositoryTopics`,
   non-empty `homepageUrl`, and no `parent` field. Forks and clones may
   have confusingly similar names (e.g. `dduclos1776/https-github.com-KeygraphHQ-shannon`).

## Relationship to github-repo-survey

- **github-repo-survey** = breadth: stars, descriptions, topic discovery,
  ranked lists, landscape reports. Stays at the metadata level.
- **open-source-architecture-analysis** (this skill) = depth: clone,
  read source, understand internal design, produce structured architecture
  findings.

Use github-repo-survey to find candidates, then this skill to deep-dive
the shortlist.

## Reference Files

| File | Content |
|------|---------|
| `references/security-agent-projects.md` | Findings on CyberStrikeAI and Shannon as a worked example — architecture patterns, agent roles, tech stacks |
