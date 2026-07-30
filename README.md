# SwarmTeam

> 29-agent Hermes cluster with multi-board Kanban collaboration, ACP integration, and skill self-evolution.
> 5 teams · 29 profiles · 5 Kanban boards · 4678+ skills · 5662+ SOUL lines

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Profiles](https://img.shields.io/badge/profiles-29-blue.svg)](#teams--profiles)
[![Skills](https://img.shields.io/badge/skills-4678+-purple.svg)](#skills)
[![Teams](https://img.shields.io/badge/teams-5-orange.svg)](#teams--profiles)

[中文文档](README_zh.md) · **English**

---

## Overview

SwarmTeam is a multi-agent system built on [Hermes Agent](https://hermes-agent.nousresearch.com/docs), featuring:

- **Multi-board Kanban collaboration** — 5 teams with independent boards, tasks auto-flow across stages
- **ACP integration** — All 29 profiles can delegate coding to Claude Code via ACP protocol
- **Skill self-evolution** — Dynamic overlay weights, experience bank, 5D evaluation (from JiuwenSwarm Symphony)
- **Pentest methodology fusion** — 10 attack playbooks, coverage tracking, finding confirmation (from PentesterFlow)
- **Agent Harness engineering** — 10 runtime rules, L0-L5 maturity, 7 loop invariants (from agents-best-practices)
- **Pressure escalation engine** — L0-L4 failure detection, SPINNING/EXPLORING/MIXED patterns (from tanweai/pua)
- **Cognitive self-check** — 5-principle pre-execution checklist, 8-bias post-decision checklist
- **Privacy hardening** — Docker isolation, env scoping, PII redaction, secret redaction, workspace locking

## Teams & Profiles

| Team | Profiles | Focus |
|------|----------|-------|
| **Swarm** | 9 | Software development lifecycle (architect → coder → tester → deployer) |
| **Hack** | 6 | Offensive security (recon → exploit → C2 → forensics → audit → weapons) |
| **Ops** | 4 | Operations (DevOps, SRE, incident response, executive summary) |
| **Product** | 4 | Product management (researcher, manager, prioritizer, feedback) |
| **[已移除]** | 6 | Electronic Design Automation (AI, IP core, multiphysics, optics, physics, toolchain) |

### Swarm Team (9 profiles)

| Profile | Title | Role Identity | SOUL Lines |
|---------|-------|---------------|------------|
| orchestrator | Orchestrator | Smart router + cognitive engine | 407 |
| architect | Architect (架构师) | System design, tech selection | 205 |
| project-manager | Project Manager (项目经理) | Project execution coordinator | 126 |
| requirement-analyst | Requirement Analyst (需求分析师) | Requirement decomposition | 327 |
| worker-coder | Worker-Coder (开发工程师) | Implementer, not decision-maker | 229 |
| worker-deployer | Worker-Deployer (部署工程师) | Final gatekeeper | 157 |
| worker-researcher | Worker-Researcher (研究分析工程师) | Researcher, not decision-maker | 174 |
| worker-reviewer | Worker-Reviewer (代码审查员) | Independent reviewer | 167 |
| worker-tester | Worker-Tester (测试工程师) | Independent verifier | 164 |

### Hack Team (6 profiles)

| Profile | Title | Role Identity | SOUL Lines |
|---------|-------|---------------|------------|
| hack-recon | Hack-Recon (侦察工程师) | Scout, not attacker | 163 |
| hack-exploit | Hack-Exploit (渗透利用工程师) | Attacker, not scout | 174 |
| hack-c2 | Hack-C2 (C2与后渗透工程师) | Red team operator | 185 |
| hack-weapons | Hack-Weapons (武器库工程师) | Weapons specialist | 160 |
| hack-forensics | Hack-Forensics (数字取证工程师) | Incident investigator | 183 |
| hack-auditor | Hack-Auditor (安全审计工程师) | White-box analyst | 194 |

### Ops Team (4 profiles)

| Profile | Title | Role Identity | SOUL Lines |
|---------|-------|---------------|------------|
| ops-devops | DevOps Automator (DevOps自动化工程师) | IaC practitioner | 130 |
| ops-sre | SRE (站点可靠性工程师) | Reliability guardian | 124 |
| ops-incident-commander | Incident Response Commander (事件响应指挥官) | Anchor under pressure | 169 |
| ops-exec-summary | Executive Summary Generator (高管摘要生成器) | Consulting-level thinker | 164 |

### Product Team (4 profiles)

| Profile | Title | Role Identity | SOUL Lines |
|---------|-------|---------------|------------|
| product-researcher | Product Researcher (产品研究员) | Market intelligence expert | 160 |
| product-manager | Product Manager (产品经理) | Product leader, not feature porter | 158 |
| product-prioritizer | Sprint Prioritizer (需求排序师) | Priority judge | 167 |
| product-feedback | Feedback Analyst (反馈分析师) | Voice-of-user translator | 158 |

### [已移除] Team (6 profiles)

| Profile | Title | Role Identity | SOUL Lines |
|---------|-------|---------------|------------|
| [已移除] | [已移除] (AI+[已移除]工程师) | AI+[已移除] implementer | 252 |
| [已移除] | [已移除] (IP核工程师) | IP core implementer | 248 |
| [已移除] | [已移除] (多物理场工程师) | Multiphysics implementer | 257 |
| [已移除] | [已移除] (光学计算研究员) | Researcher + implementer | 190 |
| [已移除] | [已移除] (物理建模工程师) | Physics modeler | 244 |
| [已移除] | [已移除] ([已移除]工具链工程师) | Toolchain implementer | 226 |

## Skills

| Category | Count | Key Skills |
|----------|-------|------------|
| DevOps | 14 | agent-harness-best-practices, github-profile-distribution, skill-self-evolution-fusion, pentest-methodology-fusion, harness-entropy-management, pua-pressure-engine, pua-methodology-router, cognition-self-check |
| Hack Team | 6×646=3876 | 39 CLI tools + 2 Docker alternatives, 10 attack playbooks (recon/webvuln/ssrf/ssti/jwt/graphql/race/takeover/supabase/deserialize) |
| Ops Team | 4×73=292 | DevOps, SRE, incident response, executive summary tools |
| Product Team | 4×73=292 | Product management, feedback, prioritization tools |
| [已移除] Team | 3×68+3×0=204 | Multiphysics, optics, physics, IP core, toolchain |
| Orchestrator | 6 | hermes-agent, autonomous-ai-agents, github-code-review, devops, mlops, productivity |

## Key Features

### Multi-Board Kanban

5 independent boards with cross-board task flow:
- `swarm` board: software development pipeline
- `hack` board: offensive security pipeline
- `product` board: product management pipeline
- `ops` board: operations pipeline
- `[已移除]` board: [已移除] platform development pipeline

### ACP Integration

All 29 profiles have ACP toolset configured:
- `toolsets: [acp, ...]` in config.yaml
- `plugins/acp-client` installed
- `ANTHROPIC_AUTH_TOKEN` in env (not committed)
- Mandatory ACP rule block at SOUL.md top

### Model Allocation

| Team | Model | Provider | Effort | Fallback |
|------|-------|----------|--------|----------|
| Swarm / Ops / Product / [已移除] (23 profiles) | GLM-5.2 | damoxing | xhigh | glm-5.2 → glm-5.1 → deepseek-v4-flash |
| Hack (6 profiles) | k3 | custom:kimicode | max | k3 → glm-5.1 → deepseek-v4-flash |
| Auxiliary (text) | GLM-5.2 | damoxing | — | — |
| Auxiliary (vision) | k3 | custom:kimicode | — | — |
| Approval | deepseek-v4-flash | damoxing | — | — |

### Privacy & Security

- Docker hard isolation: `hermes-terminal-sandbox:latest` (workspace-only mount)
- `env_probe=false`, `redact_pii=true`, `redact_secrets=true`
- Workspace-locked cwd, SOUL.md three-layer restriction
- MCP paths use `$HOME` placeholder

## Quick Start

```bash
# 1. Clone this repo
git clone https://github.com/issac-new/SwarmTeam.git
cd SwarmTeam

# 2. Install Hermes Agent
pip install hermes-agent

# 3. Copy profiles
cp -r profiles/* ~/.hermes/profiles/

# 4. Copy shared config
cp shared/* ~/.hermes/shared/
cp config.yaml ~/.hermes/config.yaml
cp SOUL.md ~/.hermes/SOUL.md

# 5. Configure your API keys
# Edit ~/.hermes/config.yaml with your provider credentials

# 6. Start Hermes
hermes
```

## Architecture

```
~/.hermes/
├── config.yaml              # Global config
├── SOUL.md                  # Global system prompt
├── global_kanban_rules.md   # Kanban rules
├── profiles/               # 29 agent profiles
│   ├── orchestrator/       # Smart router + cognitive engine
│   ├── _shared/            # Shared rules (loop-engineering-gates, mandatory-acp, mandatory-privacy)
│   ├── swarm/              # 8 swarm team profiles + orchestrator
│   ├── hack/               # 6 hack team profiles
│   ├── ops/                # 4 ops team profiles
│   ├── product/            # 4 product team profiles
│   └── [已移除]/                 # 6 [已移除] team profiles
└── shared/                 # Profile generation scripts
    ├── profiles.yaml        # Master profile definitions
    └── generate-configs.py  # Config generator
```

## License

MIT
