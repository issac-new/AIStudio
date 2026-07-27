---
name: open-source-project-deep-analysis
description: "Deep source-code analysis of open-source projects: clone repos, read key files (agent factories, prompt templates, tool registries, dependency manifests), and produce structured technical findings covering architecture, multi-agent design, capabilities, workflow, uniqueness, and tech stack. Use when a user needs architectural understanding beyond README-level metadata — when they ask 'how does X work', 'what's the architecture of Y', or 'compare project A and B'."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [research, open-source, architecture, source-code, github, analysis, multi-agent]
    related_skills: [github-repo-survey, evidence-based-research, multi-agent-orchestration-design]
---

# Open-Source Project Deep Analysis

Go beyond GitHub metadata (stars, description) to understand how a project
actually works by reading its source code. Produce structured findings on
architecture, capabilities, workflow, uniqueness, and tech stack.

## When to Use

- "Research the architecture of project X"
- "How does Y's multi-agent system work?"
- "Compare project A and B — architecture, tools, workflow, tech stack"
- "What makes project Z unique?"
- Any task requiring architectural understanding beyond README level

## When NOT to Use

- Just looking up star counts or descriptions → use `github-repo-survey`
- Checking if a repo exists or its license → use `github-repo-survey`
- Evaluating a single API or feature → read the docs directly

## Prerequisites

- `git` installed
- `curl` for GitHub API search
- Enough disk space for shallow clones (typically 50-200MB per repo)

## Workflow

### Step 1: Find the Correct Repo

Users often guess URLs wrong. Always verify via GitHub Search API first:

```bash
curl -sL "https://api.github.com/search/repositories?q=PROJECTNAME&per_page=5" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for r in d.get('items',[]):
    print(f\"{r['full_name']} | Stars: {r['stargazers_count']} | {r.get('description','')[:80]} | Lang: {r.get('language')} | URL: {r['html_url']}\")
"
```

**Pitfall**: `github.com/v3xro/PentAGI` → actual repo is `github.com/vxcontrol/pentagi`.
`github.com/r3xst3r/Strix` → actual repo is `github.com/usestrix/strix`. Always search.

### Step 2: Clone Shallow

```bash
cd /tmp && mkdir -p research && cd research
git clone --depth 1 https://github.com/OWNER/REPO.git
```

For large repos (>100MB or >1000 files), use partial clone in background:

```bash
git clone --depth 1 --single-branch --filter=blob:none https://github.com/OWNER/REPO.git &
# Or use terminal(background=true, notify_on_complete=true) for async clone
```

**Pitfall**: PentAGI (21K stars, 1159 files) took 90s to clone. Strix cloned in <5s.
Set timeout=60 for normal repos; use background clone for large ones.

### Step 3: Read README (But Don't Trust It)

```bash
cat README.md | head -200
```

The README gives you the marketing view. It often has Mermaid architecture
diagrams, feature lists, and quick-start guides. But it OVERSTATES capabilities
and UNDERSTATES complexity. Treat it as a starting point, not ground truth.

### Step 4: Inspect Project Structure

```bash
# Directory layout
find . -maxdepth 2 -type d | sort

# Key files by type
find . -maxdepth 2 -name "*.go" -o -name "*.py" -o -name "*.ts" | head -60

# Config/manifest files (reveal tech stack)
find . -maxdepth 2 -name "go.mod" -o -name "pyproject.toml" -o -name "package.json" -o -name "docker-compose*.yml" -o -name "Dockerfile" -o -name "Makefile"
```

### Step 5: Read Key Source Files (by question type)

The files to read depend on what you're researching:

#### Architecture & Multi-Agent Design

| Look for | File patterns | What they reveal |
|---|---|---|
| Agent definitions | `**/agent*.go`, `**/agents/*.py`, `**/factory*.py` | Agent types, roles, how they're constructed |
| Agent prompts | `**/prompts/*.tmpl`, `**/prompts/*.jinja`, `**/prompts/*.md` | Agent roles, capabilities, delegation rules |
| Tool registry | `**/tools/registry.go`, `**/tools/tools.go`, `**/tools/*.py` | Available tools, tool types, capabilities |
| Controller/Runner | `**/controller/*.go`, `**/core/runner.py`, `**/core/execution.py` | Workflow orchestration, task lifecycle |
| Coordinator | `**/core/agents.py`, `**/coordinator*.go` | Multi-agent graph state, messaging, lifecycle |
| Config models | `**/config/models.py`, `**/config/*.go` | Settings, scan modes, provider configuration |

#### Capabilities/Tools

| Look for | File patterns | What they reveal |
|---|---|---|
| Tool definitions | `**/tools/*.go`, `**/tools/**/*.py` | Integrated tools, external APIs |
| Skill files | `**/skills/**/*.md` | Specialist knowledge loaded into agents |
| Docker setup | `Dockerfile`, `docker-compose*.yml` | Containerized tools, sandbox config |
| External integrations | `**/providers/*.go`, `**/backends.py` | LLM providers, search engines, external APIs |

#### Tech Stack

| File | What it reveals |
|---|---|
| `go.mod` | Go dependencies, module path, Go version |
| `pyproject.toml` | Python dependencies, build system, linters, type checkers |
| `package.json` | Node.js dependencies, scripts |
| `docker-compose.yml` | Full stack: databases, caches, monitoring, analytics |
| `Dockerfile` | Build stages, base images, installed system packages |
| `.env.example` | Configuration surface: providers, search engines, features |

#### Workflow/Pipeline

| Look for | File patterns | What they reveal |
|---|---|---|
| Flow controller | `**/controller/flow.go`, `**/core/runner.py` | Top-level workflow, task queue, lifecycle |
| Task decomposition | `**/subtasks_generator.tmpl`, `**/inputs.py` | How user input becomes subtasks |
| System prompt | `**/system_prompt.jinja`, `**/prompts/*.tmpl` | Agent behavior rules, mandatory phases |
| Execution hooks | `**/hooks.py`, `**/execution.py` | Pre/post-execution, budget limits |

### Step 6: Cross-Reference README vs Source

README claims vs actual implementation:
- README says "multi-agent system" → check agent factory for actual agent count and types
- README says "20+ tools" → count tool definitions in registry
- README says "supports 10+ LLM providers" → count provider directories
- README has architecture diagrams → verify the data model in actual schema files

### Step 7: Produce Structured Findings

For each project, cover the 5 questions:

1. **Architecture & Multi-Agent Design**: Agent roles, delegation graph, spawning pattern (fixed vs dynamic), supervision mechanisms, memory system
2. **Key Capabilities/Tools**: Tool registry, external integrations, skill/knowledge system, sandbox tools
3. **Workflow/Pipeline**: Entry point → decomposition → execution → reporting. Data model. Phases.
4. **What Makes It Unique**: Differentiators from competitors, novel patterns, design philosophy
5. **Tech Stack**: Languages, frameworks, databases, containerization, LLM providers, monitoring

When comparing multiple projects, add a comparison table at the end.

## Pitfalls

1. **Wrong repo URL from user** — users guess URLs. Always search via GitHub API first.
   `github.com/v3xro/PentAGI` → actual: `github.com/vxcontrol/pentagi`

2. **Large repo clone timeout** — repos with 1000+ files can take 60-90s.
   Use `--filter=blob:none` partial clone or background process with notification.

3. **README is not architecture** — PentAGI's README has Mermaid diagrams but
   actual agent roles/delegation are in `backend/pkg/templates/prompts/*.tmpl` and
   `backend/pkg/tools/tools.go`. Strix's multi-agent design is in
   `strix/agents/factory.py` and `strix/agents/prompts/system_prompt.jinja`.

4. **Prompt templates are the ground truth for agent behavior** — system prompts
   define what agents actually DO, including mandatory phases, delegation rules,
   and workflow constraints. Always read them.

5. **Tool registry constants reveal the full capability surface** — PentAGI's
   `backend/pkg/tools/registry.go` has constants for ALL tool names (30+),
   revealing search providers, agent types, and memory operations that the
   README only partially covers.

6. **`pyproject.toml`/`go.mod` reveal the real tech stack** — not just languages,
   but the actual frameworks (Gin, gqlgen, openai-agents SDK, LiteLLM, Textual),
   linting tools (Ruff, Bandit, mypy), and version constraints.

7. **Don't read every file** — be targeted. For a 5-question analysis, you typically
   need: README + project structure + 5-10 key source files + dependency manifest.
   Reading more than 15 files is usually diminishing returns.

8. **Batch independent reads** — when you need multiple files that don't depend on
   each other, read them in parallel terminal calls to save round-trips.

## Reference Files

| File | Content |
|------|---------|
| `references/security-agent-architectures.md` | Full analysis of PentAGI & Strix (agent roles, orchestration patterns, tech stacks, comparison with general-purpose frameworks) — worked example of this skill |
