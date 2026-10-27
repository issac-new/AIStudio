# AIStudio 产品一致性整合改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不减少既有能力的前提下，修复 AIStudio 的对象串线、状态失真、重复控制面和页面表达不一致。

**Architecture:** 保留三种工作模式和现有组件。
以复合任务身份、分域运行引用和单一数据生命周期收编控制面。
设置目录与页面解析各自单源，最后统一视觉密度。

**Tech Stack:** Vue 3、TypeScript、Pinia、Naive UI、Koa、Vitest、Vite、现有 regression scripts。

**Spec:** `docs/superpowers/specs/2026-10-27-product-coherence-refactor.md`

## Global Constraints

- 从 `origin/main` 工作；分支为 `refactor/product-coherence`。主工作区未提交内容不得触碰。
- 保留三种工作模式、37 个阶段 tab key、既有 route name、路径和深链。
- `vendor/**` 只经 patches 变更；注入脏态不得提交。
- daily 与 sim 同 taskId 不得互相覆盖或写错；sim 不得写日常 Kanban。
- Legacy Loop 与 Workflow Run 都保留，禁止跨 API 使用裸 ID。
- 空、错、部分可用、陈旧和历史判定必须如实区分，不得用空态或绿灯掩盖。
- 不新增依赖，不创建第四套壳，不复制看板、审批、Matrix 或运行器。
- 新改共享组件同步 zh/en；正文以 14px 为主，辅助文字不低于 12px。
- 每任务先写失败测试，再实现，再运行目标测试并提交。
- 写流只在隔离数据根运行；合入前必须全量测试、build:full、dev 与 dist 走查。
- `DESIGN_SYNC: touched`，整合正本与数字总账随批修订。

## Review Focus

- 同一 board/taskId 的 daily 与 sim：UI key、审批和抽屉必须解析到正确对象，见 Task 2 的同 ID 夹具。
- Legacy Loop 没有运行记录：创建后仍能看到设置，不得丢 loopId，见 Task 3。
- `applied:false`、`status=archived`、`wf=new` 取消：每个例外都有专门测试，见 Tasks 1、3、10。
- 设置路由层级与 loader 必须同时改变，避免双壳或空白页，见 Task 7 的路由行为测试。
- 权限失败、部分 board 失败和陈旧数据不得展示为真空或成功，见 Tasks 5、6、12。

---

### Task 1: 导演台与业务地图接口契约

**Files:**
- Modify: `custom/client/ia2/views/sim/DirectorPanel.vue`
- Modify: `custom/client/ia2/views/sim/BusinessMapView.vue`
- Test: `custom/client/ia2/__tests__/sim-impact-map-contract.test.ts`

**Interfaces:**
- Consumes: `analyzeRequirementImpact(): Promise<{ fingerprint, impact }>`；`saveMapAnnotation(): Promise<{ annotation, applied }>`。
- Produces: 正确渲染的 impact DTO；地图保存只写 `annotation`，并如实处理 `applied:false`。

- [ ] 写失败测试：影响推演解包、正常标注保存、旧 rev 拒绝、annotation 列表形状。
- [ ] 运行 `npx vitest run custom/client/ia2/__tests__/sim-impact-map-contract.test.ts`，确认先失败。
- [ ] 变更两个视图，旧 rev 时同步最新 rev 并提示“存在更新版本，本次未覆盖”。
- [ ] 复跑目标测试及既有 sim/map 测试，确认通过。
- [ ] 提交 `fix(sim): 修正影响推演与地图标注契约`。

### Task 2: daily/sim 复合任务身份

**Files:**
- Modify: `custom/client/ia2/store/workspace.ts`
- Modify: `custom/client/ia2/composables/useSitCounts.ts`
- Modify: `custom/client/kanban/views/SwarmKanbanView.vue`
- Modify: `custom/client/kanban/components/KanbanColumn.vue`
- Modify: `custom/client/ia2/views/stage/StageAcceptanceOverview.vue`
- Modify: `custom/client/ia2/views/stage/DailyUatPanel.vue`
- Modify: `custom/client/ia2/views/stage/StageShell.vue`
- Test: `custom/client/ia2/__tests__/task-identity.test.ts`

**Interfaces:**
- Produces: `TaskRef.key = daily:<board>:<taskId> | sim:<runId>:<board>:<taskId>`；`dailyTasks`、`simTasks`、`isWritableTask(ref)`。
- Consumes: 看板、审批、阶段和抽屉使用复合 key，原 `task.id` 仅用于所属 API。

- [ ] 用同 board、同 taskId 的 daily/sim 写失败测试，覆盖卡片 key、选择、审批和 sim 只读。
- [ ] 运行目标测试确认失败。
- [ ] 在 workspace 创建身份并迁移上述消费者，写操作只接受 daily ref。
- [ ] 复跑目标测试与 workspace、kanban、stage 测试。
- [ ] 提交 `fix(tasks): 隔离日常与推演任务身份`。

### Task 3: Legacy Loop 与 Workflow 分域

**Files:**
- Create: `custom/client/ia2/views/LegacyLoopView.vue`
- Modify: `custom/client/ia2/routes.ts`
- Modify: `custom/client/ia2/views/WorkbenchView.vue`
- Modify: `custom/client/ia2/components/flow/FlowNavPanel.vue`
- Modify: `custom/client/ia2/components/WorkflowPanel.vue`
- Test: `custom/client/ia2/__tests__/loop-workflow-boundary.test.ts`

**Interfaces:**
- Produces: `/app/l/:loopId` 设置与最新运行详情；`?wf=<runId>` Workflow 详情；`WorkflowPanel` 的 `open-run(id)` 与取消事件。
- Consumes: 创建 Loop、blocked Loop 和 Workflow 创建均按域跳转。

- [ ] 写失败测试：Loop 无运行时可见设置，blocked Loop 不请求 Workflow API。
- [ ] 同时覆盖 Workflow 创建成功更新 ID、取消移除 `wf=new`、首载 running 使用 4 秒轮询。
- [ ] 运行目标测试确认失败。
- [ ] 实现薄 Legacy Loop 详情和分域跳转；Workflow 补错误、重试、取消和轮询重排。
- [ ] 复跑目标测试与 workbench/routes 测试。
- [ ] 提交 `fix(automation): 分离定时循环与工作流运行`。

### Task 4: 日常阶段语义与工作台注意力

**Files:**
- Modify: `custom/client/ia2/views/journey/JourneyView.vue`
- Modify: `custom/client/ia2/composables/useDailyStageProgress.ts`
- Modify: `custom/client/ia2/composables/useAttentionRows.ts`
- Modify: `custom/client/ia2/views/WorkbenchView.vue`
- Modify: `custom/client/ia2/components/flow/TaskDecisionPanel.vue`
- Modify: `custom/client/ia2/components/IaSideNavItem.vue`
- Modify: `custom/client/ia2/views/stage/StageSetupSteps.vue`
- Test: `custom/client/ia2/__tests__/daily-workbench-coherence.test.ts`

**Interfaces:**
- Produces: `stepState=untracked` 无信号分支；`useAttentionRows({ includeWaitItems })` 局部选择；只有 routeSel 驱动选中对象。
- Consumes: 顶条保留默认 attention 口径，Workbench 排除已在决策队列的项。

- [ ] 写失败测试：日常首页不读 sim 进度，后续有任务不展示本阶段完成。
- [ ] 同时覆盖未选择房间无房间名、决策项不重复计数。
- [ ] 运行目标测试确认失败。
- [ ] 实现上述语义和分组空态，隐藏无信号的 `0/5`。
- [ ] 复跑目标测试与 journey/stage/workbench/nav 测试。
- [ ] 提交 `fix(workbench): 统一日常阶段与注意力语义`。

### Task 5: 提醒与共享数据生命周期

**Files:**
- Modify: `custom/client/cockpit/store/cockpit.ts`
- Modify: `custom/client/ia2/store/workspace.ts`
- Modify: `custom/client/ia2/composables/useSharedArm.ts`
- Modify: `custom/client/kanban/views/SwarmKanbanView.vue`
- Test: `custom/client/ia2/__tests__/shared-lifecycle.test.ts`
- Test: `custom/client/cockpit/__tests__/reminder-single-owner.test.ts`

**Interfaces:**
- Produces: workspace 唯一提醒调度；overview 单例加载；卸载停止 Kanban/Graph 通道；异步状态含 error/partial/stale。
- Consumes: `useSharedArm` 和各壳只调用这一套生命周期。

- [ ] 写失败测试：提醒只触发一次、旧副本不覆盖、overview 去重、卸载断开、刷新失败不冒充成功。
- [ ] 运行目标测试确认失败。
- [ ] 移除 cockpit 第二调度与重复 overview，补错误状态和流释放；无生产消费者的 metrics 不再预取。
- [ ] 复跑目标测试与 cockpit/workspace 测试。
- [ ] 提交 `fix(shared): 收敛提醒与数据生命周期`。

### Task 6: Graph 摘要与在线计数

**Files:**
- Modify: `custom/server/loop/graph/graph-rest.ts`
- Modify: `custom/client/ia2/composables/useSitCounts.ts`
- Modify: `custom/client/ia2/components/SitDetailPanel.vue`
- Test: `custom/server/loop/__tests__/graph-run-summary.test.ts`
- Test: `custom/client/ia2/__tests__/online-counts.test.ts`

**Interfaces:**
- Produces: 服务端 `projectRunSummary` 同时供列表和详情；在线计数与明细使用同一来源。
- Consumes: 外部 sim run 无内存实例时仍从事件日志推导 status/updatedAt。

- [ ] 写失败测试：外部 run 列表与详情一致；注册离线账号不计在线；单个 FleetSession 不给人/agent/机器各加一。
- [ ] 运行目标测试确认失败。
- [ ] 实现共享摘要与真实 presence/gateway 计数。
- [ ] 复跑目标测试及 graph 与在线计数测试。
- [ ] 提交 `fix(observability): 统一运行摘要与在线计数`。

### Task 7: 设置目录与壳合一

**Files:**
- Modify: `custom/client/ia2/views/gov/gov-settings-registry.ts`
- Modify: `custom/client/ia2/components/IaSettingsSidebar.vue`
- Modify: `custom/client/ia2/components/IaShellHeader.vue`
- Modify: `custom/client/ia2/components/SpotlightPanel.vue`
- Modify: `custom/client/ia2/routes.ts`
- Modify: `custom/client/ia2/views/legacy-view-loaders.ts`
- Modify: `custom/client/ia2/views/IaLegacyShell.vue`
- Test: `custom/client/ia2/__tests__/settings-single-center.test.ts`

**Interfaces:**
- Produces: 带 surface/icon/gate 的设置目录元数据；目录和详情共用 `IaLegacyShell`。
- Consumes: 页头、Spotlight、设置首页和侧栏都使用该目录；route name/path/query 不变。

- [ ] 写失败测试：单一设置入口、无双壳、loader 非空、Hermes theme/Ekko/权限项保留、preview 开关一致、生产不全表预热。
- [ ] 运行目标测试确认失败。
- [ ] 实现目录派生和正确顶层 annex 路由，补 VIEW_LOADERS。
- [ ] 复跑目标测试与 routes/settings 测试。
- [ ] 提交 `refactor(settings): 合并设置目录与收编壳`。

### Task 8: 阶段页签与页面展示解析

**Files:**
- Create: `custom/client/ia2/page-presentation.ts`
- Modify: `custom/client/ia2/recent-trail.ts`
- Modify: `custom/client/ia2/components/IaBreadcrumb.vue`
- Modify: `custom/client/ia2/stage-tabs.ts`
- Modify: `custom/client/ia2/views/stage/StageShell.vue`
- Modify: `custom/client/governance/components/ProactivitySection.vue`
- Modify: `registries/client/entry.mts`
- Test: `custom/client/ia2/__tests__/page-presentation.test.ts`
- Test: `custom/client/ia2/__tests__/stage-tab-registry.test.ts`

**Interfaces:**
- Produces: 共享 `resolvePagePresentation(route)`；37 个 tab 的统一元数据/loader/props；仅⑥只读的 Proactivity。
- Consumes: 面包屑、最近轨迹和 `document.title` 使用同一解析。

- [ ] 写失败测试：simMap、导演详情、query.from、tab 深链、loader 懒加载、①可写⑥只读。
- [ ] 运行目标测试确认失败。
- [ ] 实现共享解析和页签注册，⑥分组只作展示。
- [ ] 复跑目标测试与 stage/recent/breadcrumb 测试。
- [ ] 提交 `refactor(navigation): 合并页签与页面展示解析`。

### Task 9: 推演壳与状态表达

**Files:**
- Modify: `custom/client/ia2/views/sim/SimCenterView.vue`
- Modify: `custom/client/ia2/components/IaSideNav.vue`
- Modify: `custom/client/ia2/views/sim/DirectorPanel.vue`
- Modify: `custom/client/ia2/views/sim/SimOrchestrationView.vue`
- Modify: `custom/client/ia2/views/sim/BusinessMapView.vue`
- Test: `custom/client/ia2/__tests__/sim-shell-coherence.test.ts`

**Interfaces:**
- Produces: 左侧唯一推演导航并保留 run/from；历史运行、流程完成、历史门判定、当前证据核验分别展示。
- Consumes: 四个兄弟路由与内容映射保持不变。

- [ ] 写失败测试：无重复导航、run/from 保留、当前运行不说无历史、证据缺失不形成完成绿灯、只读文案准确。
- [ ] 运行目标测试确认失败。
- [ ] 实现壳与状态文案调整，原始技术信息收进详情。
- [ ] 复跑目标测试与 sim-center 测试。
- [ ] 提交 `fix(sim): 去重推演导航并澄清状态`。

### Task 10: 检索与特性开关

**Files:**
- Modify: `custom/client/ia2/views/SearchView.vue`
- Modify: `custom/client/ia2/components/SpotlightPanel.vue`
- Modify: `custom/client/ia2/components/IaWorkspaceSwitch.vue`
- Modify: `custom/client/ia2/composables/useIdeJump.ts`
- Modify: `registries/client/bootstrap.ts`
- Modify: `vendor/hermes-studio/packages/client/src/components/hermes/connections/ConnectionsPanel.vue`（仅经新 patch）
- Test: `custom/client/ia2/__tests__/search-feature-gates.test.ts`
- Test: `scripts/__tests__/connections-panel-gate.test.ts`

**Interfaces:**
- Produces: `archived=1` 深链与可搜索工作区选项；统一 FeatureDisabled；空 Tabs 回退。
- Consumes: `status=archived` 覆盖默认排除，工作区值仍为完整路径。

- [ ] 写失败测试：默认不含归档、显式 archived、重名短路径消歧、IDE 关闭无无效跳转、专题关闭态、superadmin 空 Tabs。
- [ ] 运行目标测试确认失败。
- [ ] 实现检索和开关行为；vendor 变更生成 patch 并登记 series。
- [ ] 复跑目标测试与 search/bootstrap 测试，inject 重放验证。
- [ ] 提交 `fix(search): 统一过滤口径与特性关闭态`。

### Task 11: IDE 与视觉内容一致性

**Files:**
- Modify: `custom/client/ide/components/IdeLandingHero.vue`
- Modify: `custom/client/ide/components/IdeSecurityBoostBar.vue`
- Modify: `custom/client/ia2/styles/shell-overrides.scss`
- Modify: `custom/client/ia2/views/IaLegacyShell.vue`
- Modify: `custom/client/ide/views/IdeShell.vue`
- Modify: 触及的工作台、阶段、专题和设置视图
- Test: `custom/client/ide/__tests__/security-boost-contract.test.ts`
- Test: `custom/client/ide/__tests__/landing-single-session-list.test.ts`
- Test: `custom/client/ia2/__tests__/visual-coherence.test.ts`

**Interfaces:**
- Produces: 左侧唯一 CLI 会话列表；真实 diff 扫描；内联 boost；单一壳 tokens。
- Consumes: 既有 CLI 动作、UiStatusPill、UiEmptyState 和 Naive UI 主题。

- [ ] 写失败测试：中央无重复 CLI、无变更不装安全、无死 git 端点、无 window.prompt、重复 token 移除、辅助字号和命中区。
- [ ] 运行目标测试确认失败。
- [ ] 实现 IDE 与视觉内容变更，收绝对路径/方法论/原始时间戳到详情。
- [ ] 复跑目标测试、raw-hex、locale、IDE 与触及域测试。
- [ ] 提交 `fix(ui): 去重 IDE 并统一视觉与内容`。

### Task 12: 验证基建、文档与整体验收

**Files:**
- Modify: `scripts/regression/ide-smoke.mjs`
- Modify: `scripts/verify-dist.mjs`
- Modify: `scripts/regression/route-manifest.test.ts`
- Modify: `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`
- Modify: `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`
- Modify: `README.md`、`docs/USAGE.md`（仅可见变化）
- Test: `scripts/__tests__/verify-dist-default-password.test.ts`

**Interfaces:**
- Produces: IDE 23 签 smoke、当前 vendor 与 assets/js 的 dist 检查、准确 37 签文档。
- Consumes: Tasks 1–11 的最终行为。

- [ ] 修正验证基建并先运行其目标测试。
- [ ] 运行全量 `npm test`，保存真实结果。服务端模块有改动时运行 `npm run typecheck:harness`。
- [ ] 运行 `OVERLAY_UPSTREAM_ROOT=$PWD/vendor npm run build:full`。
- [ ] 在隔离环境运行 dev/dist 全路由、IDE smoke、关键写流、错误注入与四宽度双主题走查。
- [ ] 根据实测更新整合正本、数字总账、README/USAGE，记录所有未验证项。
- [ ] 提交 `test(regression): 补齐产品整合验收与文档`。
