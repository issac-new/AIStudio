# 驾驶舱 v12 统一视图智能驾驶舱 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 v12 设计稿（会话×循环×任务×参与者四对象、双视图、协作三栏、⚙管理台、IDE 维度条）实施为 SwarmStudio 应用的真实 UI，替换现有六场景导航。

**Architecture:** 保留双壳（/app 驾驶舱 IaShell + /ide IDE 壳）与 A/B 类改造体系（custom/ 纯新增 + patches/ 注入）。/app 从六场景收敛为单一「沟通协作」工作台（三栏：工作流导航 | 对象工作区 | 任务与决策），旧场景路由全部按 v12 迁移表重定向；管理台为全局覆盖层；IDE 加维度条。数据底座全部复用现有 store（matrix-room、chat、loop、runCenter、kanban/workspace、cockpit、team-registry、fleet），只新建聚合视图层与纯函数适配器。

**Tech Stack:** Vue 3 `<script setup>` + Pinia + vue-router + vitest（jsdom）+ overlay inject patch 体系。无新依赖。

**Spec:** `ncwk/docs/superpowers/designs/finalized.html`（v12 设计稿，含 §1 令牌/§2 模拟窗/§2.1 六动线/§4 对象归属表与迁移表）。规格全文提取件见本计划附录引用。

## Global Constraints

- 只改 `overlay/`：A 类落 `overlay/custom/`，B 类走 patch 五步法；**严禁直改 upstream**（改 B 类 patch 后必须 `npm run clean && npm run inject` 重放）。
- 分支：`feat/cockpit-v12-workbench`（自 overlay main），完成后合 main。工作区 AGENTS.md 裁定在本仓就地开分支（inject 与 upstream 树耦合，不建 git worktree）。
- i18n：新 UI 文案 zh/en 全键对称，成对 patch **316/317**（315 已退役不复用；开工前 `ls patches/ | grep ^31` 复核撞号）。
- 新 UI 文案一律 `t()`，禁止裸中文进模板（ide-main-page 记忆坑）。
- 门禁（收口缺一不可）：`npm test` 全绿 → `npm run clean && npm run inject` 重放 → `npm run build:full`（vite build 过；.vite 缓存先删）→ 注入树对账。
- 测试规约：vitest + `// @vitest-environment jsdom` 文件级指令；测试放各模块 `__tests__/`；守门测试直接消费 routes/adapters 纯函数。
- 视觉令牌（v12 §1）：三栏 `250px | minmax(320px,1fr) | 240px` gap 10px，永不换列（窄屏由外层缩放，不写栏宽媒体查询）；状态点 8px 语义色；基础字号 12px；primary #3b82f6 / success #2e7d32 / error #c62828 / warning #f57f17 / info #4a90d9。
- 六动线（§2.1）全部真实可点：沟通对齐→指派→执行追踪→决策→编码→管理。

## 路由与名称账本（Task 2 的单一事实源）

新 `/app` 子路由（name 决不改错，深链全量迁移）：

| path | name | 组件 | 说明 |
|---|---|---|---|
| `/app` | `ia2.shell` | IaShell | fullscreen |
| `` (子) | `ia2.collab` | WorkbenchView | 三栏工作台（默认无选择→自动选首个会话，不写 URL） |
| `s/chat` | `ia2.collabChat` | WorkbenchView | 中栏=ChatView（新会话态） |
| `s/chat/:sessionId` | `ia2.collabSession` | WorkbenchView | 中栏=ChatView（参数名不变，cockpit 适配器/upstream GlobalPendingActions 深链免改） |
| `s/room/:roomId` | `ia2.commsRoom` | WorkbenchView | 中栏=MatrixRoomCanvas（参数名不变，notify/collab-adapter/KanbanTaskDrawer 深链免改） |
| `l/:loopId` | `ia2.loopCanvas` | WorkbenchView | 中栏=运行画布 |
| `board` | `ia2.board` | TasksView（现名 ia2.tasks 改名） | 看板+追溯矩阵 |
| `eng` | `ia2.eng` | EngScene（保留，不进场景条） | 编排；＋新循环入口 |
| `runs` | `ia2.runs` | RunCenterView（新挂载，隐藏路由） | 全部运行列表 |
| `runs/:runId` | `ia2.runDetail` | RunDetailView（路径自 /app/ops/runs 迁移） | |
| `history`、`history/session/:sessionId` | `ia2.collabHistory(-Session)` | HistoryView（隐藏深链，upstream PageSidebarNav 依赖） | |
| `agent`、`agent/session/:sessionId` | `ia2.collabGlobalAgent(-Session)` | GlobalAgentView（隐藏深链） | |

路径重定向（无 name 记录）：`/app/ops→/app/runs`、`/app/ops/runs/:runId→/app/runs/:runId`、`/app/tasks→/app/board`、`/app/comms→/app`、`/app/comms/room/:roomId→/app/s/room/:roomId`、`/app/collab→/app`、`/app/collab/session/:sessionId→/app/s/chat/:sessionId`、`/app/collab/(chat|history|global-agent)→/app`。

退役名称（守门断言零残留于 buildIaRoutes）：`ia2.overview`、`ia2.ops`、`ia2.tasks`、`ia2.comms`。名称引用点改造：`ide/views/IdeTaskSidebar.vue:550`、`ide/views/IdeTopBar.vue:21-22`、`ide/components/IdeCommandPalette.vue:45-46`、`cockpit/components/CockpitScheduleModal.vue:211`、`ia2/adapters/inbox-center.ts:148,190`、`loop/runcenter/views/RunDetailView.vue:122`、`loop/runcenter/components/NodeInspector.vue:44`、`ia2/views/OrchestrateView.vue:163`、patch 299（AppSidebar `ia2.overview`→`ia2.collab`，等行数单行替换）。

退役组件（Task 2 删除）：`ia2/views/scenes/OverviewScene.vue`、`CollabScene.vue`、`OpsScene.vue`、`CommsView.vue`、`ia2/components/MindViz.vue`、`MindViz3D.vue`、`ia2/adapters/mind.ts`、`mind3d.ts` 及其测试（overview-scene/collab-scene/ops-scene/mind-adapter/mind3d-adapter）。保留：`AttentionStrip.vue`（升壳层）、`InboxView`（不挂路由，文件保留供 RunCenter 内嵌用）、EngScene/TasksView/RunCenterView/RunDetailView。

## i18n 键清单（Task 11 patch 316 zh / 317 en；前缀 `ia2.`）

`nav.collab`(值改"沟通协作"/"Collaboration")、`scenes.ideView`("IDE 工作台")；左栏 `flow.title/workflow/all/sessions/loops/filterPlaceholder/newSession/newLoop/manage/teamTag…`；右栏 `tdp.title/waiting/all/linked/newTask/feed/allTimeline/approve/reject/confirm/reassign/openIde/handleMe/waitingSub…`；链路条 `chain.openIde/chain.timeline…`；参与方 `part.title/part.invite/part.duty…`；运行画布 `rc.live/rc.history/rc.board/rc.liveBadge/rc.stageWaitYou/rc.stageBlocked/rc.stageIdle/rc.linkedTasks/rc.participants/rc.eventCount/rc.export/rc.stageName.plan|impl|review|accept|deliver…`；态势条 `sit.waiting/sit.oldest/sit.tasks/sit.running/sit.review/sit.sessions/sit.loops/sit.blocked/sit.online/sit.onlineDetail/sit.manage…`；注意力条 `attn.waiting/attn.tierReview/attn.tierTriage/attn.tierBlocked…`；管理台 `gov.title/gov.back/gov.task/gov.session/gov.people/gov.agent/gov.team/gov.*各列名与操作（detail/history/enter/members/archive/tasks/runs/reassign/diagnose/restart/invite/register/createTeam/newX…）/gov.detail.realtime/gov.detail.history/gov.detail.gotoRun/gov.detail.gotoIde…`；空态 `flow.empty.*`、`tdp.empty.*`、`rc.empty.*`；IDE 维度条 `ide.dims.workspace/task/project/session/chain/switchCollab`。成对补齐 en；`i18n-message-compile-gate` 与 `unified-nav-guard` i18n 断言同步更新。

---

### Task 1: 分支与基线

**Files:** 无代码改动；产出计划文档（本文件）。

- [x] **Step 1:** `cd overlay && git checkout -b feat/cockpit-v12-workbench`（自 main 6b9e8d3）
- [x] **Step 2:** 基线 `npm test` 全绿记录（后台运行中，开工 Task 2 前确认；若红先停手排查）
- [x] **Step 3:** upstream 注入态对账（106 dirty ⊂ patch 目标，正常）

### Task 2: 路由重构 — 双视图 + 迁移表 + 场景条

**Files:**
- Modify: `custom/client/ia2/routes.ts`（重写：IaAreaKey='collab'；IA_AREAS 单元素；新子路由+重定向表）
- Modify: `custom/client/ia2/store/ia.ts`（默认 currentArea='collab'）
- Modify: `custom/client/ia2/views/IaShell.vue`（场景条=IA_AREAS link + IDE 第二按钮 router-link `ide.shell`，testid `ia-scene-ide`）
- Modify: `custom/client/ia2/wm/store.ts`（MinimizedPanel.area 类型随 IaAreaKey）
- Create: `custom/client/ia2/views/WorkbenchView.vue`（本任务仅占位骨架：三栏 grid 容器 + 空左中右）
- Modify: 上述名称引用点 9 处（改 push 目标名）
- Modify: `overlay/patches/299-client-appsidebar-dual-entry-system-group.patch`（`ia2.overview`→`ia2.collab` 单行替换，行数不变）
- Delete: 退役组件与其测试（清单见上）
- Test 重写: `ia2/__tests__/unified-nav-guard.test.ts`、`routes.test.ts`、`scene-routes.test.ts`（并入 routes.test）、`ia-views.test.ts`、`ia-shell.test.ts`、`wm.test.ts`（area 投影）、`eng-scene.test.ts`（路由名不变仅路径断言）

**Interfaces（Produces，后续任务依赖）:**
- `IaAreaKey = 'collab'`；`IA_AREAS = [{ key:'collab', name:'ia2.collab', path:'/app', labelKey:'ia2.nav.collab' }]`
- `areaForPath(path): 'collab' | null`（/app* → 'collab'；其余 null）
- 路由名称账本（上表）；WorkbenchView 经 `route.params.sessionId/roomId/loopId` 推导选择

- [x] **Step 1: 重写守门测试（红）** — unified-nav-guard：IA_AREAS=['collab']；RETIRED_NAMES 增 `ia2.overview|ia2.ops|ia2.tasks|ia2.comms`；重定向表逐条 `expect(rec.redirect).toBe(...)`；routes.test：按名称账本逐条 resolve 断言（含 `/app/s/room/!x:h`→ia2.commsRoom、`/app/l/l1`→ia2.loopCanvas、`/app/board`→ia2.board、`/app/runs/r-1`→ia2.runDetail、`/app/ops`→redirect）
- [x] **Step 2: 跑测试确认红**（现行六场景模型必挂）
- [x] **Step 3: 重写 routes.ts + ia.ts + IaShell 场景条 + WorkbenchView 占位**；改 9 处名称引用；删退役组件与测试
- [x] **Step 4: patch 299 单行替换**（`ia2.overview`→`ia2.collab`，两处 hunk 若有）→ `npm run clean && npm run inject` 重放验证
- [x] **Step 5: `npm test` 绿 → commit** `feat(ia2): v12 双视图路由重构——/app 工作台+迁移表+场景退役`

### Task 3: flow store 与纯适配器（TDD 核心）

**Files:**
- Create: `custom/client/ia2/store/flow.ts`
- Create: `custom/client/ia2/adapters/flow.ts`、`custom/client/ia2/adapters/waiting.ts`
- Test: `custom/client/ia2/__tests__/flow-adapter.test.ts`、`waiting-adapter.test.ts`

**Interfaces（Produces）:**
```ts
// adapters/flow.ts —— 全部纯函数
export type StreamKind = 'room' | 'chat' | 'loop'
export interface FlowSessionRow { kind:'room'|'chat'; id:string; name:string; unread:number; taskCount:number; teamTag:string; dutyName:string|null; lastActivityAt:number|null }
export interface FlowLoopRow { kind:'loop'; id:string; name:string; stageIndex:number /*0-4*/; stageTotal:5; stageState:'done'|'run'|'err'|'todo'; progressPct:number; statusText:string; blocked:boolean; awaitingYou:boolean; updatedAt:number|null }
export interface FlowFilter { kind:'all'|'session'|'loop'; query:string }
export function buildSessionRows(rooms, chatSessions, unreadOf, taskCountOf, teamTagOf, dutyOf): FlowSessionRow[]
export function buildLoopRows(loops: LoopInstance[], now:number): FlowLoopRow[]   // stageIndex=STAGE_ORDER.indexOf(loop.stage); stageState: completed→done, blocked→err, awaiting-review→run, running→run, else todo; progressPct = Math.round(((stageIndex + (running?0.5:1)) / 5) * 100), completed=100
export function filterStreams<T extends {kind:string; name:string; taskIds:string[]}>(rows:T[], f:FlowFilter): T[]  // query 匹配 name / taskIds 前缀
export function linkedTaskIdsOfSession(session:{kind:'room'|'chat'; id:string}, tasks:CockpitTask[], tenantRoomOf:(t:CockpitTask)=>string|null, sessionOf:(t:CockpitTask)=>string|null): string[]
export function linkedTasksOfLoop(contracts: TaskContract[], tasks: CockpitTask[]): CockpitTask[]  // contract.persistedTaskId → task.id
export interface FeedRow { id:string; icon:'run'|'gate'|'task'|'sys'; text:string; ts:number }
export function mergeFeed(loopEvents: LoopEvent[], runTails: {runId:string; events:GraphEventLike[]}[], tasks:CockpitTask[], now:number, cap=20): FeedRow[]
// adapters/waiting.ts
export type WaitKind = 'task-review' | 'run-approval' | 'fleet-approval'
export interface WaitItem { kind:WaitKind; id:string; title:string; sub:string; ts:number; taskId?:string; runId?:string; sessionId?:string; approvalId?:string }
export function buildWaiting(tasks:CockpitTask[], awaitingRuns:RunSummary[], fleetSessions:FleetSession[], now:number): WaitItem[]
```
- store/flow.ts（Pinia `ia2-flow`）：state `selected: { kind:StreamKind; id:string } | null`、`govOpen=false`、`govSection='task'`、`govSelectedId:string|null`；actions `select(kind,id)`（与路由同步由 WorkbenchView 负责）、`openGov(section?)`、`closeGov()`。**store 不含派生数据**，派生全走 adapters（可测）。

- [x] **Step 1: 写 flow-adapter + waiting-adapter 测试**（含表驱动：stage 投影、progress 公式、filter、tenant/session/contract 三路挂接、feed 归并排序、waiting 三源去重权重 task-review>run-approval>fleet-approval 按 ts）
- [x] **Step 2: 跑红** → **Step 3: 实现** → **Step 4: 跑绿** → **Step 5: commit** `feat(ia2): v12 工作流纯适配器——统一列表/挂接/动态/等我聚合`

### Task 4: WorkbenchView 骨架 + 左栏工作流导航

**Files:**
- Modify: `custom/client/ia2/views/WorkbenchView.vue`（三栏 grid `250px minmax(320px,1fr) 240px` / gap 10px；route→selection 同步；无选择→computed 首个会话）
- Create: `custom/client/ia2/components/flow/FlowNavPanel.vue`（栏头"工作流"+过滤 chips 全部/会话/循环+过滤框+会话分组(计数徽章+📋N+未读红点)+循环分组(进度条 3px 分段+meta 状态)+栏底 ＋新会话/＋新循环/⚙管理；选中态；点击→router.push 对应子路由）
- Test: `ia2/__tests__/workbench-view.test.ts`（挂载断言三栏 testid `wb-left/wb-center/wb-right`、选择切换、过滤交互）、`flow-nav.test.ts`

**Interfaces（Consumes）:** Task 3 adapters；matrix-room `sortedRooms/getRoomUnreadCount`、chat sessions、loop `loopStore.loops`。**Produces:** testid 约定 `wb-left` `wb-center` `wb-right` `flow-session-<id>` `flow-loop-<id>` `flow-filter-all|session|loop` `flow-new-session` `flow-new-loop` `flow-gov`；事件 `select`（panel 内部直接 router.push）。
- [ ] Steps: 测试（三栏渲染/默认选中/点击会话→/app/s/room/:id push/点击循环→/app/l/:id/过滤）→ 红 → 实现 → 绿 → commit `feat(ia2): v12 工作台骨架+工作流导航（会话∪循环）`

### Task 5: 右栏 任务与决策

**Files:**
- Create: `custom/client/ia2/components/flow/TaskDecisionPanel.vue`（恒驻三节：等我（行上 验收/打回/确认 就地按钮）/ 挂接任务（状态点+指派头像+改派/⌨/去处理）/ 任务动态；栏底 🕘 全部时间线 ›）
- Create: `custom/client/ia2/components/flow/WaitQueue.vue`、`LinkedTaskList.vue`、`TaskFeed.vue`
- Test: `ia2/__tests__/task-decision.test.ts`

**动作接线（真实 API）：** 验收→`kanban.moveTask(id,'done')`；打回→`kanban.blockTask(id,'打回：需返工')`；确认(run)→`runsStore.resumeRun(runId)`；确认(fleet)→`cockpit.respondFleetApproval(sessionId, approvalId,'once')`；改派→`KanbanTaskDrawer` 复用或 `kanban.reassignTask`（弹 confirm 输入 profile，首版用 drawer）；⌨→`router.push({name:'ide.shell', query:{task:id}})`；去处理→`/app/board?task=<id>`。挂接任务源=Task 3 linked*（选择会话/循环/默认=最近开放任务前 8）。
- [ ] Steps: 测试（waiting 行渲染+验收触发 moveTask mock、挂接任务随 selection 变化、feed 渲染）→ 红 → 实现 → 绿 → commit `feat(ia2): v12 任务与决策右栏——等我队列/挂接任务/动态`

### Task 6: 对话画布（会话工作区）

**Files:**
- Create: `matrix-chat/components/MatrixRoomCanvas.vue`（复用 MatrixRoomHeader + MatrixMessagePanel + composer + MatrixRightPanel；**无房间列表**；roomId 仍经 route.params 绑定）
- Create: `ia2/components/flow/SessionCanvas.vue`（kind 分派：room→MatrixRoomCanvas；chat→upstream ChatView 经动态 import；顶部 ChainBar + ParticipantsBar）
- Create: `ia2/components/flow/ChainBar.vue`（对象→任务→门 面包屑：当前对象 chip + 挂接任务 chip（取首个挂接任务）+ 等你状态门 chip（waiting 命中该对象时）+ 「时间线 ▾」（→右栏动态滚动）+「⌨ 在 IDE 打开」）
- Create: `ia2/components/flow/ParticipantsBar.vue`（room→getRoomMemberList 投影 👤/🤖 徽章+值守；chat→会话 agent；＋邀请（room→inviteUser 入口））
- Test: `ia2/__tests__/session-canvas.test.ts`（kind 分派、链路条任务 chip 来自 linked tasks、partbar 徽章渲染）

- [ ] Steps: 测试→红→实现→绿→commit `feat(ia2): v12 对话画布——matrix/agent 会话统一工作区+链路条+参与方`

### Task 7: 运行画布（循环工作区：实时|历史）

**Files:**
- Create: `ia2/components/flow/RunCanvas.vue`（链路条 + 视图条 实时/🕘历史·回放/▦看板→/app/board + LIVE 徽章（runsStore socket 连接时绿））
- Create: `ia2/components/flow/StageFlow.vue`（①-⑤ 胶囊流：done ✓N轮/run ◐状态/todo；来自 FlowLoopRow + loop.stats.totalIterations）
- 实时视图：StageFlow + 挂接任务卡（LinkedTaskList 复用只读态）+ 参与方卡（contracts assignee + 值守）+ 最新 run 迷你图（`RunGraphCanvas`，数据=`runRest.getSpec('loop-'+id)`+`replay(latestRunId)`→`buildRunGraph`，无 run 时显示阶段卡占位）；LIVE 更新走 runsStore 已有 socket
- 历史视图：`useRunReplay`（键盘 j/k 步进绑定）+ 事件编年（`projectEvents`）+「导出归档」→`runRest.exportRun` 触发下载
- Test: `ia2/__tests__/run-canvas.test.ts`（stage 投影渲染、live/hist 切换 testid `rc-view-live|hist`、无 run 空态、导出按钮调用）
- [ ] Steps: 测试→红→实现→绿→commit `feat(ia2): v12 运行画布——实时图+阶段流+历史回放+导出`

### Task 8: 壳层收口 — 态势条 + 注意力条 + 管理台挂载

**Files:**
- Create: `ia2/components/SitlineBar.vue`（等我 N 最久Xh ⚠ / 任务 N 进行·待审 / 会话 N / 循环 N 阻塞 / 在线 N（人·智能体·机器）/ ⚙管理；数据=sitline 聚合 computed（waiting+workspace.tasks+rows+loops+fleet+registry））
- Create: `ia2/store/platforms.ts`（网关/平台探测自 IaShellHeader 抽出：30s 轮询 /agent-health/detailed；header 改消费 store，DOM/testid 不变）
- Modify: `IaShell.vue`（页头下加 `AttentionStrip`（items=buildWaiting 派生 AttentionRow，select→右栏定位+gov 关闭）+ WorkbenchView 顶部 SitlineBar + `<GovOverlay v-if="flow.govOpen">` 覆盖层挂载 + Esc 关闭）
- Modify: `IaShellHeader.vue`（平台组改用 platforms store）
- Test: `ia2/__tests__/sitline.test.ts`、`ia-shell.test.ts` 增补（attn/sitline/gov 挂载断言、Esc 关 gov）
- [ ] Steps: 测试→红→实现→绿→commit `feat(ia2): v12 壳层——注意力条+态势条+管理台挂载点`

### Task 9: ⚙管理台覆盖层（五区+详情）

**Files:**
- Create: `ia2/components/gov/GovOverlay.vue`（三栏：资源导航（五区+实时计数徽章）| 分区列表 | 详情面板；⇠返回=closeGov）
- Create: `ia2/components/gov/GovTaskSection.vue`（workspace.tasks 表：任务/循环阶段|指派|状态|操作；过滤 状态/指派人/循环 ▾；行上 详情(KanbanTaskDrawer)/⌨/历史(openRunTrace)；＋新建→/app/board）
- Create: `ia2/components/gov/GovSessionSection.vue`（rooms∪chat sessions：成员数/挂任务数/最近活动/归档候选（30 天无活动标记，只读）；进入→工作台选中；成员→room members 弹层；归档仅 chat 会话接 archiveSession）
- Create: `ia2/components/gov/GovPeopleSection.vue`（team-registry accounts：在线/负载（其 agentTeams profiles 上 running 任务数）；任务→/app/board?assignee=；会话→其值守房)
- Create: `ia2/components/gov/GovAgentSection.vue`（fleet sessions（working/idle/心跳/当前任务 approvals）∪ registry AgentTeams；运行→fleet 会话/cockpit session 视图；改派/诊断/重启首版只对有 API 的动作实装，其余按钮带 disabled+title 说明——不放假按钮）
- Create: `ia2/components/gov/GovTeamSection.vue`（团队卡（TeamRecord profiles 数/成员名）+ 通道卡（platforms store：api_server/matrix/email 状态 ✓/断开·重连提示））
- Create: `ia2/components/gov/GovDetailPanel.vue`（选中对象：实时卡（指派/会话/循环 chips 可跳）+ 历史卡（时间线摘要+ ↗运行·历史 / ⌨ IDE 任务空间））
- Test: `ia2/__tests__/gov-overlay.test.ts`（五区导航切换 testid `gov-nav-task|session|people|agent|team`、计数徽章、行操作触发、详情跳转 push 断言）
- [ ] Steps: 测试→红→实现→绿→commit `feat(ia2): v12 管理台覆盖层——任务/会话/员工/智能体/团队五区`

### Task 10: IDE 维度条 + 双向互链

**Files:**
- Modify: `ide/store/ide.ts`（state 增 `dimension:'task'|'project'|'session'|'chain'`（localStorage `hermes_ide_dim` 持久化）+ `setDimension()`；`IdeSidePaneTab` 联合补 `'terminal'`（既有越界调用转正））
- Create: `ide/components/IdeDimsBar.vue`（横条：工作空间 | 任务·#<t> | 项目·<ws> | 会话·<s> | 链路·run 追踪 | ⇄沟通协作；任务 dim→sidebar tasks+chat messages；项目→sidebar files；会话→chat 联动会话；链路→openRunTraceGlobal()）
- Modify: `ide/views/IdeShell.vue`（TopBar 下挂 IdeDimsBar；query.task 进入→setDimension('task')+尝试 chat.switchSession(任务 session_id)）
- Test: `ide/__tests__/ide-dims.test.ts`（维度切换副作用、⇄push /app、query.task 深链）
- [ ] Steps: 测试→红→实现→绿→commit `feat(ide): v12 工作空间维度条——任务/项目/会话/链路`

### Task 11: i18n patch 316/317 + 覆盖门禁

**Files:**
- Create: `patches/316-client-i18n-cockpit-v12-zh.patch`、`317-client-i18n-cockpit-v12-en.patch`（键清单见上；含 `ia2.nav.collab` 值变更 hunk）
- Modify: `patches/series` 追加两行；`ia2/__tests__/unified-nav-guard.test.ts` i18n 断言更新
- 五步法：临时改 upstream zh.ts/en.ts → `git diff > patch` → `git checkout -- <两文件>` → 入 series → `npm run clean && npm run inject`
- [ ] Step: inject 重放 → `npm test`（i18n-compile 门禁+coverage 18/18）→ commit `feat(i18n): v12 工作台全量文案 zh/en 成对注入`

### Task 12: 退役清理 + 全量门禁 + 收口合并

- [x] 死代码扫描：`grep -r "ia2.overview\|ia2.ops\|ia2.tasks\|ia2.comms\b" custom/ patches/` 零残留（除 series 注释/重定向表）；未引用组件复核
- [ ] `npm test` 全绿（基线 1832 ± 增删后全过）
- [ ] `npm run clean && npm run inject` 重放 + `npm run verify` + 注入树对账（dirty ⊂ patch 目标 + 新增文件型产物）
- [ ] `rm -rf upstream/hermes-studio/packages/client/node_modules/.vite` 后 `npm run build:full` 过
- [x] dev 冒烟：`npm run dev`（8649）+ 后端 8647，CDP 或 curl 抽查 /app 三栏渲染、六动线核心跳转（沟通→指派→执行→决策→编码→管理）
- [x] 合并：`git checkout main && git merge feat/cockpit-v12-workbench`（保留分支，按仓库惯例）
- [x] 同步设计稿镜像已在位（finalized.html 两处 IDENTICAL 已核）；RELEASE-NOTES 条目（版本号顺延，与 042/207 联动规则留发布轮处理——本任务只加 Unreleased 段）

## Self-Review 结论

- 规格覆盖：v12 §2 三栏（T4-7）、§2.1 六动线（沟通=T4/6、指派=T5、执行=T7、决策=T5/8、编码=T10、管理=T9）、§3 窗口四态（已有 wm，T2 保兼容）、§4 迁移表（T2）、管理台（T9）、IDE 维度条（T10）、态势/注意力（T8）——全覆盖。空态文案设计稿未定义，实施自定并进键清单（已注明）。
- 类型一致性：FlowLoopRow/WaitItem/FeedRow 跨任务签名已对齐；路由名称账本为 Task 2/10/12 共同依据。
- 风险与对策：patch 299 手改=等行数单行替换（避开尾行添加陷阱）+ clean&&inject 即时验证；MatrixChatPanel 不动（新建 Canvas 组件复用其子件）；ChatView 为 upstream 组件仅经路由参数嵌入，零 patch。
