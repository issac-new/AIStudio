# Loop Graph 多视图重构设计（壳 + 四场景）

日期：2026-09-16 · 分支：`feat/loop-multiview` · 状态：设计定稿待实施

## 主旨

Loop Graph 页面（`/app` 与 `/hermes/loop` 双挂载点）从单一 3D 思维大脑驾驶舱升级为**壳 + 四场景视图**：总览（现状原样）、管理（研发管理治理）、Code（IDE 习惯编码）、运维（值班/告警/工单）。本文写给实施者与后续维护者，回答三件事：改什么、为什么、怎么验证。能力全部由既有组件装配（AI 协作中心 + loop/ia2/kanban/matrix 模块），零后端改动、零新依赖。

## 用户裁决记录（2026-09-16）

| # | 裁决 |
|---|------|
| 1 | 3D 思维大脑保留为「总览」视图，四视图并列 |
| 2 | AI 协作中心（/hermes/cockpit）两页并存，仅组件复用；登录落点不动 |
| 3 | 默认视图 = 总览 3D 大脑 |
| 4 | 「拉群干活」MVP = 任务↔群弱锚点（命名约定，不持久化字段） |
| 5 | 视图切换机制 = **子路由**（非 query 参数） |
| 6 | Code 视图复用 cockpit 组件 = **就地参数化**（可选 props，缺省回落原行为） |

## 决策

### D1 壳 + 四场景架构

`LoopCockpitView` 从「完整页面」瘦身为**驾驶舱壳**：

- 壳保留：页头（品牌/连接状态/时钟/动作区——运行中心按钮 + 溢出菜单原样）+ **场景切换条**（总览/管理/Code/运维）+ `<router-view />`。
- KPI 条、注意力条、主体三栏全部随迁总览场景，**不在壳级**（避免吃掉 Code/运维视图垂直空间）。
- 数据武装分层：壳武装四场景共享的 workspace 流（loadTodos / startReminderScheduler / watchKanbanTasks / initFleetStream，卸载时全量回收——现有行为原样保留在壳）；场景专属武装在场景内（总览 = mind 订阅 + runs fetch；运维 = runs fetch；管理/Code 依赖壳级 workspace 流与 kanban store 自武装）。

### D2 子路由切换（双挂载点，单一事实源）

```
/app (ia2.shell → IaShell, fullscreen)               ← 既有不动
  ''  → LoopCockpitView（壳）                          ← 由总览本体改为壳
      ''        → OverviewScene（路由名 ia2.overview 保留，/app 深链不变）
      'manage'  → ManageScene（ia2.manage）
      'code'    → CodeScene（ia2.code）
      'ops'     → OpsScene（ia2.ops）
  'orchestrate' | 'runs' | 'runs/:runId' | 'inbox' | 'tasks' | 'comms'   ← 既有兄弟路由零改动

/hermes/loop (hermes.loop) → LoopCockpitView（同一壳组件）
  ''        → OverviewScene
  'manage'  → ManageScene（hermes.loopManage）
  'code'    → CodeScene（hermes.loopCode）
  'ops'     → OpsScene（hermes.loopOps）
/hermes/loop/runs | /hermes/loop/runs/:runId | /hermes/loop/:id          ← 既有兄弟路由零改动
```

- 场景路由由 `ia2/routes.ts` 导出的 `buildSceneChildren(namePrefix)` 单一构造器产出，两个挂载点消费同一构造器（防双份漂移）；守门测试断言两挂载点场景集一致。
- vue-router 4 静态段排名高于 `:id`，`/hermes/loop/manage` 等不会被 `hermes.loopDetail` 吞掉；`hermes.loop*` 家族命名使 AppSidebar「循环工程图」isLoopArea 高亮在场景间保持（patch 246 冻结不动）。
- 场景切换条 = 壳内 `<router-link>` 集合，当前场景按路由名高亮；两挂载点各自前缀内跳转（`/app` 侧切 `/app/code`，`/hermes/loop` 侧切 `/hermes/loop/code`），不跨挂载点跳。
- guard.ts 兼容守卫只承接 loop 旧深链，不受影响，零改动。

### D3 总览场景 = 现主体原样提取

现 `LoopCockpitView` 的 KPI 条 + 注意力条 + 三栏 + MindViz3D/MindViz + KanbanTaskDrawer + CockpitScheduleModal 全部迁入 `ia2/views/scenes/OverviewScene.vue`，**行为零变化**。现 cockpit-view.test.ts 断言随迁。壳只保留 workspace 流生命周期与页头。

### D4 管理场景（ManageScene）——研发管理治理

布局：顶部人员聚合条 + 左看板主区 + 右沟通栏。

- **任务管理**（左，主区）：内嵌 `SwarmKanbanView`（/app/tasks 同款先例），指派/状态流转/批量操作全量继承；「全屏看板」按钮跳 `/app/tasks`。
- **人员管理指派**（顶部条）：纯函数适配器按 assignee 聚合 workspace.tasks（在办/待审/阻塞计数），点击按人筛选看板；指派动作走既有 KanbanTaskForm 的 assignee 字段（agents + members 选项既有）。
- **拉群干活**（右沟通栏 + 任务抽屉）：
  - 弱锚点约定：群名前缀 `[<taskId 前 8 位>]`。`KanbanTaskDrawer` 新增「建群」按钮 → 复用 `MatrixCreateRoomDialog` 预填群名 `[xxxxxxxx] <任务标题>`；
  - 「跳群」：matrix store 按前缀匹配已有群，命中即右栏内嵌该群聊天（matrix-chat 面板组件），未命中给建群入口；
  - 不持久化任务↔群关系到任务模型（裁决 #4），匹配失败即视为无群。
- **资料查阅/反馈拉扯**：KanbanTaskDrawer 既有 attachments + 描述评论区；右栏默认渲染最近群列表。
- **治理**：顶部条放追溯矩阵入口（跳 `/app/tasks?tab=trace` 既有深链）。

### D5 Code 场景（CodeScene）——IDE 习惯

布局：顶部任务上下文条 + 左文件树 + 中终端主区 + 右上下文面板。

- **任务上下文条**（顶部）：当前任务选择器（workspace.tasks 下拉）+ 任务标题 + 打开抽屉按钮。场景本地 ref 持有当前 taskId，不写 cockpit store。
- **文件树**（左）：复用 `CockpitFilePanel`（参数化：可选 props 注入 taskId/workspacePath，缺省回落 cockpit store 既有行为）。
- **终端**（中，主区）：复用 `CockpitTerminalPane`（参数化：可选 props 注入任务 workspace；自动 cd + 启动 Claude Code > Codex > dsh 的既有链路原样）。实测其 cockpit store 耦合仅 `selectedTask.workspace` 一个读点 + `exitTerminal` 一个动作，参数化面小。
- **上下文面板**（右）：任务状态摘要 + RunLinks（跳运行详情）+ RunTimeline 精简 + 「完整 Chat」入口（跳 matrix-chat 既有路由）。
- 终端会话生命周期：MVP 切走场景即断开重建（与 AI 协作中心切 mode 现状一致，不隐藏该代价）。

### D6 运维场景（OpsScene）——值班/告警/工单

布局：左告警+工单 / 中值班台 / 右快捷动作。

- **左**：`AlarmList`（熔断/停滞告警）+ `TriageQueue`（工单分诊），复用 `adapters/inbox-center` 五源聚合纯函数与 kv 分诊状态（与 /app/inbox 同源同键，单一事实源；组件级复用，不嵌 InboxView 整页）。告警点击深链 `/app/runs?loop=` 既有行为。
- **中值班台**：今日计划（buildTodayPlan）+ 定时任务列表（loopStore.loops 计划项）+ 运行中/待介入 runs 精简表（RunListTable 过滤 running + awaiting）。
- **右快捷动作**：新建循环（LoopCreateWizard 入口）、日程管理（workspace.openSchedule → CockpitScheduleModal）、agent 健康跳转 AI 协作中心（外链 `/hermes/cockpit`，fleet 数据在 loop 页无既有通道，明确范围外）。

### D7 数据面与边界

- **不 bootstrap cockpit store**（裁决 #2 的技术落点）：四场景数据面 = ia2 workspace store（壳武装）+ kanban store（upstream 独立，自武装）+ runs/loop store + matrix stores。cockpit store 仅经 D5 两组件的缺省回落路径间接触达，loop 页始终走 props 注入。
- CockpitCollabMap / CockpitFleetGrid / CockpitTimeline 等深度耦合 cockpit store 的组件**不复用**（人员面板用 D4 轻量聚合替代）。
- 入口冻结：AppSidebar patch 246-248、顶栏 "Swarm Studio" 入口、/hermes/cockpit 本体与登录落点（patch 274/275）零改动。

### D8 i18n 与 patch

- 新键（场景名 `loopCockpit.scene.*`、各场景工具条与面板文案）zh/en 成对，B 类 patch 注入上游 locale，编号开工时查重顺延（当前尾号 275）。i18n-coverage 18/18 门禁照跑。
- 其余改动全部 A 类 custom/（ia2 场景组件、shell 装配、kanban drawer 按钮均在 custom 模块内）。

## 范围外（本期不做）

群强绑定持久化、人员 CRUD、代码编辑器组件（终端 TUI 即编码面）、fleet 面板嵌入 loop 页、AI 协作中心页面任何改造（除两个组件可选 props 的向后兼容扩展）、keep-alive 终端会话保持。

## 验证

1. `scene-routes.test.ts`：双挂载点场景集一致（消费同一构造器）、`ia2.overview` 名称保留、静态段排名（`/hermes/loop/manage` 不落入 `:id`）。
2. `cockpit-view` 测试随迁为 `overview-scene.test.ts`（行为零变化）；壳新增 `scene-switcher` 断言（切换条渲染/高亮/前缀内跳转）。
3. `manage-scene.test.ts`：装配、人员聚合纯函数（在办/待审/阻塞计数）、建群锚点命名、跳群前缀匹配、未命中空态。
4. `code-scene.test.ts`：装配、props 注入（file/terminal 收到 workspace）、无任务空态。
5. `ops-scene.test.ts`：装配、告警/分诊投影复用 inbox-center、值班台聚合。
6. cockpit 组件参数化回归：props 模式生效 + 缺省回落原行为，AI 协作中心终端/文件既有测试不改不破。
7. 收口门禁：overlay `npm test` 全绿 + `npm run clean && npm run inject` 重放 + `npm run build:full`（vue-tsc）+ 上游 i18n-coverage。
