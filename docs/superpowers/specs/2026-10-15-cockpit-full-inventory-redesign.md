# 驾驶舱全量盘点与重构设计（协作沟通·IDE 工作台·swarm kanban 及全部下级功能）

> **文档定位**：三中心重构（2026-10-15-cockpit-sim-gov-ia-redesign.md）的下钻正本——按用户裁定对「驾驶舱及其下协作沟通、IDE 工作台、swarm kanban 及更下级所有功能」先一一盘点（每行带实存文件锚），再按三件产品定位重构功能与 UI。实现单一事实源=本文件+IA 正本。
> **盘点方法**：路由注册表（ia2/routes.ts）+页签注册表（i18n-tasks-tabs.ts）+视图/组件实存文件逐一点名；未列即不存在（盘点完备性声明）。

## 一、全量盘点表（功能 → 实存锚 → 重构归属 → 重构形态）

### 1. 驾驶舱壳（/app 工作台）

| 功能 | 实存锚 | 重构归属 | 重构形态 |
|---|---|---|---|
| 三栏工作台（左导航轨/中对象区/右任务决策，双轨可折叠） | WorkbenchView.vue 33K（wb-rail-left/right、wb-split-l/r、wb-unfold） | 工作台·壳 | 保留三栏骨架；顶栏换三中心场景条（工作台/推演中心/治理中心+岛屿）；中区深链（canvas-ph-board/tasks/back/retry）保留 |
| 旧功能页收编壳（hermes-* 设置族） | IaLegacyShell.vue 5.6K | 工作台·设置 | 不变（2026-09-30 收编裁定延续） |
| 场景条/区域投影 | IA_AREAS/routes.ts | 顶栏 | 三中心一级导航替代单场景条 |

### 2. 协作沟通

| 功能 | 实存锚 | 重构归属 | 重构形态 |
|---|---|---|---|
| 会话三态（单聊/群聊/房间深链 /app/s/chat·group·room） | matrix-chat/matrix-teams 组件群、WorkbenchView 中区 | 工作台·沟通 | 不变；新增**消息锚点入证据库**（任一消息可存证并生成反查锚——替代「群深链不可拍」的采证缺口） |
| 会话历史/回放 | /app/history(/session/:id) | 工作台·沟通 | 不变；与证据库互链（会话片段可被报告引用） |
| 全局智能体会话 | /app/agent(/session/:id) | 工作台·沟通 | 不变 |
| 审批收件箱 | InboxView.vue 1.9K、/app/inbox | 工作台·把关 | **扩展**：收编清偿门 resolve/waive 审批流（E4）——人的两类把关一个收件箱 |
| 注意力条（后台条/提醒） | KanbanAttentionStrip.vue 5.2K | 工作台·顶 | 保留；新增清偿门红灯位 |
| 沟通组账户管理 | /app/accounts、AccountAdminView 6.5K | 工作台·组织与资产 | 并入「能力与规则」页签的组织区（board 4 签方案） |

### 3. IDE 工作台（/app/ide）

| 功能 | 实存锚 | 重构归属 | 重构形态 |
|---|---|---|---|
| 会话面板（编码会话） | IdeChatPane.vue 38.4K | 工作台·生产位 | 不变（生产位核心） |
| Git 面板/提交流 | IdeGitPane.vue 17.1K、IdeGitLog 4.3K | 工作台·生产位 | 新增**分支新鲜度标记**（fresh 绿/stale 琥珀，宽限窗语义——branch_fresh 产品面） |
| 文件树/钩子/看板速览 | IdeFilesPane 2.6K、IdeHooksPane 12.4K、IdeKanbanPane 10.6K | 工作台·生产位 | 不变 |
| 活动收件箱/目标预算浮窗 | IdeActivityInbox 6.2K、IdeGoalBudgetFloat 14.2K | 工作台·生产位 | 不变 |
| 任务简报抽屉（?task=） | 深链协议（run13 根修） | 工作台↔任务 | 保留；抽屉内新增「本任务证据」区（帧/判词/台账关联） |
| zcode 岛屿 | client/zcode | 岛屿 | 不变 |

### 4. swarm kanban（/app/board，13 页签+组件群）

**页签分流**（IA 正本既定，此处落到组件）：

| 现页签 | 实存锚 | 归属 | 形态 |
|---|---|---|---|
| 看板 | KanbanBoard 6.2K/Column 11.1K/TaskCard 15.4K/Toolbar 17.4K/BulkBar/InlineCreate/Attachments/Markdown/saved-views 3.0K | 工作台·board（4 签之首） | 默认「我的卡」视角；全局视角切换保留 |
| 任务协同 | KanbanOrchestrationPanel 12.9K | 工作台·board | 不变 |
| 协作与知识 | GovOrgKnowledgeView 1.7K | 工作台·board | 不变 |
| 能力与规则 | GovRegistryRulesView 2.0K（+组织与资产区并 入） | 工作台·board | 扩为「能力与规则+组织资产」 |
| 需求追溯 | tabTrace（AC 判词链） | **推演中心** | 迁入；判词行加 provenance 标注 |
| 交付健康 | tabAccounts、i18n-accounts | **推演中心** | 迁入；STALE 标记用宽限窗语义 |
| 运行观测 | tabObservatory | **推演中心** | 迁入；+派发器健康卡+休眠工作者卡（634/635 数据面） |
| 审计与变更 | GovAuditChangeView 1.9K | **治理中心** | 迁入 |
| 文档评审 | GovDocsReviewView 16.3K | **治理中心** | 迁入 |
| 工程效能 | GovHarnessView 2.7K | **治理中心·度量体检** | 四体检合一签四卡之一 |
| 集群健康 | GovClusterSection 8.9K | **治理中心·度量体检** | 之二 |
| 语义体检 | GovOntologySection 8.7K | **治理中心·度量体检** | 之三 |
| 会话健康 | GovSessionHealthSection 8.2K | **治理中心·度量体检** | 之四 |
| 六域体检+六闸总览 | GovHealthSection 16.5K | 拆分 | 六闸卡→治理中心「关卡与闸工作流」；六域体检→度量体检第五卡 |
| 诊断规则 | KanbanDiagnosticsSection 9.0K | **治理中心·问题单对账** | 迁入并与台账/清偿门同屏 |
| 容量分析 | CapacitySection 8.2K | **推演中心·轮次总览** | 迁入（人日/覆盖率是轮次仪表盘的度量行） |
| 交接 | kanban/handoff.ts 4.4K、KanbanHandoffSection 6.8K | 工作台·协作 | 迁入协作与知识页签 |
| 任务抽屉 | KanbanTaskDrawer 64.5K/TaskForm 10.3K | 工作台（共享组件） | **抽屉加「证据」页**：卡的判词/帧/台账关联一屉可查——证据库的反查入口 |

### 5. 全局路由与岛屿

| 功能 | 实存锚 | 归属 | 形态 |
|---|---|---|---|
| 运行中心 | /app/runs(/:id)、run-surface | **推演中心·壳** | 升格为推演中心入口（开轮/续跑/姿态切换+E1 执行器落点） |
| 编排（autosched 场景） | OrchestrationView 15.3K、EngScene 2.8K、/app/eng | **推演中心·场景编排** | E1 产品面（场景注册表 UI 落点） |
| 交付案例 | /app/cases、delivery-contract | **推演中心·证据库** | 并入证据库（案例=交付证据形态） |
| 仪表/循环 | /app/dash、/app/l/:loopId | 工作台·岛屿入口 | 保留入口归工作台 |
| BPA/本体/评测/技能治理 | 岛屿 | 岛屿 | 既定路线不变 |

## 二、重构后的四张总图（UI 定义）

**① 工作台**＝三栏壳＋board 4 页签（看板/任务协同/协作与知识/能力与规则+组织资产）＋inbox（审批+清偿门）＋IDE 生产位（深链）＋沟通三态。首页=「我的驾驶位」：我的卡+待我审批+我的会话三块。
**② 推演中心**＝/app/sim（runs 升格）6 页签：轮次总览（姿态横幅/六闸/净额对账/容量行）·监督面板·运行观测·证据库（帧/台账/journal/案例）·交付健康·需求追溯。
**③ 治理中心**＝/app/gov 6 页签：关卡与闸工作流·问题单对账·清偿门·审计与变更·文档评审·度量体检（五卡）。
**④ 岛屿**＝IDE/BPA/本体/评测/技能治理（入口在工作台顶栏右侧）。

全局 UI 六原则沿 IA 正本（状态色含 compensated 紫、姿态横幅、锚点直达、中文优先、密度三级、单层页签）。

## 三、迁移与守卫

- 迁移映射表=第一节「归属」列（旧入口→新入口一一对应，无功能删除——全部为迁移或合并，仅「四体检合一」属合并）。
- 事实源迁移：i18n-tasks-tabs.ts 13 键拆为三中心各自模块内事实源；ia-views.test.ts/governance-view.test.ts 随迁；帧拍摄位注册表（capture-plan.env）随路由变更同步（board 页签位变少、推演中心新增位）。
- 实施排期：Phase B 推演中心（新家先立）→ A 工作台收敛 → C 治理聚合 → D IDE/沟通增强（消息存证/抽屉证据页/新鲜度标记）。新会话执行；studio 在跑轮次期间禁 inject。

## 四、不做什么

- 不删任何既有功能（盘点表全部行都有新家；无「废弃」行——退役仅发生在产品面正身验证后按 replan 退役判据走）。
- 不动岛屿既定路线；不做二级页签；不为重构打断在跑轮次。
