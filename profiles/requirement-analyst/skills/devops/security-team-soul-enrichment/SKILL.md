---
name: security-team-soul-enrichment
description: >-
  Enrich hack team agent SOUL.md files with external tool catalogs (hackingtool
  180 tools), headless tool operation guides (Burp Suite REST API), and
  open-source project design patterns. Covers tool-to-agent load balancing,
  AST-based catalog extraction, parallel SOUL.md batch updates, and the
  key insight that wrapper repos are launchers not frameworks.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, hack-team, tool-integration, burpsuite, hackingtool]
    related_skills: [multi-board-team-deployment, agent-team-tool-integration]
---

# Security Team SOUL Enrichment

Procedures for enriching specialized security team agents' SOUL.md files
with external tool catalogs, headless operation guides, and design patterns
from open-source security agent projects.

## When to Use

- Integrating a large tool catalog (hackingtool, Kali tools) into hack team agents
- Adding headless tool guides (Burp Suite, OWASP ZAP) to agent SOUL.md
- Embedding open-source project design patterns into agent definitions
- Rebalancing tool load after adding new agents to a team

## Wrapper Repo Architecture Insight

Many security tool collections (hackingtool, Kali meta-packages) are **CLI
menu launchers**, NOT execution frameworks. Each tool is a Python class with
`INSTALL_COMMANDS` and `RUN_COMMANDS` as shell strings, invoked via
`os.system()`. There is no tool chaining, pipeline logic, or result
aggregation.

**Implication for SOUL.md**: Reference underlying tools directly (nmap,
sqlmap, nuclei) rather than the wrapper. The catalog's value is knowing what
tools exist and their install commands. Write tool tables with:

```markdown
| 工具 | 用途 | 安装 |
|------|------|------|
| nmap | 端口/服务扫描 | `brew install nmap` |
```

## AST-Based Tool Catalog Extraction

Extract the full tool catalog from a Python wrapper repo via AST parsing:

```python
import ast, pathlib
base = pathlib.Path("/tmp/hackingtool/tools")
for f in sorted(base.glob("*.py")):
    if f.name in ("__init__.py", "tool_manager.py"):
        continue
    tree = ast.parse(f.read_text())
    tools = [n.name for n in ast.walk(tree)
             if isinstance(n, ast.ClassDef)
             and "Collection" not in n.name
             and n.name != "HackingTool"]
    if tools:
        print(f"{f.stem}: {tools}")
```

Each `ClassDef` maps 1:1 to a tool. Collection classes and the base class
are filtered out.

## Tool-to-Agent Load Balancing

### Step 1 — Map categories to agents by role alignment

| Agent Type | Gets Categories | Rationale |
|------------|----------------|-----------|
| recon | Info Gathering, Anonsurf, Mobile (app recon), RE (binary recon) | Discovery is recon's job |
| exploit | Web Attack, SQLi, XSS, Exploit Frameworks, RAT | Core penetration testing |
| forensics | Forensics, Steganography | Evidence analysis |
| auditor | Cloud Security, Other Tools | Audit/assessment |
| c2 | Post-Exploitation, AD, Cloud (post-exploit) | Post-exploitation ops |
| weapons | Phishing, Payload, Wordlist, Wireless, DDoS | Weapons preparation |

### Step 2 — Check for overload

Count tools per agent. If any agent has >2x the least-loaded agent, split.

**Real example**: Initial mapping put 89 tools/9 categories on hack-exploit
(overloaded) while hack-recon had only 30. Created hack-weapons to absorb
52 tools/5 categories. Final distribution: recon(38), exploit(45),
forensics(14), auditor(7), c2(23), weapons(52).

### Step 3 — Create new agent if needed

Follow the "Adding a New Agent" procedure in `multi-board-team-deployment`.
Update board.json `profile_scope` to include the new agent.

## Burp Suite Headless Guide (for hack-exploit SOUL.md)

Burp Suite Community Edition supports headless mode via REST API. This
is NOT in hackingtool's catalog but is essential for Web pentest.

### Headless startup

```bash
# Direct
burpsuite --headless --api-key <key> --listener 127.0.0.1:1337 \
  --project-file /workspace/burp-project.burp

# Docker (recommended, isolated)
docker run -d --name burp -p 127.0.0.1:1337:1337 \
  -v /workspace:/workspace \
  ghcr.io/portswigger/burpsuite:latest \
  --headless --api-key <key> --listener 0.0.0.0:1337
```

### Core REST API endpoints

| Function | Endpoint | Method |
|----------|----------|--------|
| Set target scope | `/v0/api/scan/targets` | POST |
| Active scan | `/v0/api/scan` | POST |
| Scan status | `/v0/api/scan/status` | GET |
| Issues (vulns) | `/v0/api/issues` | GET |
| Proxy history | `/v0/api/proxy/history` | GET |
| Repeater | `/v0/api/repeater` | POST |
| Intruder | `/v0/api/intruder` | POST |
| Sitemap | `/v0/api/sitemap` | GET |

### Burp → sqlmap pipeline

```bash
# Export request from Burp proxy history
curl http://127.0.0.1:1337/v0/api/proxy/history \
  -H "Authorization: Bearer <key>" | \
  python3 -c "import json,sys; [print(r['request']) for r in json.load(sys.stdin)['items']]" \
  > /workspace/target.req

# Feed to sqlmap
sqlmap -r /workspace/target.req --batch --dbs --level=5 --risk=3
```

### Alternatives comparison

| Tool | Advantage | Disadvantage | Use case |
|------|-----------|--------------|----------|
| Burp Suite | Full-featured, Community free, REST API | ~2GB RAM, JVM | Full Web pentest |
| Caido | Lightweight, HTTPQL, Rust perf | Small community | High-speed proxy+filter |
| Mitmproxy | Python programmable, native headless | No GUI scanner | Scripted traffic analysis |
| OWASP ZAP | Open source, Python API | Slow scanning | CI/CD automation |

## Open-Source Design Pattern Integration

After researching open-source security agent projects, embed key design
patterns into each agent's SOUL.md as inline references:

| Project | Pattern | Goes Into Agent |
|---------|---------|-----------------|
| PentAGI | Searcher (8 providers), Reflector (3-fail switch), Chain Summarization | recon, c2 |
| Strix | Discovery→Validation two-step, inline fix (fix_before/after/PR body) | exploit, auditor |
| PentestGPT | task-kind constraint (TEST→EXPLOIT boundary) | exploit |
| Nebula | EvidenceVerifier (SHA-256), scope_policy (DNS=auth boundary) | forensics, recon |
| CyberStrikeAI | C2 as first-class, attack-chain (record-as-you-go), cleanup-rollback | c2, forensics |
| Shannon | proof-by-exploitation (no PoC=no report), source-aware whitebox | exploit, auditor |

Reference format in SOUL.md:
```
- **借鉴 Shannon proof-by-exploitation 模型**：只有被 PoC 证明的漏洞才报告
- **借鉴 Strix Discovery→Validation 两步法**：发现→验证严格分离
```

## Parallel SOUL.md Batch Updates

When updating 3+ agent SOUL.md files, use `delegate_task` with 3 concurrent
subagents. Meanwhile, update the remaining agents directly.

```python
delegate_task(tasks=[
    {"goal": "Append tool table to hack-recon SOUL.md...", "context": "..."},
    {"goal": "Remove transferred categories + append tool table to hack-exploit...", "context": "..."},
    {"goal": "Append tool table to hack-forensics SOUL.md...", "context": "..."},
])
# Meanwhile, update hack-auditor, hack-c2, hack-weapons directly
```

### Pitfall: subagent patch tool stale content

Subagents using `patch` may fail if the SOUL.md was previously read with
offset/limit pagination. Instruct subagents to `read_file` the full file
first, then patch.

## Pitfalls

### skill_manage cannot edit cross-profile skills

Skills in the `default` profile (symlinked into `orchestrator`) cannot be
patched via `skill_manage(cross_profile=True)`. The flag is recognized but
doesn't resolve the skill lookup — it reports "not found in active profile".
Workaround: create a new skill in the active profile instead.

### profile.yaml descriptions need Hermes venv Python

`read_profile_meta()` in `profiles.py` needs the `yaml` module. System
Python may lack it. Always verify with `~/.hermes/hermes-agent/venv/bin/python3`.

### Dispatcher recreates stale board directories

The dispatcher ticks every 60s. If it ticks during a board rename window,
it recreates the old slug directory with an empty `kanban.db`. Always
delete residual directories and restart gateway after rename.

## Related Skills

- **multi-board-team-deployment** — batch team creation, board slug rename,
  SOUL.md design structure
- **agent-team-tool-integration** — (in default profile) tool-to-agent
  mapping, load balancing, parallel SOUL.md updates
- **hermes-gateway-operations** — (in default profile) gateway+dashboard
  startup, multi-board enumeration, session pruning
