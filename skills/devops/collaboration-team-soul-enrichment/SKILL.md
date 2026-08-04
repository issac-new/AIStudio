---
name: collaboration-team-soul-enrichment
description: >-
  Enrich collaboration-board agent SOUL.md files (architect, PM, requirement-analyst,
  worker-coder, worker-deployer, worker-reviewer, worker-tester) with concrete
  command manuals. Covers the operability gap discovered when the same quality-bar
  audit applied to hack agents was extended to collaboration agents, the different
  command categories needed (software-engineering toolchains vs security tools),
  and the parallel delegate_task batching pattern. Complements agent-soul-patching
  and soul-operability-quality-bar.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, collaboration-team, operability, command-manual]
    related_skills:
      - agent-soul-patching
      - soul-operability-quality-bar
      - multi-board-team-deployment
---

# Collaboration Team SOUL.md Enrichment

The same operability problem found in hack team agents (78% pure description,
0% executable commands) exists in collaboration-board agents. This skill
covers the audit and fix for collaboration agents.

## When to Use

- After enriching hack team SOUL.md files, run the same audit on collaboration agents
- When collaboration agents produce vague outputs because their SOUL.md lacks commands
- When setting up a new collaboration team or adding new worker profiles
- After creating new agent profiles that ship with generic SOUL.md templates

## The Problem

Collaboration agents (architect, PM, requirement-analyst, worker-coder,
worker-deployer, worker-researcher, worker-reviewer, worker-tester) typically
ship with role-description-only SOUL.md files. Quantitative analysis shows:

| Metric | Before enrichment |
|--------|------------------|
| Average pure description | 98% |
| Average command lines | <5 |
| Agents with command manual | 0 of 9 |

## Command Categories by Agent

Unlike hack agents (which need security tools like nmap/sqlmap/hashcat),
collaboration agents need software-engineering toolchains:

### architect
- Architecture diagrams: mermaid (sequenceDiagram/classDiagram/flowchart), plantuml, ditaa
- Codebase analysis: cloc, pygount, tree, wc
- Dependency analysis: pipdeptree, npm ls, go mod graph, cargo tree
- API design: openapi-generator-cli, redocly, swagger-codegen
- ADR: adr init, adr new

### project-manager
- Kanban task management: kanban_create(title, assignee, parents), kanban_link, kanban_list
- Task decomposition patterns: by module, by layer, by feature
- Progress monitoring: kanban_list(status='running'), kanban_heartbeat
- Dependency graph: kanban_show for parent/child relationships
- Timeline: mermaid gantt from kanban task data

### requirement-analyst
- Document template: background/scope/user-stories/acceptance-criteria/constraints
- User story format: "As a <role>, I want <feature>, so that <benefit>"
- BDD acceptance criteria: Given/When/Then
- Requirement mining: grep -r 'TODO|FIXME|HACK', git log --grep='feature'
- Validation: markdownlint, marksnap

### worker-coder
- Git workflow: git clone/branch/commit/push, gh pr create/review/merge
- Python: pytest -v --cov, ruff check/format, mypy, pip install -e .
- Node.js: npm install/test/build, npx tsc --noEmit, eslint, prettier
- Rust: cargo build/test/clippy/fmt
- Go: go build/test/vet, golangci-lint
- ACP delegation: hermes acp send --agent claude-code
- Debugging: python -m pdb, python -m debugpy, node --inspect

### worker-deployer
- Docker: build/run/compose/exec/push, docker scout cves
- Kubernetes: kubectl get/apply/logs/exec/port-forward, helm install/upgrade/rollback
- Terraform: init/plan/apply/destroy, validate, fmt, state list
- Ansible: ansible-playbook --check, ansible-inventory
- CI/CD: gh workflow run, gh run list/watch/download
- Health checks: curl -sf /health, kubectl get events
- Rollback: kubectl rollout undo, helm rollback

### worker-reviewer
- Git review: git diff HEAD~1, git show, gh pr diff/view
- Linters: ruff, eslint, golangci-lint, shellcheck, mypy --strict
- SAST: semgrep --config=auto, bandit -r, gosec
- Dependency scan: pip-audit, npm audit, trivy fs, osv-scanner
- Complexity: radon cc/mi, lizard

### worker-tester
- Python: pytest -v --cov --cov-report=html, pytest -x -k, pytest -n auto
- Node.js: npm test --coverage, vitest, jest, playwright, cypress
- Go: go test -v -race -cover, go test -bench
- Rust: cargo test --nocapture, cargo tarpaulin
- E2E: docker compose up --wait, newman, k6
- Performance: ab, wrk, hey

## Agents to Skip

- **orchestrator**: Pure router, doesn't execute implementation work
- **worker-researcher**: Overlaps with hack-recon (research tools already documented there)

## Enrichment Pattern

1. **Audit**: Run quantitative check (same as hack team, but with extended cmd_patterns)
2. **Batch dispatch**: 3 parallel delegate_task subagents, each handling 2-3 agents
3. **Append**: Each agent gets `## 具体操作命令手册` section at end of SOUL.md
4. **Verify**: Re-run quantitative check, confirm command ratio >25%

## Extended cmd_patterns for Collaboration Agents

```python
collab_cmd_patterns = [
    'git ', 'gh ', 'npm ', 'npx ', 'pnpm ', 'yarn ', 'cargo ', 'go ',
    'pip ', 'python', 'pytest', 'jest', 'vitest', 'docker ', 'kubectl ',
    'helm ', 'terraform ', 'ansible', 'make ', 'cmake ', 'ruff', 'mypy',
    'eslint', 'prettier', 'shellcheck', 'semgrep', 'trivy',
]
```

## Typical Results

After enrichment (2026-07 session):

| Agent | Before | After | Delta | Code blocks |
|-------|--------|-------|-------|-------------|
| architect | 42 | 218 | +176 | 7 |
| project-manager | 80 | 215 | +135 | 8 |
| requirement-analyst | 40 | 141 | +101 | 2 |
| worker-coder | 205 | 348 | +143 | 11 |
| worker-deployer | 138 | 286 | +148 | 9 |
| worker-reviewer | 148 | 253 | +105 | 7 |
| worker-tester | 144 | 260 | +116 | 8 |
| **Total** | **797** | **1,721** | **+924** | **52** |

## Related Skills

- **agent-soul-patching** (default) — batch patch techniques for SOUL.md files
- **soul-operability-quality-bar** (orchestrator) — quality threshold definition
- **multi-board-team-deployment** — multi-board architecture and team creation
