# SwarmTeam

> 29-agent Hermes 集群，多看板 Kanban 协作，ACP 集成，Skill 自演进。
> 5 团队 · 29 profile · 5 看板 · 4,683+ skill · 5,666+ SOUL 行

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Profiles](https://img.shields.io/badge/profiles-29-blue.svg)](#团队--profile)
[![Skills](https://img.shields.io/badge/skills-4683+-purple.svg)](#skills)
[![Teams](https://img.shields.io/badge/teams-5-orange.svg)](#团队--profile)

[English](README.md) · **中文**

---

## 概览

SwarmTeam 是基于 [Hermes Agent](https://hermes-agent.nousresearch.com/docs) 的多智能体系统，特色：

- **多看板 Kanban 协作** — 5 个团队独立看板，任务跨阶段自动流转
- **ACP 集成** — 全部 29 个 profile 可通过 ACP 协议委托 Claude Code 编码
- **Skill 自演进** — 动态 overlay 权重、经验库、五维评估（融合 JiuwenSwarm Symphony）
- **渗透方法论融合** — 10 个攻击 playbook、coverage tracking、finding confirmation（融合 PentesterFlow）
- **Agent Harness 工程** — 10 条运行时规则、L0-L5 成熟度、7 条循环不变量（融合 agents-best-practices）
- **压力升级引擎** — L0-L4 失败检测、SPINNING/EXPLORING/MIXED 模式（融合 tanweai/pua）
- **认知自检** — 5 原则执行前检查、8 偏差决策后检查
- **隐私保护** — Docker 硬隔离、env 作用域、PII 脱敏、secret 脱敏、workspace 锁定

## 团队 & Profile

| 团队 | Profile 数 | 定位 |
|------|-----------|------|
| **Swarm** | 9 | 软件开发生命周期（架构 → 编码 → 测试 → 部署） |
| **Hack** | 6 | 攻击性安全（侦察 → 利用 → C2 → 取证 → 审计 → 武器） |
| **Ops** | 4 | 运维（DevOps、SRE、事件响应、高管摘要） |
| **Product** | 4 | 产品管理（研究员、产品经理、排序师、反馈分析师） |
| **[已移除]** | 6 | 电子设计自动化（AI、IP核、多物理场、光学、物理、工具链） |

### Swarm 团队（9 profile）

| Profile | 标题 | 角色定位 | SOUL 行数 |
|---------|------|---------|----------|
| orchestrator | Orchestrator | 智能任务路由 + 认知引擎 | 333 |
| architect | 架构师 | 系统设计，技术选型 | 205 |
| project-manager | 项目经理 | 项目执行协调 | 126 |
| requirement-analyst | 需求分析师 | 需求分解 | 327 |
| worker-coder | 开发工程师 | 实现者，不是决策者 | 229 |
| worker-deployer | 部署工程师 | 最后把关者 | 157 |
| worker-researcher | 研究分析工程师 | 调研者，不是决策者 | 174 |
| worker-reviewer | 代码审查员 | 独立把关者 | 167 |
| worker-tester | 测试工程师 | 独立验证者 | 164 |

### Hack 团队（6 profile）

| Profile | 标题 | 角色定位 | SOUL 行数 |
|---------|------|---------|----------|
| hack-recon | 侦察工程师 | 侦察兵，不是突击手 | 176 |
| hack-exploit | 渗透利用工程师 | 突击手，不是侦察兵 | 187 |
| hack-c2 | C2与后渗透工程师 | 红队操作手 | 198 |
| hack-forensics | 数字取证工程师 | 事故调查员 | 196 |
| hack-auditor | 安全审计工程师 | 白盒分析师 | 207 |
| hack-weapons | 武器库工程师 | 武器专家 | 173 |

### Ops 团队（4 profile）

| Profile | 标题 | 角色定位 | SOUL 行数 |
|---------|------|---------|----------|
| ops-devops | DevOps自动化工程师 | IaC 践行者 | 130 |
| ops-sre | SRE | 可靠性守护者 | 124 |
| ops-incident-commander | 事件响应指挥官 | 压力下的锚点 | 169 |
| ops-exec-summary | 高管摘要生成器 | 咨询级思考者 | 164 |

### Product 团队（4 profile）

| Profile | 标题 | 角色定位 | SOUL 行数 |
|---------|------|---------|----------|
| product-researcher | 产品研究员 | 市场情报专家 | 160 |
| product-manager | 产品经理 | 产品领导者，不是功能搬运工 | 158 |
| product-prioritizer | 需求排序师 | 优先级裁判 | 167 |
| product-feedback | 反馈分析师 | 用户之声翻译官 | 158 |

### [已移除] 团队（6 profile）

| Profile | 标题 | 角色定位 | SOUL 行数 |
|---------|------|---------|----------|
| [已移除] | AI+[已移除]工程师 | AI+[已移除] 实现者 | 252 |
| [已移除] | IP核工程师 | IP 核实现者 | 248 |
| [已移除] | 多物理场工程师 | 多物理场实现者 | 257 |
| [已移除] | 光学计算研究员 | 研究者 + 实现者 | 190 |
| [已移除] | 物理建模工程师 | 物理建模 | 244 |
| [已移除] | [已移除]工具链工程师 | 工具链实现者 | 226 |

## Skills

| 类别 | 数量 | 关键 Skill |
|------|------|-----------|
| DevOps | 14 | agent-harness-best-practices, github-profile-distribution, skill-self-evolution-fusion, pentest-methodology-fusion, harness-entropy-management, pua-pressure-engine, pua-methodology-router, cognition-self-check |
| Hack 团队 | 6×645=3870 | 39 CLI 工具 + 2 Docker 替代，10 个攻击 playbook（recon/webvuln/ssrf/ssti/jwt/graphql/race/takeover/supabase/deserialize） |
| Ops 团队 | 4×74=296 | DevOps、SRE、事件响应、高管摘要工具 |
| Product 团队 | 4×74=296 | 产品管理、反馈、排序工具 |
| [已移除] 团队 | 6×~35=207 | 多物理场、光学、物理、IP核、工具链 |

## 核心特性

### 多看板 Kanban

5 个独立看板，跨看板任务流转：
- `swarm` 看板：软件开发流水线
- `hack` 看板：攻击性安全流水线
- `product` 看板：产品管理流水线
- `ops` 看板：运维流水线
- `[已移除]` 看板：[已移除] 平台开发流水线

### ACP 集成

全部 29 个 profile 已配置 ACP toolset：
- `toolsets: [acp, ...]` 在 config.yaml
- `plugins/acp-client` 已安装
- `ANTHROPIC_AUTH_TOKEN` 在 env 中（不提交）
- SOUL.md 顶部强制 ACP 规则块

### 模型分配

全 29 个 profile 统一 **GLM-5.2**（effort: max）：
- Fallback 链：glm-5.2 → glm-5.1 → deepseek-v4-flash
- Auxiliary：GLM-5.2（文本），k3（仅 vision）
- Approval：deepseek-v4-flash

### 隐私与安全

- Docker 硬隔离：`hermes-terminal-sandbox:latest`（仅挂载 workspace）
- `env_probe=false`、`redact_pii=true`、`redact_secrets=true`
- workspace 锁定 cwd，SOUL.md 三层限制
- MCP 路径使用 `${HOME}` 占位符

## 快速开始

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

## 架构

```
~/.hermes/
├── config.yaml              # 全局配置
├── SOUL.md                  # 全局系统提示
├── global_kanban_rules.md   # Kanban 规则
├── profiles/               # 29 个 agent profile
│   ├── orchestrator/       # 智能路由 + 认知引擎
│   ├── _shared/            # 共享规则 (loop-engineering-gates, mandatory-acp, mandatory-privacy)
│   ├── swarm/              # 8 个 swarm 团队 profile + orchestrator
│   ├── hack/               # 6 个 hack 团队 profile
│   ├── ops/                # 4 个 ops 团队 profile
│   ├── product/            # 4 个 product 团队 profile
│   └── [已移除]/                 # 6 个 [已移除] 团队 profile
└── shared/                 # Profile 生成脚本
    ├── profiles.yaml        # 主 profile 定义
    └── generate-configs.py  # 配置生成器
```

## License

MIT
