# SwarmTeam — Hermes Agent 多 Agent Profile 分发仓库

> 基于 [Hermes Agent](https://hermes-agent.nousresearch.com) 的生产级多智能体系统。
> **17 个 profile** 分布在 3 个团队（swarm/product/ops），由 orchestrator 统一路由，基于 Kanban 进行任务分解。

## 概览

本仓库分发 Hermes Agent 多智能体团队配置。每个 profile 有独立的 SOUL.md 人格、config.yaml 配置和角色专属规则。Orchestrator 是所有 Gateway 消息（Matrix/Weixin/API Server/Email）的唯一入口，通过看板将任务路由到专家 profile。

**17 个 profile** · **3 个团队** · **3 个看板** · skills（orchestrator 范围）

## Profile 名册

### Swarm 团队（9 个 profile）— 软件工程

| Profile | 标题 | 角色定位 | 核心能力 | SOUL 行数 |
|---------|------|---------|---------|----------|
| `orchestrator` | Orchestrator（调度路由器） |  |  | 274 |
| `architect` | 架构师 (Architect) |  | 接收任务; 分析需求; 设计架构; 输出文档 | 205 |
| `project-manager` | 项目经理 (Project Manager) |  | 接收任务; 任务分解; 创建任务; 设置依赖 | 126 |
| `requirement-analyst` | 需求分析师 (Requirement Analyst) |  | 接收任务; 需求澄清; 需求验证; 输出文档 | 327 |
| `worker-coder` | 开发工程师 (Worker-Coder) | 实现者，不是决策者 | 退出协议（最高优先级） | 229 |
| `worker-deployer` | 部署工程师 (Worker-Deployer) | 最后把关者 | 退出协议（最高优先级） | 157 |
| `worker-researcher` | 研究分析工程师 (Worker-Researcher) | 调研者，不是决策者 | 退出协议（最高优先级） | 174 |
| `worker-reviewer` | 代码审查员 (Worker-Reviewer) | 独立把关者 | 退出协议（最高优先级） | 167 |
| `worker-tester` | 测试工程师 (Worker-Tester) | 独立验证者 | 退出协议（最高优先级） | 164 |

### Product 团队（4 个 profile）— 产品管理

| Profile | 标题 | 角色定位 | 核心能力 | SOUL 行数 |
|---------|------|---------|---------|----------|
| `product-manager` | 产品经理 (Product Manager) | 产品领导者，不是功能搬运工 | 问题定义与机会识别; 需求规格与优先级 | 158 |
| `product-prioritizer` | 需求排序师 (Sprint Prioritizer) | 优先级裁判，不是需求搬运工 | 需求评分与排序; Sprint 容量规划; 依赖关系映射; 取舍决策记录 | 167 |
| `product-researcher` | 产品研究员 (Product Researcher) | 市场情报专家，不是泛泛调研员 | 竞争分析; 市场规模估算; 用户研究综合; 趋势与机会识别 | 160 |
| `product-feedback` | 反馈分析师 (Feedback Analyst) | 用户之声翻译官 | 多渠道反馈收集; 定性编码与分类; NPS 与情感分析; 痛点识别与排序 | 158 |

### Ops 团队（4 个 profile）— 运维与 SRE

| Profile | 标题 | 角色定位 | 核心能力 | SOUL 行数 |
|---------|------|---------|---------|----------|
| `ops-devops` | DevOps自动化工程师 (DevOps Automator) | 基础设施即代码（IaC）践行者 | 基础设施编排; CI/CD 流水线开发; 零停机部署 | 205 |
| `ops-exec-summary` | 高管摘要生成器 (Executive Summary Generator) | 咨询级思考者 | 输入消化; 结构化输出; 量化呈现; 每个关键发现配量化数据 | 164 |
| `ops-incident-commander` | 事件响应指挥官 (Incident Response Commander) | 压力下的锚点 | 事故定级（SEV1-SEV4）; 响应协调; 影响消除与恢复 | 243 |
| `ops-sre` | 站点可靠性工程师 (SRE) | 可靠性守护者 | SLO 体系; 可观测性建设; 确保三大支柱 (Metrics/Logs/Traces) | 198 |

## 架构

```
Gateway 消息 (Matrix/Weixin/API Server/Email)
    ↓
┌─────────────────────────────────────────────────┐
│  Orchestrator（路由器 + 分解器）                  │
│  智能路由：按复杂度轻/中/重三级判定               │
└──────────────────┬──────────────────────────────┘
                   ↓
    ┌──────────────┼──────────────┐
    ↓              ↓              ↓
  swarm 看板   product 看板     ops 看板
  (9 profile)  (4 profile)   (4 profile)
```

**3 个看板**：`swarm`（软件开发）、`product`（产品管理）、`ops`（运维 SRE）。

## 核心特性

- **智能路由**：Gateway 消息按复杂度路由——轻量（≤2 次工具调用）直接执行，中等（3-5 次）轻量留痕，重型（≥6 次）走完整看板流程。
- **Loop Engineering 验证门**：每次 `kanban_complete` 前必须通过验证门（从任务 body 提取验收条件，用工具验证非自述）。
- **ACP 编码委托**：所有编码工作通过 `acp_send(provider="claude")` 委托 Claude Code，worker 不直接写代码。
- **隐私加固**：真实邮箱 → `your@email.com`，用户名路径 → `$HOME`，密钥 → `${ENV_VAR}` 占位符。
- **单一事实源**：Loop Engineering 验证门引用 `_shared/loop-engineering-gates.md`，不在 profile 中重复。

## 快速开始

```bash
# 克隆（浅克隆 — skills 按 profile 打包）
git clone --depth 5 https://github.com/issac-new/SwarmTeam.git
cd SwarmTeam

# 安装全部 profile
./install-all.sh

# 或安装单个 profile
cp -r profiles/orchestrator ~/.hermes/profiles/orchestrator
```

## 版本

**v2.4.0** — 2026-08-01 更新

- 移除 hack 团队（6 个 profile）、[已移除] 团队（6 个 profile）的公开分发
- 通过 git-filter-repo 彻底清除禁止发布团队的全部 git 历史
- 更新 README、install-all.sh、shared/profiles.yaml 为 3 团队 / 17 profile 结构
- 清理 Matrix token、真实邮箱、用户名路径

详见 [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md)。

## 许可证

个人使用分发。Skills 保留原始许可证（见 `skills/`）。

---

> English documentation: [README.md](README.md)
