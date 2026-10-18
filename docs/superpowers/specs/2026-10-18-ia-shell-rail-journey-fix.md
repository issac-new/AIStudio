# 驾驶舱双左栏与旅程页运行上下文修复（2026-10-18）

分支：`fix/ia-shell-rail-journey`
来源：左侧栏落地后的 8649 热更新走查。DOM 实查发现 `/app` 旅程/阶段页 `body` 没有 `ia-center-full`，上游 `StudioNavigationRail`（单聊/群聊/工作流/历史/模型/用量）仍为 `display:flex`，与新的 `IaSideNav` 形成双左栏；旅程页仍要求手打运行目录名，且在 run21 已记忆的情况下显示「还没有进行中的运行」。

## 变更

1. 新增 `useBodyClass.retainBodyClass(name)` 引用计数：`IaShell` 与 `IaLegacyShell` 挂载时 retain、卸载时 release；`WorkbenchView`/`SimCenterView` 改用它，避免页面互相摘除。
2. `JourneyView` 改用 `useStageProgress` 共享读面（与左侧栏/阶段页同源），运行选择交给 `RunSelector`；删除手打运行目录名输入与「查看进度」按钮。
3. `useStageProgress` 失败时保留错误原文（不再统一显示「运行状态读取失败」），成功路径与缓存语义不变。

## 决策记录

- D-1：`ia-center-full` 的 add/remove 改为引用计数，不把类管理继续散落在各页面。理由=Workbench 与 SimCenter 卸载会误摘 IaShell 需要的类；单点收口后新增页面零心智负担。
- D-2：`IaShell` 与 `IaLegacyShell` 都 retain。理由=两壳都自带左栏/设置侧栏，上游 rail 在任何一壳出现都是双左栏。
- D-3：旅程页不再自己发 run-state 请求，统一走 `useStageProgress`。理由=同一运行在左侧栏、旅程、阶段页必须同源；手打目录名与「记忆运行」冲突会产生「已在进行却显示未开始」。
- D-4：本轮不 inject、不重启 8647 后端；只重启 8649 vite 开发实例做走查（已用 lsof 核 cwd=主工作树）。

## 验证

- 前端全量：`4857 passed / 8 skipped / 0 failed`（4865 项，`--maxWorkers=4`）。
- 8649 DOM 实查：`body.className` 含 `ia-center-full`，`.studio-navigation-rail` 不再显示，`[data-testid="ia-side-nav"]` 在位。
- 旅程页：运行选择器显示记忆运行；无运行时仍显示引导态。

## 补充（8649 走查）

- 左侧栏「全流程推演」行的运行名过长时挤掉了标签（截图实测显示「全流程…」）。修复：右侧槽 `max-width: 94px` + 省略号，完整运行名放 `title` 悬停显示；标签保持完整。
- 补充：整轮行只显示运行短名（run21），完整目录名保留在顶栏运行 chip 与 `title`；「全流程推演」标签不再被挤断。
- 补充：运行总览页删除手打运行目录名输入，改 `useRunContext` + 页头 RunSelector 单一入口；无运行时引导去页头选择。
- D-5（2026-10-18 用户二次走访）：上游 `StudioNavigationRail` 在 IDE 壳仍以 64px 显示。改为 `ia2.scss` 全局 `.studio-navigation-rail { display: none !important; }`——rail 全站退役，不再依赖 `ia-center-full` 按壳/按页隐藏；body 类 retain 保留但 rail 已不参与布局。
- D-6（2026-10-18 用户三次走访）：专题页（流程架构/本体/评测/技能治理）是独立注册的 fullscreen 路由，不经过 IaShell，`ia2.scss` 里的 rail 规则对它们不生效。规则移到 `ia2/styles/shell-overrides.scss`，由 `ia2/index.ts` 在 bootstrap 顶层静态导入——冷启动直达 /app/ide、/app/bpa、/app/ontology、/app/eval、/app/skillgov 均生效。
