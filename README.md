# SwarmTeam — Hermes Agent Multi-Profile Distribution

> A production-grade multi-agent system built on [Hermes Agent](https://hermes-agent.nousresearch.com).
> **36 profiles** across 9 domain teams (swarm / product / ops / platform / aiteam / pay / data / [已移除] / worker), unified routing via orchestrator, Kanban-based task decomposition with persistent git worktree workspaces.

## Overview / 概览

This repository distributes a multi-agent team configuration for Hermes Agent. Each profile has its own SOUL.md personality, config.yaml, and role-specific rules. The orchestrator is the single entry point for all Gateway messages (Matrix/Weixin/API Server/Email) and routes tasks to specialist profiles via Kanban boards.

**36 profiles** · **9 teams** · **9 Kanban boards** · persistent worktree workspaces

### What changed in this release (v2.0)

- **Profile consolidation**: 8 sub-roles absorbed as skills into primary profiles (architect→worker-coder, prioritizer→product-manager, etc.)
- **New team**: Platform team (skill-miner + ontology-curator) for self-improving skill library
- **ops-eval**: Dedicated workflow evaluation engineer (6-dimension weekly assessment)
- **Workspace persistence**: All kanban tasks default to `workspace_kind="worktree"` — outputs survive task completion on independent git branches

## Profile Roster / Profile 名册

> 本次发布 36 个 profile，横跨 9 个领域团队。[已移除] 家庭团队（7 个）与 hack 安全团队（4 个）因隐私/敏感性不在此仓库。

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

### AI Team (6 profiles) — AI 研究

| Profile | Role |
|---------|------|
| `aiteam-orchestrator` | 领域网关：模型架构/多模态/具身智能路由 |
| `aiteam-architecture` | Transformer/MoE/推理引擎架构调研 |
| `aiteam-multimodal` | 视觉-语言/多模态对齐调研 |
| `aiteam-embodied` | 具身智能/世界模型调研 |
| `aiteam-training` | 训练算法/对齐技术调研 |
| `aiteam-scout` | arXiv/会议前沿侦察 |

### Pay Team (4 profiles) — 支付清算

| Profile | Role |
|---------|------|
| `pay-orchestrator` | 领域网关：支付/清算/结算/对账路由 |
| `pay-infra` | 支付基础设施/核心系统 |
| `pay-clearing` | 清算/对账/差错处理 |
| `pay-fintech` | 跨境支付/合规/风控 |

### Data Team (4 profiles) — 实时数据栈

| Profile | Role |
|---------|------|
| `data-orchestrator` | 领域网关：Flink/Paimon/MinIO 运维路由 |
| `data-infra` | 集群基础设施/容器化 |
| `data-arch` | 数仓架构/数据建模 |
| `data-flink` | Flink 流批处理调优 |

### [已移除] Team (10 profiles) — IC 设计自动化

| Profile | Role |
|---------|------|
| `[已移除]` | [已移除] 算法架构师 |
| `[已移除]` | 器件物理/寄生提取 |
| `[已移除]` | 工艺设计套件 |
| `[已移除]` | 工具链/流程集成 |
| `[已移除]` | 后端/签核/DFM |
| `[已移除]` | 设计验证 |
| `[已移除]` | IP 核集成 |
| `[已移除]` | 封装测试 |
| `[已移除]` | 模拟混合信号 |
| `[已移除]` | AI for [已移除] |

### Domain Gateway Pattern / 领域网关原则

`aiteam` / `pay` / `data` / `[已移除]` 各有独立 orchestrator 作为领域网关，负责领域内子任务分解与路由；跨领域任务由顶层 `orchestrator` 统一调度，禁止跳过领域网关直派下游 worker。

## Architecture / 架构

```
Gateway Messages (Matrix/Weixin/API Server/Email)
    ↓
┌─────────────────────────────────────────────────────┐
│  Orchestrator (顶层路由器 + 分解器)                  │
│  Smart routing: light/medium/heavy by complexity    │
│  workspace_kind="worktree" (persistent git branch)  │
└──────────────────┬──────────────────────────────────┘
                   ↓
   ┌────┬────┬───┬────┬────┬────┬────┬────┬────┐
   swarm  product ops platform aiteam pay  data  [已移除]  worker
   board  board  board  board  board  board board board
   (4)    (2)    (4)   (2)    (6)    (4)  (4)  (10)
```

**9 Kanban Boards**: `swarm` (software), `product` (PM), `ops` (SRE), `platform` (self-improvement), `aiteam` (AI research), `pay` (payment/clearing), `data` (data stack), `[已移除]` (IC design), `worker` (general).

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

# Install all profiles (Windows: install-windows.ps1 / install-windows.bat)
powershell -ExecutionPolicy Bypass -File install-windows.ps1

# Or install a single profile via Hermes native import
hermes profile install profiles/worker-coder --alias -y
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
