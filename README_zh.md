# SwarmTeam — Hermes Agent 多 Agent Profile 分发仓库

> 基于 [Hermes Agent](https://hermes-agent.nousresearch.com) 的生产级多智能体系统。
> **41 个 profile** 分布在 10 个团队（swarm/product/ops/platform/aiteam/pay/data/[已移除]/hack/worker），由 orchestrator 统一路由，基于 Kanban 进行任务分解。

## 概览

本仓库分发 Hermes Agent 多智能体团队配置。每个 profile 有独立的 SOUL.md 人格、config.yaml 配置和角色专属规则。Orchestrator 是所有 Gateway 消息（Matrix/Weixin/API Server/Email）的唯一入口，通过看板将任务路由到专家 profile。

**41 个 profile** · **10 个团队** · **10 个看板** · 全量 skills + 六层 _shared 共享规则

## Profile 名册

### Swarm 团队（4 个 profile）— 软件工程

| Profile | 角色 |
|---------|------|
| `orchestrator` | 顶层调度路由器（轻/中/重三级路由） |
| `worker-coder` | 编码实现 |
| `worker-researcher` | 调研分析 |
| `worker-tester` | 独立验证 |

### Product 团队（2 个 profile）— 产品管理

| Profile | 角色 |
|---------|------|
| `product-manager` | 需求优先级裁决 |
| `product-researcher` | 需求分析与调研 |

### Ops 团队（4 个 profile）— 运维与 SRE

| Profile | 角色 |
|---------|------|
| `ops-devops` | DevOps 工程 |
| `ops-sre` | SRE 运维 |
| `ops-incident-commander` | 事故指挥 |
| `ops-eval` | 工作流评估（六维周评） |

### Platform 团队（2 个 profile）— 自我改进系统

| Profile | 角色 |
|---------|------|
| `platform-skill-miner` | 技能挖掘 |
| `platform-ontology-curator` | 本体治理 |

### AI Team（6 个 profile）— AI 研究

| Profile | 角色 |
|---------|------|
| `aiteam-orchestrator` | 领域网关 |
| `aiteam-architecture` | 模型架构 |
| `aiteam-multimodal` | 多模态 |
| `aiteam-embodied` | 具身智能 |
| `aiteam-training` | 训练对齐 |
| `aiteam-scout` | 情报侦察 |

### Pay 团队（4 个 profile）— 支付清算

| Profile | 角色 |
|---------|------|
| `pay-orchestrator` | 领域网关 |
| `pay-clearing` | 清算结算 |
| `pay-fintech` | 金融科技 |
| `pay-infra` | 支付基础设施 |

### Data 团队（4 个 profile）— 实时数据栈

| Profile | 角色 |
|---------|------|
| `data-orchestrator` | 领域网关 |
| `data-arch` | 数仓架构 |
| `data-flink` | Flink 流计算 |
| `data-infra` | 存储基础设施 |

### [已移除] 团队（11 个 profile）— IC 设计自动化

| Profile | 角色 |
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
| `[已移除]` | [已移除] 软件逆向（仅静态分析，禁执行未授权二进制） |

### Hack 团队（4 个 profile）— 安全审计与红队（授权测试）

| Profile | 角色 |
|---------|------|
| `hack-recon` | 被动侦察/资产测绘/OSINT |
| `hack-auditor` | 代码审计/白盒分析 |
| `hack-exploit` | PoC 验证/受控利用（仅授权范围） |
| `hack-forensics` | 取证分析/逆向/证据固定 |

> Hack 团队仅用于授权测试场景；所有派卡须过授权门判定（SOUL 红线）。
> [已移除] 家庭团队因家庭隐私不在此仓库。

## 领域网关原则

`aiteam` / `pay` / `data` / `[已移除]` 各有独立 orchestrator 作为领域网关，负责领域内子任务分解与路由；跨领域任务由顶层 `orchestrator` 统一调度，禁止跳过领域网关直派下游 worker。

## 架构

```
Gateway 消息 (Matrix/Weixin/API Server/Email)
    ↓
┌─────────────────────────────────────────────────┐
│  Orchestrator（路由器 + 分解器）                  │
│  智能路由：按复杂度轻/中/重三级判定               │
└──────────────────┬──────────────────────────────┘
                   ↓
  swarm · product · ops · platform · aiteam
  pay · data · [已移除] · hack · worker （10 看板）
```

## 核心特性

- **智能路由**：Gateway 消息按复杂度路由——轻量（≤2 次工具调用）直接执行，中等（3-5 次）轻量留痕，重型（≥6 次）走完整看板流程。
- **持久 Worktree 工作区**：每个看板任务默认 `workspace_kind="worktree"`，输出以 commit 形式持久化，多任务并行不冲突。
- **Loop Engineering 验证门**：每次 `kanban_complete` 前必须通过验证门（从任务 body 提取验收条件，用工具验证非自述）。
- **ACP 编码委托**：编码工作通过 ACP 委托外部编码 agent（claude/codex），worker 不直接写代码。
- **隐私加固**：真实邮箱 → `your-bot@example.com`，用户名路径 → `/Users/YOURNAME`，密钥 → `${ENV_VAR}` 占位符。
- **单一事实源**：共享规则收敛在 `_shared/` 六层目录（调度总线/组织编排/进化记忆/专业能力/工程执行/观测治理）。

## 快速开始

```bash
git clone https://github.com/issac-new/SwarmTeam.git
cd SwarmTeam

# 安装全部 profile（macOS/Linux，按 distribution.yaml 逐个导入）
for d in profiles/*/; do
  [ -f "$d/distribution.yaml" ] && hermes profile install "$d" --alias -y
done

# 或安装单个 profile（Hermes 原生导入）
hermes profile install profiles/orchestrator --alias -y
```

Windows 见 [WINDOWS-INSTALL.md](WINDOWS-INSTALL.md) / [WINDOWS-OFFLINE-INSTALL.md](WINDOWS-OFFLINE-INSTALL.md)。

### 前置条件

- 已安装 [Hermes Agent](https://hermes-agent.nousresearch.com)
- `~/hermes-docker-sandbox/workspace/` 有 git 仓库（worktree 基座）
- API key 放 `~/.hermes/.env`（必填变量见 `shared/profiles.yaml` 与各 profile `distribution.yaml` 的 `env_requires`）

## 版本

**v3.2.0** — 2026-10-14 更新

- 全量刷新 40 个 profile 到 2026-10 live 状态（模型路由统一 cc-switch 本地代理）
- 新增 `[已移除]`（第 41 个 profile）：[已移除] 商业软件安装树静态逆向（REA/Ghidra；仅静态分析红线）
- root skills 库刷新；`shared/profiles.yaml` 同步为 48 profile 差异清单
- 隐私脱敏：微信/Matrix ID → 占位符，`/Users/YOURNAME` → `/Users/YOURNAME`，`/Volumes/YOURVOLUME` → `/Volumes/YOURVOLUME`，私人 cron 剔除（家庭/[已移除] 类 job）

**v3.1.0** — 2026-10-12：40 profile 全量刷新，新增 hack 团队 4 profile。
**v3.0.0** — 2026-10：36 profile 跨 9 团队 + Windows 安装器适配六层 _shared 结构。
**v2.4.0** — 2026-08-01：移除禁发团队历史（git-filter-repo）。

详见 [MIGRATION-GUIDE.md](MIGRATION-GUIDE.md)。

## 许可证

个人使用分发。Skills 保留原始许可证（见 `skills/`）。

---

> English documentation: [README.md](README.md)
