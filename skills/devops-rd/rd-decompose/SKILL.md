---
name: rd-decompose
description: 需求拆解——生成 by 应用的 requirement 作为开发产物
version: 1.0.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [rd, decompose, orchestrator, kanban]
    related_skills: [rd-work, rd-analyze, verify-requirement, to-tickets, rd-estimate]
---

# /rd:decompose — 需求拆解

> **对应文章命令**：`/rd:decompose`（需求拆解，生成 by 应用的 requirement 做为开发产物）
> **触发**：analyze 完成后，需要拆到具体应用/profile 时
> **作用**：把跨应用需求拆成每个应用自己的 requirement.md

---

## 一、触发场景

- analyze 完成，产出应用级需求摘要
- 需求涉及 ≥2 个应用/profile
- 需要并行开发或跨 board 协同

---

## 二、工作流

### 2.1 拆解步骤

1. **确认应用边界**：每个应用负责什么，不负责什么
2. **生成应用级 requirement**：每个应用一份独立的 requirement.md
3. **建立依赖关系**：哪些应用需要先完成（parents=[...]）
4. **创建 kanban 子任务**：每个应用一个子任务

### 2.2 输出

每个应用生成 `requirement.md`：

```markdown
# requirement — <应用名>

## 目标
<本应用在本需求中的目标>

## 非目标
<本应用不涉及的场景>

## 影响
- 接口：<列表>
- 消息：<列表>
- 状态：<列表>
- 字段：<列表>

## 知识入口
- `applications/<app>.md`
- `skills/<相关 skill>`

## 代码入口
- <具体路径/模块/函数>

## 验收标准
- [ ] <可机械验证的标准 1>
- [ ] <可机械验证的标准 2>

## 依赖
- 前置任务：<task_id>
- 阻塞项：<如有>

## effort_tier
<S / M / L / XL / unknown>（见下方「effort_tier — 工作量规模标签」判定依据）
```

---

## effort_tier — 工作量规模标签

每个应用的 `requirement.md` 输出契约中，**必须**新增 `## effort_tier` 字段，用于标注本次拆解的工作量规模。取值范围：`S` / `M` / `L` / `XL` / `unknown`。

### 判定依据（至少覆盖以下维度中的 1–2 项）

| 档位 | 判定参考 |
|---|---|
| **S** | 文件数 ≤3，依赖 ≤1，验收标准 ≤2 项，可单轮完成 |
| **M** | 文件数 4–8，依赖 2–3，验收标准 3–5 项，需 2–3 轮 |
| **L** | 文件数 9–15，依赖 4–6，验收标准 6–10 项，需多轮并行 |
| **XL** | 文件数 >15，依赖 >6，跨 board / 跨团队，验收标准 >10 项 |
| **unknown** | 无法可靠估计时显式标注，不得编造具体数值 |

### 与 rd-estimate 的边界与向后兼容

- `effort_tier` 是**轻量相对规模标签**，用于快速分流与排期参考，**不替代** `rd-estimate` 的精确工时估算能力。
- `rd-estimate` 继续在需要精确小时/故事点时独立调用；`effort_tier` 在 `rd-decompose` 产出时一并给出，作为前置粗估。
- 两者**向后兼容**：`rd-estimate` 的输入可引用 `effort_tier` 作为快速上下文，但不依赖它。
- 无法估计时**必须**标记 `unknown`，不得为了通过而编造 S/M/L/XL。


## 完整输出示例

以下示例展示各档位的 `effort_tier` 完整输出，包含判定过程与依据来源。
每个示例的 `## effort_tier` 段后附带 `## effort_tier_justification` 段，
列出维度数值、实测值与依据来源——该段不纳入输出契约模板（模板仍为单行 `<S / M / L / XL / unknown>`），
仅用于记录判定过程，供 `rd-estimate` 快速上下文参考。

### S 档

```markdown
# requirement — 通知渠道配置

## 目标
在 gateway 配置中新增 Telegram 通知渠道。

## 非目标
不涉及消息模板重构（归 l12edu 应用处理）。

## 影响
- 接口：gateway config schema v1→v1.1（新增 telegram_bot_token）
- 消息：通知路由新增 Telegram 分支
- 状态：无
- 字段：2 个新键

## 知识入口
- `applications/gateway.md`
- `skills/devops-rd/rd-decompose`

## 代码入口
- `profiles/_shared/gateway/config.yaml`
- `profiles/_shared/gateway/messaging.md`

## 验收标准
- [ ] 配置加载不报错
- [ ] 通知路由到 Telegram 平台

## 依赖
- 前置任务：t_d8a73c7a（analyze 完成）

## effort_tier
S

## effort_tier_justification
| 维度 | 实测值 | 依据来源 |
|---|---|---|
| 文件数 | 2 | analyze 产出涉及 config.yaml + messaging.md |
| 依赖数 | 1 | 仅前置 analyze 任务，无其他应用依赖 |
| 验收标准数 | 2 | 标准 1：配置加载；标准 2：路由正确 |
| 轮次预估 | 单轮 | 纯配置层改动，无代码实现 |
| 判定 | **S** | 满足 S 档门槛：文件数 ≤3、依赖 ≤1、验收标准 ≤2 |
```

### M 档

```markdown
# requirement — 知识库检索纪律协议

## 目标
为 deep-research-workflow 接线 recall-discipline.md，写入 SKILL.md 引用。

## 非目标
不改动 hindsight 存储层或检索算法（归 memory-curation 应用）。

## 影响
- 接口：hindsight_recall 调用规范新增召回纪律约束
- 消息：检索结果需标注来源可信度
- 状态：新增 recall-discipline 状态标记
- 字段：检索结果 JSON 新增 source_tier 字段

## 知识入口
- `applications/deep-research-workflow.md`
- `skills/devops-rd/rd-decompose`

## 代码入口
- `skills/research/deep-research-workflow/SKILL.md`（+引用）
- `profiles/_shared/memory/recall-discipline.md`（新建）

## 验收标准
- [ ] recall-discipline.md 存在且含 5 条纪律
- [ ] SKILL.md 含单行引用 recall-discipline.md
- [ ] frozen 验收 4 项机械核验全过

## 依赖
- 前置任务：t_d8a73c7a（analyze 完成）

## effort_tier
M

## effort_tier_justification
| 维度 | 实测值 | 依据来源 |
|---|---|---|
| 文件数 | 2（新建1 + 修改1） | recall-discipline.md + SKILL.md |
| 依赖数 | 2 | 前置 analyze + 需等待 memory-curation 就绪 |
| 验收标准数 | 3 | 标准 1：文件存在；标准 2：引用接线；标准 3：验收全过 |
| 轮次预估 | 2–3 轮 | ACP 委托 → 自验 → 修复 |
| 判定 | **M** | 满足 M 档门槛：依赖 2–3 + 验收标准 3–5 |
```

### L 档

```markdown
# requirement — 团队知识检索纪律协议接线

## 目标
为三大检索 discipline skill 完成接线与验证。

## 非目标
不改动检索算法核心（归 memory-curation 应用处理）。

## 影响
- 接口：3 个 skill 引用关系对齐
- 消息：检索结果标注来源可信度
- 状态：新增 recall-discipline 状态标记
- 字段：检索结果 JSON 新增 source_tier 字段

## 知识入口
- `skills/research/deep-research-workflow/SKILL.md`
- `skills/devops/agent-memory-curation/SKILL.md`
- `skills/software-development/test-driven-development/SKILL.md`

## 代码入口
- `profiles/_shared/memory/recall-discipline.md`（新建）
- `skills/research/deep-research-workflow/SKILL.md`（修改）
- `skills/software-development/test-driven-development/SKILL.md`（修改）

## 验收标准
- [ ] recall-discipline.md 存在且含 5 条纪律
- [ ] 3 个 skill SKILL.md 含正确引用
- [ ] frozen 验收 5 项机械核验全过
- [ ] 无越界改动（git diff 确认）
- [ ] ACP session_id 验证通过

## 依赖
- 前置任务：t_d8a73c7a（analyze 完成）
- 阻塞项：t_10c3cf84（摩擦信号捕获协议）需先完成

## effort_tier
L

## effort_tier_justification
| 维度 | 实测值 | 依据来源 |
|---|---|---|
| 文件数 | 4（新建1 + 修改3） | recall-discipline.md + 3 个 SKILL.md |
| 依赖数 | 4 | 前置 analyze + 3 个 skill 引用链 + 摩擦信号协议阻塞 |
| 验收标准数 | 5 | 标准 1–5：文件存在、引用正确、验收全过、无越界、ACP 验证 |
| 轮次预估 | 多轮 | ACP 委托 → 自验 → 修复 → 验收脚本编写 |
| 判定 | **L** | 满足 L 档门槛：依赖 4–6 + 验收标准 6–10（此处 4 依赖 + 5 标准 → 取上限 L） |
```

### XL 档

```markdown
# requirement — 跨 board 夜间雷达管道重构

## 目标
重构 nightly-loop 管道：fetch→报告→PDF→微信→差距派工闭环，涉及 3 个 board 协同。

## 非目标
不改动雷达算法模型（归 nightly-radar-runbook 应用处理）。

## 影响
- 接口：5 个 stage 的 API 契约重定义
- 消息：Stage 间通信协议升级
- 状态：pipeline 状态机新增 3 个中间态
- 字段：pipeline JSON 新增 stage_metadata 字段

## 知识入口
- `skills/devops/nightly-loop-ops/SKILL.md`
- `skills/devops/nightly-radar-runbook/SKILL.md`
- `skills/devops/nightly-report-delivery/SKILL.md`
- `skills/devops/domain-nightly-ops/SKILL.md`

## 代码入口
- `_nightloop_inventory/`（5 个 stage 脚本）
- `profiles/_shared/scheduling-bus/forward-deployed-protocol.md`
- `.cron_scripts/`（3 个 cron job）

## 验收标准
- [ ] Stage 0 fetch 输出含时间戳
- [ ] Stage 1 报告含 3 源三角验证
- [ ] Stage 2 PDF 含 --no-pdf-header-footer
- [ ] Stage 3 微信推送含摘要
- [ ] Stage 4 差距派工闭环含 kanban_create
- [ ] pipeline 状态机幂等
- [ ] cron 脚本入口可执行
- [ ] 3 个 board 子任务联动
- [ ] 监控告警规则覆盖
- [ ] 回滚预案文档同步

## 依赖
- 前置任务：t_d8a73c7a（analyze 完成）
- 阻塞项：t_0c784699（session 审计）需先完成
- 跨 board：board-a（fetch）、board-b（PDF）、board-c（微信）

## effort_tier
XL

## effort_tier_justification
| 维度 | 实测值 | 依据来源 |
|---|---|---|
| 文件数 | 12（脚本5 + 配置3 + 文档4） | _nightloop_inventory/ + .cron_scripts/ + forward-deployed-protocol.md |
| 依赖数 | 8 | 前置 analyze + session 审计 + 3 个 board + 4 个 skill |
| 验收标准数 | 10 | 标准 1–10：5 个 stage + 幂等 + cron + 联动 + 监控 + 回滚 |
| 轮次预估 | 多轮跨团队并行 | orchestrator 分 3 board 子任务，每 board 独立验收 |
| 判定 | **XL** | 满足 XL 档门槛：跨 board/跨团队 + 验收标准 >10 |
```

### unknown 档

```markdown
# requirement — AI4EDA 组织调研

## 目标
调研 AI4EDA 领域芯片组织的研究方向、论文产出、开源项目布局。

## 非目标
不涉及具体 [已移除] 算法实现（归 [已移除] 应用处理）。

## 影响
- 接口：调研报告 JSON schema 待定
- 消息：调研结果推送格式待定
- 状态：调研进度状态待定
- 字段：调研结果字段待定

## 知识入口
- `skills/research/open-source-architecture-research`
- `skills/software-development/[已移除]`

## 代码入口
- 待调研确定（开源仓库 clone 路径未知）

## 验收标准
- [ ] 组织清单 ≥5 个
- [ ] 每组织含研究方向 + 论文链接
- [ ] 开源项目清单 ≥3 个
- [ ] 调研方法可复现

## 依赖
- 前置任务：t_d8a73c7a（analyze 完成）
- 阻塞项：无

## effort_tier
unknown

## effort_tier_justification
| 维度 | 实测值 | 依据来源 |
|---|---|---|
| 文件数 | 不可靠估计 | 调研涉及 clone 开源仓库，仓库大小未知 |
| 依赖数 | 不可靠估计 | 调研范围取决于分析结果，可能涉及 ≥5 个组织 |
| 验收标准数 | 4 | 标准 1–4：组织清单、研究方向、开源项目、方法复现 |
| 轮次预估 | 不可靠估计 | 调研产出量取决于组织数量与仓库深度 |
| 判定 | **unknown** | 无法可靠估计文件数/依赖数/轮次，显式标记 unknown |
```

---

## 三、验证清单

- [ ] 每个应用有独立的 requirement.md
- [ ] 每个 requirement 含目标/非目标/影响/入口/验收标准
- [ ] 依赖关系已用 parents=[...] 表达
- [ ] 已创建对应 kanban 子任务

---

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版 | orchestrator |