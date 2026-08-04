---
name: soul-enrichment-pipeline
description: >-
  Complete 5-layer SOUL.md enrichment pipeline for hack team and collaboration
  team agents. Covers the layer structure (role→commands→supplemental→advanced→reference),
  parallel delegate_task batching for 6-agent updates, cross-team applicability
  (hack team + collaboration team), macOS tool installation verification, and
  the AgentMail email channel as a bidirectional communication alternative.
  Use when enriching any agent's SOUL.md, when auditing SOUL.md quality, or
  when setting up email-based agent communication.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, enrichment, hack-team, collaboration-team, agentmail]
    related_skills:
      - security-team-soul-enrichment
      - collaboration-team-soul-enrichment
      - macos-security-tool-install
      - soul-operability-quality-bar
---

# SOUL Enrichment Pipeline

The complete workflow for enriching agent SOUL.md files from bare role
descriptions to fully operational command manuals with advanced usage.

## When to Use

- New agent created and needs SOUL.md beyond a stub
- Quality audit found >70% pure description (no executable commands)
- Adding tools from a new source (hackingtool, GitHub research, etc.)
- Setting up AgentMail as an email channel for the agent

## 5-Layer SOUL.md Structure

Each agent's SOUL.md should contain these sections in order:

| Layer | Section | Purpose | Hack Team | Collab Team |
|-------|---------|---------|-----------|-------------|
| 1 | Role definition | Who, what, boundaries | ✓ | ✓ |
| 2 | `## 具体操作命令手册` | Copy-paste commands per tool | ✓ | ✓ |
| 3 | `## 补充工具与命令` | Extra GitHub tools with install+usage | ✓ | optional |
| 4 | `## 高级用法与实战技巧` | Advanced flags, chaining, output parsing | ✓ | optional |
| 5 | `## hackingtool 工具速查` | Quick-reference table | ✓ | ✗ |

### Quality Threshold

- **<60% pure description** (measured by counting non-empty, non-header,
  non-table lines without backticks or command patterns)
- **>25% executable commands** (lines containing real tool invocations)
- **≥1 code block per 3 tool categories**

## Enrichment Workflow (4 Phases)

### Phase 1 — Baseline Audit

Read every SOUL.md, count lines/commands/description-ratio:

```python
from hermes_tools import read_file
for agent in agents:
    content = read_file(path=f"~/.hermes/profiles/{agent}/SOUL.md")["content"]
    lines = content.split("\n")
    cmd_lines = sum(1 for l in lines if any(p in l for p in ['nmap ', 'sqlmap ', 'git ', 'docker ']))
    # ... calculate ratios
```

### Phase 2 — Command Manual (Layer 2)

Dispatch 3 parallel subagents via `delegate_task`, each handling 2 agents:

```python
delegate_task(tasks=[
    {"goal": "Add ## 具体操作命令手册 to hack-recon + hack-forensics...", "context": "..."},
    {"goal": "Add ## 具体操作命令手册 to hack-auditor + hack-c2...", "context": "..."},
    {"goal": "Add ## 具体操作命令手册 to hack-exploit + hack-weapons...", "context": "..."},
])
```

**Pitfall**: Subagents using `patch` may fail on stale content if the parent
previously read with offset/limit. Instruct subagents to `read_file` the
full file first.

**Pitfall**: `cross_profile=True` is needed when subagents edit other
profiles' SOUL.md files. Pass this explicitly in the task context.

### Phase 3 — Supplemental Tools (Layer 3)

Research GitHub for mainstream tools NOT yet in SOUL.md, then dispatch
subagents to append `## 补充工具与命令` sections.

Key research workflow:
1. Read current SOUL.md to identify covered tools
2. Query GitHub API via `gh` CLI (authenticated, 5000 req/hr)
3. Handle non-existent tools (PartNavigator, myvn don't exist)
4. Handle renamed repos (droope/droopescan → SamJoan/droopescan,
   carlospolop/PEASS-ng → peass-ng/PEASS-ng)
5. Write structured report, then dispatch patch subagents

### Phase 4 — Advanced Usage (Layer 4)

Add `## 高级用法与实战技巧` with real-world workflows:
- Advanced flag combinations (nmap -T0-T5 tradeoffs, sqlmap --tamper chains)
- Tool chaining pipelines (subfinder → dnsx → httpx → nuclei)
- Output parsing (jq, python one-liners)
- Custom rule/template writing (YARA rules, nuclei templates, Semgrep rules)

## Cross-Team Applicability

The same enrichment pipeline applies to collaboration team agents:

| Agent | Command Manual Focus |
|-------|---------------------|
| architect | mermaid/plantuml diagrams, cloc/pygount, API design tools, ADR |
| project-manager | kanban_create/link/list/show, decomposition patterns, Gantt |
| requirement-analyst | BDD Given/When/Then, markdown validation, user story format |
| worker-coder | Git/gh CLI, Python/Node/Rust/Go build+test, ACP delegation, debugging |
| worker-deployer | Docker/K8s/Helm/Terraform/Ansible, CI/CD, health checks, rollback |
| worker-reviewer | Git diff, linters, SAST, dependency scan, complexity analysis |
| worker-tester | pytest/vitest/cargo test, E2E, performance (ab/wrk/k6), mutation |

## Tool Installation Verification

After enrichment, verify all referenced tools are installed. See the
`macos-security-tool-install` skill for the full installation guide and
verification script.

Key macOS installation patterns:
- **Brew**: Clear `~/Library/Caches/Homebrew/downloads/` + set
  `HOMEBREW_BOTTLE_DOMAIN=""` to bypass mirror cache misses
- **Go**: Install to `~/go/bin/` — must add to PATH for non-interactive shells
- **pipx**: Bypass PEP 668 — each tool gets its own venv
- **Ruby gems**: zsteg works with system Ruby 2.6; wpscan/evil-winrm need
  Ruby ≥3.2 → use Docker alternatives
- **Pre-compiled binaries**: feroxbuster from GitHub releases (brew needs Rust)
- **Conda interference**: Use `/usr/bin/gem` or `/opt/homebrew/bin/python3`
  explicitly to bypass conda plugin crashes

## AgentMail as Email Channel

AgentMail (`agently-cli`) provides bidirectional email via QQ Mail API.
It is a **skill-based tool** (loaded on demand), NOT a gateway platform
adapter. Key characteristics:

| Feature | IMAP/SMTP Adapter | AgentMail (agently-cli) |
|---------|-------------------|------------------------|
| Type | Gateway platform channel | Skill-based CLI tool |
| Mechanism | IMAP poll + SMTP send | QQ Mail API (agent.qq.com) |
| Config | EMAIL_* env vars | OAuth via `agently-cli auth login` |
| Stability | IMAP retry risk | API-based, stable |
| Auto-receive | Yes (gateway polls) | Manual `+watch` or cron job |
| Two-phase confirm | No | Yes (ctk_xxx for writes) |

### Current deployment

- Email: `your@email.com`
- CLI: `agently-cli v1.0.11` at `/opt/homebrew/bin/agently-cli`
- Auth: macOS keychain, valid
- Limits: 50 sends/day, 10 req/min, 200 req/hr
- Scopes: mail:read, mail:send, mail:delete, alias:read

### Automated receiving via cron

To auto-process incoming emails, set up a cron job:

```bash
# Cron job: check for new emails every 5 minutes
agently-cli message +watch --msg-format event
# Each new email outputs NDJSON — pipe to a handler script
```

See the `agently-mail` skill for the full command reference, security rules,
and two-phase confirmation workflow.

## Pitfalls

### skill_manage cross_profile limitation

Skills in the `default` profile cannot be patched from `orchestrator` even
with `cross_profile=True`. The flag is recognized but the skill lookup fails.
Workaround: create a new skill in the active profile.

### LLM refusals on tool research

When researching tools via `delegate_task`, the LLM may refuse. Do NOT
rephrase goals to evade the safety filter — refusals are the model
service's responsibility. If a model refuses legitimate research, switch
that profile to a different model via
`hermes config set model.default <alt> --profile <name>`, or do the
research yourself via `terminal` + `gh api` calls.

### Board slug rename cascade

When renaming a board slug (e.g. kanban001 → swarm), the dispatcher may
recreate the old directory. Always: delete residual directories, restart
gateway, verify with `hermes kanban boards list`.

## Related Skills

- **security-team-soul-enrichment** (default profile) — hackingtool integration,
  Burp Suite headless guide, open-source design pattern mapping
- **collaboration-team-soul-enrichment** (default profile) — collaboration
  team command manual categories
- **macos-security-tool-install** (default profile) — 58-tool installation
  guide with verification script
- **soul-operability-quality-bar** (default profile) — quality threshold
  definition and 3-phase audit workflow
- **agently-mail** — AgentMail CLI command reference and security rules
