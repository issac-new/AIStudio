# Agent 治理基线（Agent Governance Baseline：事前控制 + 事后取证）

> 本文件管两件事：事前——每个常驻 Agent/loop/管线上线前过一张治理卡（§二）；事后——出了事故按最小字段集留取证（§三，执行细则在 `agent-observability.md` §一~§三）。
> 来源：BCG《The Formula for Agentic AI Value》六类控制机制；《Beyond Predictable Paths: AI Security Incident Reporting for Compromised Agents》（arXiv 2609.24515）。两源面向企业级舰队，17 项与六机制按本集群单人多域语境收缩；存档 `research/wechat-fusion-20261008/`。
> 本文件是检查清单+取证字段集，无独立机械执行面；首次真实事故核对后回填效力结论。

---

## 一、为什么需要本基线

传统 LLM 事故分析单位是「一次输入→一次输出」；Agent 的事故单位是**一条执行轨迹**（目标→上下文→推理→工具调用→状态变化→记忆写入→子 Agent→外部系统→事故）。任何单步看都可能正常，问题存在于步骤连接处。

两份外部研究给出互补的两侧：
- **事前**（BCG）：每个重要 Agent 应具备哪几类控制机制——控制缺失与价值流失强相关（全六类控制企业的 Agentic AI 价值约为仅一类控制者的 3 倍以上）。
- **事后**（Incident 框架）：事故发生后必须留下什么信息才能重建因果链——核心是「设计态 ≠ 运行态」：审计对象不是「这个 Agent 有多自主」，而是「出事那一步它实际拥有多大自主权」。

本集群对应物：kanban 卡 + kanban_comment 留痕 + delegate_task 链 + Matrix 消息就是 Agent 的「执行轨迹」；本文件定义这些载体上应始终可回答的治理问题与取证字段。

---

## 二、事前：六类控制收缩为集群治理卡（BCG Exhibit 9 → 集群口径）

对集群每个**常驻** Agent/loop/自动化管线（nightly loop、watchdog、多 agent fan-out），建一张治理卡（可并入 risk-register 条目），逐类回答：

| # | 控制类 | BCG 原义 | 集群收缩口径 | 本集群既有载体 |
|---|--------|----------|--------------|----------------|
| 1 | 记忆与上下文 | 规定上下文读取/保存/调用，防错误跨工作流传播 | hindsight/memory 写入有来源环境（memory-governance 读侧门）；跨卡传递走 kanban handoff 而非自由漫游 | memory-governance.md、delegation-brief-format 必读 context 清单 |
| 2 | 范围与监督 | 任务目的/权限/自主程度/人工审批节点写清 | 卡 body 的任务契约+验收标准 frozen+动作空间段；不可逆动作走 staged-action | forward-deployed-protocol §三、delegation-brief-format |
| 3 | 评估与回滚 | 上线前门槛+持续监测+回滚办法 | 验收命令前置（收卡只跑命令）；crash/block 有恢复通道；变更三分法 | output-contract 验证门、kanban-crash-recovery、capability-ladder |
| 4 | 工具与集成 | 统一 API/工具接入/Agent 目录 | skills_list + skill-catalog.md 单一登记面；clearances 标记管工具边界 | skill-catalog.md、marking-rules.md、config.yaml clearances |
| 5 | 明确负责人 | 业务/技术/风险责任人+谁可改/暂停/关闭 | 每卡 assignee 唯一；owner-registry 主责岗；loop 有看门狗 cron 与改口令归属 | owner-registry.yaml、nightly-loop-ops |
| 6 | 安全与审计（含成本边界） | 运行时风险控制+审计记录+**调用成本设界** | llm-routing 红线+cc-switch 账本+预算轮次入卡+事件留痕（本文件 §三） | llm-routing-redlines、cost-ledger、delegation-brief-format 预算字段 |

**核对触发时机**：新 loop 上线前、新 profile 入网时、治理审计（cluster-integrity-audit）时逐行过表；六类中任何一类答不出对应载体，即治理缺口——按 capability-ladder 判级处置（登记 gap_register，禁静默降级）。

---

## 三、事后：事故取证最小集（17 项 → 8 项）

> 收缩依据：集群事故第一现场是 kanban 卡+评论+终端输出，非独立 Agent 运行时；8 项覆盖「还原轨迹/还原能力/还原编排」三类，其余 9 项（推理 tokens 原文、OS 级交互、通信协议细节等）在集群载体上或不可得或已由留痕间接覆盖。

### 3.1 取证八项（执行正本在 `agent-observability.md` §一——本节仅存收缩依据，字段表以彼为准）

> 字段表以 agent-observability.md §一 为单一正本**（其表含集群现成载体列，且带「N/A 须逐项显式标注」执行细则）；本文件保留收缩裁决记录与接线关系。

| # | 字段 | 回答的问题 | 集群取证位置 |
|---|------|-----------|--------------|
| 1 | 消息历史 | 用户/上游对 Agent 说了什么 | 卡 body + comment 全文 + 原始 Gateway 消息 |
| 2 | 上下文与数据来源 | Agent 看到了什么、来自哪 | comment 引用的文件/URL/查询结果（来源+时间戳） |
| 3 | 数据读写 | 改了哪些文件/状态 | handoff 变更段 + git diff + workspace 快照 |
| 4 | **实际**自治度 | 出事那步实际自主到什么程度 | staged 豁免清单命中记录、预算超限点、绕过的确认环节 |
| 5 | **实际**工具调用 | 实际调了什么工具/参数/结果 | 终端输出、tool_calls 留痕（对照声明过的动作空间） |
| 6 | **设计态**对照 | 设计上允许什么（自治度/工具/架构） | 卡 body 任务契约 + SOUL 纪律 + staged 触发表 |
| 7 | 委托链 | 谁授权了谁：Human→Agent→子Agent→工具 | kanban parents 链 + delegate_task 层级 + 所用身份/凭据来源 |
| 8 | 通信与编排 | Agent 之间实际交换了什么 | Matrix 消息、kanban comment、acp_send 记录 |

（上表保留为历史裁决记录；执行/复盘时以 `agent-observability.md` §一 勾稽，该表另含「设计架构 vs 实际架构」「时间线」两项表达微差，以彼为准。）

### 3.2 设计态 vs 运行态偏差（Design–Runtime Gap）

取证的核心动作是**成对对照**而非单侧记录：

```
设计自治度 ↔ 实际自治度        设计工具集 ↔ 实际调用集
设计 Agent 编排 ↔ 实际运行编排   设计权限边界 ↔ 实际权限传播
```

典型集群实例：设计上「部署生产必须人工确认」，实际经 delegate 链传递后绕过确认直接执行——单看每层都合规，问题在链的组合。凡 staged-action 触发判断只看「当前层动作类型」不看「委托链累计后果」的环节，都属此类偏差面。

### 3.3 语义层留痕（本集群已等效，引用不加机制）

外部框架的 Semantic Gap 要求（底层事件恢复成业务语义，如 `click(x=843,y=421)`→「点击确认支付」）在集群已由 kanban handoff 四段（变更/验证/实现方式/决策）天然满足——comment 留痕即语义层。**判等效印证，不新增机制**。新增义务仅一条：事故复盘 comment 引用 §3.1 八项字段的取证位置，不重述过程叙事。

---

## 四、显式不吸收清单（防后续 session 重复提议）

| 外部机制 | 不吸收/降级理由 |
|----------|----------------|
| 17 项全录+字段强制分级 | 集群载体无独立 Agent 运行时，全录=纯成本；收缩为 8 项取证位（§3.1） |
| tamper-resistant/tamper-evident 日志、反取证威胁模型 | 🔭 **观察项**：集群 kanban DB 为单用户受信环境 append-only 事件流，无对抗性篡改威胁面；若未来多租户/对外服务上线再评估（先例：action-risk.md 文20 观察项格式） |
| Evidence→Report 分层披露（数据最小化/匿名化） | 集群事故报告仅内部消费；隐私红线已由 alert-triage-rules §三 + mandatory-privacy 承载 |
| 10-20-70 转型投入比（BCG） | 大型企业组织转型语境；集群投入结构由拆卡优先+预算字段承载，无对应变量 |
| 虚拟损益表独立建设 | 收益侧盘点已由组合管理三点式（资源效率）+ cost-ledger（成本侧）承载；口径提醒：人工复核与治理成本应计入动作成本，见 §2 第 6 类 |

---

## 五、与本集群资产的接线

| 资产 | 关系 |
|------|------|
| `02-org-orchestration/alert-triage-rules.md` | 安全类事故的告警定级按其分级走（安全事件=urgent） |
| `01-scheduling-bus/forward-deployed-protocol.md` | §2 范围与监督的执行细节（staged 触发表）在其 §三；委托链累计后果为待补强面 |
| `03-evolution-memory/output-contract.md` | 事故复盘产出的 handoff/验证字段口径以其为准 |
| `devops/failure-mode-playbook`（orchestrator skills） | 事故归因入口；本文件 §3.1 是其问题回顾五步的取证证据源 |
| `06-observability/risk-register.md` | 常驻 Agent 治理卡（§2）可并入其条目格式 |

## 上游锚点

- BCG《The Formula for Agentic AI Value》Exhibit 9（六类控制机制）
- arXiv 2609.24515（3 大类 17 项要素；本文件收缩为取证八项，显式不吸收清单见 §四）
- 变更历史见 git log
