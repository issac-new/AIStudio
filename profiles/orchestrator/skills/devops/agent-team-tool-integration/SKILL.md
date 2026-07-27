---
name: agent-team-tool-integration
description: >-
  Integrate a large external tool catalog (e.g. hackingtool's 180 tools across
  20 categories) into a multi-agent Hermes team. Covers tool-to-agent mapping,
  load balancing when one agent is overloaded, parallel SOUL.md updates via
  delegate_task, and AST-based tool extraction from Python wrapper repos.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [tool-integration, multi-agent, hack-team, soul-design, load-balancing]
    related_skills: [multi-board-team-deployment, hermes-worker-lifecycle]
---

# Agent Team Tool Integration

Procedures for mapping a large external tool catalog onto a multi-agent team,
balancing the load across agents, and embedding tool references into SOUL.md
files in parallel.

## When to Use

- Integrating a tool collection (e.g. hackingtool, Kali tools, SecLists) into a specialized team
- An agent is overloaded with too many tool categories — needs splitting
- Batch-updating multiple agents' SOUL.md files in parallel

## Extracting Tool Catalog from a Python Wrapper Repo

Many security tool collections (hackingtool, Kali, BlackArch) use Python
wrapper classes. Extract the full catalog via AST parsing:

```python
import ast, pathlib

base = pathlib.Path("/tmp/hackingtool/tools")
categories = {}

for f in sorted(base.glob("*.py")):
    if f.name in ("__init__.py", "tool_manager.py"):
        continue
    tree = ast.parse(f.read_text())
    tools = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            # Skip collection classes and base classes
            if "Collection" not in node.name and node.name != "HackingTool":
                tools.append(node.name)
    if tools:
        cat = f.stem.replace("_", " ").title()
        categories[cat] = tools

# Print distribution
total = sum(len(v) for v in categories.values())
print(f"{total} tools across {len(categories)} categories")
for cat, tools in sorted(categories.items()):
    print(f"  {cat}: {len(tools)}")
```

This extracts class names which map 1:1 to tools in hackingtool. Each class
has `INSTALL_COMMANDS` and a `run()` method showing how the tool is invoked.

## Tool-to-Agent Mapping Strategy

### Step 1 — List all categories and tool counts

```
Information Gathering: 27
Web Attack: 21
Phishing Attack: 18
Post Exploitation: 11
XSS Attack: 10
Forensics: 9
Payload Creator: 9
SQL Injection: 8
Wordlist Generator: 8
Active Directory: 7
DDoS: 7
Wireless Attack: 14
Exploit Frameworks: 4
Mobile Security: 4
Cloud Security: 5
Reverse Engineering: 6
Steganography: 5
Remote Administration: 2
Anonsurf: 3
Other Tools: 2
```

### Step 2 — Map by role alignment

Assign each category to the agent whose role most naturally covers it:

| Agent Type | Gets Categories | Rationale |
|------------|----------------|-----------|
| recon | Information Gathering, Anonsurf, Mobile (app recon), RE (binary recon) | Discovery is recon's job |
| exploit | Web Attack, SQLi, XSS, Exploit Frameworks, RAT | Core penetration testing |
| forensics | Forensics, Steganography | Evidence analysis |
| auditor | Cloud Security, Other Tools | Audit/assessment |
| c2 | Post Exploitation, Active Directory, Cloud (post-exploit) | Post-exploitation ops |
| weapons | Phishing, Payload, Wordlist, Wireless, DDoS | Weapons preparation |

### Step 3 — Check for overload

After mapping, count tools per agent. If any agent has >2x the least-loaded
agent, split the overloaded agent.

**Real example**: Initial mapping put 89 tools / 9 categories on hack-exploit
(overloaded) while hack-recon had only 30 (underutilized). Solution: created
hack-weapons to absorb 52 tools / 5 categories (Phishing, Payload, Wordlist,
Wireless, DDoS).

## Parallel SOUL.md Updates via delegate_task

When updating 5+ agent SOUL.md files, use `delegate_task` with 3 concurrent
subagents (the max) to parallelize:

```python
delegate_task(tasks=[
    {
        "goal": "Update ~/.hermes/profiles/hack-recon/SOUL.md: append tool table...",
        "context": "Categories: Information Gathering(27), Anonsurf(3)..."
    },
    {
        "goal": "Update ~/.hermes/profiles/hack-exploit/SOUL.md: remove transferred categories, append tool table...",
        "context": "Categories: Web Attack(21), SQLi(8)... Remove: Phishing, Payload, Wireless, DDoS..."
    },
    {
        "goal": "Update ~/.hermes/profiles/hack-forensics/SOUL.md: append tool table...",
        "context": "Categories: Forensics(9), Steganography(5)..."
    }
])
```

Meanwhile, the parent agent updates the remaining 2-3 agents directly (e.g.
hack-c2, hack-auditor, hack-weapons). This achieves 6-agent SOUL.md updates
in ~6 minutes instead of ~18 minutes sequential.

### Pitfall: subagent patch tool limitations

Subagents using `patch` tool may fail if the SOUL.md file was previously
read with offset/limit pagination (the tool warns about stale content).
Instruct subagents to `read_file` the full file first, then patch.

## Embedding Tool Tables in SOUL.md

Format each agent's tool catalog as a markdown table at the end of SOUL.md:

```markdown
## hackingtool 工具速查

### Category Name (N tools)

| 工具 | 用途 | 安装 |
|------|------|------|
| ToolName | What it does | `brew install` / `pip install` / `go install` / `git clone` |
```

Include install method so the agent can self-provision tools on first use.
Use the actual language of the team (Chinese for this deployment).

## Adding a New Agent to an Existing Team

When splitting an overloaded agent:

1. **mkdir + symlink skills**:
   ```bash
   mkdir -p ~/.hermes/profiles/<new-agent>
   ln -s ~/.hermes/profiles/<source>/skills ~/.hermes/profiles/<new-agent>/skills
   ```

2. **Create profile.yaml** with a description that helps the decomposer LLM
   understand the new agent's role.

3. **Create SOUL.md** with the transferred tool categories.

4. **Create rules.md** with red lines (authorization, evidence, collaboration).

5. **Add to profiles.yaml** under `profiles:` with same config pattern as
   siblings (api_server: false, matrix: false, etc.).

6. **Regenerate configs**: `generate-configs.py`

7. **Update board.json profile_scope**: add the new agent name to the list.

8. **Verify decomposer roster** shows the expanded team.

9. **Restart gateway**: `launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-orchestrator`

## Pitfalls

### Initial tool distribution may be unbalanced

Always count tools per agent after the first mapping. A 2x imbalance between
the most and least loaded agent warrants a split. The hackingtool integration
started with hack-exploit at 89 tools / 9 categories — after splitting to
hack-weapons, the max dropped to 52 (hack-weapons) and hack-exploit went
down to 45.

### delegate_task max_concurrent_children is 3

Can only run 3 subagents in parallel. For 6 agent updates, dispatch 3 via
delegate_task and do the remaining 3 directly. Total wall-clock time is
dominated by the longest single subagent.

### profile.yaml descriptions must use Hermes venv Python

The `yaml` module needed to parse `profile.yaml` is only in the Hermes venv.
Always verify with `~/.hermes/hermes-agent/venv/bin/python3`, not system
`python3`. See `multi-board-team-deployment` skill for details.

## Related Skills

- **multi-board-team-deployment** — batch team creation, board slug rename,
  SOUL.md design structure, open-source project research integration
- **hermes-worker-lifecycle** — single profile creation lifecycle
- **kanban-board-profile-scoping** — profile_scope and _build_roster() patch
