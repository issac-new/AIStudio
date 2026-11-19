# 能力池地基：能力标签进入派单决策（AI 原生组织 C 方案·批二点五）

> 状态：立项（2026-11-19 用户选择“新增批二点五”）。本 spec 是决策事实源，不表示已实施。
> 外部吸收源：《AI Native 组织HRBP的定位转型：管理对象从人转变为能力，价值交付不再是「人岗匹配」而是更加灵活的能力调度》，公众号“顶上思考”，2026-11-17 18:55，作者“编织杀”。
> 上游设计：`docs/superpowers/specs/2026-11-19-ai-native-operating-model-design.md`（已批准 C 方案，当前在 `feat/ai-native-operating-model` 分支，未合 main）。

## 1. 背景与目标

### 1.1 外部研究给出的可执行判断

文章把 AI Native 组织的人力资源判断改写为五条：

1. 岗位是行政容器，能力才是调度单元。业务需求流动、碎片化、项目化，交付主体是“全职人才 + 外部专家 + AI 智能体”的混合劳动力。
2. 判断基准从“人岗匹配”转为“能力供需匹配”。盘点对象是能力库存：能力缺口、复用率、人机组合成功率。
3. HRBP 升级为 Capability BP：拆业务目标、拆任务、判断交给人还是 Agent、做组合调度、定义临时团队的协作/权责/绩效规则。
4. 岗位不取消。岗位/JD/职级/编制继续承担合规、薪酬、协议、职业通道；只是退出资源调度、项目组队、人才盘点的主索引。
5. 五步落地：统一能力标签、重构盘点表单、KPI 换轨、三层能力池、配套激励。

对 AIStudio 而言，最有价值的是第 5 步里的一句判据：**建标签不等于用标签，能否进入决策流才是分水岭。**

### 1.2 一手来源核验

| 来源 | 核验结果 | 边界 |
|---|---|---|
| KPMG《HR must own the Total Workforce to drive business outcomes》 | 页面存在；“melt the ice cube / fluid collection of skills”原话属实，说话人 Leila Shin | 页面只标 ©2026，未标 2026.10 具体日期 |
| McKinsey《HR Monitor 2026》 | 搜索摘要确认 85% 组织有技能分类、57% 接入人力规划；另有 22% 用技能预测、11% 做三年以上规划 | 官网直取超时，建议以官方 PDF 为准 |
| Josh Bersin《HR 2030: A Vision For Agentic Human Resources》（2026.4） | 上一轮已核验 | 文章引用 2026.4 |
| McKinsey《Agentic AI in HR: Escaping the pilot trap》（2026.8） | 上一轮已核验 | 文章引用 2026.8 |
| 用友 BIP 人力云（2026-09-22） | 页面存在；“3 周缩短到 5 天”属实；总控 Agent + 专家 Agent 三层结构属实 | 单一客户、厂商自述，原文注明结果需验证 |

外部数字只作为设计依据，不作为 AIStudio 成熟度或收益证明。

### 1.3 目标

在已批准的 C 方案批二与批三之间，插入“批二点五：能力池地基”，用最小改动让能力标签进入派单决策：

- 任务能声明“需要哪些能力”，而不是只在 body 里写一段文字。
- 派单前能回答“谁有、缺什么、依据在哪”，缺供给时阻断或要求带理由的显式例外。
- 能力供需可查询：每个能力标签的需求、供给、缺口、跨板复用、供给时效。
- 三项能力指标各自绑定一个会因它改变的决定；没有消费者的指标标为装饰。
- 批三的 OutcomeTeam 消费本批能力库存，不再只按关键词组队。

### 1.4 非目标与反目标

- 不新建第二套调度器。内核 dispatcher 仍是唯一 spawn 权威；本批只做候选查询与准入建议。
- 不新建第五套能力标签体系。词表以能力台账 L2/L3 与既有技能标签为源。
- 不把 `skills` 字段改造成“能力需求”。`skills` 保持执行期强制加载语义；需求用独立字段。
- 不做薪酬、晋升、招聘、岗位淘汰、个人排行榜或自动绩效评分。
- 不假装外部专家池已建模。v1 显式 `available:false`。
- 不把任务 done、消息 delivered、工具调用量或生成内容量当能力价值。
- 不以推演假数据替代真实任务证据。

## 2. 仓内现状与断点

### 2.1 已有零件

| 零件 | 位置 | 作用 |
|---|---|---|
| 能力台账 L1/L2/L3 | `runtime/governance/capability-ledger.yaml:20,38,153` | 16 个 L2 能力项、27 个 L3 能力单元、22 个技能标签；带 owner、lifecycle、sloTier、复核日 |
| 能力图 | `team/shared/capability-graph.yaml` | 每个 Agent 的 `capabilities`、`substitutes`、`reliability`；44 个 Agent 中 17 个有声明，83 个自由文本标签 |
| 技能供给清单 | `team/profiles/_shared/skill-provisioning.json`、`custom/server/skillprovision/manifest.ts:159` | 角色到技能的机器可读期望源 |
| 身份册与户口五要素 | `custom/server/agentidentity/agent-identity.ts:66,175-218` | 名称、能力边界 can/cannot、工具白名单、审计要求、责任人、生命周期 |
| 四维能力声明 | `custom/server/graph/node-executors/capability-composer.ts:8-14` | 交付物类型、VCS 范围、资料密级、集成权限 |
| 统一能力目录 | `custom/server/harness/capability-catalog.ts:1-16` | 工具/数据/模型的登记、权限、版本、审计四要素只读投影 |
| 能力缺口阶梯 R0-R3 | `team/profiles/_shared/01-scheduling-bus/capability-ladder.md:24-31` | 借调、挂载、生成、派生四级补全规则 |
| 使用与零调用报告 | `custom/server/governance/governance-analytics.ts:188-243` | 每个能力单元的最后使用时间、零调用候选、名册外活动 |
| 团队库 | `team/shared/team-library.yaml:10-18`、`custom/server/team-library/team-library.ts:194-260` | 团队族、必需角色、候选名单；当前只做关键词预筛 |
| 身份与责任 | `custom/server/agentidentity/responsibility.ts:39-63` | 主责任人、复核人、接管人必须来自 active 人员 |

### 2.2 三条断链

**需求侧断链。** 任务卡有 `skills` 字段（`runtime/hermes_cli/kanban_db.py:1078-1080`），创建事件里也记了声明（`:1605`），但它的语义是“worker 执行时强制加载的技能包”，不是“派单匹配所需能力”。派发器只按卡上 `assignee` 起 worker（`runtime/hermes_cli/kanban_db_dispatch.py:2693-2704`），从不读 `skills` 做候选匹配。

**供给侧断链。** 能力图 44 个 Agent 只有 17 个声明 `capabilities`（38.6%）；`governance/docs/admin/` 下没有 `agent-capabilities.md`，四维能力合成器读不到注册表，`graph-assembly.ts:369-386` 把缺失 catch 成空表，长期空转。能力图生成器 `bin/capability-graph-gen.py` 不在仓内，无法从仓内复现。

**决策侧断链。** 列编排按固定 specialist 派单（`runtime/roster/columns.yaml:19-61`）；squad 由 leader 自选人（`custom/server/zcode/squad-protocol.ts:1-12`）；唯一按能力标签选人的实现只在客户端 Matrix（`custom/client/matrix-teams/agent-router.ts:35-50`），但服务端生产者发出的 `agent.profile` 不带 `schemaVersion/capabilities`（`custom/server/matrix/chat-bridge.ts:427-439`），客户端解析器要求 v2 完整形状（`custom/client/matrix-teams/protocol.ts:284-326`），这条路由跑不起来。

### 2.3 度量侧事实

`custom/server/metricpolicy/store.ts:32-92` 的六个内置指标 `consumers` 全为空，代码自述“确实还没有绑定过任何决策，页签上会如实标为装饰”。`custom/server/metricpolicy/derive.ts:183-186,297-300` 明确写“没有技能级调用计数，不能算复用率”。`governance-analytics.ts:240-243` 有零调用候选，但只在 `RuntimeSection.vue:108-124` 作为警告徽标展示，没有进入退役或补位决定。

一句话：**AIStudio 已经有能力账，但没有“能力账进入派单”的那一步。**

## 3. 变更

本批分三增量。每增量独立测试、独立审查、可独立停用；前增量不通过不扩后增量。

### 3.1 增量一：统一词表与登记补齐

- 词表单一源：能力台账 L2/L3 的 `capability` 与 `skills` 标签，校验复用 `custom/server/governance/governance-ledger.ts:21` 的 `SKILL_TAG_RE`。新增标签必须挂到有效 L2 或已注册技能；无主标签不进入派单。
- 登记补齐：新增维护脚本 `scripts/maintenance/capability-registry-seed.mjs`，从 `team/shared/profiles.yaml`、`team/profiles/_shared/skill-provisioning.json`、`team/shared/capability-graph.yaml`、`team/shared/role-tool-matrix.yaml` 生成 `agent-capabilities.md` 的候选行；只写有证据的声明，未声明的 Agent 标 `unknown`，不填默认能力。脚本默认 dry-run（stdout），`--write` 直写目标文件——它是生成器不是编辑器；交互编辑与 git 审计仍走 registry-admin 通道（审查修正：原文"经 registry-admin 写通道落盘"与实现不符）。
- 能力图：手工区补齐核心 profile 的 `capabilities`（orchestrator、worker-coder、worker-tester、reviewer、ops、product 等）；未声明者保留 `unknown`，不以空数组冒充“无能力”。
- Matrix 生产端：`custom/server/matrix/chat-bridge.ts:427-439` 输出 `schemaVersion: 2`、`updatedBy/updatedAt` 与每 Agent 的 `capabilities`；不改协议，只修生产端。客户端解析器保持现状。
- 退役：删除 `graph-assembly.ts:369-386` 的静默空表 catch，改为显式 `available:false` 并记录缺口；这是本增量配对的退役项。

### 3.2 增量二：能力供需读模型与派单准入

- 新增只读投影 `custom/server/capabilitypool/`（`types.ts`、`derive.ts`、`controller.ts`），不建存储、不复制事实源。
- 需求侧：优先读任务 `required_capabilities`（增量三落地前的过渡期读 `skills`，供需报告顶层标注 `demandSource='skills-fallback'`，治理页显示"需求来源：任务 skills 过渡口径"）；按标签、板、状态、年龄聚合。
- 供给侧：读能力台账（L3 单元与 skills）、能力图（capabilities/substitutes/reliability）、技能供给清单（角色到技能）、`profiles.yaml`（只取 `skills_pinned` 个体声明——`skills_enabled` 是分类白名单不是能力标签）、舰队能力目录（多机 profile×角色×技能名）；外部专家池 v1 不建模，sources 中恒 `external-experts: available:false` 占位（D7）。
- 输出每标签一行：`demand`、`supplyUnits`、`supplyAgents`、`supplySkills`、`gap`、`distinctBoards`、`supplyLeadTimeMedian`、`lastUsedAt`、`sources`、`evidenceRefs`。每个源独立 `available`；源缺席返回 `null` 并标 unknown，不猜 0。
- 派单准入：纯函数 `assessCapabilityReadiness`（实现在 `custom/server/capabilitypool/derive.ts`，任务级包装 `readiness.ts`）：
  - 供给源全部缺席：`unknown`，原因 `supply_sources_unavailable`——源故障不冒充“缺供给”（审查修正，原案未定义此态）。
  - 需求标签在五源供给并集中不存在：`block`，原因 `capability_not_supplied:<tag>`（原案的 `skill_not_installed` 原因码未采用——判定面是供给并集不是技能目录）。
  - 能力图缺席时 assignee 声明不可判：`warn`，原因 `assignee_unverifiable`——与“图在位但未声明”区分。
  - 有 assignee 但未声明该能力：`warn`，原因 `assignee_undeclared:<tag>`，不阻断。
  - 无 assignee：返回候选 Agent（按能力覆盖、`reliability`、在途负载排序），`decision='warn'`，候选只作建议。派单热路径的候选 load 恒 0（同步纯函数不读看板库）；真实在途负载只在 REST `/candidates` 接入，两路径排序依据差异登记在未决事项。
  - 无需求：`pass`，存量卡行为不变。
- 准入接线：列编排在既有 readiness 链后调用，mention 派单在入口调用同一纯函数；默认只 warn，不阻断、不改派；不修改内核 claim 权威。若需要内核层强制，另立补丁并在本 spec 的增量三评审后再定。

### 3.3 增量三：任务能力字段与三项指标

- 任务字段：新增 `required_capabilities`（JSON 数组，可选，旧行 NULL）。语义是“完成该任务需要的能力标签”，与 `skills` 的强制加载语义分离。内核迁移随批一 `tasks.outcome_id` 同一枚补丁批次落地，避免两次迁移；补丁号等 series 尾稳定后分配，不抢先占用 804-806。
- 采集：任务创建、修订、派发各写一条结构化事件，带 `requiredCapabilities`、`source`、`declaredAt`、`actor`；不记敏感原值。
- 三项指标，全部放 `measure/`：
  - `measure/capability-supply-lead-time`：带能力需求的任务从 `created` 到首次 `run started` 的中位时长。消费者：中位超过 24h 触发能力缺口复核（P95 分位留待有足够样本后另行登记，不引用不存在的统计量）。
  - `measure/capability-reuse-rate`：被两个及以上板调用过的能力标签数 ÷ 至少被调用一次的能力标签数。消费者：零调用与低复用标签进入退役复核。
  - `measure/human-ai-team-success`：同时含 person 与 agent 成员的 OutcomeTeam，其结算 verdict 为成功的比例。消费者：团队组合复核。批三结算口径落地前返回 `available:false`，不写 0 或 100。
- 每项指标在 `metricpolicy` 登记 `consumerPlan`（计划决策/阈值/owner）；实际决策发生后才写 `consumers.decisionRef`。未发生前 consumers 为空，仍按装饰处理，不伪造决策锚。
- 新增 `GET /api/metricpolicy/capability` 一次返回三项读数；`human-ai-team-success` 在批三前 `available:false`。
- 不替换现有四类核心指标（自治率、人机配比、单任务人时、返工率），只新增能力组。

### 3.4 界面

- 治理页：`custom/client/governance/components/CapabilitySupplySection.vue` 挂进 `custom/client/ia2/views/gov/GovHarnessView.vue`，在“度量纪律”之后展示能力供需表、三项指标、源可用性、标签词法问题与采集缺口；不新增顶层菜单或孤立门户。
- 任务抽屉：`custom/client/kanban/components/CapabilityReadinessBadge.vue` 挂在 `KanbanTaskDrawer.vue` 的 skills 行后，按任务 `skills` 查候选/缺口/决策；只读建议，不自动改派。
- 创建表单：继续复用现有 `skills` 输入；`required_capabilities` 输入在 Task 8 字段落地后接入。
- 空态与未知态分开：源不可用、指标 unknown、能力未声明分别显示不同文案；高风险不得用绿色。
- 浏览器实物走查未做；SFC 编译与渲染由 2 个 jsdom 组件测试守门。

## 4. 数据契约

```ts
interface CapabilityRequirement {
  tags: string[]
  source: 'declared' | 'derived' | 'skills-fallback'
  declaredAt: number
}

interface CapabilitySupplyEntry {
  tag: string
  supplyKind: 'unit' | 'agent' | 'skill'
  ref: string
  available: boolean
  reliability?: number | null
  load?: number | null
  lastUsedAt?: number | null
  source: 'capability-ledger' | 'capability-graph' | 'skill-provisioning' | 'profiles' | 'fleet-directory'
}

interface CapabilityGapRow {
  tag: string
  demand: number
  supplyUnits: number
  supplyAgents: number
  supplySkills: number
  gap: number
  distinctBoards: number
  supplyLeadTimeMedianMs: number | null
  lastUsedAt: number | null
  sources: Record<string, { available: boolean; note?: string }>
  evidenceRefs: string[]
}

interface CapabilityReadinessCandidate {
  agentId: string
  tags: string[]
  reliability: number | null
  load: number
  evidenceRefs: string[]
}

interface CapabilityReadiness {
  decision: 'pass' | 'warn' | 'block' | 'unknown'   // unknown=供给源全部缺席，无法判定
  reasons: string[]
  candidates: CapabilityReadinessCandidate[]
  evidenceRefs: string[]
}
```

约束：

- 所有读模型 fail-soft；源缺席 `available:false`，不把缺席写成 0。
- 所有数字带 `evidenceRefs`；没有证据的候选不进候选列表。
- 标签词法复用 `SKILL_TAG_RE`，非法标签拒绝并在响应里给出原因。
- 候选排序是确定性的：能力覆盖优先，其次 `reliability` 降序，再次在途负载升序，最后 `agentId` 字典序。

## 5. 接口与侵入点

| 面 | 位置 | 侵入方式 |
|---|---|---|
| 只读供需 | `custom/server/capabilitypool/controller.ts` | 新域，挂 `GET /api/harness/capabilitypool/supply-demand`、`GET /api/harness/capabilitypool/candidates`；不写存储 |
| 任务快照 | `custom/server/kanban/dispatch-readiness.ts:94-130` | 扩展返回 `assignee/skills`；旧库无 skills 列回落三列查询 |
| 派单准入 | `custom/server/capabilitypool/readiness.ts` | `assessTaskCapabilityReadiness` 纯函数；列编排在 readiness 后调用，mention 在入口调用；默认仅 warn |
| 任务字段 | `runtime/hermes_cli/kanban_db.py:1030-1144`、`custom/server/services/hermes/kanban-task-fast.ts:195-200` | 内核补丁加列与投影；旧行 NULL |
| 任务创建事件 | `runtime/hermes_cli/kanban_db.py:1605` | 事件 payload 增加 `requiredCapabilities` |
| Matrix 生产端 | `custom/server/matrix/chat-bridge.ts:427-439` | 补 `schemaVersion:2` 与 `capabilities` |
| 指标 | `custom/server/metricpolicy/store.ts:32-92`、`derive.ts` | 新增三项与消费者登记 |
| 能力指标读数 | `custom/server/capabilitypool/metrics.ts` | 三项 `DerivedReading`；`GET /api/metricpolicy/capability` 消费 |
| 界面 | `custom/client/governance/components/`、`custom/client/kanban/components/` | 既有区块扩展 |
| 治理页供需表 | `custom/client/governance/components/CapabilitySupplySection.vue` | 挂 `GovHarnessView`，只读 |
| 任务抽屉准入 | `custom/client/kanban/components/CapabilityReadinessBadge.vue` | 挂 `KanbanTaskDrawer`，只读建议 |
| 注册表种子 | `scripts/maintenance/capability-registry-seed.mjs` | 一次性生成器：默认 dry-run，`--write` 直写目标文件；编辑与审计走 registry-admin |

## 6. 决策记录

| # | 决策 | 选择 | 备选与代价 | 类型 | 用户裁定 |
|---|---|---|---|---|---|
| D1 | 批次落点 | 新增批二点五，插在批二与批三之间；批三消费 | 并入批三会膨胀范围、无法独立停用；先做最小切片只解决可见性 | UserChallenge | approved：2026-11-19 用户选择“新增批二点五” |
| D2 | 需求字段 | 新增 `required_capabilities`，不复用 `skills` | 复用 `skills` 会混淆强制加载与能力需求，破坏存量语义 | Mechanical | 设计提案，待设计批准 |
| D3 | 调度权威 | 内核 dispatcher 保持唯一 spawn 权威；本批只出候选与准入 | 新建能力调度器会与 board fence、并发帽、HumanGate 形成双权威 | Mechanical | 设计提案，待设计批准 |
| D4 | 词表 | 以能力台账 L2/L3 与既有技能标签为源，不新建第五套 | 另建标签表会制造第二个事实源 | Mechanical | 设计提案，待设计批准 |
| D5 | 指标 | 三项能力指标，每项必须有消费者；不替换现有四类核心指标 | 无消费者的指标是装饰；替换现有指标会破坏历史口径 | Mechanical | 设计提案，待设计批准 |
| D6 | 人机团队成功率 | 批三结算口径前 `available:false` | 用任务 done 冒充业务成功会造假 | Mechanical | 设计提案，待设计批准 |
| D7 | 外部专家池 | v1 不建模，显式 `available:false` | 伪造外部池会误导调度 | Mechanical | 设计提案，待设计批准 |
| D8 | Matrix 修复 | 只修生产端到 v2，不改协议 | 改协议会破坏外部生产者兼容 | Mechanical | 设计提案，待设计批准 |
| D9 | 未声明能力 | 标 `unknown`，不填默认能力 | 填默认能力会制造虚假供给 | Mechanical | 设计提案，待设计批准 |
| D10 | 补丁号 | 等 series 尾稳定后分配，不抢先占用批一的 804-806 | 抢号会在合并时冲突改号 | Mechanical | 设计提案，待设计批准 |
| D11 | 激励机制 | 不做薪酬/排名；复用批三贡献回顾与署名 | 抄 HR 激励会越出产品边界，且违反既有非目标 | Mechanical | 设计提案，待设计批准 |

## 7. 验证

### 7.1 目标测试

- 词表校验：合法/非法标签、无主标签、未注册技能。
- 供需派生：固定夹具下每标签的 demand/supply/gap/distinctBoards/lead time；源缺席返回 null 与 `available:false`。
- 派单准入：缺技能包阻断；assignee 未声明警告；无 assignee 候选排序确定；无需求放行；存量卡不变。
- Matrix 生产端：v2 完整形状可被客户端解析器接受；v1 旧形状仍被拒绝且不崩溃。
- 指标：unknown 语义；consumers 非空；复用率公式与分母为 0 的未知态。
- 注册表种子：只写有证据的行；未声明 Agent 标 unknown；重复运行幂等。

### 7.2 集成与负例

- 一个真实任务声明 `required_capabilities`，派单前返回候选/缺口/证据；缺供给时阻断或要求带理由的例外，例外落事件。
- 高风险或 one-way 动作不因本批放松授权；本批不替代批一 DecisionProfile。
- 能力图未声明、注册表缺失、技能目录缺失三种源故障分别显示 unknown，不显示 0 或绿色。
- 存量卡（无 `required_capabilities`）行为与改造前一致。

### 7.3 全量门

- `npx vitest run <目标路径>`；合并前 `npm test`；涉服务端新增模块跑 `npm run typecheck:harness`。
- UI 改动做浏览器实物走查；推断不算。
- 独立审查：非实现者复核能力缺口计算与候选排序，避免实现者自证。

### 7.4 实施验证记录（2026-11-19）

- 目标套件：26 文件 210 例通过；`npm run typecheck:harness` 退出 0；`governance-lint --budget` 0 problems。
- 全量：`npx vitest run --exclude scripts/__tests__/overlay-pristine-replay.test.ts` 得 1192 文件通过、9250 例通过、11 跳过、0 失败。排除项是环境阻塞：`npm run clean` 检测到 8647 有在跑实例并拒绝执行，不是本批代码失败。
- 生产构建：`npm run build` 退出 0，`verify-dist` 通过。
- 真实走查：隔离服务 18647 + Vite 18649，临时 `HERMES_HOME`，真实任务 `walk-t1` 声明 `skills=["coding","review"]`。治理页能力供需显示供给时效 3,500ms、复用率 50.0%、人机团队成功率 `—`；`coding` 需求 2/单元 8/Agent 1/跨板 2，`review` 需求 1/单元 5/跨板 1；任务抽屉显示“警告 / no_assignee / 候选 worker-coder 可靠度 0.474”。
- 走查抓出并修复两处真实问题：供需同名标签被误报 `duplicate`（改为只校验需求侧每条任务）；`profiles.skills_enabled` 分类白名单混入供给（改为只计 `skills_pinned`，标签数 144→124）。
- 独立审查（2026-11-19，冷读子代理，非实现者）：P0×0 / P1×5 / P2×11。五条 P1 全部当轮修复：
  1. spec 承诺的 `skill_not_installed`/`will_force_load` 原因码与实现不符 → §3.2 改按实现口径（`capability_not_supplied:<tag>`，判定面=五源供给并集）。
  2. 种子脚本实际直写而非 registry-admin 通道 → spec 改为“生成器 dry-run/--write，编辑审计走 registry-admin”。
  3. `skills-fallback` 口径标注未落地 → 供需报告顶层 `demandSource` 字段＋治理页“需求来源”提示行。
  4. consumerPlan 阈值引用不存在的 P95 → 改“中位 > 24h”（spec 与 store 同步）。
  5. 准入路径五源全故障误报 block → 新增 `unknown` 决策（`supply_sources_unavailable`），REST 与派单两路同修；另修图缺席时 assignee 误报 `assignee_undeclared` → `assignee_unverifiable`。
  P2 修复：复用率样本下限 2（单标签 0%/100% 是单点误导）；metrics median 空数组守卫；供给侧未声明判定改用词法过滤后长度；种子脚本 skills 列剔除 skills_enabled（与 derive 同口径）；chat-bridge 标签长度改用 `SKILL_TAG_MAX`；readiness 头注释四源→五源；UI 复用率 0-1×100 渲染加守门断言。未修（登记）：派单热路径候选 load 恒 0（见未决事项 6）、供给侧词法问题未进 tagIssues、派单路径非法标签静默放行（REST 422，两路口径差异接受）。

## 8. 设计文档影响

DESIGN_SYNC: touched
DESIGN_DOCS: docs/DESIGN.md

实施批同批修订：

- 权威数据源表：`required_capabilities`、能力供需只读投影、能力候选查询的唯一来源与边界。
- 架构与治理章：能力准入与内核调度权威的关系；候选只读，不新建第二调度器。
- 指标章：三项能力指标的定义、消费者与 unknown 语义；现有四类核心指标不变。
- 产品界面章：能力供需表、任务抽屉能力面、创建表单能力标签输入的落点。
- 关联 spec 索引与机制预算：新增只读投影/准入/指标登记 `sunset` 与配对退役（静默空表 catch、装饰指标降级）。

本 spec 只立项，不改产品行为；上述修订随实施第一批同批提交，未提交前不声称已同步。

已随批修订：`docs/DESIGN.md` §2.3 能力供需段、§2.6 能力供需视图、§3.9 权威数据源与跨域契约；
`config/mechanism-budget.json` 已登记本批 `+1 域/+1 script`、配对降级（注册表静默空表 catch 改显式告警）
与 sunset（批三开工前复核）。

## 9. 风险与回滚

| 风险 | 缓解与回滚 |
|---|---|
| `skills` 语义被误用 | 新增独立字段；`skills` 保持强制加载；存量卡不迁移 |
| 任务表迁移破坏历史 | 只加可空列与追加事件；旧行 NULL；回滚保留档案 |
| 能力准入误阻断 | 只在技能包确定性缺失时阻断；assignee 覆盖只警告；例外带理由可放行 |
| 候选排序制造新权威 | 候选只读；派单仍由内核与既有编排决定；不自动改 assignee |
| 能力图生成器不在仓内 | 只写有证据的声明；未知标 unknown；生成器缺失显式 `available:false` |
| 指标再次装饰化 | 每项必须有消费者；无消费者标装饰并退出主位 |
| 补丁号冲突 | 等批一 804-806 稳定后再分配；合并前重查 series 尾 |
| 机制通胀 | 在 `config/mechanism-budget.json` 登记新投影/准入/指标的 owner、reviewBy、retireWhen，并配对退役静默空表 catch 与装饰指标降级 |

退役判据不使用“看起来没人用”。须在多轮真实任务中确认人和 Agent 均不消费，或被更完整正本替代；退役后保留历史档案，停止新写入与导航入口。

## 10. 未决事项

1. `required_capabilities` 的最终字段名与是否允许自由标签，需在实施前由设计评审确认。
2. 能力准入是“仅 overlay 警告”还是“内核 claim 前阻断”，取决于批一补丁与内核改动窗口；本 spec 先按 overlay 警告设计，内核阻断另立补丁。
3. 能力图的 27 个未声明 Agent 是否在本批补齐，取决于 owner 是否愿意提供有证据的声明；不以推测填充。
4. 外部专家池是否在未来建模，需单独立项；本批只保留 `available:false` 占位语义。
5. 批三 `OutcomeTeam` 消费本批供需表的接口形态，需在批三增量 spec 中确认。
6. 候选排序的 load 键在两条路径依据不一致（审查 S2）：派单热路径（列编排/mention）是同步纯函数、候选 load 恒 0；真实在途负载只在 REST `/candidates` 经 `collectAgentLoads` 接入。若两路排序差异造成实际误排，再评估把负载快照注入派单路径的成本。
7. 供给侧词法问题（如台账单元声明了非法标签）目前静默丢弃、不进 `tagIssues`；量小且治理面有 unknowns 兜底，出现实际污染再收口。
8. 派单路径对非法需求标签静默按“无需求”放行（不抛错），REST `/candidates` 则 422——两路口径差异是有意的（派单热路径禁抛），已用注释与测试固化。
