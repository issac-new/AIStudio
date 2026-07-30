# SwarmTeam — Hermes Agent 多 Agent Profile 分发仓库

> 基于 [Hermes Agent](https://hermes-agent.nousresearch.com) 的生产级多智能体系统。
> **29 个 profile** 分布在 5 个团队（swarm/hack/product/ops/[已移除]），由 orchestrator 统一路由，基于 Kanban 进行任务分解。

## 概览

本仓库分发完整的 Hermes Agent 多智能体团队配置。每个 profile 有独立的 SOUL.md 人格、config.yaml 配置和角色专属规则。Orchestrator 是所有 Gateway 消息（Matrix/Weixin/API Server/Email）的唯一入口，通过 5 个看板将任务路由到专家 profile。

**29 个 profile** · **5 个团队** · **5 个看板** · **587 个 skills**（orchestrator 范围）

## Profile 名册

### Swarm 团队（9 个 profile）— 软件工程

| Profile | 标题 | 角色定位 | 核心能力 | SOUL 行数 |
|---------|------|---------|---------|----------|
| `orchestrator` | Orchestrator（调度路由器） |  |  | 274 |
| `architect` | 架构师 (Architect) |  | 接收任务** ; 分析需求** ; 设计架构** ; 输出文档**  | 205 |
| `project-manager` | 项目经理 (Project Manager) |  | 接收任务** ; 任务分解** ; 创建任务** ; 设置依赖**  | 126 |
| `requirement-analyst` | 需求分析师 (Requirement Analyst) |  | 接收任务** ; 需求澄清** ; 需求验证** ; 输出文档**  | 327 |
| `worker-coder` | 开发工程师 (Worker-Coder) | 实现者，不是决策者 | > 🚨 **退出协议（最高优先级，真实事故驱动）; >  | 229 |
| `worker-deployer` | 部署工程师 (Worker-Deployer) | 最后把关者 | > 🚨 **退出协议（最高优先级，真实事故驱动）; >  | 157 |
| `worker-researcher` | 研究分析工程师 (Worker-Researcher) | 调研者，不是决策者 | > 🚨 **退出协议（最高优先级，真实事故驱动）; >  | 174 |
| `worker-reviewer` | 代码审查员 (Worker-Reviewer) | 独立把关者 | > 🚨 **退出协议（最高优先级，真实事故驱动）; > ; > ⚠️ **第 5 步不可省 | 167 |
| `worker-tester` | 测试工程师 (Worker-Tester) | 独立验证者 | > 🚨 **退出协议（最高优先级，真实事故驱动）; >  | 164 |

### Hack 团队（6 个 profile）— 网络安全

| Profile | 标题 | 角色定位 | 核心能力 | SOUL 行数 |
|---------|------|---------|---------|----------|
| `hack-auditor` | 安全审计工程师 (Hack-Auditor) | 白盒分析师 | 每个发现附 `file; line` + CWE + 修复代码; 不编造漏洞; 修复可执行 | 194 |
| `hack-c2` | C2与后渗透工程师 (Hack-C2) | 红队操作手 | 严格授权范围; OPSEC 优先; 不破坏数据; ATT&CK 映射 | 185 |
| `hack-exploit` | 渗透利用工程师 (Hack-Exploit) | 突击手，不是侦察兵 | 无授权不测试; 最小影响; 不编造漏洞; task-kind 边界 (借鉴 PentestGPT) | 174 |
| `hack-forensics` | 数字取证与应急响应工程师 (Hack-Forensics) | 事故调查员 | 先保全后分析; 证据链; 不污染证据; 独立验证 | 183 |
| `hack-recon` | 侦察工程师 (Hack-Recon) | 侦察兵，不是突击手 | brew; go install** (完整导入路径); pip; > 📖 **具体操作命令手册** 已外置到 `references/tool-commands.md | 163 |
| `hack-weapons` | 武器库工程师 (Hack-Weapons) | 武器专家 | 钓鱼/DDoS 额外授权; payload 仅用于授权测试; 密码破解范围; 不编造结果 | 160 |

### Product 团队（4 个 profile）— 产品管理

| Profile | 标题 | 角色定位 | 核心能力 | SOUL 行数 |
|---------|------|---------|---------|----------|
| `product-manager` | 产品经理 (Product Manager) | 产品领导者，不是功能搬运工 | 问题定义与机会识别; 从业务目标、用户反馈、市场趋势中识别值得解决的产品问题。写"逆向新闻稿"（Working Backw; 需求规格与优先级; 将问题分解为可执行的需求项（PRD/用户故事/验收标准 | 158 |
| `product-prioritizer` | 需求排序师 (Sprint Prioritizer) | 优先级裁判，不是需求搬运工 | 需求评分与排序; Sprint 容量规划; 依赖关系映射; 取舍决策记录 | 167 |
| `product-researcher` | 产品研究员 (Product Researcher) | 市场情报专家，不是泛泛调研员 | 竞争分析; 市场规模估算; 用户研究综合; 趋势与机会识别 | 160 |
| `product-feedback` | 反馈分析师 (Feedback Analyst) | 用户之声翻译官 | 多渠道反馈收集; 定性编码与分类; NPS 与情感分析; 痛点识别与排序 | 158 |

### Ops 团队（4 个 profile）— 运维与 SRE

| Profile | 标题 | 角色定位 | 核心能力 | SOUL 行数 |
|---------|------|---------|---------|----------|
| `ops-devops` | DevOps自动化工程师 (DevOps Automator) | 基础设施即代码（IaC）践行者 | 基础设施编排; CI/CD 流水线开发; 构建从提交到生产的自动化流水线; 零停机部署 | 205 |
| `ops-exec-summary` | 高管摘要生成器 (Executive Summary Generator) | 咨询级思考者 | 输入消化; 结构化输出; 量化呈现; 每个关键发现配量化数据 | 164 |
| `ops-incident-commander` | 事件响应指挥官 (Incident Response Commander) | 压力下的锚点 | 事故定级（SEV1-SEV4）; 响应协调; 影响消除与恢复; 优先消除用户影响（回滚、扩容、切流、限流），而非找根因 | 243 |
| `ops-sre` | 站点可靠性工程师 (SRE) | 可靠性守护者 | SLO 体系; 可观测性建设; 确保三大支柱; —Metrics（Prometheus/Grafana）、Logs（结构化日志 + 聚合查询）、Tr | 198 |

### [已移除] 团队（6 个 profile）— 电子设计自动化

| Profile | 标题 | 角色定位 | 核心能力 | SOUL 行数 |
|---------|------|---------|---------|----------|
| `[已移除]` | AI+[已移除] 工程师 ([已移除]) | 实现者，不是决策者 | 你的专业领域覆盖 [已移除] 工具链中的 AI+[已移除] 全栈（基于调研报告 §6-7）; Fourier Neural Operator (FNO); DeepONet; Physics-Informed | 358 |
| `[已移除]` | IP 核工程师 ([已移除]) | 实现者，不是决策者 | 你的专业领域覆盖 [已移除] 工具链中的 IP 核设计全栈（基于调研报告 §3.3）; RV32IMC 5 级流水线; 开源参考实现; 指令集扩展 | 337 |
| `[已移除]` | 多物理场工程师 ([已移除]) | 实现者，不是决策者 | 你的专业领域覆盖 [已移除] 工具链中的多物理场全栈（基于调研报告 §3.7+§5）; 电磁 FDTD; 热传导 FEM; 结构力学 FEM | 333 |
| `[已移除]` | 光学计算研究员 ([已移除]) | 实现者 + 研究者双重身份 | 复现 ONE 架构的完整光学前向传播链路; 实现 D²NN 架构; 传播模型; 训练框架 | 260 |
| `[已移除]` | 物理建模工程师 ([已移除]) | 实现者，不是决策者 | 你的专业领域覆盖 [已移除] 工具链中的物理建模全栈; Darcy 流动; Navier-Stokes 方程; Maxwell 方程组 | 322 |
| `[已移除]` | [已移除]工具链工程师 ([已移除]) | 实现者，不是决策者 | > **领域边界 | 323 |

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
  swarm 看板    hack 看板    product/ops/[已移除] 看板
  (9 profile)  (6 profile)  (14 profile)
```

**5 个看板**：`swarm`（软件开发）、`hack`（安全攻防）、`product`（产品管理）、`ops`（运维 SRE）、`[已移除]`（电子设计自动化）。

## 核心特性

- **智能路由**：Gateway 消息按复杂度路由——轻量（≤2 次工具调用）直接执行，中等（3-5 次）轻量留痕，重型（≥6 次）走完整看板流程。
- **Loop Engineering 验证门**：每次 `kanban_complete` 前必须通过验证门（从任务 body 提取验收条件，用工具验证非自述）。
- **ACP 编码委托**：所有编码工作通过 `acp_send(provider="claude")` 委托 Claude Code，worker 不直接写代码。
- **隐私加固**：真实邮箱 → `your@email.com`，用户名路径 → `$HOME`，密钥 → `${ENV_VAR}` 占位符。
- **单一事实源**：Loop Engineering 验证门引用 `_shared/loop-engineering-gates.md`，不在 29 个 profile 中重复。

## 快速开始

```bash
# 克隆（浅克隆 — skills 按 profile 打包）
git clone --depth 5 https://github.com/issac-new/SwarmTeam.git
cd SwarmTeam

# 安装全部 29 个 profile
./install-all.sh

# 或安装单个 profile
cp -r profiles/orchestrator ~/.hermes/profiles/orchestrator
```

## 版本

**v2.3.0** — 2026-07-30 更新

- orchestrator SOUL 补「你是谁」身份定义段 + 命令手册
- 4 个理论规则块瘦身为 `skill_view()` 引用（字符 -29%）
- 修正 §0.5 路由表：四看板 → 五看板（补 [已移除] 看板）
- 9 个 profile 补命令手册（[已移除] 6 + ops 3），覆盖率 100%
- 清理 Matrix token、真实邮箱、用户名路径

详见 [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md)。

## 许可证

个人使用分发。Skills 保留原始许可证（见 `skills/`）。

---

> English documentation: [README.md](README.md)
