# 统一导航重构设计：双壳驾驶舱

日期：2026-09-18
状态：已获批（用户在会话中对架构方向、交付范围、兼容策略、场景组织四项拍板）
受众：实施者（本仓库 overlay 开发）；评审者

## 一、主旨

把「AI协作中心、IDE工作台、工作台、循环工程图」四个语义重叠的一级入口收敛为**双壳**：驾驶舱（六场景）+ IDE 工作台，两壳之间固定位置一键互跳；旧路由直删、引用全清扫。目标是统一驾驶舱、易用性、便捷清晰。

## 二、问题现状（全部有代码锚点）

运行时代码 = upstream/hermes-studio 工作树 + overlay/custom/client（vite `@/custom` 别名注入）。路由分静态（`upstream/hermes-studio/packages/client/src/router/index.ts`）与动态（各 custom 模块 registerRoute，`overlay/registries/client/bootstrap.ts:59-61` 挂载前收集）。

1. **两个一级入口渲染同一组件**：`/app` 默认区与 `/hermes/loop` 双挂载同一个 LoopCockpitView + 同四场景（`overlay/custom/client/loop/index.ts:20-45`、`overlay/custom/client/ia2/routes.ts:163-178`）。侧边栏「工作台」和「循环工程图」落到同一份 UI。
2. **三主页面全 fullscreen，侧边栏消失**，返回靠页内零散链接：IDE 有 NavRail / 功能导航下拉 / 命令面板三套（`IdeNavRail.vue:57-98`、`IdeTopBar.vue:39-51`、`IdeCommandPalette.vue:43-54`）；cockpit 顶栏只有 "Swarm Studio" 字样可点（`CockpitTopBar.vue:148-158`）；cockpit → /ide 无任何链接。
3. **约 20 个 hermes.* 路由无菜单入口**（jobs/kanban/journey/memory/plugins/mcp/files/terminal 等，`router/index.ts:105-331`），只能深链或从 IDE 下拉到。
4. **重复挂载**：SwarmKanbanView 出现 4 处（cockpit 子路由、cockpit 全屏弹窗、/app/tasks、ManageScene 内嵌）；RunCenterView、matrix-chat 各双挂载。
5. **孤儿与命名漂移**：GraphSpineView/GraphDetailView 无引用无路由；`sidebar.loop`「循环工程」旧 key 仍被 cockpit 顶栏 LoopModal 按钮使用（`CockpitTopBar.vue:164-166`），与「循环工程图」路由语义不同却名字相邻。
6. **高亮 bug**：AppSidebar 对 hermes.cockpit 用精确匹配（`AppSidebar.vue:159`），进入任何子路由后高亮丢失；ia2/ide/loop 均用 startsWith 家族匹配。

## 三、决策记录（用户拍板）

| # | 问题 | 裁定 |
|---|---|---|
| 1 | 四页面如何收敛 | **双壳**：驾驶舱 + IDE 工作台两个一级入口 |
| 2 | 交付范围 | **设计 + 实施**一轮到位 |
| 3 | 旧路由处置 | **直接删除**，引用全清扫，不保留 redirect |
| 4 | 驾驶舱一级导航 | **六场景**：总览 / 协作 / 工程 / 运行 / 工作项 / 沟通 |

## 四、架构设计

### 4.1 壳 A：驾驶舱（保留 `/app` 路由家族）

IaShell 改造为统一壳 = 全局页头 + 场景条 + router-view。

**唯一全局页头**（取代 CockpitTopBar、LoopCockpitView 页头、IaShell slim 页头三套）：
品牌 + Gateway 健康探测（只显示 channel，遵循 2026-09-14 用户裁定）+ 团队切换 + 全局搜索 + 通知 + 主题/语言 + 用户菜单 + **⇄ IDE 跳转按钮**（固定最右侧）。

**场景条**（一级导航）：`总览 / 协作 / 工程 / 运行 / 工作项 / 沟通`。active 态统一路由家族 startsWith 匹配（根治 §二.6 同型 bug）。

### 4.2 壳 B：IDE 工作台（`/ide` 不动）

- IdeNavRail 的 3 个跨页跳转收敛为 1 个「⇄ 驾驶舱」按钮，位置/图标与驾驶舱页头「⇄ IDE」镜像对称。
- IdeTopBar 功能导航下拉与 IdeCommandPalette 清理死链目标（指向被删路由的 kanban/history/loopGraph 等一律移除）。

### 4.3 六场景归属

| 场景 | 路由 | 内容 | 来源 |
|---|---|---|---|
| 总览 | `/app` | MindViz 思维大脑 + 驾驶舱读数 | 现有 OverviewScene |
| 协作 | `/app/collab` | 现 AI协作中心三栏（看板/协作图/时间线/工作区模式切换 CockpitModeBar）+ 弹窗群（History/Schedule/Notify/TemplateManager/RunTrace/Kanban 详情） | CockpitView 拆解迁入 |
| 工程 | `/app/eng` | 编排（OrchestrateView/SpecEditor）+ Teams 管理，页内 tab | orchestrate + ManageScene 合并 |
| 运行 | `/app/ops` | RunCenter + 介入收件箱 + 告警值守，页内 tab | runs + inbox + OpsScene 合并 |
| 工作项 | `/app/tasks` | SwarmKanban + 追溯矩阵 | 现有 TasksView |
| 沟通 | `/app/comms` | matrix-chat | 现有 CommsView |

- CodeScene 删除，编码能力归 IDE 壳。
- LoopCockpitView 组件删除，页头功能上移到壳页头。
- **单一挂载原则**：SwarmKanbanView、RunCenterView、matrix-chat 各自只剩一个路由入口（组件复用不限，路由入口唯一）。

### 4.4 删除清单（旧路由直删 + 引用清扫）

- 路由：`/hermes/loop` 全家族、`/hermes/cockpit` 全家族（chat/session/history/global-agent/swarm-kanban/matrix-chat 子路由）、`/hermes/graph` redirect、旧路径别名（`router/index.ts:92-97`）。
- 组件：CockpitTopBar、LoopModal、孤儿 GraphSpineView/GraphDetailView。
- 引用点：`overlay/custom/client/ia2/guard.ts:33-44` 重定向、cockpit/adapters/inbox-adapter.ts:90 与 notify-adapter.ts:118 的 routeTarget、IdeTopBar/IdeCommandPalette/IdeNavRail 目标集、相关测试断言。
- AppSidebar 重排：一级只留**驾驶舱 / IDE 工作台**；日志/用量/性能/技能用量/浏览器/版本预览/主题/宠物/配置/设置收进「系统」折叠分组；删除「工作台」「AI协作中心」「循环工程图」三入口与底部「返回」hack（`AppSidebar.vue:556-575`）。
- i18n：新增场景 key，删除死 key，zh/en 同步，过 i18n-coverage 门禁。

### 4.5 兜底与错误处理

- 路由 catch-all → 驾驶舱总览，防旧深链白屏。
- 登录后默认落点由 `/ide` 改为 `/app` 总览（`router/index.ts:360-365,377-380`、`LoginView.vue:28-32` 同步）。
- features 开关：ide 关闭时 `/ide` 兜底改为 → `/app`（`bootstrap.ts:44`）；loopEngineering 开关并入 cockpit 开关。

## 五、测试与验收

- 改写 patch 246-248 的旧「循环工程图」菜单守门测试 → 新场景条 + 双入口守门测试。
- 每条被删路由一个 catch-all 断言；⇄ 双壳互跳测试；场景条六入口导航测试。
- 全量套件（基线 154 文件 / 1624 测试）+ i18n-coverage 门禁 + 构建验证。
- 手工验收：六场景逐一点击、双壳互跳、旧深链兜底。

## 六、实施约束（ncwk 仓库规则）

- 只改 overlay/；upstream 行为变更一律走 `overlay/patches/` + `npm run inject`。
- overlay 仓库基于 main 建 `feat/unified-navigation` 分支，测试全绿后合回 main。
- i18n 改动 zh/en 双侧同步；注入后跑注入树漂移检查。

## 七、追加裁决：窗口管理（/goal 同日追加，随本轮一并落地）

用户追加要求：每个独立操作页都可最大化/最小化、独立窗口或合并窗口。

**概念模型**：驾驶舱内每个「独立操作页」= 一个面板（六场景页含其子路由/tab 态），四态可逆：

| 态 | 载体 | 机制 |
|---|---|---|
| 合并（默认） | 驾驶舱壳内 | — |
| 最大化 | 壳内满幅（隐藏页头/场景条） | URL query `max=1`（可书签；Esc/浮动胶囊还原） |
| 最小化 | 底部任务栏 dock | wm store 入列（同路径去重），主区回总览，chip 点击恢复导航 |
| 独立窗口 | Electron BrowserWindow / 浏览器新窗 | query `standalone=1` → IaPopoutBar 精简壳；桌面走 IPC `hermes-desktop:open-panel-window`（patch 302-304，复用 chat 弹窗模式：preload + `--hermes-window-kind=panel` + 路由白名单 + 去重聚焦），web 降级 window.open |

**合并回驾驶舱**：独立窗口精简页头「⇤ 合并回驾驶舱」→ localStorage storage 事件（同源跨窗口天然广播）携带路径（剥离 standalone、保留 tab query）→ 主窗监听导航；独立窗口自关。

**实现落点**：`custom/client/ia2/wm/{popout,store}.ts`、`components/{IaWindowControls,IaMinimizedDock,IaPopoutBar}.vue`、IaShell 三态分支；桌面 patch 302（主进程 openPanelWindow + 可信发送者集纳入 panel 窗）/303（preload）/304（bridge 接口 + windowKind 'panel'）；i18n `ia2.wm` 九键（patch 305/306，顺带修复 `ia2.shell.gotoIde` 缺失键）。

**守门**：`wm.test.ts`（11 例：query 合并/剥离、web 降级、storage 回流容错、store 去重）、`ia-shell.test.ts` 窗口三态 5 例、`panel-window-ipc.test.ts` 5 例（注入态桌面断言）、`unified-nav-guard.test.ts` 窗控挂载断言。
