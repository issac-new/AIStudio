# AI 原生组织运行模型：结果闭环、共享认知与组织工作台设计

> 日期：2026-11-19
> 状态: 已批准（2026-11-19 用户批准设计；批一/批二/批三各自实施前另立增量 spec）
> 用户方向裁决：2026-11-19 当前会话选择「全做 C」；首个试点=AIStudio 自身授权闭环（同会话裁决）
> 关联：`2026-11-19-process-framework-pending-batch.md` N03/N04、`2026-11-06-workunit-responsibility-ledger.md`、`2026-11-05-org-governance-autonomy-scale.md`

本设计写给后续三批实现者、独立审查者与验收人。读完应能确定对象边界、数据契约、授权矩阵、界面落点和验收方法，不需要重新解释四份外部报告。

## 批准前六问

1. **决策**：决定 AIStudio 是否把现有看板、审批、证据、记忆和组织治理零件接成一套围绕业务结果运行的人机协作系统。项目所有者批准方向；每批的结果责任人批准该批业务验收。
2. **口径**：外部研究只提供设计原则，不把案例数字变成产品 KPI。麦肯锡的 2—5 人/50—100 Agent 是特定 agent factory 观察；BCG 的 80% 只限约 50 家样本企业；Gartner 的 74%/2% 是会议投票预期；Reserv 的提速只限其披露场景。
3. **可逆性**：三批均以可选 `outcomeId` 和功能开关灰度，存量卡不迁移、不改变完成语义。代码按批 revert；新增记录保留只读归档，不删除历史。
4. **署名**：项目所有者对「全做 C」范围负责；每个 OutcomeContract 必须指定一名 active 自然人作为结果责任人。Agent 不承担人的最终责任。
5. **停止条件**：出现无授权执行、跨作用域读取、存量卡无法完成、经验未经审核进入下一任务、贡献观察被自动转成个人排名，或两批连续真实试点均未使用新契约时，停止扩量并回退相应批次。
6. **语法**：变更权限、结果验收、经验复用、团队编组、会议议程和贡献回顾语法；不改变数据权属，不接薪酬、晋升、招聘或法定人事考核。

## 1. 背景与目标

### 1.1 外部研究的可用结论

四份一手来源已经形成一组相互衔接的约束：

- Deloitte：认知层把 Knowing、Acting、Learning 接成一条链；Agent  workforce 需要共享、实时、受治理的上下文、记忆与判断标准。
- McKinsey：小型多学科人类团队拥有并监督 AI 工作流，围绕端到端业务成果组织；治理实时嵌入，但人承担最终责任。
- Gartner：从业务价值出发反向设计工作，再决定人、外部资源与 AI 的分工；管理者转向辅导、权衡和结果责任。
- BCG：结果责任、AI 生产与人指导评价、按风险和可逆性分配决策权、会议转向校准与决策、评价转向影响与判断。

这些是设计依据，不是对 AIStudio 当前成熟度的证明。

### 1.2 仓内现状

AIStudio 已有大量可复用单元：看板 DAG、完成合同、OrchestrationView 根任务协同图、BPA Owner/KPI、责任卡、RACI、四挡权限、审批账、评审治理、证据账、Workitem Panorama、Hindsight、Proactive/Outbox、Standing Agenda、DecisionGraph、经验候选与受控注入。

实际断点有三个：

1. BPA 的 KPI/Owner 与任务关联目前主要是登记和分组，工程完成与业务结果结算没有统一契约。
2. 四挡、风险分类、责任卡和动作契约存在多条局部路径；N03/N04 已确认结构化授权与执行器接线未完成。
3. 记忆、证据、经验提取和注入都存在，但共享上下文不是冻结的一致快照，学习效果也没有普遍回指到下一次业务结果。

### 1.3 目标

- 给一个真实业务结果建立唯一、版本化的 OutcomeContract，并能追溯到任务、团队、授权、证据、结算和学习。
- 让风险、可逆性和既有四挡共同决定 outcome-scoped 动作的 allow/ask/deny；任何新规则只能收紧硬边界。
- 让每次派单可冻结并审计其上下文、政策和已审核经验版本。
- 把交付完成与业务结果达成分开表达，支持「交付完成、结果观察中」。
- 提供结果团队、决策议程和证据化贡献回顾，不做自动个人排名。
- 用至少一个真实结果走通全链；学习效果至少使用两个同口径结果做对照，不足时明确标「未验证」。

### 1.4 非目标与反目标

- 不追求 Agent 数量、人机比例、团队缩小或会议减少等外部案例数字。
- 不新建第二棵任务树、第二套 Owner 台账、第二个知识库或另一套通用自治等级。
- 不把任务 done、消息 delivered、工具调用量或生成内容量当业务价值。
- 不做薪酬、晋升、招聘、岗位淘汰、个人排行榜或自动绩效评分。
- 不允许一次成功或失败静默修改记忆、权限、门禁或技能。
- 不把当前单租户证据存储宣称为已完成多租户隔离；本轮不开放在线跨租户共享。

## 2. 总体方案与分批边界

用户已选择完整 C。实施仍分三批，每批独立 spec 增量、计划、测试、独立审查和合并，不把全部改动压成一个长寿命分支。

| 批次 | 交付 | 必须证明 | 下一批准入 |
|---|---|---|---|
| 批一：结果与授权地基 | OutcomeContract、独立测量事实/结算、风险×可逆性×四挡、最小决策快照、看板与 Hermes 审批接线 | 一个真实结果从合同走到观察/结算；高风险或 one-way 未授权必拒；存量卡不变 | 批一全量测试、真实走查、独立审查通过 |
| 批二：共享认知与学习 | 在最小决策快照上扩全量上下文、结果证据聚合、学习候选审核与召回、同口径对照 | 同一快照被相关 Agent 使用；未审核经验不出现；下一次运行能证明实际召回 | 至少一个结果完成学习闭环；效果不足则标未知，不扩量 |
| 批三：组织工作台 | 动态结果团队、决策议程、贡献回顾与治理界面 | 人能编组团队、处理议程并签署贡献回顾；所有结论可回指证据 | 全量回归与浏览器走查；无自动人事结论 |

每批可在上一批稳定后单独停用。批三停用不影响批一/批二的结果与证据链。

### 2.1 首个真实试点（用户已裁决）

试点选择 **AIStudio 自身的高风险动作授权闭环**，不依赖外部客户数据，也不新增自动采集适配器。

- Outcome：`outcome-scoped 高风险动作全部经有权审批且可追溯`。
- 结果责任人：项目所有者（当前账号 plusprimer）；只有其在 `people` 中为 active 自然人时才允许激活，不能靠账号名绕过人员校验。
- measure 1：`unauthorized_high_risk_actions`，单位=次，operator=`eq`，target=`0`，baseline 未采集则为 null。
- measure 2：`high_risk_decision_trace_coverage`，单位=`%`，operator=`gte`，target=`100`；口径=同时具备有效 DecisionGrant、正确签署人与证据引用的 outcome-scoped 高风险动作数 ÷ 同范围高风险动作总数 ×100。分母为 0 时结果 unknown，不得记 100。
- 数据来源：真实审批账、OutcomeEvent、Hermes 执行日志和对应测试/走查证据。结果责任人或验证责任人审阅后通过 measurements 端点提交 actual，并附 evidenceRefs；系统不自动造数。
- 第二个同口径结果：下一张真实高风险 outcome 卡，沿用同一 measure 定义；不使用推演假数据替代。
- 独立验收：非实现者复核日志与测量计算，避免实现者自证。试点证明的是本产品的授权闭环，不声称外部组织绩效提升。

## 变更

三批增量各自立实施计划与测试；本段是总变更面（实现时按批落地，不以本段冒充已完成）。

- 新增 `custom/server/outcome/` 域：合同类型与校验、事件台账（哈希链）、状态机、测量与结算建议、DecisionProfile 授权矩阵（含双侧共享判定向量）、最小上下文快照、REST 控制器；`OUTCOME_WORKBENCH=1` 显式启用。
- 补丁三枚（号取 series 当时尾，当前尾 803）：宿主路由挂载（773 范式）、看板 `tasks.outcome_id` 列＋decompose 子任务继承（含 runtime 镜像）、Hermes 审批守卫 outcome 接线＋双签（含 runtime 镜像）。
- 接线：`column.dispatch` 按 taskId 反查 outcome 并生成最小快照；Approval Inbox 高危双签分支扩展（505-546 先例）；审批账记录带 outcome 引用。
- 客户端：根任务抽屉 OutcomeSection（建/激活/观察/结算）、OrchestrationView 五问面板接真实合同、Panorama 结果面。
- 配套：`config/mechanism-budget.json` 登记＋配对退役、DESIGN.md 权威数据源表与治理章、文档索引重生成、首个试点（AIStudio 授权闭环）走查与独立核验。

## 3. 核心架构

```text
BPA 流程/KPI 字典（可选来源）
              │
              ▼
OutcomeContract（根任务唯一扩展，版本化）
              │冻结版本
      ┌───────┴────────┐
      ▼                ▼
OutcomeTeam       DecisionPolicy
人/Agent 引用      风险×可逆性×四挡
      │                │
      └───────┬────────┘
              ▼
OutcomeContextSnapshot（派单时冻结）
              │
              ▼
看板 DAG / LoopForge / 审批 / 执行入口
              │
              ▼
Evidence + Eval + Review + DecisionGraph
              │
              ▼
OutcomeSettlement（业务结果，不等于任务 done）
              │
              ▼
ExpCandidate（待审核学习）→ 受控注入 → 下一结果对照
              │
              ▼
DecisionAgenda / ContributionReview（只读聚合＋人署名）
```

### 3.1 唯一身份与事实源

- 现有根任务仍是任务 DAG 与 OrchestrationView 的执行锚。OutcomeContract 通过唯一 `rootTaskId` 扩展根任务，不复制标题树或依赖关系。
- `outcomeId` 是独立稳定 ID；`rootTaskId` 有唯一约束。存量根任务无合同仍可运行，界面标为「未建模业务结果」。
- BPA 继续拥有流程与 KPI 定义。OutcomeContract 可引用 `processId/kpiId`，同时冻结当次定义摘要与版本；没有 BPA 来源时允许手工定义，稍后可通过审核晋升到 BPA。
- 人员、Agent、角色与责任仍分别来自 `agentidentity/people`、身份册、角色工具矩阵和责任卡。OutcomeTeam 只保存引用。
- 任务通过 `outcomeId` 关联结果；OutcomeContract 不冗余保存 taskIds。查询侧按任务索引生成关联，避免双写。
- 经验仍存 `expcandidates`；决策仍写 DecisionGraph；人类判断仍写 `agentidentity/judgments`。新域只拥有结果合同、结果事件、上下文快照和结果团队版本。

### 3.2 工程完成与业务结果分离

Outcome 生命周期：

```text
draft → active → observing → settled
  │        │          │
  └────────┴──────────┴──→ cancelled（须理由与责任人）
```

- `active`：工作正在执行。
- `observing`：交付已达到工程完成条件，业务指标仍在收集。界面必须显示「交付完成/结果观察中」，不能显示「业务目标达成」。
- `settled`：结果责任人签署结算。`verdict` 独立取 `achieved|partial|missed|unknown`，不以状态名暗示成败。
- `unknown` 必须写原因、证据缺口和 `nextReviewAt`；不是绿色通过。
- 既有项目完成状态不改写。带 outcome 的项目可以增加结果观察面，但不把延迟指标硬塞进现有项目 done 状态。
- 进入 `observing` 由结果责任人或验证责任人显式发起，服务端核验根任务及全部同 outcome 子任务已终结、要求的工程验收证据有效后才迁移；本轮不新增自动事件监听器。
- 根任务重开或工程验收被撤销时，服务端把 outcome 退回 `active` 并追加事件。已 settled 的旧结算标为 `superseded`，保留历史且必须重新结算；不得继续显示「结果已达成」。

### 3.3 批一接入边界与 outcome 继承

批一只承诺以下权威链，不用「全入口已统一」作宣传：

1. 根任务创建/激活合同时写入 `outcomeId`；`kanban_decompose` 和图卡持久化创建子任务时继承同一 `outcomeId`。禁止子任务改挂其他 outcome，除非结果责任人走显式迁移并留下事件。
2. `column.dispatch` 与 RACI 派单由 taskId 在服务端反查 outcome、合同版本和身份，生成批一最小决策快照。客户端提交的 outcomeId/contractVersion 不作为授权依据。
3. Hermes `tools/approval.py` 的既有审批守卫从当前 run 的可信任务上下文取得 taskId，接入同一 DecisionProfile 与四挡裁决；Approval Inbox 的 approve/reject 只写同一 DecisionGrant。runtime 镜像与补丁同步修改。
4. LoopForge 仅在其现有 KanbanBridge 建立的任务链上继承 outcome，不另接通用 Agent 执行器。直接 chat、CLI、delegate 等无法证明 taskId 的入口不属于 outcome-scoped 覆盖面，行为不变且不得声称取得 outcome 授权。
5. `complete_task` 继续只负责工程完成；它提供进入 observing 的核验证据，不自动做业务结算。

批二只扩快照内容和学习面，不改变批一授权链。批三的团队、议程和贡献界面不得新增绕过上述守卫的执行通道。

## 4. 数据契约

### 4.1 OutcomeContract

```ts
interface OutcomeContract {
  schemaVersion: 1
  outcomeId: string
  rootTaskId: string
  version: number
  title: string
  valueStatement: string
  ownerPersonId: string
  processRef?: { processId: string; kpiId?: string; definitionVersion: string }
  measures: OutcomeMeasure[]
  acceptance: { statements: string[]; requiredEvidenceKinds: string[] }
  scope: { included: string[]; excluded: string[] }
  riskTier: 'low' | 'medium' | 'high'
  defaultReversibility: 'reversible' | 'costly' | 'one-way' | 'unknown'
  verificationOwnerId: string
  contextPolicy: { allowedScopes: string[]; excludedSourceKinds: string[] }
  learningOptIn: boolean
  status: 'draft' | 'active' | 'observing' | 'settled' | 'cancelled'
  createdAt: number
  updatedAt: number
}
```

`OutcomeMeasure` 只保存稳定定义，不保存会变化的 actual：

```ts
interface OutcomeMeasure {
  measureId: string
  name: string
  definition: string
  unit: string
  operator: 'gte' | 'lte' | 'eq'
  baseline: number | null
  target: number
  sourceRef: string
}
```

测量事实另存为追加记录：

```ts
interface OutcomeMeasurement {
  measurementId: string
  outcomeId: string
  measureId: string
  contractVersion: number
  actual: number | null
  availability: 'available' | 'pending' | 'unavailable'
  evidenceRefs: string[]
  observedAt: number
  recordedBy: string
  recordedAt: number
}
```

规则：

- 至少有一个 measure 或一条 qualitative acceptance；两者都空不得离开 draft。
- `baseline=null`、`actual=null` 是合法未知，不能自动补零。
- 数值判定只生成建议；最终 verdict 由结果责任人签署。
- `contractVersion` 只随定义、责任、验收、范围、风险、政策等合同语义递增。追加测量、状态迁移和结算不递增合同版本。
- `PUT /outcomes/:id` 在 draft 可改定义；active 后属于合同修订，必须递增 version 并让旧审批失效。该端点不得修改 actual、observedAt 或 measurement 历史。
- 测量记录绑定定义版本。measureId 定义未变时可追加新观测；定义改变后旧测量只作历史，结算必须引用当前版本的 measurementIds。
- 运行中的快照仍引用旧合同版本，不 retroactively 改历史。

### 4.2 OutcomeEvent 与 Settlement

- `OutcomeEvent` 追加制，含 `eventId/outcomeId/contractVersion/type/actor/at/payload/hash/prevHash`。
- 类型限定为合同激活、测量追加、状态迁移、结算、取消、团队变更和上下文快照生成。
- 写入沿用现有原子文件与哈希链纪律；写失败对状态变更 fail-closed，对只读聚合返回来源不可用。
- Settlement 至少包含合同定义快照、本次引用的 measurementIds、acceptance 证据、verdict、rationale、signedBy、signedAt 和 contractVersion。

### 4.3 DecisionProfile 与授权矩阵

新增 `DecisionProfile`，不把可逆性继续隐藏在单一风险档里：

```ts
interface DecisionProfile {
  riskTier: 'low' | 'medium' | 'high'
  reversibility: 'reversible' | 'costly' | 'one-way' | 'unknown'
  externalEffect: boolean
  basis: string[]
}
```

`classifyApprovalRisk` 保留旧签名并委托给新分类器，避免两套正则和词表漂移。Outcome/Action 声明只能把自动分类结果调严，不能调松。

执行顺序：

1. 既有 hardline/user-deny/sudo/沙箱 floors 先判；拒绝即终局。
2. `plan` 对非只读动作拒绝。实施备忘（批一 Task 5 审查 M2）：outcome 授权矩阵对 `plan` 挡无条件 deny（含 low+reversible，向量已钉死）——比「非只读」字面更严，属有意收紧，后续读者勿当 bug 放宽。
3. outcome-scoped 动作按合同版本、身份、角色与下表裁决。
4. 所有结果写统一审批账；批准绑定 action、合同版本、上下文快照、批准人和过期时间。

| 条件 | build | guarded | yolo（仅 outcome-scoped 新增政策） |
|---|---|---|---|
| low + reversible + 无外部影响 | allow | allow | allow |
| medium 或 costly | ask | allow并记政策放行 | allow并记政策放行 |
| high、one-way、unknown 或外部影响 | ask | ask | ask |
| high + one-way | 结果责任人＋独立复核人双签 | 同左 | 同左 |
| 身份/作用域/版本无法证明 | deny或待补证，不猜 allow | 同左 | 同左 |

该表只收紧新 outcome-scoped 面，不改变未接入合同的既有 yolo 行为。任何推广到全局执行入口的动作另立兼容性 spec。

授权边界补注（T12 复审 Minor-1，2026-11-20 批一 Task 15 收录）：fleet: 绑定条目 `dual_sign_required=false` 而分类器判 high 时单签即决——合同门为权威的取舍，两分类器分歧角落取合同门。

### 4.4 OutcomeContextSnapshot

派单时生成不可变快照：

```ts
interface OutcomeContextSnapshot {
  snapshotId: string
  outcomeId: string
  contractVersion: number
  teamVersion: number | null
  decisionPolicyVersion: string
  /** 实际注入 Agent 的规范化只读内容；不是仅有一组可失效引用。 */
  content: Record<string, unknown>
  sourceRefs: Array<{ kind: string; id: string; version?: string; sha256?: string }>
  approvedExperienceVersions: string[]
  excludedSources: Array<{ kind: string; reason: string }>
  createdAt: number
  sha256: string
}
```

- 批一快照只物化合同、任务、身份、责任和政策；teamVersion 可为 null。批二在同一信封中追加 Panorama、DecisionGraph/PremiseLog 与 approved 经验，不另建快照格式。
- `content` 保存 Agent 当时实际看到的规范化文本和结构化字段，`sourceRefs` 只负责溯源。历史还原承诺覆盖「Agent 看到的上下文」，不承诺外部链接和二进制原件永远仍存在。
- 快照持久化保存完整 content 与 canonical JSON 的 sha256，不做环形覆盖；超过 1 MiB 或 100 个来源时拒绝生成，要求缩小上下文，不静默截断。
- 内容来自合同、团队、责任卡、政策及批二读模型。只读面源失败必须进入 `excludedSources`；关键合同、身份或政策源失败则禁止派单。
- 不把 Hindsight 原始私有记忆全量共享。只有满足作用域、来源和审核要求的条目才能进入快照；敏感原值、密钥和未授权附件字节不得物化。
- 每个相关 Agent 接收同一 snapshotId；旧 run 可逐字还原当时注入的上下文。

### 4.5 学习候选与效果对照

- Settlement、eval badcase 和复盘可生成/更新 `ExpCandidate`，扩展可选 `outcomeId`、`sourceSettlementId`、`baselineOutcomeRef` 和 `evaluationOutcomeRefs`。
- 状态沿用 `candidate|approved|rejected`；只有 approved 且作用域匹配才可注入。`learningOptIn` 与既有环境开关同时满足才开启实验写入。
- 注入记录包含 snapshotId、经验版本和目标任务；不能把「已注入」写成「有效」。
- 对照至少记录同一 measure 定义、基线、目标、实际、质量门和异常。只有两个以上同口径结果才允许给「有改善迹象」；否则 `effect=unknown`。
- 经验可退役；退役不删除历史，只停止后续快照引用。

### 4.6 OutcomeTeam

```ts
interface OutcomeTeam {
  outcomeId: string
  version: number
  familyRef?: { familyId: string; version: number }
  accountablePersonId: string
  reviewerPersonId?: string
  members: Array<{
    subjectKind: 'person' | 'agent'
    subjectId: string
    role: string
    responsibility: string
  }>
  status: 'draft' | 'active' | 'closed'
  changeReason: string
  updatedBy: string
  updatedAt: number
}
```

- team-library 只给候选家族和 roster，不自动派单；结果责任人确认后才 active。
- 高风险必须 reviewer 与 accountable 人不同；Agent 必须在身份册中处于可用阶段，人员必须 active。
- M 型管理者对应跨域编排责任，T 型专家对应深度专业与异常处理；它们是角色描述，不新建岗位等级。
- RACI 和 OrchestrationView 消费同一团队版本；成员变化递增版本并写事件。

#### 归属与签署权限

- v1 只支持既有单租户桌面/自托管 profile，由显式 `OUTCOME_WORKBENCH=1` 启用；服务端以根任务所在 board 和当前部署存储确定归属，不接受客户端提交 tenantId。无法证明根任务归属时创建返回 422 `ownership_unavailable`。多租户 SaaS 与跨部署共享不在本轮开放。
- `OutcomeContract.ownerPersonId` 是唯一业务结果责任人；`OutcomeTeam.accountablePersonId` 必须与其相同。`verificationOwnerId` 是验证责任人，团队的 reviewerPersonId 与其相同；高风险时两者必须是不同的 active 自然人。
- 只有结果责任人可激活、修订、取消和结算合同，也只有该责任人可确认团队版本。验证责任人可发起 observing 迁移并执行工程验证，但不能代替结果责任人签署业务 verdict。
- high+one-way 的第一签来自结果责任人，第二签来自验证责任人；两者之外的人不能代签。批准绑定当前合同与快照版本，任一变化即失效。
- 测量可以由结果/验证责任人或有来源权限的采集适配器提交；无论来源如何都必须附 evidenceRefs，签署人/适配器身份由服务端确定。
- 贡献评价由结果责任人或验证责任人签署；评价对象为自然人时禁止自评。系统管理员身份本身不授予冒签权。

### 4.7 DecisionAgenda

决策议程是确定性只读投影，不是新调度器。来源仅限：

- 待审批/双签事项；
- 阻塞或逾期结果；
- PremiseLog 到期或被推翻的假设；
- 评审分歧和升级；
- 待审核学习候选；
- 待确认团队变更。

每项必须有 `agendaId/outcomeId/kind/question/owner/evidenceRefs/riskTier/reversibility/age/sourceRef`。例行进度的状态摘要不进入议程。每个来源独立报告 `available`；来源失败不能显示成「没有待决事项」。

人作出决定后仍写原权威域：审批去审批账，假设去 PremiseLog，学习审核去 expcandidates，团队变化去 OutcomeTeam；DecisionGraph 保存统一决策引用。

### 4.8 贡献回顾

贡献回顾分两层：

1. **机器可读事实**：结果测量、任务/运行证据、评审结论、人类 judgment、团队角色和 approved 经验的实际召回。
2. **人签署评价**：对 person/agent/team 写 `effective|mixed|ineffective|unknown`，必须有 rationale 与 evidenceRefs。

扩展 `JudgmentRecord` 为兼容旧记录的判别联合：旧 kind 继续要求 `unitId`；新 `kind='contribution_review'` 改用 `outcomeId + subject`，并增加上述评价。所有记录仍只能 `source='human-entry'`。

约束：

- 不输出总分、排名、薪酬建议或因果信用比例。
- Shapley、任务历时、消息数和工具调用量只能作为有局限的观察，不进入评价结论的自动计算。
- 人可以评价「判断是否有证据、是否纠正了 AI、是否处理了例外、结果是否改善」；系统不得自动替人签署。

## 5. 界面与使用路径

### 5.1 不新增孤立门户

- 扩展 `TasksView → orchestra` 的 OrchestrationView：有合同的业务结果显示真实 outcome、measure、团队版本和控制点；无合同根卡保留现有启发式，并明确标注。
- 扩展 `IdeWorkitemPanorama`：增加 outcome、上下文快照、业务结算和学习召回面，每面独立可用性。
- 扩展 `TasksView → gov-org` 的 GovOrgKnowledgeView：在现有五流/知识/决策图谱前增加 DecisionAgendaSection；增加 OutcomeTeamSection 与 ContributionReviewSection。
- 扩展 `TasksView → effectiveness`：只增加同口径结果对照链接，不新增个人排行榜。
- 新建/编辑合同使用现有抽屉、表单、按钮和面板外壳；路由继续使用现有 tab query，不增加顶层菜单。

### 5.2 主流程

1. 结果责任人在根任务上建立合同，定义价值、测量、验收、风险与可逆性。
2. 系统给出候选团队和缺失项；人确认团队并激活合同。
3. 派单冻结上下文，Agent 执行；需要决策的事项进入审批或议程。
4. 工程完成后进入 observing；收集结果，责任人签署 settlement。
5. 系统生成学习候选；审核后在后续同类任务中受控召回并做对照。
6. 贡献回顾把事实与评价并列展示，所有评价可回指证据。

### 5.3 界面诚实态

- 空数据、来源失败、指标未知、经验未验证分别使用不同文案。
- 不设置假按钮；每个动作必须连接实际端点和权威状态机。
- 高风险、one-way、来源不可用不得用绿色。
- 中文为默认文案，标识符保持英文；补既有 i18n 字典。

## 6. 接口与侵入点

所有路由由新 `custom/server/outcome/outcome-controller.ts` 与 `org-workbench-controller.ts` 提供，经补丁追加到宿主 `bootstrap/routes.ts`；补丁号在实现 rebase 后取 series 当前尾部，不预留固定号。所有端点走宿主 JWT、`ok/fail/bodyOf` 和服务端身份/归属检查。

| 方法 | 路径 | 用途 | 写幂等/并发 |
|---|---|---|---|
| GET | `/api/hermes/outcomes` | 按状态/责任人/根任务查询 | — |
| POST | `/api/hermes/outcomes` | 创建 draft | `clientRequestId`；rootTaskId 唯一冲突 409 |
| GET | `/api/hermes/outcomes/:id` | 合同、当前团队、测量、结算和可用性 | — |
| PUT | `/api/hermes/outcomes/:id` | 更新并递增合同版本 | `expectedVersion`；冲突 409 |
| POST | `/api/hermes/outcomes/:id/transitions` | active/observing/cancelled 等迁移 | `eventId`；非法迁移 422 |
| POST | `/api/hermes/outcomes/:id/measurements` | 追加测量事实 | `measurementId`；重复返回原事实 |
| POST | `/api/hermes/outcomes/:id/settlement` | 人签署结果结算 | `settlementId`；版本/签署冲突 409 |
| GET | `/api/hermes/outcomes/:id/context` | 查询当前/指定快照 | — |
| POST | `/api/hermes/outcomes/:id/context-snapshots` | 冻结派单上下文 | 内容 hash 幂等 |
| PUT | `/api/hermes/outcomes/:id/team` | 确认团队与新版本 | `expectedVersion`；变更留痕 |
| GET | `/api/hermes/org-workbench/agenda` | 决策议程与来源可用性 | — |
| GET | `/api/hermes/outcomes/:id/contribution` | 贡献事实与已签评价 | — |
| POST | `/api/hermes/outcomes/:id/contribution-reviews` | 人签署贡献评价 | `reviewId`；只收 human-entry |

学习审核复用 expcandidates 既有端点，只扩 outcome 过滤与引用字段；审批、PremiseLog、DecisionGraph 不新增旁路写接口。

A 类新增集中在 `custom/server/outcome/`、`custom/client/governance/components/` 与对应 API/测试。B 类仅用于宿主路由挂载、上游任务 `outcomeId` 持久化和必须进入上游执行咽喉的接线；所有上游行为改动走 patches/series 与 runtime 镜像同步。

## 7. 复用与版本约束

### 7.1 必复用单元

| 单元 | 复用方式 |
|---|---|
| `kanban_decompose/kanban_db_graph` | 保留任务 DAG，只增加 outcome 关联 |
| `OrchestrationView` | 保留根任务画布与五问，接入真实合同和团队 |
| `bpa-types/bpa-task-link` | 复用流程/KPI 字典；新合同承载一次结果实例 |
| `agentidentity/responsibility/people` | 结果责任人、复核人和准入证据唯一来源 |
| `approval-inbox/risk-tier` | 委托到 DecisionProfile，保留旧适配签名 |
| `executioncontract/mode-policy` | 复用四挡语义，组合 outcome 授权矩阵 |
| `completion_contract` 与卡级 verification | 工程验收继续由原权威完成点执行 |
| `evidence-store/reviewgov/trust` | 证据与评审事实来源 |
| `workitem/buildPanorama` | 上下文读侧汇聚，不新建第二套聚合器 |
| `decisiongraph/premiselog` | 决策记录、假设复核与议程来源 |
| `expcandidates/exp-inject/eval/flywheel` | 学习候选、审核、召回和效果对照 |
| `team-library` | 结果团队候选，不做自动选择 |
| `Proactive/Outbox/Approval Inbox` | 待决与异常来源，议程不绕过原处理链 |
| `agentidentity/judgments` | 人签署贡献评价，禁止遥测自动写入 |

已读组件清单和当前源码；不引入新框架、数据库、图表库、LLM 服务或核心依赖升级。

### 7.2 新增胶水

新代码只承载既有系统没有的对象：OutcomeContract、OutcomeEvent、OutcomeContextSnapshot、OutcomeTeam、决策议程投影和 API/UI 胶水。不得复制 owner、审批、知识、经验或评测存储。

## 8. 安全、隐私与权限边界

| 边界 | 威胁 | 约束 |
|---|---|---|
| 结果合同写入 | 伪造责任人、冒签 | 签署人取服务端认证身份，必须 active；客户端不得指定 signedBy |
| 上下文共享 | 跨用户/租户泄露 | 使用现有可证明的 workspace/归属边界；无法证明同域时不共享并标 unavailable |
| 经验注入 | 未审核指令污染 | 仅 approved、作用域匹配、版本固定的文本；历史经验不得冒充本轮证据 |
| 动作执行 | 风险低判、授权绕过 | 服务端重算 DecisionProfile；合同只能调严；high/one-way/unknown 必问 |
| 评价 | 遥测冒充人的判断 | contribution_review 只收 human-entry，不生成排名 |
| 文件与引用 | 路径穿越、敏感原值落账 | 只存引用与摘要，路径规范化；密钥仅存 env 名，不写敏感原值 |
| 路由 | 未认证/越权读写 | 宿主 JWT 默认保护；每个写端点做服务端角色与归属校验 |

本轮不宣称修复 evidence-store 等既有单租户边界。新功能若运行在无法证明归属的共享部署，结果上下文共享必须关闭；这不是用新域掩盖旧债。

## 9. 验证

本节是测试设计，不代表已执行。实现采用先测试后实现；每批先让新增守门用例在旧实现上失败。

### 9.1 单元与契约测试

- OutcomeContract：缺值、非法 operator、null 基线、版本递增、rootTaskId 唯一、存量无 outcomeId 兼容。
- 状态机：draft/active/observing/settled/cancelled 全路径；unknown 必须有缺口与 nextReviewAt；工程 done 不自动等于 achieved。
- 授权矩阵：四挡×四可逆性×三风险×外部影响全覆盖；high+one-way 双签；合同只能调严、不得调松；身份/版本缺失拒绝。
- 快照：同输入同 hash；源失败进入 excludedSources；关键源失败禁止派单；旧 run 可还原旧版本。
- 学习：candidate/rejected 不注入；approved 且双开关才注入；退役后不再召回；注入不自动宣称有效。
- 团队：候选不自动成队；高风险复核分离；成员变更版本与理由；身份不可用不得激活。
- 议程：只含需决策事项；来源失败与空列表可区分；处理后回到原权威域。
- 贡献：非 human-entry、缺 rationale、缺 evidenceRefs 拒绝；响应无总分/排名字段。

### 9.2 接口测试矩阵

每个新端点至少覆盖：正常、401/403、400/422、404、409/幂等、依赖失败。PUT/POST 另测重复提交不产生第二条历史，过期 `expectedVersion` 不覆盖他人变更。GET 聚合端点逐源模拟不可用，检查不会把失败伪装成零数据。

### 9.3 集成与负面测试

- 同一高风险动作从看板、审批收件箱和已接入执行入口得到相同裁决，只产生一个权威决定及对应引用。
- 断库、审批超时、证据写入失败、经验存储损坏、团队身份失效、进程中断后恢复均有确定终态。
- 变异探针：删除高风险复核、把 one-way 改 reversible、移除 approved 过滤、伪造 signedBy，对应测试必须失败。
- 既有卡无 AC/dod、无 outcomeId 的兼容行为保持；既有四挡在非 outcome-scoped 面不被本轮改变。

### 9.4 浏览器与真实业务验收

1. 在隔离环境创建一个带数值目标和验收证据的真实根任务，建立结果团队并激活。
2. 走派单、审批、执行、工程验收、结果观察、业务结算；检查每个界面状态与来源。
3. 生成一条学习候选，证明未审核不出现；审核后在第二个同口径任务证明实际召回。
4. 比较两次结果。样本不足或口径不同，页面与交付结论均写「效果未知」。
5. 在决策议程处理审批/假设/学习/团队各一项，确认回到原权威域。
6. 签署一条贡献评价，刷新和重开后仍可追溯；页面无个人总分和排名。
7. 覆盖桌面与窄容器、亮暗主题、空态、来源失败和权限拒绝；实际截图与走查记录留档，历史二进制限制按仓规处理。

### 9.5 每批工程门

- 目标 `npx vitest run <path>`；新增服务端模块跑 `npm run typecheck:harness`。
- 触及补丁时 `npm run inject` 重放、runtime 镜像同步和对应 pytest；不重启用户未授权的宿主 gateway。
- 合并前 `npm test`、`node scripts/merge-invariants.mjs --check`、相关客户端类型棘轮。
- 基线实测：本设计分支在 2026-11-19 得到 9215 通过、11 跳过、1 失败；唯一失败是 8647 活服触发 `npm run clean` 安全拒绝。用户已批准登记为环境阻塞继续设计；每批实施合并前仍须在允许窗口复跑，不能把该登记当作测试通过。

## 10. 风险、回滚与退役

| 风险 | 缓解与回滚 |
|---|---|
| 结果合同变成额外填表负担 | 只在声明 outcome 的根任务启用；存量不变；从现有 RACI/BPA/责任卡预填但不伪造 |
| 业务指标滞后阻塞工程交付 | observing 与 settled 分离；项目工程状态不被强行改写 |
| 多入口裁决仍不一致 | 每批公布已接入口清单，未接入口不宣称覆盖；负面集成测试守同权 |
| 共享上下文越权 | 无归属证明不共享；快照列排除源；逐源权限校验 |
| 经验污染与错误学习 | 审核、版本、作用域、退役和效果未知五道约束；停用注入即可回滚 |
| 贡献评价异化为监控排名 | 只展示事实与人署名评价；无总分/排名；发现自动人事消费即停止该面 |
| 数据迁移破坏历史 | 只加可选字段与追加事件；旧记录只读兼容；回滚保留档案 |
| 机制通胀 | 在 `config/mechanism-budget.json` 登记新合同/快照/团队/议程/贡献面的 owner、reviewBy、retireWhen；配对收敛旧风险分类适配、N03/N04 挂账和 `userGoal` 近似面 |

退役判据不使用「看起来没人用」。须在多轮真实结果中确认人和 Agent 均不消费，或合同被更完整正本替代；退役后保留历史档案，停止新写入与导航入口。学习效果未验证不构成宣称成功的理由。

## 11. 可观测性与运营

- 结构化事件：`outcome.contract.*`、`outcome.context.*`、`outcome.authorization.*`、`outcome.settlement.*`、`outcome.learning.*`、`outcome.team.*`、`outcome.contribution.*`。
- 公共字段：outcomeId、contractVersion、snapshotId、actor、result、reasonCode；不记敏感原值。
- 指标只放 `measure/`：合同缺口数、授权拦截、结果观察时长、学习候选审核/召回、议程来源不可用、贡献评价证据覆盖。
- 不设 `settle/` 个人或团队绩效指标。任何未来结算口径必须另立版本化 spec 和法务/隐私审查。
- 告警处理：上下文关键源失败→停止派单；授权账写失败→停止相关写动作；经验注入异常→空注入并记录；聚合面失败→显示来源不可用，不阻断无关业务。

## 12. 认知与偏差自检

- **权威偏误**：四家机构的名望不替代仓内源码证据；所有外部数字保留样本边界。
- **确认偏误**：同时记录已有能力和断点，不把全新系统当作默认答案。
- **规划谬误**：C 分三批，前一批真实闭环未通过不扩后一批。
- **后见之明与错误归因**：经验对照必须同口径；两次结果也不能自动证明因果。
- **指标异化**：贡献评价不以可调用量替代判断；无因果证据不出排名。
- **交付衰减**：即使三批全做，也只能证明 AIStudio 支持这些组织机制，不能证明采用者已经成为 AI 原生企业。

## 13. 参考资料

一手来源：

- McKinsey, *The Agentic Organization: Contours of the Next Paradigm for the AI Era*（2025-09）：https://www.mckinsey.com/capabilities/people-and-organization/our-insights/the-agentic-organization-contours-of-the-next-paradigm-for-the-ai-era
- Deloitte, *Building the AI-native enterprise*（官网未显示发布日期）：https://www.deloitte.com/us/en/services/consulting/articles/enterprise-ai-operating-model-for-ai-native-businesses.html
- BCG, *Five Ways That AI Front-Runners Change How Work Gets Done*（2026-09-24）：https://www.bcg.com/publications/2026/companies-use-ai-to-redesign-work
- Gartner, *The AI-Shaped Organization Reimagines Work, Not Jobs*（2026-10-30）：https://www.gartner.com/en/articles/ai-shaped-organization
- 微信二手导读者文章·上篇（2026-11-19）：https://mp.weixin.qq.com/s/iIPBYx6BjGWS3PNoqjG8Rg
- 微信二手导读者文章·下篇（2026-11-20）：https://mp.weixin.qq.com/s/Wgb93mOGgzWOA1mEpPoDjQ —— 下篇增量对账（2026-11-20 补充调研）：「六个核心变化」与本设计三批对象一一对应（工作设计=OutcomeContract、成果型团队=OutcomeTeam、有边界授权=DecisionProfile 矩阵、组织认知=快照/学习闭环、复合能力=角色引用、经营成果=结算与对照）；「五步转型路径」（价值链→拆工作→定分工→调机制→结果检验）即批一试点主流程的叙述形态，不新增机制面。新增可引数据点：McKinsey《The State of AI 2025》（约 1993 家受访）——25 项组织实践中工作流程重构与 genAI EBIT 影响关联最强，仅 21% 组织已根本重构至少部分工作流程（官网直连被拦，经多源二手交叉证实；仅作叙事依据，不设为产品 KPI）。

仓内关联：

- `docs/superpowers/specs/2026-11-19-process-framework-pending-batch.md` N03/N04
- `docs/superpowers/specs/2026-11-06-workunit-responsibility-ledger.md`
- `docs/superpowers/specs/2026-11-05-org-governance-autonomy-scale.md`
- `docs/superpowers/specs/2026-10-16-wx-three-article-research.md`
- `docs/reports/2026-09-30-org-design-semantica-research.md`

## 决策记录

| # | 决策 | 选择 | 备选与代价 | 类型 | 用户裁定 |
|---|---|---|---|---|---|
| D1 | 建设范围 | 完整 C，但分三批 | 只做 A 会缺学习与工作台；一次全写会放大回归面 | UserChallenge | approved：当前会话「全做 C」 |
| D2 | 结果对象 | 扩展现有根任务，新增版本化 OutcomeContract | 新建第二棵任务树会与看板 DAG/ORCHESTRATION 双写 | Mechanical | 设计提案，待设计批准 |
| D3 | 完成语义 | 工程完成与业务结算分离 | 用任务 done 代表业务达成会造假；阻塞项目等长期指标会破坏既有流 | Mechanical | 设计提案，待设计批准 |
| D4 | 决策权 | 风险×可逆性×四挡，outcome-scoped 先收紧 | 只看职级不符合研究；直接全局改 yolo 会破坏兼容 | Mechanical | 设计提案，待设计批准 |
| D5 | 认知层 | 冻结共享快照，不复制原始私有记忆 | 全量共享有越权与漂移风险；只读 Panorama 又无法还原历史派单语境 | Mechanical | 设计提案，待设计批准 |
| D6 | 学习 | 复用 expcandidates，审核后召回并做结果对照 | 自动学习会污染后续行为；只存知识库无法证明有效 | Mechanical | 设计提案，待设计批准 |
| D7 | 团队 | team-library 只推荐，结果责任人确认 | 自动选队把词面分数误当适配事实 | Mechanical | 设计提案，待设计批准 |
| D8 | 议程 | 确定性聚合既有待决来源 | 新建会议调度/日报会重复 Proactive 与状态面板 | Mechanical | 设计提案，待设计批准 |
| D9 | 贡献评价 | 事实＋人签署评价，不做分数与排名 | 自动评分会产生因果错觉和监控异化 | Mechanical | 设计提案，待设计批准 |
| D10 | 依赖 | 不新增或升级依赖 | 新数据库/框架会增加部署与迁移成本 | Mechanical | 设计提案，待设计批准 |
| D11 | 首个试点 | AIStudio 自身高风险授权闭环；人工核验真实日志后提交测量 | 外部业务试点需额外数据源与适配器 | UserChallenge | approved：当前会话选择推荐项 |
| D12 | 根任务结果面板读侧（批一 Task 13） | 合同/快照走既有读端点；测量与结算无读端点——面板仅回显本会话提交响应并如实标注「以事件账为准」；根卡判定=抽屉 links.parents 为空；权限前端按登录名禁用示因、服务端 403 终裁 | 临时造测量/结算读端点超出批一 API 面；静默显示来路不明的旧值违反 fail-soft 不造假 | Mechanical | 设计提案，待设计批准 |

> D12 实施锚点：根任务结果面板落地于 297064277（批一 Task 13），复审修复 M-1/M-2 于 fbda213e0；本笔为授权修订的收据重绑（SPEC_REBIND）。

## 设计文档影响

DESIGN_SYNC: touched
DESIGN_DOCS: docs/DESIGN.md

每批实施时同批修订：

- 权威数据源表：OutcomeContract、OutcomeEvent、OutcomeContextSnapshot、OutcomeTeam 的唯一来源及其与根任务/BPA/责任卡的关系。
- 架构与治理章：工程完成与业务结算分离、风险×可逆性×四挡矩阵、学习审核与效果未知语义。
- 产品界面章：OrchestrationView、Workitem Panorama、GovOrgKnowledgeView 和 Effectiveness 的新增消费面。
- 安全与指标章：归属无法证明不共享、贡献评价只收 human-entry、不输出个人排名。
- 关联 spec 索引与机制预算随实际新增/退役面更新；不以本设计草案冒充已实施事实。
