# SwarmTeam — Hermes Agent Multi-Profile Distribution

> A production-grade multi-agent system built on [Hermes Agent](https://hermes-agent.nousresearch.com).
> **12 profiles** across 4 teams (swarm / product / ops / platform), unified routing via orchestrator, Kanban-based task decomposition with persistent git worktree workspaces.

## Overview / 概览

This repository distributes a multi-agent team configuration for Hermes Agent. Each profile has its own SOUL.md personality, config.yaml, and role-specific rules. The orchestrator is the single entry point for all Gateway messages (Matrix/Weixin/API Server/Email) and routes tasks to specialist profiles via Kanban boards.

**12 profiles** · **4 teams** · **5 Kanban boards** · persistent worktree workspaces

### What changed in this release (v2.0)

- **Profile consolidation**: 8 sub-roles absorbed as skills into primary profiles (architect→worker-coder, prioritizer→product-manager, etc.)
- **New team**: Platform team (skill-miner + ontology-curator) for self-improving skill library
- **ops-eval**: Dedicated workflow evaluation engineer (6-dimension weekly assessment)
- **Workspace persistence**: All kanban tasks default to `workspace_kind="worktree"` — outputs survive task completion on independent git branches

## Profile Roster / Profile 名册

### Swarm Team (4 profiles) — Software Engineering

| Profile | Title | Role Identity | Core Capabilities | SOUL Lines |
|---------|-------|---------------|-------------------|------------|
| `orchestrator` | Orchestrator（调度路由器） | Router, not executor | Smart routing; task decomposition; worker assignment | 274 |
| `worker-coder` | 开发工程师 (Worker-Coder) | 实现者，不是决策者 | ACP Claude Code delegation; architecture; deployment; code review (absorbed architect/deployer/reviewer) | 220 |
| `worker-researcher` | 研究分析工程师 (Worker-Researcher) | 调研者，不是决策者 | Multi-source research; information synthesis; report writing | 180 |
| `worker-tester` | 测试工程师 (Worker-Tester) | 独立验证者 | Independent verification; test design; quality gates | 153 |

### Product Team (2 profiles) — Product Management

| Profile | Title | Role Identity | Core Capabilities | SOUL Lines |
|---------|-------|---------------|-------------------|------------|
| `product-manager` | 产品经理 (Product Manager) | 产品领导者，不是功能搬运工 | Problem definition; PRD; RICE prioritization; feedback analysis (absorbed prioritizer/feedback) | 143 |
| `product-researcher` | 产品研究员 (Product Researcher) | 市场情报专家，不是泛泛调研员 | Competitive analysis; TAM/SAM/SOM; user research; trend identification | 145 |

### Ops Team (4 profiles) — DevOps & SRE

| Profile | Title | Role Identity | Core Capabilities | SOUL Lines |
|---------|-------|---------------|-------------------|------------|
| `ops-sre` | 站点可靠性工程师 (SRE) | 可靠性守护者 | SLO definition; observability; error budgets; chaos engineering | 142 |
| `ops-incident-commander` | 事件响应指挥官 (Incident Commander) | 压力下的锚点 | Severity classification; response coordination; post-mortem | 184 |
| `ops-devops` | DevOps自动化工程师 (DevOps Automator) | 基础设施即代码践行者 | IaC; CI/CD pipelines; K8s; zero-downtime deploy | 151 |
| `ops-eval` | Agent评估工程师 (Workflow Evaluator) | 工作流度量工程师 | Weekly metrics; 6-dimension assessment; continuous improvement | 205 |

### Platform Team (2 profiles) — Self-Improving System

| Profile | Title | Role Identity | Core Capabilities | SOUL Lines |
|---------|-------|---------------|-------------------|------------|
| `platform-skill-miner` | 平台技能挖掘师 (Skill Miner) | 模式识别者 | Scan completed tasks; pattern clustering; skill extraction | 197 |
| `platform-ontology-curator` | 本体策展师 (Ontology Curator) | 语义层守门人 | ontology.md maintenance; semantic layer evolution; marking propagation | 203 |

## Architecture / 架构

```
Gateway Messages (Matrix/Weixin/API Server/Email)
    ↓
┌─────────────────────────────────────────────────────┐
│  Orchestrator (router + decomposer)                 │
│  Smart routing: light/medium/heavy by complexity    │
│  workspace_kind="worktree" (persistent git branch)  │
└──────────────────┬──────────────────────────────────┘
                   ↓
    ┌──────────┬───┴───────┬──────────┐
    ↓          ↓           ↓          ↓
  swarm     product      ops      platform
  board     board       board     board
  (4 prof)  (2 prof)   (4 prof)  (2 prof)
```

**5 Kanban Boards**: `swarm` (software), `product` (PM), `ops` (SRE), `platform` (self-improvement), `default` (fallback).

## Key Features / 核心特性

- **Smart Routing**: Gateway messages routed by complexity — light (≤2 tools) direct execute, medium (3-5) light tracing, heavy (≥6) full Kanban flow.
- **Persistent Worktree Workspaces**: Every kanban task defaults to `workspace_kind="worktree"` — each task gets its own git branch under `.worktrees/<task-id>/`, outputs persist as commits, multiple tasks run in parallel without file conflicts.
- **Loop Engineering Gates**: Every `kanban_complete` must pass verification gates (acceptance criteria extracted from task body, verified by tools not self-report).
- **ACP Coding Delegation**: All coding work delegated to Claude Code via `acp_send(provider="claude")`. Workers don't write code directly.
- **PII Hardened**: Real emails → `your@email.com`, username paths → `$HOME/`, secrets → `${ENV_VAR}` placeholders.
- **Forward-Deployed Protocol**: Every worker's first step is frontline reconnaissance (read_file + search_files + session_search), not immediate execution.

## Quick Start / 快速开始

```bash
# Clone (shallow — skills are bundled per-profile)
git clone --depth 5 https://github.com/issac-new/SwarmTeam.git
cd SwarmTeam

# Install all profiles
./install-all.sh

# Or install a single profile
cp -r profiles/worker-coder ~/.hermes/profiles/
```

### Prerequisites

- [Hermes Agent](https://hermes-agent.nousresearch.com) installed (`curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`)
- Git repo initialized at `~/hermes-docker-sandbox/workspace/` (worktree base)
- API keys in `~/.hermes/.env` (see `shared/profiles.yaml` for required env vars)

## Shared Configuration / 共享配置

| File | Purpose |
|------|---------|
| `shared/profiles.yaml` | Single source of truth for all profile configs (model, provider, toolsets) |
| `shared/generate-configs.py` | Generates per-profile config.yaml from profiles.yaml |
| `shared/setup-hindsight-banks.py` | Initializes Hindsight memory banks per profile |
| `shared/start-gateway-with-dashboard.sh` | Unified gateway + dashboard launcher |
| `global_kanban_rules.md` | Shared kanban rules (workspace_kind, privacy, worktree mechanism) |
| `config.yaml` | Global Hermes config (gateway, kanban dispatcher, platforms) |

## License

MIT — use freely for your own multi-agent deployments.
