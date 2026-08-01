# SwarmTeam — Hermes Agent Multi-Profile Distribution

> A production-grade multi-agent system built on [Hermes Agent](https://hermes-agent.nousresearch.com).
> **17 profiles** across 3 teams (swarm / product / ops), unified routing via orchestrator, Kanban-based task decomposition.

## Overview / 概览

This repository distributes a multi-agent team configuration for Hermes Agent. Each profile has its own SOUL.md personality, config.yaml, and role-specific rules. The orchestrator is the single entry point for all Gateway messages (Matrix/Weixin/API Server/Email) and routes tasks to specialist profiles via Kanban boards.

**17 profiles** · **3 teams** · **3 Kanban boards** · skills (orchestrator-scoped)

## Profile Roster / Profile 名册

### Swarm Team (9 profiles) — Software Engineering

| Profile | Title | Role Identity | Core Capabilities | SOUL Lines |
|---------|-------|---------------|-------------------|------------|
| `orchestrator` | Orchestrator（调度路由器） |  |  | 274 |
| `architect` | 架构师 (Architect) |  | 接收任务** ; 分析需求** ; 设计架构** ; 输出文档**  | 205 |
| `project-manager` | 项目经理 (Project Manager) |  | 接收任务** ; 任务分解** ; 创建任务** ; 设置依赖**  | 126 |
| `requirement-analyst` | 需求分析师 (Requirement Analyst) |  | 接收任务** ; 需求澄清** ; 需求验证** ; 输出文档**  | 327 |
| `worker-coder` | 开发工程师 (Worker-Coder) | 实现者，不是决策者 | > 🚨 **退出协议（最高优先级，真实事故驱动）; >  | 229 |
| `worker-deployer` | 部署工程师 (Worker-Deployer) | 最后把关者 | > 🚨 **退出协议（最高优先级，真实事故驱动）; >  | 157 |
| `worker-researcher` | 研究分析工程师 (Worker-Researcher) | 调研者，不是决策者 | > 🚨 **退出协议（最高优先级，真实事故驱动）; >  | 174 |
| `worker-reviewer` | 代码审查员 (Worker-Reviewer) | 独立把关者 | > 🚨 **退出协议（最高优先级，真实事故驱动）; > ; > ⚠️ **第 5 步不可省 | 167 |
| `worker-tester` | 测试工程师 (Worker-Tester) | 独立验证者 | > 🚨 **退出协议（最高优先级，真实事故驱动）; >  | 164 |

### Product Team (4 profiles) — Product Management

| Profile | Title | Role Identity | Core Capabilities | SOUL Lines |
|---------|-------|---------------|-------------------|------------|
| `product-manager` | 产品经理 (Product Manager) | 产品领导者，不是功能搬运工 | 问题定义与机会识别; 需求规格与优先级 | 158 |
| `product-prioritizer` | 需求排序师 (Sprint Prioritizer) | 优先级裁判，不是需求搬运工 | 需求评分与排序; Sprint 容量规划; 依赖关系映射; 取舍决策记录 | 167 |
| `product-researcher` | 产品研究员 (Product Researcher) | 市场情报专家，不是泛泛调研员 | 竞争分析; 市场规模估算; 用户研究综合; 趋势与机会识别 | 160 |
| `product-feedback` | 反馈分析师 (Feedback Analyst) | 用户之声翻译官 | 多渠道反馈收集; 定性编码与分类; NPS 与情感分析; 痛点识别与排序 | 158 |

### Ops Team (4 profiles) — DevOps & SRE

| Profile | Title | Role Identity | Core Capabilities | SOUL Lines |
|---------|-------|---------------|-------------------|------------|
| `ops-devops` | DevOps自动化工程师 (DevOps Automator) | 基础设施即代码（IaC）践行者 | 基础设施编排; CI/CD 流水线开发; 构建从提交到生产的自动化流水线; 零停机部署 | 205 |
| `ops-exec-summary` | 高管摘要生成器 (Executive Summary Generator) | 咨询级思考者 | 输入消化; 结构化输出; 量化呈现; 每个关键发现配量化数据 | 164 |
| `ops-incident-commander` | 事件响应指挥官 (Incident Response Commander) | 压力下的锚点 | 事故定级（SEV1-SEV4）; 响应协调; 影响消除与恢复; 优先消除用户影响 | 243 |
| `ops-sre` | 站点可靠性工程师 (SRE) | 可靠性守护者 | SLO 体系; 可观测性建设; 确保三大支柱 (Metrics/Logs/Traces) | 198 |

## Architecture / 架构

```
Gateway Messages (Matrix/Weixin/API Server/Email)
    ↓
┌─────────────────────────────────────────────────┐
│  Orchestrator (router + decomposer)             │
│  Smart routing: light/medium/heavy by complexity│
└──────────────────┬──────────────────────────────┘
                   ↓
    ┌──────────────┼──────────────┐
    ↓              ↓              ↓
  swarm board  product board   ops board
  (9 profiles) (4 profiles)  (4 profiles)
```

**3 Kanban Boards**: `swarm` (software), `product` (PM), `ops` (SRE).

## Key Features / 核心特性

- **Smart Routing**: Gateway messages routed by complexity — light (≤2 tools) direct execute, medium (3-5) light tracing, heavy (≥6) full Kanban flow.
- **Loop Engineering Gates**: Every `kanban_complete` must pass verification gates (acceptance criteria extracted from task body, verified by tools not self-report).
- **ACP Coding Delegation**: All coding work delegated to Claude Code via `acp_send(provider="claude")`. Workers don't write code directly.
- **PII Hardened**: Real emails → `your@email.com`, username paths → `$HOME`, secrets → `${ENV_VAR}` placeholders.
- **Single Source of Truth**: Loop Engineering gates referenced from `_shared/loop-engineering-gates.md`, not duplicated across profiles.

## Quick Start / 快速开始

```bash
# Clone (shallow — skills are bundled per-profile)
git clone --depth 5 https://github.com/issac-new/SwarmTeam.git
cd SwarmTeam

# Install all profiles
./install-all.sh

# Or install a single profile
cp -r profiles/orchestrator ~/.hermes/profiles/orchestrator
```

## Version / 版本

**v2.4.0** — Updated 2026-08-01

- Removed hack team (6 profiles), [已移除] team (6 profiles) from public distribution
- Purged all forbidden team history via git-filter-repo
- Updated README, install-all.sh, shared/profiles.yaml to reflect 3-team / 17-profile structure
- Sanitized Matrix token, real emails, username paths

See [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md) for upgrade details.

## License / 许可证

Personal use distribution. Skills retain their original licenses (see `skills/`).

---

> 中文文档见 [README_zh.md](README_zh.md)
