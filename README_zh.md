# SwarmTeam

> 29-agent Hermes 集群，多看板 Kanban 协作，ACP 集成，Skill 自演进。
> 5 团队 · 29 profile · 5 看板 · 4,678+ skill · 5,662+ SOUL 行

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Profiles](https://img.shields.io/badge/profiles-29-blue.svg)](#团队--profile)
[![Skills](https://img.shields.io/badge/skills-4678+-purple.svg)](#skills)
[![Teams](https://img.shields.io/badge/teams-5-orange.svg)](#团队--profile)

**中文** · [English](README.md)

---

## 概览

SwarmTeam 是基于 [Hermes Agent](https://hermes-agent.nousresearch.com/docs) 构建的多 Agent 系统，特性包括：

- **多看板 Kanban 协作** — 5 个团队各自独立看板，任务跨阶段自动流转
- **ACP 集成** — 全部 29 个 profile 可通过 ACP 协议委托 Claude Code 编码
- **Skill 自演进** — 动态 overlay 权重、经验库、五维评估（源自 JiuwenSwarm Symphony）
- **渗透测试方法论融合** — 10 个攻击 playbook、覆盖率跟踪、发现确认（源自 PentesterFlow）
- **Agent Harness 工程** — 10 条运行时规则、L0-L5 成熟度、7 项循环不变量（源自 agents-best-practices）
- **压力升级引擎** — L0-L4 失败检测、SPINNING/EXPLORING/MIXED 模式识别（源自 tanweai/pua）
- **认知自检** — 执行前 5 原则清单、决策后 8 项偏差清单
- **隐私加固** — Docker 硬隔离、环境变量作用域、PII 脱敏、Secret 脱敏、工作区锁定

## 团队 & Profile

| 团队 | Profile 数 | 职责方向 |
|------|-----------|---------|
| **Swarm** | 9 | 软件开发生命周期（架构师 → 开发 → 测试 → 部署） |
| **Hack** | 6 | 进攻安全（侦察 → 利用 → C2 → 取证 → 审计 → 武器库） |
| **Ops** | 4 | 运维（DevOps、SRE、事件响应、高管摘要） |
| **Product** | 4 | 产品管理（研究员、产品经理、排序师、反馈分析师） |
| **[已移除]** | 6 | 电子设计自动化（AI、IP 核、多物理场、光学、物理、工具链） |

### Swarm 团队（9 profile）

| Profile | 标题 | 角色定位 | SOUL 行数 |
|---------|------|---------|----------|
| orchestrator | Orchestrator | 智能路由 + 认知引擎 | 407 |
| architect | 架构师 (Architect) | 系统设计、技术选型 | 205 |
| project-manager | 项目经理 (Project Manager) | 项目执行协调 | 126 |
| requirement-analyst | 需求分析师 (Requirement Analyst) | 需求分解 | 327 |
| worker-coder | 开发工程师 (Worker-Coder) | 实现者，不是决策者 | 229 |
| worker-deployer | 部署工程师 (Worker-Deployer) | 最后把关者 | 157 |
| worker-researcher | 研究分析工程师 (Worker-Researcher) | 调研者，不是决策者 | 174 |
| worker-reviewer | 代码审查员 (Worker-Reviewer) | 独立把关者 | 167 |
| worker-tester | 测试工程师 (Worker-Tester) | 独立验证者 | 164 |

### Hack 团队（6 profile）

| Profile | 标题 | 角色定位 | SOUL 行数 |
|---------|------|---------|----------|
| hack-recon | 侦察工程师 (Hack-Recon) | 侦察兵，不是突击手 | 163 |
| hack-exploit | 渗透利用工程师 (Hack-Exploit) | 突击手，不是侦察兵 | 174 |
| hack-c2 | C2与后渗透工程师 (Hack-C2) | 红队操作手 | 185 |
| hack-weapons | 武器库工程师 (Hack-Weapons) | 武器专家 | 160 |
| hack-forensics | 数字取证工程师 (Hack-Forensics) | 事故调查员 | 183 |
| hack-auditor | 安全审计工程师 (Hack-Auditor) | 白盒分析师 | 194 |

### Ops 团队（4 profile）

| Profile | 标题 | 角色定位 | SOUL 行数 |
|---------|------|---------|----------|
| ops-devops | DevOps自动化工程师 (DevOps Automator) | 基础设施即代码践行者 | 130 |
| ops-sre | 站点可靠性工程师 (SRE) | 可靠性守护者 | 124 |
| ops-incident-commander | 事件响应指挥官 (Incident Response Commander) | 压力下的锚点 | 169 |
| ops-exec-summary | 高管摘要生成器 (Executive Summary Generator) | 咨询级思考者 | 164 |

### Product 团队（4 profile）

| Profile | 标题 | 角色定位 | SOUL 行数 |
|---------|------|---------|----------|
| product-researcher | 产品研究员 (Product Researcher) | 市场情报专家 | 160 |
| product-manager | 产品经理 (Product Manager) | 产品领导者，不是功能搬运工 | 158 |
| product-prioritizer | 需求排序师 (Sprint Prioritizer) | 优先级裁判 | 167 |
| product-feedback | 反馈分析师 (Feedback Analyst) | 用户之声翻译官 | 158 |

### [已移除] 团队（6 profile）

| Profile | 标题 | 角色定位 | SOUL 行数 |
|---------|------|---------|----------|
| [已移除] | AI+[已移除]工程师 ([已移除]) | AI+[已移除] 实现者 | 252 |
| [已移除] | IP核工程师 ([已移除]) | IP 核实现者 | 248 |
| [已移除] | 多物理场工程师 ([已移除]) | 多物理场实现者 | 257 |
| [已移除] | 光学计算研究员 ([已移除]) | 研究者 + 实现者 | 190 |
| [已移除] | 物理建模工程师 ([已移除]) | 物理建模实现者 | 244 |
| [已移除] | [已移除]工具链工程师 ([已移除]) | 工具链实现者 | 226 |

## Skills

| 类别 | 数量 | 关键 Skill |
|------|------|-----------|
| DevOps | 14 | agent-harness-best-practices, github-profile-distribution, skill-self-evolution-fusion, pentest-methodology-fusion, harness-entropy-management, pua-pressure-engine, pua-methodology-router, cognition-self-check |
| Hack 团队 | 6×646=3876 | 39 个 CLI 工具 + 2 个 Docker 替代方案，10 个攻击 playbook（recon/webvuln/ssrf/ssti/jwt/graphql/race/takeover/supabase/deserialize） |
| Ops 团队 | 4×73=292 | DevOps、SRE、事件响应、高管摘要工具 |
| Product 团队 | 4×73=292 | 产品管理、反馈、排序工具 |
| [已移除] 团队 | 3×68=204 | 多物理场、光学、物理、IP 核、工具链 |
| Orchestrator | 6 | hermes-agent, autonomous-ai-agents, github-code-review, devops, mlops, productivity |

## 核心特性

### 多看板 Kanban

5 个独立看板，支持跨看板任务流转：
- `swarm` 看板：软件开发流水线
- `hack` 看板：进攻安全流水线
- `product` 看板：产品管理流水线
- `ops` 看板：运维流水线
- `[已移除]` 看板：[已移除] 平台开发流水线

### ACP 集成

全部 29 个 profile 均配置了 ACP toolset：
- config.yaml 中 `toolsets: [acp, ...]`
- 已安装 `plugins/acp-client`
- 环境变量中含 `ANTHROPIC_AUTH_TOKEN`（未提交至仓库）
- SOUL.md 顶部强制 ACP 规则块

### 模型分配

| 团队 | 模型 | Provider | Effort | Fallback |
|------|------|----------|--------|----------|
| Swarm / Ops / Product / [已移除]（23 profile） | GLM-5.2 | damoxing | xhigh | glm-5.2 → glm-5.1 → deepseek-v4-flash |
| Hack（6 profile） | k3 | custom:kimicode | max | k3 → glm-5.1 → deepseek-v4-flash |
| 辅助（文本） | GLM-5.2 | damoxing | — | — |
| 辅助（视觉） | k3 | custom:kimicode | — | — |
| 审批 | deepseek-v4-flash | damoxing | — | — |

### 隐私与安全

- Docker 硬隔离：`hermes-terminal-sandbox:latest`（仅挂载 workspace）
- `env_probe=false`、`redact_pii=true`、`redact_secrets=true`
- 工作区锁定 cwd，SOUL.md 三层限制
- MCP 路径使用 `$HOME` 占位符

## 快速开始

```bash
# 1. 克隆本仓库
git clone https://github.com/issac-new/SwarmTeam.git
cd SwarmTeam

# 2. 安装 Hermes Agent
pip install hermes-agent

# 3. 复制 profile
cp -r profiles/* ~/.hermes/profiles/

# 4. 复制共享配置
cp shared/* ~/.hermes/shared/
cp config.yaml ~/.hermes/config.yaml
cp SOUL.md ~/.hermes/SOUL.md

# 5. 配置你的 API 密钥
# 编辑 ~/.hermes/config.yaml 填入你的 provider 凭据

# 6. 启动 Hermes
hermes
```

## 架构

```
~/.hermes/
├── config.yaml              # 全局配置
├── SOUL.md                  # 全局系统提示
├── global_kanban_rules.md   # Kanban 规则
├── profiles/               # 29 个 agent profile
│   ├── orchestrator/       # 智能路由 + 认知引擎
│   ├── _shared/            # 共享规则（loop-engineering-gates, mandatory-acp, mandatory-privacy）
│   ├── swarm/              # 8 个 swarm 团队 profile + orchestrator
│   ├── hack/               # 6 个 hack 团队 profile
│   ├── ops/                # 4 个 ops 团队 profile
│   ├── product/            # 4 个 product 团队 profile
│   └── [已移除]/                 # 6 个 [已移除] 团队 profile
└── shared/                 # Profile 生成脚本
    ├── profiles.yaml        # 主 profile 定义
    └── generate-configs.py  # 配置生成器
```

## 许可证

MIT
