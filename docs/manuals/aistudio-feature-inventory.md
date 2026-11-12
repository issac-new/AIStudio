# AIStudio 前端功能清单：入口、职责与边界

> 面向需要查入口、备课和解释功能边界的用户与讲师。
>
> 基线：`3690ceba3`；版本：AIStudio `1.0.16-overlay`；盘点日期：2026-11-12。
>
> **这是一份静态代码盘点，不等于全部活体验证。**“真写”表示代码会调用写接口、写文件、改 Git、启停进程或修改外部服务，不表示本次已在每种部署上执行成功。矩阵服务、模型供应商、Git 仓、PTY、桌面桥、SSH/Docker、推演数据目录是否可用，需要按目标环境另行验收。空态、离线回退、未接线和本地模拟均按代码原义标注。

## 一、先看总数和计数口径

默认配置指 `config/features.ts` 的出厂值，Web 端且无桌面浏览器桥。路由以真实注册链、上游路由和注入补丁合并后的静态结果为准。

| 类别 | 数量 | 计数说明 | 主要证据 |
|---|---:|---|---|
| 默认内容路由 | **80** | 工作总览、项目与执行记录等 19 + 六阶段 6 + SIM 9 + 专题 4 + IDE 1 + 独立 Matrix 2 + 收编设置/Hermes 28 + 未收编 11 | `scripts/regression/route-manifest.ts:91-133` |
| 重定向 | **41** | 注入态真实注册链 41 条，含 pet=false 的 petdex 重定向与 catch-all 1 条 | `custom/client/ia2/routes.ts:56-68,138-145`；`patches/297-client-router-cockpit-family-removal.patch:83-85` |
| 默认禁用的公开外链 | **2** | 路由记录存在，默认守卫送回 `/app`，不计入 80 个可用内容页 | `patches/523-client-s3-entries-gates.patch:15-18` |
| 桌面桥条件页 | **2** | 浏览器与下载历史，仅 `hasDesktopBrowserBridge()` 为真时注册，不计入 80 | `vendor/hermes-studio/packages/client/src/router/index.ts:290-303` |
| 六阶段页签 | **37** | ①6、②4、③4、④5、⑤6、⑥12 | `custom/client/ia2/stage-tabs.ts:30-89` |
| 四专题页签 | **26** | 评测 8、技能治理 3、本体 9、流程架构 6 | 四个专题主视图的 `*_TABS` 注册表 |
| IDE 辅助栏页签 | **23** | 编码 3、知识 3、观测 6、协作 4、工具与配置 7 | `custom/client/ide/views/IdeSidePane.vue:66-94` |

**本次注入态实跑结果是 123 条路由、82 页、41 重定向。**`route-manifest.ts` 另生成 37 个阶段页签，因此走查态总数为 160。82 页含两个默认被禁公开外链，扣除后就是本文的 80；桌面桥两页不提前计入默认 Web 页面。生成器已补齐真实 bootstrap 的 projects 注册，所以项目列表和项目详情在这 80 页内；旧 `/hermes/history*` 两页由补丁退役，catch-all 计入 41 条重定向，不再把未注入 vendor 的临时结果当成产品计数。

### 边界标签怎么读

| 标签 | 含义 |
|---|---|
| 真写 | 代码存在真实写接口或副作用；仍需目标环境验证权限与执行结果 |
| 只读 | 页面以查询、投影、导航或本地导出为主，源数据编辑要去另一入口 |
| 模拟/离线 | 数据来自推演、内置场景、本地推导、浏览器存储或明确的离线回退 |
| 外部依赖 | 功能依赖 Matrix、模型、Git、外部进程、桌面桥、SSH/Docker 等 |
| 未接线 | 开关、按钮或声明没有有效运行时消费者，或当前只有占位/提示，不能当成已生效能力 |

---

## 二、工作总览、项目、执行记录、看板、审批与历史：19 个内容路由

| # | 入口与功能 | 实现与边界 |
|---:|---|---|
| 1 | `/app` 工作总览：五步搭建、五阶段交付、空态引导 | 只读配置信号与看板任务，不读推演 run-state；团队/环境部分步骤可显示“未纳入跟踪”。`custom/client/ia2/routes.ts:216-223`；`custom/client/ia2/views/journey/JourneyView.vue:1-75` |
| 2 | `/app/not-found` 诚实 404 | 公共只读页，保留原地址并提供总览/工作台/看板/检索出口。`custom/client/ia2/routes.ts:225-236`；`custom/client/ia2/views/NotFoundView.vue:14-45` |
| 3 | `/app/collab` 三栏工作台 | 会话/房间/循环导航、对象画布、任务与决策；聊天和建房为真写，依赖 Hermes 会话、Matrix 与工作流服务。`custom/client/ia2/routes.ts:258-265`；`custom/client/ia2/views/WorkbenchView.vue:1-17,274-294` |
| 4 | `/app/dash` 工作台概览 | 我的待办、评审闸口、交付进度与异常服务，30 秒轮询；服务失败按未知/异常呈现，不伪造全健康。`custom/client/ia2/routes.ts:267-273`；`custom/client/ia2/views/WorkbenchView.vue:119-178` |
| 5 | `/app/s/chat` 新 Hermes 会话画布 | 真写会话与模型调用，嵌入态隐藏重复会话侧栏。`custom/client/ia2/routes.ts:274-282`；`vendor/hermes-studio/packages/client/src/views/hermes/ChatView.vue:38-46,100-124` |
| 6 | `/app/s/chat/:sessionId` 指定 Hermes 会话 | 按 `sessionId` 加载会话，支持 `profile` 与消息定位；外部模型/会话库依赖。`custom/client/ia2/routes.ts:283-288`；`vendor/hermes-studio/packages/client/src/views/hermes/ChatView.vue:23-36,70-89` |
| 7 | `/app/s/room/:roomId` Matrix 房间画布 | 房间消息读写、任务流解析，依赖 Matrix 凭据与 homeserver。`custom/client/ia2/routes.ts:289-294`；`custom/client/ia2/views/WorkbenchView.vue:276-294,336-356` |
| 8 | `/app/s/group/:roomId` Hermes 群聊房间 | 群消息与多智能体协作真写；无 `roomId` 时上游群聊列表会规范到真实房间。`custom/client/ia2/routes.ts:295-304`；`vendor/hermes-studio/packages/client/src/views/hermes/GroupChatView.vue:39-57,60-83` |
| 9 | `/app/l/:loopId` Legacy Loop 薄详情 | **只读** cron/自治/预算/停止条件与最新运行；写操作去运行详情或看板，禁止拿 Loop ID 查 Workflow Run API。`custom/client/ia2/routes.ts:305-314`；`custom/client/ia2/views/LegacyLoopView.vue:1-7,37-55` |
| 10 | `/app/board` 全量看板 | 四个本地页签：看板、任务协同、协作与知识、交付效能。日常卡建改/批量操作是真写；推演卡只读并回推演区。`custom/client/ia2/routes.ts:315-320`；`custom/client/ia2/views/TasksView.vue:56-77,184-207`；`custom/client/kanban/views/SwarmKanbanView.vue:32-47,184-198` |
| 11 | `/app/inbox` 审批收件箱 | 人工介入、命令/评审待审与历史，批准/打回是真写并留痕；10 秒轮询。`custom/client/ia2/routes.ts:321-326`；`custom/client/ia2/views/InboxView.vue:27-44` |
| 12 | `/app/history` Hermes 会话历史 | 历史检索、阅读、导入、置顶、归档/删除；后四项是真写，依赖会话库和 profile 权限。`custom/client/ia2/routes.ts:505-509`；`vendor/hermes-studio/packages/client/src/views/hermes/HistoryView.vue:25-26,82-109,133-146` |
| 13 | `/app/history/session/:sessionId` 指定历史会话 | 同上，深链加载指定会话和分页消息。`custom/client/ia2/routes.ts:510-514`；`vendor/hermes-studio/packages/client/src/views/hermes/HistoryView.vue:34-58,82-109` |
| 14 | `/app/agent` 全局智能体新会话 | 全局智能体对话真写，模型与 profile 依赖。`custom/client/ia2/routes.ts:515-519`；`vendor/hermes-studio/packages/client/src/views/hermes/GlobalAgentView.vue:43-81` |
| 15 | `/app/agent/session/:sessionId` 指定全局智能体会话 | 指定会话加载/切换；不存在时回全局智能体列表。`custom/client/ia2/routes.ts:520-524`；`vendor/hermes-studio/packages/client/src/views/hermes/GlobalAgentView.vue:28-41,65-81` |
| 16 | `/app/records` 执行记录列表 | 统一查询编码 CLI 与 delegate 留痕，支持类型/结果/agent/task 筛选和分页；**只读旁路观测**，索引保留近 14 天，被拒绝的尝试也在列。`custom/client/ia2/routes.ts:489-496`；`custom/client/ia2/views/records/RecordsListView.vue:18-89,92-99` |
| 17 | `/app/records/:kind/:id` 执行记录详情 | `delegate` 按 taskId 读结果与日志尾部，`coding-run` 按 sessionId 读会话、usage 和变更；**只读**，索引或详情被裁剪时明确缺席。`custom/client/ia2/routes.ts:497-503`；`custom/client/ia2/views/records/RecordDetailView.vue:23-67,130-160` |
| 18 | `/app/projects` 项目工作流列表 | 聚合项目状态与任务分布；暂停、恢复、完成是真写，完成有未终结任务时需显式理由覆盖。`custom/client/projects/index.ts:10-29`；`custom/client/projects/views/ProjectsView.vue:27-55,77-149` |
| 19 | `/app/projects/:id` 项目工作流详情 | 读取统计、未终结任务、时间线和任务拓扑，暂停/恢复/完成与列表同权；拓扑品牌 HTML 经 CSP 与 sandbox 展示，失败回退 Mermaid 源。`custom/client/projects/index.ts:17-29`；`custom/client/projects/views/ProjectDetailView.vue:30-121,146-199,227-230` |

**projects 与 records 不是同一类页面。**projects 面向项目生命周期和任务聚合，允许受控写操作；records 面向编码运行与委托执行的只读留痕，不提供项目完成或执行重跑按钮。二者路由、API 和完成判据分别验收。

**看板本地四签不计入六阶段 37 签。**它们属于 `/app/board` 组件内部状态，证据是 `custom/client/ia2/views/TasksView.vue:56-77`。同理，SIM 四签和专题 26 签单独计数，不混入阶段页签。

---

## 三、六阶段：6 个内容路由、37 个页签

六条路由都复用 `StageShell`，页签经 `?tab=` 深链；未知键回退默认签，②的旧 `launch` 键回落 `preflight`。实现见 `custom/client/ia2/views/stage/StageShell.vue:30-38,76-89,127-172` 和 `custom/client/ia2/stage-tabs.ts:117-148`。

| 阶段 | 路由 | 默认签 | 注册位置 |
|---|---|---|---|
| ①搭建 | `/app/stage/setup` | `steps` 五步进度 | `custom/client/ia2/routes.ts:247-252`；`custom/client/ia2/stage-tabs.ts:31-38` |
| ②需求 | `/app/stage/reqs` | `reqs` 需求与冻结 | `custom/client/ia2/routes.ts:253`；`custom/client/ia2/stage-tabs.ts:39-44` |
| ③分析设计 | `/app/stage/design` | `tasks` 任务分解 | `custom/client/ia2/routes.ts:254`；`custom/client/ia2/stage-tabs.ts:45-50` |
| ④开发 | `/app/stage/build` | `today` 今日工作 | `custom/client/ia2/routes.ts:255`；`custom/client/ia2/stage-tabs.ts:51-57` |
| ⑤验收 | `/app/stage/accept` | `overview` 验收总览 | `custom/client/ia2/routes.ts:256`；`custom/client/ia2/stage-tabs.ts:58-65` |
| ⑥治理 | `/app/stage/govern` | `clearance` 遗留项清算 | `custom/client/ia2/routes.ts:257`；`custom/client/ia2/stage-tabs.ts:66-88` |

### ①搭建：6 签

| 页签 | 能做什么 | 实现与边界 |
|---|---|---|
| `steps` 五步进度 | 组织→账号→团队→环境资产→智能体的状态和下一步 | 只读真实配置信号；团队/环境没有完整日常信号时不计伪进度。`custom/client/ia2/stage-tabs.ts:32`；`custom/client/ia2/views/stage/StageSetupSteps.vue:1-41` |
| `org` 组织 | 维护账号、角色、汇报线、团队、Matrix 绑定；离职移交/停用/审计 | **真写治理仓和 Synapse**；`super_admin` 才能调用管理维护端点，另需 Synapse 管理 token。admin 行变更要双人会签或紧急通道。`custom/client/ia2/components/gov/OrgEditor.vue:1-3,43-101`；`custom/server/governance/governance-controller.ts:578-618` |
| `accounts` 账号 | 直建/邀请人类与 AI 助理账号，维护 roster | 真写，双闸为登录 `super_admin` + Synapse 管理 token；邀请口令只回一次、不落盘。`custom/client/ia2/views/AccountAdminView.vue:1-28,78-99`；`custom/server/governance/governance-controller.ts:661-689` |
| `teams` 团队 | 注册房、团队自声明、领导邀请、值守分派、派发列表 | 真写 Matrix 状态事件；普通成员写自声明，领导由 leaders 状态判定后显示管理面，依赖 Matrix 在线。`custom/client/matrix-teams/views/TeamsManagePanel.vue:38-92,158-204`；`custom/client/matrix-teams/stores/team-registry.ts:50-67,153-174,234-266` |
| `assets` 环境与资产 | 密钥轮换台账、应用资产规则、模型服务商、主动性策略 | 真写配置和治理仓；密钥只存环境变量名。模型目录保存可写穿 IDE 引擎，装载失败禁止空目录覆盖。`custom/client/ia2/views/stage/StageAssetsPanel.vue:1-23`；`custom/client/ia2/components/gov/GovModelProvidersSection.vue:1-5,73-119` |
| `agents` 智能体 | 档案列表、网关/运行时重启、模型绑定 | 真写 profile 配置与进程操作，重启后生效；普通账号只看到自己的授权 profile。`custom/client/ia2/views/agents/AgentsView.vue:1-5,36-65`；`custom/server/services/hermes/profile-access.ts:16-27` |

### ②需求：4 签

| 页签 | 能做什么 | 实现与边界 |
|---|---|---|
| `reqs` 需求与冻结 | 看待分类、待办、可进入分析的任务和下一步 | 只读看板，启动推演是跨区入口，不把推演进度混进日常需求。`custom/client/ia2/views/stage/StageRequirementsOverview.vue:1-27` |
| `docs` 文档评审 | 治理工件全文、评审裁决、组织/应用资产维护 | 读写混合；工件保存即本地 Git 提交，分支证据件只读，工件编辑仅 `super_admin`。`custom/client/ia2/views/gov/GovDocsReviewView.vue:1-7,49-89,225-253`；`custom/server/governance/governance-controller.ts:247-284` |
| `g1` 质量门 G1 | G1 修复单、派修、复审、通过或有理由豁免 | 真写状态机，只展示合法迁移，没有“绕过质量门”按钮。`custom/client/ia2/stage-tabs.ts:42`；`custom/client/ia2/views/gov/GateRepairsPanel.vue:1-6,70-83,122-144` |
| `preflight` 启动准备 | 核对需求全分类、至少一张可分析卡、G1 无未结修复 | 只读检查，启动/续跑去推演编排；读取失败要人工复核，不能当作通过。`custom/client/ia2/views/stage/StagePreflight.vue:1-4,25-63` |

### ③分析设计：4 签

| 页签 | 能做什么 | 实现与边界 |
|---|---|---|
| `tasks` 任务分解 | 本阶段任务看板、拆解、依赖与流转 | 日常卡真写；复用全量看板并按阶段状态过滤，推演卡只读。`custom/client/ia2/stage-tabs.ts:46`；`custom/client/ia2/views/stage/StageShell.vue:164-172,222-230` |
| `analysis` G2 系统分析 | G2 设计工件和评审裁决 | 工件读写与评审真写；`scope=g2` 不重复显示组织/资产表单，编辑回①。`custom/client/ia2/stage-tabs.ts:47`；`custom/client/ia2/views/gov/GovDocsReviewView.vue:29-31,98-102,242-253` |
| `g2` 质量门 G2 | G2 修复单闭环 | 真写合法状态迁移和豁免理由。`custom/client/ia2/stage-tabs.ts:48`；`custom/client/ia2/views/gov/GateRepairsPanel.vue:29-37,108-144` |
| `schedule` 排期 | 查看 `scheduled` 任务并打开原卡 | 本签只读，排期变更去看板，没有伪造的独立日期表单。`custom/client/ia2/views/stage/StageSchedulePanel.vue:1-18,21-51` |

### ④开发：5 签

| 页签 | 能做什么 | 实现与边界 |
|---|---|---|
| `today` 今日工作 | 我的/阻塞/评审任务与待我裁决 | 只读聚合，任务行开原卡，审批行进收件箱。`custom/client/ia2/views/stage/StageDevToday.vue:1-23,36-66` |
| `board` 看板 | 本阶段开发卡的流转与批量操作 | 日常卡真写、阶段过滤；推演卡跨区只读。`custom/client/ia2/stage-tabs.ts:53`；`custom/client/kanban/views/SwarmKanbanView.vue:184-211` |
| `approvals` 审批待办 | 介入/清偿 + 命令/评审审批及历史 | 真写审批决策，汇总缺失显示“未知”而非 0。`custom/client/ia2/views/stage/StageDevApprovals.vue:1-26,43-62` |
| `risk` 风险与交接 | 磁盘容量水位与交接风险 | 只读集群巡检异常，端点缺席明确显示未接入。`custom/client/ia2/views/stage/StageRiskPanel.vue:1-14`；`custom/client/ia2/views/gov/CapacityLampBanner.vue:16-50` |
| `quality` 质量与测试 | G3/G4 修复单与复审 | 真写 G3/G4 状态迁移，按双门过滤。`custom/client/ia2/stage-tabs.ts:56`；`custom/client/ia2/views/gov/GateRepairsPanel.vue:17-37` |

### ⑤验收：6 签

| 页签 | 能做什么 | 实现与边界 |
|---|---|---|
| `overview` 验收总览 | 评审、完成、受阻任务和四个验收入口 | 只读日常任务，无推演运行也能验收。`custom/client/ia2/views/stage/StageAcceptanceOverview.vue:1-29` |
| `trace` 需求追溯 | 验收标准、执行结果、人工判定对账 | 日常源只读，原卡可编辑；推演 AC 判定链是折叠的只读参照。`custom/client/ia2/views/stage/DailyTracePanel.vue:1-29,42-56` |
| `delivery` 交付健康 | 分支、工作区、结果缺项与容量 | 只读日常任务及推演参照，缺分支/完成无结果直接标出。`custom/client/ia2/views/stage/DailyDeliveryPanel.vue:1-31,41-71` |
| `uat` UAT 待判 | 所有 `review` 任务，打开原卡或审批 | 列表只读，判定写操作在原卡/审批系统完成，不写推演台账。`custom/client/ia2/views/stage/DailyUatPanel.vue:1-25,36-45` |
| `g5` G5 审批 | 发布类审批和发布前任务检查 | 发布审批真写；服务端只许 `super_admin` 或 `release` 角色批准/打回/发布，普通登录用户可提交。`custom/client/ia2/views/stage/DailyG5Panel.vue:1-24,26-48`；`custom/server/governance/lifecycle/release-state.ts:181-192` |
| `cases` 交付案例 | 建案例、P1-P6/G1-G6 灯、证据、同步 QGate | 真写 Matrix 案例房与判定事件，依赖 Matrix 和中央仓；QGate 无记录时如实提示。`custom/client/matrix-teams/views/DeliveryCasesView.vue:17-82,119-200` |

### ⑥治理：12 签

| 页签 | 能做什么 | 实现与边界 |
|---|---|---|
| `clearance` 遗留项清算 | 按目标登记根治 PR 或有理由豁免，查看开轮放行灯 | 真写处置台账；豁免理由必填，未清时阻止新运行。`custom/client/ia2/views/gov/ClearancePanel.vue:1-10,46-70,128-159` |
| `issues` 问题清单 | 本轮 ISSUE 与 DISP 联合处置率 | **只读单轮账本**，不是组织级跨轮总账。`custom/client/ia2/views/gov/GovIssuesPanel.vue:1-5,20-45` |
| `posture` 治理姿态 | 生效姿态、审计链、MCP 漂移、紧急停止 | 读取真值；可重置 MCP 基线。STOP-ALL 是合作式中止而非进程强杀，停后仍运行会标红。`custom/client/ia2/views/gov/GovPostureView.vue:1-15`；`custom/client/governance/components/EmergencyStopSection.vue:1-5,24-42` |
| `secAudit` 安全审计 | 覆盖账本、候选、三态裁决、独立复核、报告 | 真写项目/发现/裁决；自证拒绝，confirmed 要完整追踪链与有界观察。`custom/client/ia2/views/gov/SecAuditPanel.vue:1-10,69-137` |
| `audit` 审计与变更 | 四源审计、PROV-O、变更单、冻结窗口、事故/事件流 | 审计查询只读；变更草拟/提交/决议/实施和冻结窗口为真写，冻结冲突不能静默绕过。`custom/client/ia2/views/gov/GovAuditChangeView.vue:1-12`；`custom/client/governance/components/ChangeGovernanceSection.vue:1-18,130-180` |
| `trust` 长程可信 | 主张审计、双准入、完整性栅栏、断点核对 | 真写检查案件与审计事件；页面不能直接改完成态，准入由服务端证据判定。`custom/client/ia2/views/gov/LongHorizonTrustPanel.vue:1-16,106-211` |
| `reviewGov` 评审治理 | 风险分档、熔断、发现项、审批、夜间扫描、合并 | 真写案例和治理动作；PR 导入不主动回写 GitHub/GitLab。`custom/client/ia2/views/gov/ReviewGovPanel.vue:1-15,51-62,130-281` |
| `improve` 改进实验 | 提案、探测、组合、晋级、回滚、经验库 | 真写实验记录；**本页不跑模型**，探测只认 Eval Studio 真实运行，缺证据不放行。`custom/client/ia2/views/gov/HarnessImprovePanel.vue:1-5,230-360` |
| `metrics` 度量检查 | 容量、六门/六域、AI 质量、评测运营、驾驭工程 | 以只读聚合为主；可显式运行六域体检并留痕，不能把历史台账当成本轮新结果。`custom/client/ia2/views/stage/StageMetricsPanel.vue:1-18`；`custom/client/ia2/views/gov/GovHealthSection.vue:60-80` |
| `docs` 文档评审 | 治理工件和评审 | 与②同一实现、无 `g2` 限定，读写边界相同。`custom/client/ia2/stage-tabs.ts:83`；`custom/client/ia2/views/gov/GovDocsReviewView.vue:49-89,242-247` |
| `gateLog` 质量门记录 | 全部六门修复单与历史 | 真写合法状态迁移，空 `gates` 表示全部门。`custom/client/ia2/stage-tabs.ts:84`；`custom/client/ia2/views/stage/StageGatePanel.vue:1-10` |
| `proactivity` 主动性两轴 | 两轴矩阵、执法策略解析态、目标漂移 | **本签只读**，编辑和确认回①环境与资产；`HERMES_PROACTIVITY_ENFORCE` 未开时策略仅呈现不拦截。`custom/client/ia2/stage-tabs.ts:85-87`；`custom/client/governance/components/ProactivitySection.vue:1-9,195-199,216-295` |

⑥仅做展示分组：待处理 2 签、审计与质量 7 签、改进与度量 3 签；分组不改变 `?tab=` 和注册顺序。证据：`custom/client/ia2/stage-tabs.ts:91-115`。

---

## 四、全流程推演 SIM：9 个内容路由

SIM 有导演图运行与 26 步 harness 两套运行体系，不能混用详情或证据口径。壳层四签为兄弟路由，中央重复页签条已退役。`custom/client/ia2/views/sim/SimCenterView.vue:38-88` 明确分流。

| # | 路由与功能 | 实现与边界 |
|---:|---|---|
| 1 | `/app/sim` 导演台：场景规划、图运行、人工闸、26 步总览 | **不是纯模拟。**启动会创建真实看板任务并由代理执行；模块拆解可用判定端，失败时明确回退词表推导。harness 启停会占用/重置 SIM 环境。`custom/client/ia2/routes.ts:404-409`；`custom/client/ia2/views/sim/DirectorPanel.vue:1-5,130-199,270-318` |
| 2 | `/app/sim/supervision` 监督面板 | **只读零写**观察窗、研判、停滞判定、分支实物信号；点行看 journal 原行。导演 run 下显示“不适用”，不静默换详情。`custom/client/ia2/routes.ts:410-414`；`custom/client/ia2/views/sim/SupervisionPanel.vue:1-4,78-99` |
| 3 | `/app/sim/ops` 运行监控 | 四服务拓扑、调度器、空闲工作者、运行活性，只读；探测命令未配置时显示未接入。`custom/client/ia2/routes.ts:415-419`；`custom/client/ia2/views/sim/OpsPanel.vue:1-5,62-111` |
| 4 | `/app/sim/evidence` 证据库 | 锚反查、截图、遗留台账、完整报告，只读；图片走授权 Blob，缺目录/缺帧不造证据。`custom/client/ia2/routes.ts:420-424`；`custom/client/ia2/views/sim/EvidencePanel.vue:1-6,43-67,192-260` |
| 5 | `/app/sim/director/:runId` 导演运行详情 | 图事件流、节点、人工闸，批准/打回为真写；26 步 harness 不使用此详情。`custom/client/ia2/routes.ts:425-432`；`custom/client/ia2/views/sim/DirectorRunDetail.vue:1-17,71-81` |
| 6 | `/app/sim/settings` 推演设置 | 姿态、观察窗、清偿策略、审批升级超时真写；值域由服务端裁决，显示回传有效值。`custom/client/ia2/routes.ts:443-448`；`custom/client/ia2/views/sim/SimSettingsView.vue:1-10,43-60` |
| 7 | `/app/sim/orchestration` 运行编排 | 图运行清单只读，场景规格画布编辑真写；启动/续跑/人工闸回导演台。`custom/client/ia2/routes.ts:449-454`；`custom/client/ia2/views/sim/SimOrchestrationView.vue:1-10,27-57` |
| 8 | `/app/sim/map` 业务地图 | 需求×本体/板级图谱/FIBO/spec/模块五层；图谱只读，节点标注真写并经 WebSocket 协同，最后写胜出。`custom/client/ia2/routes.ts:455-461`；`custom/client/ia2/views/sim/BusinessMapView.vue:1-16,98-131,234-287` |
| 9 | `/app/runs/:runId` 图运行详情/回放 | 只读图与时间轴回放、检查器、JSON 导出；完成 run 可沉淀模板并登记治理仓，属于真写。`/app/runs` 列表页仍退役。`custom/client/ia2/routes.ts:473-481`；`custom/client/loop/runcenter/views/RunDetailView.vue:1-7,99-148` |

---

## 五、四个专题：4 个内容路由、26 个页签

四路由始终注册，开关只控制导航与内容是否显示“未启用”；它们不关闭服务端能力或端点。统一壳实现：`custom/client/ia2/views/IaFeatureShell.vue:1-33`；注册口径：`registries/client/bootstrap.ts:52-73`。

### 5.1 Eval Studio 评测：`/app/eval`，8 签

路由：`custom/client/eval/index.ts:8-16`。

| 页签 | 能做什么 | 实现与边界 |
|---|---|---|
| `sets` 评测集 | 建集、密封、导出、留出题库、红队种子与变体 | 真写评测库；密封题内容永不出库，只回聚合，导出失败不伪装。`custom/client/eval/views/EvalView.vue:75-155`；`custom/client/eval/components/HeldOutPanel.vue:1-4,44-82` |
| `runs` 运行记录 | 发起回放、A/B 对比、报告、人工仲裁、失败回流与复评 | 真写运行和裁决；可按来源证据复现，密封集禁止借 origin 探测。`custom/client/eval/views/EvalView.vue:167-234`；`custom/client/eval/components/EvalReportPanel.vue:83-180` |
| `metrics` 指标治理 | 指标→动作、消费证据、能力覆盖、行为信号 | 只读指标台账，能识别未接线和装饰性指标；行为信号不可用不阻断。`custom/client/eval/components/MetricRegistryPanel.vue:1-4,35-49,108-167` |
| `redteam` 安全红队 | 确定性变异、进化、逃逸率/误报、历史 | **离线规则检测**并真写运行记录；S0 与 ToolResultGuard 同源，S1 是否接线单独显示。`custom/client/eval/components/RedteamPanel.vue:1-4,29-77,112-138` |
| `oracle` UI Oracle | 建 UI 用例，比较预测变化与真实 DOM/像素变化 | 真写用例并操作目标浏览器；外部目标 URL 和可选视觉判定依赖运行环境，离线状态明示。`custom/client/eval/components/EvalOraclePanel.vue:15-33,61-108` |
| `advice` 优化建议 | 烧钱会话、慢阶段、门禁错误、交付瀑布 | 只读分析，数据源可用性逐项展示，无数据不造 Top-N。`custom/client/eval/components/EvalAdvicePanel.vue:1-4,21-54,70-121` |
| `flywheel` 数据飞轮 | 转化漏斗、根因、退化门、变体扩产、合入门、Few-shot | 读数与真实写变体/试算；合入门是回放评估，不是直接合并生产代码。`custom/client/eval/components/FlywheelPanel.vue:1-4,35-99,196-217` |
| `skill-grade` 技能评估 | spec 测试设计段的 S0 四判、S1 四维、基线对比 | 真调用评分服务，可写基线快照；S1 不可用时 CONDITIONAL 合法，unknown 不等于接口错误。`custom/client/eval/components/SkillGradePanel.vue:1-6,28-50,68-76` |

主视图八签按钮：`custom/client/eval/views/EvalView.vue:252-263`。

### 5.2 技能治理：`/app/skillgov`，3 签

路由：`custom/client/skillgov/index.ts:7-15`。

| 页签 | 能做什么 | 实现与边界 |
|---|---|---|
| `scan` 安全扫描 | 扫描技能目录、危险/注意/安全分档、筛选和原文抽屉 | 真扫本机目录并保存报告；扫描结论不是执行期拦截本身。`custom/client/skillgov/views/SkillgovView.vue:29-59,262-311` |
| `provision` 供给对账 | 清单初始化、主机/SIM 差异、dry-run、apply、rollback | **默认干跑**；正式复制与回滚需确认，属于真实文件写入，外部主机和 SIM_ROOT 可分别缺席。`custom/client/skillgov/views/SkillgovView.vue:136-211,319-356` |
| `governance` 生成与教训 | 技能生成器、角色映射、教训库 | 生成器和角色映射真写；角色映射只是历史登记面，无执行管线，生效源在供给清单。`custom/client/skillgov/views/SkillgovView.vue:313-317`；`custom/client/kanban/components/SkillgovSection.vue:28-86,114-133` |

### 5.3 本体工作台：`/app/ontology`，9 签

路由：`custom/client/ontology/index.ts:8-16`。页签注册：`custom/client/ontology/views/OntologyView.vue:27-38`。

| 页签 | 能做什么 | 实现与边界 |
|---|---|---|
| `overview` 概览 | 类型、属性、公理、实例与健康汇总 | 只读服务端 spec/stats/health。`custom/client/ontology/views/OntologyView.vue:46-60,445-450` |
| `schema` 模式 | 类型层级、数据/对象属性检索 | 只读，没有在此签编辑 schema 的表单。`custom/client/ontology/views/OntologyView.vue:134-158,537-598` |
| `graph` 图谱 | 类层级和对象关系可视化 | 只读 Vue Flow 投影。`custom/client/ontology/views/OntologyView.vue:160-197,599-609` |
| `instances` 实例 | 查询、创建、替换、删除、预检 | 真写实例；先校验，错误阻止保存，大列表客户端分页。`custom/client/ontology/views/OntologyView.vue:199-303,610-687` |
| `validate` 校验 | 全量结构/约束验证 | 计算型只读，返回 error/warning/info，不自动修实例。`custom/client/ontology/views/OntologyView.vue:308-324,688-713` |
| `versions` 版本 | 快照列表、回滚、重置种子 | 真写版本状态，确认后执行；历史与当前 spec 同步刷新。`custom/client/ontology/views/OntologyView.vue:326-358,714-735` |
| `export` 导出 | JSON-LD、SHACL、Turtle 复制/下载 | 只读导出，本地 Blob，不上传外部服务。`custom/client/ontology/views/OntologyView.vue:360-391,736-749` |
| `fibo` FIBO 金融域 | 真实 IRI、关联 spec、官方域参照、导入 | 官方参照只读且含外链；导入 T-Box 是真写，EXMP/场景参照不自动入库。`custom/client/ontology/views/OntologyView.vue:62-132,472-536`；`custom/client/ontology/components/FiboReferencePanel.vue:1-7,64-129` |
| `constraints` 约束卡 | 建卡、启停、删除、派单预演 | 真写约束卡；预演只计算命中和简报，不直接派单。`custom/client/ontology/components/ConstraintsPanel.vue:1-8,41-107,118-166` |

### 5.4 流程架构 BPA：`/app/bpa`，6 签

路由：`custom/client/bpa/index.ts:7-15`。六签注册：`custom/client/bpa/views/BpaView.vue:25-26`。页面明确显示“本机”存储，见 `custom/client/bpa/views/BpaView.vue:67-71`。

| 页签 | 能做什么 | 实现与边界 |
|---|---|---|
| `registry` 架构清单 | L1-L6 节点、Owner/KPI/IO/驱动支撑、种子架构 | 真写本机架构，支持增改删和编号建议。`custom/client/bpa/components/BpaTreePanel.vue:1-4,84-126` |
| `map` 流程地图 | OES/POS/MOS/O-MS 分区地图 | 分类法切换真写配置；地图本身由节点投影。`custom/client/bpa/components/BpaMapPanel.vue:1-4,28-43` |
| `link` 端到端链路 | 关系图、逐跳交接物、孤岛/断头/环路 | 只读服务端 E2E 报告与客户端图形布局。`custom/client/bpa/components/BpaLinkPanel.vue:1-8,37-45,163-215` |
| `pcf` APQC 对标 | PCF 差距、落地五步法、误区自检 | 只读当前架构与历史；名称启发匹配要人工确认，不能当显式映射。`custom/client/bpa/components/BpaPcfPanel.vue:1-4,17-46,73-128` |
| `governance` 治理体检 | 八规则、覆盖率、复查、导出、治理参数 | 校验留痕和参数保存真写；报告可本地下载。`custom/client/bpa/components/BpaGovernancePanel.vue:1-7,33-89` |
| `maturity` PEMM 成熟度 | 5 能动因素×4 能力、P0-P4、历史对比 | 自评提交真写历史；总分取最低短板，雷达/趋势是投影。`custom/client/bpa/components/BpaMaturityPanel.vue:1-4,25-60,143-207` |

---

## 六、IDE：`/app/ide` 1 个内容路由、23 个辅助页签

IDE 主壳负责任务/会话/工作区，`/ide` 与 `/ide/*` 只是兼容重定向。`custom/client/ide/routes.ts:17-28`；主壳结构见 `custom/client/ide/views/IdeShell.vue:1-13`。

| # | 页签 | 功能与边界 | 实现 |
|---:|---|---|---|
| 1 | `files` 文件 | 当前工作区文件树与预览；普通账号越权时回退任务域只读树，未物化时明确不是任务仓库。 | `custom/client/ide/views/IdeFilesPane.vue:54-82,112-118,146-176` |
| 2 | `review` 审查/Git | diff、暂存、提交、切分支、push、Git 图，**全部是真写操作**，作用于当前仓库。 | `custom/client/ide/views/IdeGitPane.vue:48-85,129-182,189-200` |
| 3 | `terminal` 终端 | 多 PTY、分屏、工作区快捷命令；真实 shell 写入，快捷定义仅存 localStorage，团队共享未接线。 | `custom/client/ide/views/IdeTerminalDock.vue:1-52`；`custom/client/ide/views/IdeSidePane.vue:171-201,285-329` |
| 4 | `wiki` 引用 | 阅读 `docs/wiki`、引用页面/整册、复制生成提示词、陈旧度检查 | 文件读取为主；生成由当前 agent 会话执行，不是内置云 Wiki 引擎。 | `custom/client/ide/views/IdeWikiPane.vue:1-13,107-139` |
| 5 | `memory` 记忆 | AGENTS/CLAUDE/MEMORY/memory 文件搜索阅读、全局/项目分档 | 只读文件；“清空”只隐藏列表不删除，偏好写 localStorage。 | `custom/client/ide/views/IdeMemoryPane.vue:26-47,69-121` |
| 6 | `ctxarchive` 上下文档案 | 压缩前原文、跨窗搜索、跨窗工作笔记 | 档案只读；笔记增删改是真写 API，零摘要模型调用。 | `custom/client/ide/components/IdeContextArchivePane.vue:1-20,168-237` |
| 7 | `tools` 工具 | 当前会话 tool 消息时间线、语义卡、diff 展开 | 只读最近 80 条工具消息。 | `custom/client/ide/views/IdeToolsPane.vue:1-6,88-121` |
| 8 | `trajectory` 轨迹 | span 账本、谓词查询、热点、证据、失败转回归 | 轨迹只读；转回归集是真写，未知格式/未收尾禁止转换。 | `custom/client/ide/components/IdeTrajectoryPane.vue:68-92,94-141,175-192` |
| 9 | `context` 上下文透视 | 轮次用量、组成、趋势、Fleet、压缩留痕 | 只读；部分组成按 chars/4 或四段映射估算，不冒充精确 span，未收价目不报 0 成本。 | `custom/client/ide/views/IdeContextPane.vue:26-63,66-119,139-180` |
| 10 | `workflow` 流程 | 会话运行、事件流、已保存工作流和历史 | 只读；引擎离线显式占位，无工作区时档案和事件流降级。 | `custom/client/ide/components/WorkflowObservationPanel.vue:1-15,49-147` |
| 11 | `deliver` 交付 | 计划/变更/验证/产物聚合、摘要、选段导出、评审标记 | 摘要可发会话、导出本地文件；**评审通过/退回仅 sessionStorage 本地标记**，云分享是 stub。 | `custom/client/ide/views/IdeDeliverPane.vue:1-6,41-56,91-138,203-230` |
| 12 | `genui` 工件 | 工作区 HTML/图工件沙盒预览和机械检查 | 只读，iframe 无同源且禁网络；只允许工作区内路径、最大 512 KiB，检查调用真实 runner。 | `custom/client/ide/views/IdeGenUiPane.vue:1-5,44-81,125-136` |
| 13 | `kanban` 看板 | 跨板 list/board/swimlane/gantt 四视图 | **只读**，编辑回工作台；点卡只负责绑定任务工作区。 | `custom/client/ide/views/IdeKanbanPane.vue:1-6,53-84` |
| 14 | `matrix` 沟通 | 完整 Matrix 房间列、消息、线程、建/加入房间 | 真写，复用 Matrix store 与凭据，无独立离线账号体系。 | `custom/client/ide/views/IdeMatrixPane.vue:1-19,36-75` |
| 15 | `assistant` 辅助 | 文件/代码/想法追问模板复制、跳主会话 | MVP：没有独立多活跃辅助会话，主要动作是复制和聚焦主聊天。 | `custom/client/ide/views/IdeSidePane.vue:205-227,340-364` |
| 16 | `board` 画板 | 手绘、橡皮、撤销/重做、PNG、圈选标注回传 | 笔迹完全本地；标注回传当前会话是真写消息，无服务端画板存储。 | `custom/client/ide/views/IdeWhiteboardPane.vue:1-24,177-218` |
| 17 | `browser` 浏览器 | 桌面浏览器 profile、代理、下载、权限与数据清理 | **桌面桥外部依赖**，真实写 profile/清数据；无桥环境不能当作 Web 浏览器页。 | `custom/client/ide/views/IdeSidePane.vue:52,275`；`vendor/hermes-studio/packages/client/src/views/hermes/DesktopBrowserView.vue:8-25,74-180` |
| 18 | `storage` 资源 | 磁盘分类扫描、在文件管理器显示、安全分类清理 | 扫描只读；清理真实删除且需确认，部分超时会显示容量下限。 | `custom/client/ide/views/IdeStoragePane.vue:15-58,61-102` |
| 19 | `mcp` MCP | 服务状态、技能清单、五维体检、配置对话、搜索档 | MCP/技能状态只读；配置通过 agent 提示词和文件审批完成，搜索档目前是会话声明，**不是引擎硬门**。 | `custom/client/ide/views/IdeMcpPane.vue:33-51,63-166` |
| 20 | `hooks` 钩子 | 七事件 hooks 增删改排、fail_closed、保存 | 真写 `~/.hermes/config.yaml`；没有 enabled 假字段，删除即停用，运行进程按自身装载节奏消费。 | `custom/client/ide/views/IdeHooksPane.vue:1-12,101-119,188-195` |
| 21 | `slash` 命令 | 自定义斜杠命令增删改、内置只读、输入框模板 | 真写服务端原子保存，选中后只把模板写入输入框，不等于自动执行。 | `custom/client/ide/views/IdeSlashCommandsPane.vue:1-5,39-58,72-90` |
| 22 | `remote` 远程 | SSH/Docker 就绪探针、远端目录、配置模板 | **只读诊断**，不写配置、不做远端写操作；配置模板复制后由用户手工维护。 | `custom/client/ide/views/IdeRemotePane.vue:1-8,36-98,141-169` |
| 23 | `plugins` 插件 | Hermes 技能、MCP、zcode 插件目录 | 技能启停、MCP reload/test 真写；**zcode 插件只列不装**，宿主安装通道未接线。 | `custom/client/ide/views/IdePluginsPane.vue:1-4,40-91,159-172` |

分组只是过滤，不新增能力。默认显示编码组；工作模式会隐藏终端和审查，当前签被隐藏时回默认签。`custom/client/ide/views/IdeSidePane.vue:130-163`。

---

## 七、独立 Matrix 客户端：2 个内容路由

| # | 路由与功能 | 实现与边界 |
|---:|---|---|
| 1 | `/matrix` 全屏 Matrix 客户端 | 房间目录、列表、加入/创建房间和消息读写，依赖 homeserver；未登录时可显示访客/空态，不能当成已连通。`custom/client/matrix-chat/index.ts:23-30`；`custom/client/matrix-chat/views/MatrixChatView.vue:1-8` |
| 2 | `/matrix/room/:roomId` 指定 Matrix 房间 | 与全屏客户端共享 matrix-client/matrix-room store，不是第二运行时。`custom/client/matrix-chat/index.ts:31-36`；`custom/client/ide/views/IdeMatrixPane.vue:1-19` |

`VITE_CUSTOM_MATRIX_CHAT=false` 时这两个动态路由不注册；工作台内的 Matrix 组件是否仍显示，要按具体入口另行判断，不能把这个开关当成服务端禁用。注册链：`registries/client/bootstrap.ts:19-21,85-89`。

---

## 八、收编设置与 Hermes：28 个内容路由

这些页面统一由 `IaLegacyShell + IaSettingsSidebar` 承载；`/hermes/kanban`、`/hermes/journey` 和 pet=false 时的 `/hermes/petdex` 都是重定向，不在 28 个内容页内。装载总表：`custom/client/ia2/views/legacy-view-loaders.ts:3-38`；统一壳：`custom/client/ia2/views/IaLegacyShell.vue:1-17`。

| # | 路由与功能 | 实现与边界 |
|---:|---|---|
| 1 | `/app/gov/settings` 系统设置目录 | 按治理域展示目录，导航只读；`superAdmin`、pet/agentManager/ekko/版本预览统一过滤。`custom/client/ia2/routes.ts:93-99`；`custom/client/ia2/views/gov/gov-settings-registry.ts:146-175` |
| 2 | `/app/gov/model-providers` 模型服务商 | provider/baseURL/模型/默认与 Auto 路由真写；只存密钥 env 名，装载失败禁止保存。`custom/client/ia2/routes.ts:98-99`；`custom/client/ia2/components/gov/GovModelProvidersSection.vue:73-119` |
| 3 | `/app/settings` 通用设置 | 账号、用户、Webhook、显示、代理、压缩、隐私、模型设置真写；用户/Webhook 签仅 `super_admin`。`custom/client/ia2/routes.ts:91-92`；`vendor/hermes-studio/packages/client/src/views/hermes/SettingsView.vue:26-40,103-130` |
| 4 | `/hermes/chat` Hermes 聊天 | 会话与模型调用真写，收编嵌入态隐藏重复会话列。`custom/client/ia2/routes.ts:100-102`；`vendor/hermes-studio/packages/client/src/views/hermes/ChatView.vue:38-46,155-160` |
| 5 | `/hermes/session/:sessionId` 指定聊天会话 | 指定会话/profile/消息深链，模型依赖。`custom/client/ia2/routes.ts:102`；`vendor/hermes-studio/packages/client/src/views/hermes/ChatView.vue:23-36,70-89` |
| 6 | `/hermes/global-agent` 全局智能体 | 新全局会话真写。`custom/client/ia2/routes.ts:103`；`vendor/hermes-studio/packages/client/src/views/hermes/GlobalAgentView.vue:43-59` |
| 7 | `/hermes/global-agent/session/:sessionId` 指定全局会话 | 指定全局会话加载/切换。`custom/client/ia2/routes.ts:104`；`vendor/hermes-studio/packages/client/src/views/hermes/GlobalAgentView.vue:28-41,65-81` |
| 8 | `/hermes/models` 模型与连接配置 | ChatView 的 models 模式，模型供应商与语音等配置真写；图像辅助默认关，语音 STT/TTS 默认关。`custom/client/ia2/routes.ts:105`；`vendor/hermes-studio/packages/client/src/views/hermes/ChatView.vue:39-46`；`patches/524-client-s3-stage-gates.patch:39-52` |
| 9 | `/hermes/connections` 设备与连接管理 | ChatView 的 connections 模式，真实连接配置；社媒 App 与 ESP32 MCU 两个扩展签默认关。`custom/client/ia2/routes.ts:106`；`patches/070-cockpit-packages_client_src_App.vue.patch:57-78` |
| 10 | `/hermes/group-chat` 群聊列表/首房 | 多智能体群聊真写；无房参时规范到首个真实房间。`custom/client/ia2/routes.ts:113-115`；`vendor/hermes-studio/packages/client/src/views/hermes/GroupChatView.vue:39-47` |
| 11 | `/hermes/group-chat/room/:roomId` 指定群聊房 | 加入并加载指定房间，房间不存在回列表。`custom/client/ia2/routes.ts:115`；`vendor/hermes-studio/packages/client/src/views/hermes/GroupChatView.vue:49-57` |
| 12 | `/hermes/workflow` 工作流编排 | 节点画布、导入导出、运行、审批、计划、重跑，真实写工作流与执行服务。`custom/client/ia2/routes.ts:116-118`；`vendor/hermes-studio/packages/client/src/views/hermes/WorkflowView.vue:89-115` |
| 13 | `/hermes/files` 文件管理 | 目录、预览、编辑、上传、重命名、新建，真实文件写，受工作区/profile 权限约束。`custom/client/ia2/routes.ts:118`；`vendor/hermes-studio/packages/client/src/views/hermes/FilesView.vue:10-20,42-72,93-119` |
| 14 | `/hermes/skills` 技能装载 | 技能检索、导入、删除、外部目录、写审批 | 真写本地/外部技能；归档和外来源只读规则不同，写审批需要对应后端支持。`custom/client/ia2/routes.ts:120`；`vendor/hermes-studio/packages/client/src/views/hermes/SkillsView.vue:7-15,54-61,85-110` |
| 15 | `/hermes/plugins` Hermes 插件 | 插件清单、筛选、启停 | standalone 且非 bundled 才可启停，provider-managed 不是任意可写。`custom/client/ia2/routes.ts:121`；`vendor/hermes-studio/packages/client/src/views/hermes/PluginsView.vue:104-125` |
| 16 | `/hermes/mcp` MCP 管理 | 服务增改删、测试、重载、工具可见性 | 真写 MCP 配置并连接外部进程/服务。`custom/client/ia2/routes.ts:122`；`vendor/hermes-studio/packages/client/src/views/hermes/McpManagerView.vue:11-17,107-150` |
| 17 | `/hermes/memory` 记忆库 | memory/user/soul 查看与编辑 | 真写 profile 记忆文件。`custom/client/ia2/routes.ts:123`；`vendor/hermes-studio/packages/client/src/views/hermes/MemoryView.vue:7-8,38-61` |
| 18 | `/hermes/channels` 渠道接入 | 平台渠道设置 | 真写渠道配置，实际发送依赖各平台凭据和网络。`custom/client/ia2/routes.ts:124`；`vendor/hermes-studio/packages/client/src/views/hermes/ChannelsView.vue:7-20,29-41` |
| 19 | `/hermes/config/settings` Hermes 配置 | Agent、网关自启、记忆、会话设置 | 真写配置；与通用设置的 tab 深链相互规范。`custom/client/ia2/routes.ts:125`；`vendor/hermes-studio/packages/client/src/views/hermes/HermesSettingsView.vue:15-40,56-77` |
| 20 | `/hermes/jobs` 定时任务 | 任务增改、选择、运行历史 | 真写调度配置，执行依赖调度器在线。`custom/client/ia2/routes.ts:126`；`vendor/hermes-studio/packages/client/src/views/hermes/JobsView.vue:8-18,39-74,136-165` |
| 21 | `/hermes/logs` 日志 | 文件、级别、行数、搜索 | **只读**服务端日志，不支持在此清日志。`custom/client/ia2/routes.ts:133`；`vendor/hermes-studio/packages/client/src/views/hermes/LogsView.vue:7-21,76-116` |
| 22 | `/hermes/usage` 用量 | 内部/外部来源、时间/账户/profile、趋势和成本 | 只读统计；价目和账户范围依数据而定。`custom/client/ia2/routes.ts:134`；`vendor/hermes-studio/packages/client/src/views/hermes/UsageView.vue:21-75,91-129` |
| 23 | `/hermes/performance` 性能 | 系统/进程/worker CPU 内存与会话，5 秒刷新 | 只读，路由要求 `super_admin`。`custom/client/ia2/routes.ts:135`；`vendor/hermes-studio/packages/client/src/views/hermes/PerformanceView.vue:56-85` |
| 24 | `/hermes/profiles` 档案管理 | 新建、重命名、导入、profile 维护 | 真写，`super_admin` 路由与端点双重限制。`custom/client/ia2/routes.ts:136`；`vendor/hermes-studio/packages/client/src/views/hermes/ProfilesView.vue:20-34,37-87` |
| 25 | `/hermes/theme` 主题外观 | 明暗、风格、字号、颜色、背景与预设 | 真写主题定制与背景文件；默认首次启动暗色中文只是初始偏好，用户显式选择会保留。`custom/client/ia2/routes.ts:137`；`vendor/hermes-studio/packages/client/src/views/hermes/ThemeView.vue:31-47,68-140`；`registries/client/entry.mts:22-50` |
| 26 | `/hermes/skills-usage` 技能用量 | 按周期统计技能动作和趋势 | 只读。`custom/client/ia2/routes.ts:139`；`vendor/hermes-studio/packages/client/src/views/hermes/SkillsUsageView.vue:8-18,130-158` |
| 27 | `/hermes/terminal` Web 终端 | 浏览器 PTY 终端 | 真写 shell，`super_admin` 专属，不是模拟终端。`custom/client/ia2/routes.ts:140-142`；`vendor/hermes-studio/packages/client/src/views/hermes/TerminalView.vue:1-17` |
| 28 | `/hermes/version-preview` 版本预览 | GitHub 预览设置 | `super_admin`；路由存在但侧栏/目录还需 `VITE_HERMES_PREVIEW=1` 才显示。`custom/client/ia2/routes.ts:143`；`custom/client/ia2/views/gov/gov-settings-registry.ts:138-153`；`vendor/hermes-studio/packages/client/src/views/hermes/VersionPreviewView.vue:10-20` |

`/studio/agents` 的 agent 管理中心默认收编开关关闭，因此没有出现在本表；它仍留在上游未收编页中，见下一节。

---

## 九、未收编的上游页：11 个内容路由

“未收编”表示不使用 `IaLegacyShell`，不表示不可用或没有权限。上游公共布局/路由 meta 仍按原实现生效。旧 `/hermes/history` 与 `/hermes/history/session/:sessionId` 已由补丁退役，不再是本组内容页；现行历史入口是第二节的 `/app/history*`。

| # | 路由与功能 | 实现与边界 |
|---:|---|---|
| 1 | `/person` 个人助理 | 个人 bot 会话、任务、文件、排期、流程、记忆与设置，真实写个人工作区和模型会话。`vendor/hermes-studio/packages/client/src/router/index.ts:10`；`vendor/hermes-studio/packages/client/src/views/hermes/PersonView.vue:17-51` |
| 2 | `/desktop-pet` 桌面宠物窗口 | 公共路由，直接渲染 WebPet；默认只关闭普通页浮层与商店入口，**该直达路由没有 pet 守卫**。`vendor/hermes-studio/packages/client/src/router/index.ts:19-24`；`vendor/hermes-studio/packages/client/src/views/hermes/DesktopPetView.vue:1-8`；`patches/520-client-webpet-off.patch:8-18` |
| 3 | `/` 登录 | 公共登录/恢复页，验证密码并写本地会话 token；桌面壳会先清陈旧 token。`vendor/hermes-studio/packages/client/src/router/index.ts:25-30`；`vendor/hermes-studio/packages/client/src/views/LoginView.vue:21-68` |
| 4 | `/desktop-chat/:sessionId` 独立聊天 | `standaloneChat` 会话窗口，真实模型调用；**没有 `hasDesktopBrowserBridge` 条件注册**，不能误写成桌面桥条件页。`vendor/hermes-studio/packages/client/src/router/index.ts:53-58`；`vendor/hermes-studio/packages/client/src/views/hermes/ChatView.vue:38-58` |
| 5 | `/hermes/api-relay` API 中转用量与推广 | 读取中转账户用量，含 `apikey.fan` 外部注册链接；不是完整的本地中转配置台。`vendor/hermes-studio/packages/client/src/router/index.ts:101-105`；`vendor/hermes-studio/packages/client/src/views/hermes/ApiRelayView.vue:20-39,68-105` |
| 6 | `/studio/agents` agent 管理中心 | 上游路由仍要求 `super_admin`；`agentManager=false` 只导致不收编和隐藏导航，**不会删除此上游路由**。`vendor/hermes-studio/packages/client/src/router/index.ts:202-207`；`custom/client/ia2/routes.ts:107-112` |
| 7 | `/studio/agents/:agentId/:section(...)` coding agent 配置 | `super_admin`；skills/mcp/settings/plugins/presets 配置真写，非 dsh 的 plugins/presets 被守卫改到 settings。`vendor/hermes-studio/packages/client/src/router/index.ts:208-213,333-336`；`vendor/hermes-studio/packages/client/src/views/hermes/CodingAgentConfigView.vue:95-146,157-208` |
| 8 | `/ekko/memory` ekko 记忆 | `super_admin`，记忆图/列表、编辑与删除真写；`ekko` 开关默认开，关闭时守卫回 `/app`。`vendor/hermes-studio/packages/client/src/router/index.ts:214-219`；`vendor/hermes-studio/packages/client/src/views/ekko/MemoryView.vue:14-21`；`patches/523-client-s3-entries-gates.patch:15-18` |
| 9 | `/ekko/skills` ekko 技能 | `super_admin`，技能导入、编辑、启停、删除、外部目录真写。`vendor/hermes-studio/packages/client/src/router/index.ts:220-225`；`vendor/hermes-studio/packages/client/src/views/ekko/SkillsView.vue:12-25,104-141` |
| 10 | `/ekko/mcp` ekko MCP | `super_admin`，MCP 增改删、启停、探测真写。`vendor/hermes-studio/packages/client/src/router/index.ts:226-231`；`vendor/hermes-studio/packages/client/src/views/ekko/McpView.vue:19-29` |
| 11 | `/ekko/settings` ekko 设置 | `super_admin`，runtime/model/tools/modules/advanced 配置自动保存，真实写配置。`vendor/hermes-studio/packages/client/src/router/index.ts:232-237`；`vendor/hermes-studio/packages/client/src/views/ekko/SettingsView.vue:28-43,69-144` |

---

## 十、默认禁外链与桌面条件页：4 个不计入 80 的页面

| 类型 | 路由 | 默认行为与实现 |
|---|---|---|
| 默认禁公开外链 | `/share/group-chat/:inviteCode?` | 记录为 `public + inviteOnly`，但 `externalLinks=false` 时先被守卫送回 `/app`；设 `VITE_CUSTOM_EXTERNAL_LINKS=true` 才放行。`vendor/hermes-studio/packages/client/src/router/index.ts:31-36`；`patches/523-client-s3-entries-gates.patch:15-18` |
| 默认禁公开外链 | `/group-chat-link` | 独立群聊链接页，默认同一守卫送回 `/app`；其 meta 没有 `public`，启用后仍按登录规则处理。`vendor/hermes-studio/packages/client/src/router/index.ts:37-42,338-353`；`patches/523-client-s3-entries-gates.patch:18` |
| 桌面桥条件页 | `/hermes/browser` | 仅 `hasDesktopBrowserBridge()` 为真注册，管理桌面浏览器，不收编进 IaLegacyShell。`vendor/hermes-studio/packages/client/src/router/index.ts:290-303`；`custom/client/ia2/routes.ts:506-513` |
| 桌面桥条件页 | `/hermes/browser/downloads` | 同一桌面桥条件下注册下载历史。`vendor/hermes-studio/packages/client/src/router/index.ts:292-297`；`vendor/hermes-studio/packages/client/src/views/hermes/DesktopBrowserView.vue:1-14` |

另外两个常见“条件存在但仍计入 80”的例子：`/desktop-pet` 与 `/studio/agents`。前者路由仍注册，后者是上游 super_admin 路由仍在；它们不属于本节四个额外页面。

---

## 十一、41 个重定向：旧链接到底落在哪里

含参路径中的 `:runId`、`:sessionId`、`:roomId` 按对应参数传递。标注“保 query”的记录会保留原筛选/上下文；未标的不应自行假设所有 query 都有消费者。

| # | 旧路径 | 落点与实现 |
|---:|---|---|
| 1 | `/app/ops/runs/:runId` | `/app/runs/:runId`。`custom/client/ia2/routes.ts:58` |
| 2 | `/app/ops` | `/app/runs`，随后再由 #28 去 SIM。`custom/client/ia2/routes.ts:59` |
| 3 | `/app/tasks` | `/app/board`。`custom/client/ia2/routes.ts:60` |
| 4 | `/app/comms/room/:roomId` | `/app/s/room/:roomId`，函数拼接保留特殊房号。`custom/client/ia2/routes.ts:61,192-203` |
| 5 | `/app/comms` | `/app`。`custom/client/ia2/routes.ts:62` |
| 6 | `/app/collab/chat` | `/app/s/chat`。`custom/client/ia2/routes.ts:63` |
| 7 | `/app/collab/history/session/:sessionId` | `/app/history/session/:sessionId`。`custom/client/ia2/routes.ts:64` |
| 8 | `/app/collab/history` | `/app/history`。`custom/client/ia2/routes.ts:65` |
| 9 | `/app/collab/global-agent/session/:sessionId` | `/app/agent/session/:sessionId`。`custom/client/ia2/routes.ts:66` |
| 10 | `/app/collab/global-agent` | `/app/agent`。`custom/client/ia2/routes.ts:67` |
| 11 | `/login` | `/`，恢复登录页别名并避免 404/登录守卫环。`custom/client/ia2/routes.ts:204-210` |
| 12 | `/app/journey` | `/app` 工作总览。`custom/client/ia2/routes.ts:224` |
| 13 | `/app/search` | `/app?search=1`，保留原 query 并打开共享检索弹窗。`custom/client/ia2/routes.ts:237-246` |
| 14 | `/app/gov` | `/app/stage/govern?tab=gateLog`，保 query。`custom/client/ia2/routes.ts:328-334` |
| 15 | `/app/gov/org-assets` | `/app/stage/setup?tab=org`。`custom/client/ia2/routes.ts:335-339` |
| 16 | `/app/gov/clearance` | `/app/stage/govern?tab=clearance`。`custom/client/ia2/routes.ts:340-344` |
| 17 | `/app/gov/issues` | `/app/stage/govern?tab=issues`。`custom/client/ia2/routes.ts:345-349` |
| 18 | `/app/gov/audit` | `/app/stage/govern?tab=audit`。`custom/client/ia2/routes.ts:350-354` |
| 19 | `/app/gov/docs` | `/app/stage/govern?tab=docs`。`custom/client/ia2/routes.ts:355-359` |
| 20 | `/app/gov/metrics` | `/app/stage/govern?tab=metrics`。`custom/client/ia2/routes.ts:360-364` |
| 21 | `/app/teams` | `/app/stage/setup?tab=teams`。`custom/client/ia2/routes.ts:368-373` |
| 22 | `/app/agents` | `/app/stage/setup?tab=agents`。`custom/client/ia2/routes.ts:374-379` |
| 23 | `/app/accounts` | `/app/stage/setup?tab=accounts`。`custom/client/ia2/routes.ts:380-385` |
| 24 | `/app/eng` | `/app/sim/orchestration`。`custom/client/ia2/routes.ts:386-393` |
| 25 | `/app/cases` | `/app/stage/accept?tab=cases`。`custom/client/ia2/routes.ts:394-399` |
| 26 | `/app/sim/delivery` | `/app/stage/accept?tab=delivery`，保 query。`custom/client/ia2/routes.ts:433-437` |
| 27 | `/app/sim/trace` | `/app/stage/accept?tab=trace`，保 query。`custom/client/ia2/routes.ts:438-442` |
| 28 | `/app/runs` | `/app/sim`；只有运行列表退役，`/app/runs/:runId` 详情仍保留。`custom/client/ia2/routes.ts:462-480` |
| 29 | `/hermes/kanban` | `/app/board`，保 query；路由名 `hermes.kanban` 留给旧按名跳转。`custom/client/ia2/routes.ts:127-130` |
| 30 | `/hermes/journey` | 路由名 `ia2.journey`。`custom/client/ia2/routes.ts:130-132` |
| 31 | `/hermes/settings` | `/app/settings`，保 query。`custom/client/ia2/routes.ts:514-519` |
| 32 | `/ide` | `/app/ide`。`custom/client/ide/routes.ts:25-27` |
| 33 | `/ide/:rest(.*)` | `/app/ide`，旧子路径不再还原独立页面。`custom/client/ide/routes.ts:27` |
| 34 | `/hermes/tasks` | `hermes.chat`，转换为 `tasks=1` 及任务筛选 query。`vendor/hermes-studio/packages/client/src/router/index.ts:11-18` |
| 35 | `/social-messages` | `hermes.connections?view=messages`。`vendor/hermes-studio/packages/client/src/router/index.ts:184-190` |
| 36 | `/hermes/agents` | `hermes.agentManager`。`vendor/hermes-studio/packages/client/src/router/index.ts:238-241` |
| 37 | `/hermes/history/group-chat/:roomId` | `hermes.groupChatRoom`，传 `roomId`。`vendor/hermes-studio/packages/client/src/router/index.ts:252-258` |
| 38 | `/hermes/group-chat/history/:roomId` | `hermes.groupChatRoom`，传 `roomId`。`vendor/hermes-studio/packages/client/src/router/index.ts:259-265` |
| 39 | `/hermes/coding-agents` | `hermes.agentManager`。`vendor/hermes-studio/packages/client/src/router/index.ts:271-274` |
| 40 | `/hermes/petdex` | pet=false 时去 `/app/gov/settings`；不是可用内容页，开启 pet 后才注册图鉴页。`custom/client/ia2/routes.ts:138-145` |
| 41 | `/:pathMatch(.*)*` | 注入补丁先兜底 `/app`，`ia2NotFoundGuard` 识别该兜底并改到 `/app/not-found?from=<原地址>`；已知旧链接不重定向到 404。`patches/297-client-router-cockpit-family-removal.patch:83-85`；`custom/client/ia2/routes.ts:164-185` |

### 两类不计入 41 的“看起来像重定向”行为

- `/app/sim?tab=orchestration|settings` 是 `beforeEnter` 规范化，分别去独立编排/设置页，并只保留 `run/from`；其他 `tab` 放行。实现：`custom/client/ia2/routes.ts:146-162`。
- `/app/board?tab=<旧签>` 是组件内旧签迁移，10 个旧键去 SIM/治理路由，非法键回看板；不是独立 route record。实现：`custom/client/ia2/views/TasksView.vue:13-36,115-139`。

---

## 十二、19 个特性开关：默认状态与真实作用

所有浏览器开关必须经 `VITE_` 注入。`eval/skillgov/ontology/bpa` 只裁剪导航和页面呈现，不能当服务端安全边界。总定义：`config/features.ts:1-12,74-99`。

| 开关与环境变量 | 默认 | 实际控制面与误区 |
|---|---|---|
| `matrixChat` / `VITE_CUSTOM_MATRIX_CHAT` | 开 | 注册 Matrix 模块与 `/matrix` 两路由；不是 Matrix 服务端开关。`registries/client/bootstrap.ts:19-21,85-89` |
| `matrixAuth` / `VITE_CUSTOM_MATRIX_AUTH` | 关 | **reserved，未接线**，全仓无运行时消费者。`config/features.ts:15-17` |
| `matrixAdmin` / `VITE_CUSTOM_MATRIX_ADMIN` | 关 | **reserved，未接线**，全仓无运行时消费者。`config/features.ts:18-19` |
| `kanbanEnhancements` / `VITE_CUSTOM_KANBAN_ENHANCEMENTS` | 开 | 只决定是否调用注册函数；该函数目前仅 `console.log`，没有产品增强面。`registries/client/bootstrap.ts:22-24`；`custom/client/kanban/index.ts:1-5` |
| `branding` / `VITE_CUSTOM_BRANDING` | 开 | 只调用品牌注册函数，当前同样仅日志，不是动态换肤总开关。`registries/client/bootstrap.ts:25-27`；`custom/client/branding/index.ts:1-5` |
| `extendedI18n` / `VITE_CUSTOM_EXTENDED_I18N` | 开 | **无运行时消费**；词条已由补丁写入上游 locale。`config/features.ts:25-27`；`registries/client/bootstrap.ts:77-78` |
| `cockpit` / `VITE_CUSTOM_COCKPIT` | 开 | 注册协作能力模块和共享样式，旧 `/hermes/cockpit` 路由已退役；关闭不等于删除工作台。`registries/client/bootstrap.ts:28-32`；`custom/client/cockpit/index.ts:15-26` |
| `ide` / `VITE_CUSTOM_IDE` | 开 | 关闭时不注册 IDE 主壳，三个 IDE 路径兜底回 `/app`，IDE 跳转按钮隐藏。`registries/client/bootstrap.ts:38-46`；`custom/client/ia2/components/IaWorkspaceSwitch.vue:53-57` |
| `voice` / `VITE_CUSTOM_VOICE` | 关 | 控制语音舞台、输入菜单、麦克风和 STT/TTS 设置签；组件/API 保留。`patches/523-client-s3-entries-gates.patch:38-61`；`patches/524-client-s3-stage-gates.patch:18,48-52` |
| `pet` / `VITE_CUSTOM_PETS` | 关 | 控制普通页 WebPet 浮层与 petdex 目录入口；关闭时 `/hermes/petdex` 重定向到 `/app/gov/settings`，`/desktop-pet` 直达仍渲染。`patches/520-client-webpet-off.patch:8-18`；`custom/client/ia2/routes.ts:138-145`；`custom/client/ia2/views/gov/gov-settings-registry.ts:149` |
| `connectionsExtras` / `VITE_CUSTOM_CONNECTIONS_EXTRAS` | 关 | 控制 connections 的社媒 App 和 MCU 两个 tab，基础连接管理仍在。`patches/070-cockpit-packages_client_src_App.vue.patch:57-78` |
| `ekko` / `VITE_CUSTOM_EKKO` | 开 | 控制 agent 卡片、ekko 设置侧栏和 `/ekko/*` 路由守卫；四页另有 super_admin。`patches/515-client-type-gate-fresh-build.patch:31-41`；`patches/523-client-s3-entries-gates.patch:17` |
| `agentManager` / `VITE_CUSTOM_AGENT_MANAGER` | 关 | 控制收编路由替换与设置入口；上游 `/studio/agents` 仍可由 super_admin 直达，属 UI 裁剪。`custom/client/ia2/routes.ts:107-112`；`custom/client/ia2/views/gov/gov-settings-registry.ts:150` |
| `externalLinks` / `VITE_CUSTOM_EXTERNAL_LINKS` | 关 | 两个公开外链默认被守卫拦回 `/app`；配置注释中的“bootstrap 摘除”以当前代码看，实际生效点是路由守卫。`patches/523-client-s3-entries-gates.patch:15-18` |
| `imageAssist` / `VITE_CUSTOM_IMAGE_ASSIST` | 关 | 控制 ModelsView 图像生成辅助模型 tab。`patches/524-client-s3-stage-gates.patch:39` |
| `eval` / `VITE_CUSTOM_EVAL` | 开 | 关闭后隐藏导航并显示未启用说明；路由和端点不卸载。`custom/client/ia2/views/IaFeatureShell.vue:23-33`；`registries/client/bootstrap.ts:52-57` |
| `skillgov` / `VITE_CUSTOM_SKILLGOV` | 开 | 同上，不能用来禁止技能扫描 API。`custom/client/skillgov/index.ts:7-15`；`registries/client/bootstrap.ts:59-63` |
| `ontology` / `VITE_CUSTOM_ONTOLOGY` | 开 | 同上，不能用来禁止本体 API。`custom/client/ontology/index.ts:8-16`；`registries/client/bootstrap.ts:65-68` |
| `bpa` / `VITE_CUSTOM_BPA` | 开 | 同上，不能用来禁止流程架构 API。`custom/client/bpa/index.ts:7-15`；`registries/client/bootstrap.ts:70-73` |

另有一个不属于 `features.ts` 的入口开关：`VITE_HERMES_PREVIEW=1` 控制版本预览在设置目录和侧栏中是否可见，路由本身仍要求 super_admin。`custom/client/ia2/views/gov/gov-settings-registry.ts:138-153`。

---

## 十三、super_admin、admin 与组织职责：不要混用三套概念

### 13.1 系统登录角色只有两种

上游 `UserRole` 只有 `super_admin | admin`，没有第三个系统级“组织管理员”枚举。`vendor/hermes-studio/packages/server/src/modules/studio/repositories/users-store.ts:5-18`；客户端从 JWT 读取这两种角色，`vendor/hermes-studio/packages/client/src/api/client.ts:61-79`。

| 角色 | 能做什么 | 不能据此推断什么 |
|---|---|---|
| `super_admin` | 通过 `requiresSuperAdmin` 路由守卫；默认看全部 profile；可执行管理维护写端点和全局默认审批策略等管理动作 | 不等于每个写接口都只凭角色即可；账号/离职等还需 Synapse 管理 token，发布批准还有 release 角色规则，组织 admin 行还有会签规则 |
| `admin` | 普通已认证用户；可访问被分配的 `user_profiles`，在业务 RACI 中可负责执行或审批 | **不是 super_admin 的别名**；不能访问 `requiresSuperAdmin` 页面，默认看不到未授权 profile 和管理设置项 |

路由守卫对无 token 先回登录，对 `requiresSuperAdmin` 且非 super_admin 回 `hermes.chat`：`vendor/hermes-studio/packages/client/src/router/index.ts:338-360`。普通用户的 profile 判定在服务端，缺失授权面时 fail closed：`custom/server/services/hermes/profile-access.ts:16-27`。看板聚合按 assignee/profile 过滤任务，未指派卡保留，空板再按团队键判断：`custom/server/services/hermes/overview-access.ts:32-79`。

### 13.2 组织表中的角色是业务职责，不自动变成系统权限

`OrgEditor` 的“角色、汇报线、团队、Matrix 账号”是治理仓 `org.md` 数据，可描述研发、需求、审计、治理裁决等职责。它用于 RACI、任务过滤、会签资格和组织协作，不会自动把登录 JWT 升为 super_admin。

- **团队领导**：由注册房 leaders 状态决定，普通成员写自声明，领导看到邀请、领导维护、值守与派发管理。`custom/client/matrix-teams/stores/team-registry.ts:50-67,153-174`；`custom/client/matrix-teams/views/TeamsManagePanel.vue:158-204`。
- **治理者/审计会签**：`org.md` 中账号为 admin 或角色含“治理裁决”属于 admin 行；其变更需另一位编制在册的 admin/审计批准，发起人不能自签，也可由 super_admin 走带理由的 break-glass。`custom/server/governance/registry-admin.ts:328-375,437-487`。
- **发布审批角色**：提交对所有登录用户开放，批准/打回/发布仅 `super_admin` 或 `release`。`custom/server/governance/lifecycle/release-state.ts:181-192`。
- **关键决策身份**：只信上游认证用户；显式无鉴权单机部署才使用 `AISTUDIO_LOCAL_OPERATOR`，不能用请求体自称审批人。`custom/server/approval-inbox/human-gate.ts:29-55`。

### 13.3 权限要分四层验收

| 层 | 查什么 | 例子 |
|---|---|---|
| 路由能否解析 | 页面是否注册，是否被 fullscreen/条件路由替换 | agentManager 关闭时上游 `/studio/agents` 仍可解析 |
| 导航是否可见 | 特性开关、superAdmin、surface 是否隐藏入口 | 版本预览要 super_admin + `VITE_HERMES_PREVIEW=1` |
| 路由角色守卫 | `public`、`requiresSuperAdmin`、ekko/externalLinks 特殊守卫 | `/hermes/performance` 普通 admin 被送回聊天 |
| 服务端写权限与资源范围 | 用户角色、profile 授权、对象归属、外部凭证、业务会签 | super_admin 调 Matrix 建号还要 Synapse admin token；普通用户只见授权工作区 |

---

## 十四、讲师最容易讲错的边界

1. **“80 是仓库全部页面”不准确。**80 是默认 Web 配置下扣除两个禁公开外链后的内容路由，包含 projects 两页与 records 两页；桌面桥还条件增加 2 页，默认禁用外链也仍有 2 条注册记录。
2. **“41 是组件内所有跳转”不准确。**41 只数 route record，含 pet=false 的 petdex 重定向；SIM 的 `beforeEnter` 和看板组件内旧签迁移另列，不重复计数。
3. **“阶段 37 签包含看板、SIM、专题”不准确。**37 仅 `STAGE_TABS`；看板本地 4 签、SIM 4 签、专题 26 签、IDE 23 签分别计算。
4. **“推演不碰真实数据”错误。**导演台启动明确创建真实看板任务并调用代理；只有模块拆解离线回退、红队规则评估、本地白板等标为模拟/离线的部分才可按离线讲。
5. **“所有审批都写服务端”错误。**IDE `deliver` 的通过/退回只是 sessionStorage 本地标记；正式审批要去收件箱、G5 或治理面板。
6. **“特性开关等于权限关闭”错误。**尤其 eval/skillgov/ontology/bpa 只藏入口，深链显示未启用，服务端能力仍在。agentManager 也只是不收编和隐藏入口。
7. **“路由不显示等于路由不存在”错误。**pet、agentManager、versionPreview 都可能路由存在但导航隐藏；桌面宠物直达尤其明显。
8. **“admin 就是超级管理员”错误。**admin 是普通账号，super_admin 才通过专属路由和管理端点；组织表 admin/审计是另一层业务职责。
9. **“只读页面上的所有按钮也只读”要逐件看。**例如只读运行详情可导出 JSON、完成 run 可沉淀模板；轨迹只读但“转回归”会写真库。清单已把这类混合动作拆开。
10. **“矩阵未连接就是功能没做”错误。**独立 Matrix、团队、交付案例都依赖真实 homeserver；空态/访客态需要专项带凭据验收，不能据此判未接线。
11. **“本地标记等于团队共享”错误。**终端快捷命令是 localStorage，IDE 评审是 sessionStorage，画板笔迹只在画布内；角色映射虽可保存，却没有执行管线。
12. **“外部链接都被禁用”错误。**默认只拦 `/share/group-chat` 和 `/group-chat-link` 两个公开外链；API Relay 的外部推广链接、FIBO 官方参照链接仍在。
13. **“桌面聊天和桌面浏览器一样条件注册”错误。**`/desktop-chat/:sessionId` 始终注册；只有 `/hermes/browser` 与 `/hermes/browser/downloads` 由桌面桥条件注册。
14. **“紧急停止等于强杀进程”错误。**治理姿态的 STOP-ALL 是合作式中止，报告仍运行的会话是预期安全行为。
15. **“配置写入等于当前进程立刻生效”错误。**Hooks、模型绑定、网关/agent 配置各有装载节奏，部分需要重启；前端只展示保存结果，不能承诺热加载。

---

## 十五、复核路径与本次未覆盖项

本清单按以下顺序交叉核对：客户端注册入口 → IA/IDE/专题路由 → 上游 router → 阶段/专题/IDE 页签注册 → 各面板实际读写函数 → 权限与特性开关 → 重定向和补丁。主要计数由 `scripts/regression/route-manifest.ts` 现场生成后复核，未手写第二份路由数组来替代代码。

本轮未启动桌面端、Matrix homeserver、模型供应商、真实推演、PTY、SSH/Docker 或目标浏览器，因此：

- 不断言 80 页在当前每台机器都能加载出业务数据；
- 不断言每个真写按钮都已在活体环境执行成功；
- 不将源码中的历史注释当成验收结果，计数和边界以现行代码为准；
- 不把路由可达当成数据授权，资源级权限仍须按第 13 节四层验收。
