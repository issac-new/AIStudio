# IDE 工作台主页面设计（/ide）

> **[2026-09-23 部分取代]** D4「agent 底座：codex 默认」已被 `specs/2026-09-23-zcode-foundation-design.md` 取代——引擎层改为以 upstream/zcode 源码为底座（用户裁定）。本文其余决策（D1 路由/D2 侧边栏/D3 页面结构/D5 验收）继续有效，UI 复用结论不变。

**主旨**：新建一个 IDE 形态的操作主页面，以 upstream 既有 codex 集成为 agent 底座，全量复用 zcode 对应的会话 UI 能力，并链接全部既有功能页。写给本项目维护者，读后应能理解每个结构决策及其锚点。

**受众与动作**：维护者评审本页结构与 patch 边界；实施按配套 plan `plans/2026-09-16-ide-main-page.md` 执行。

## 背景事实（锚点）

- upstream v0.7.22 已深度集成 codex：`packages/server/src/modules/coding-agents/services/runtime/run-manager.ts` spawn `codex exec --json`（headless），事件规范化后与 hermes 会话共用同一消息流渲染；REST 面 `/api/coding-agents/*`（安装/启动/会话输入/配置/MCP）现成。**无需引入外部 codex 源码。**
- zcode UI 功能在 upstream 客户端几乎全部有对应物：`chat/MessageList.vue`（内嵌审批/澄清浮层、ToolRunCard、TaskPlanCard、diff 高亮）、`chat/ChatInput.vue`、`chat/SubagentStreamPanel.vue`、`files/FileTree.vue`、`files/FileEditor.vue`（monaco）、`files/WorkspaceFileDiff.vue`；overlay 侧有 RunTrace 全家（`custom/client/cockpit/composables/useRunTrace.ts` + `CockpitRunTraceModal.vue`）与终端面板范式（`CockpitTerminalPane.vue`，xterm → `WS /api/hermes/terminal`）。
- 全屏页面机制现成：路由 `meta.fullscreen: true` 时上游 `App.vue` 隐藏 AppSidebar（ia2 `/app` 即此模式，A 类动态注册零上游锚点）。

## 决策

### D1 路由与落点：A 类动态注册 `/ide`，登录落点三处改为 `/ide`

- 路由走 A 类 `registerRoute`（ia2 模式，`custom/client/ide/routes.ts` 纯路由描述），不动上游 `router/index.ts` 的路由表。
- 登录落点：镜像 patch 274/275 所定三处（守卫两处 + LoginView 一处）`/hermes/cockpit → /ide`，以**新 patch 276/277** 叠加实现（惯例：新建独立 patch 而非改老 patch）。2026-09-16 用户裁决：IDE 成为操作主页面。
- cockpit 与 `/app` 工作台平行共存，保留侧边栏一级入口。

### D2 侧边栏入口：patch 278 注入 AppSidebar 顶部

AppSidebar 为上游文件，入口必须走 B 类 patch：`overlay[ide]` 标记注释 + RouteLinkItem（`ide.shell`）+ `isIdeArea` 高亮 computed + 内联 SVG，插在「工作台（ia2）」之前（主页面心智）。i18n 走 zh/en 成对 patch 279/280，其余 9 语言经 `mergeMessagesWithFallback(en)` 回退。

### D3 页面结构：三列 + 顶栏 + 状态栏，全量复用既有组件

```
IdeTopBar（品牌 | workspace | agent 状态 | 功能链接 | 主题/语言）
├ IdeNavRail（活动栏：文件 / 功能链接）
├ IdeExplorerPane（FileTree，root=workspace）
├ IdeEditorPane（monaco FileEditor 页签 + WorkspaceFileDiff 页签）
│  └ IdeTerminalPanel（xterm PTY，可折叠；一键拉起 codex TUI）
├ IdeChatPane（MessageList + ChatInput；页签切 SubagentStreamPanel / RunTrace）
└ IdeStatusBar（终端/agent/用量摘要）
```

- 组件目录 `custom/client/ide/`，注册链 `features.ts` 开关 + `registries/client/bootstrap.ts`。
- IdeShell 复刻 ChatPanel 的上下文契约（`provide('hermesWorkspaceFilePreview', true)`、toolPanelStore 接线），保证 MessageList 子功能不降级。

### D4 agent 底座：codex 默认，可切换

会话 runtime 默认 `codex`（用户指定底座），经 upstream `fetchCodingAgentsStatus` 探测可用集合，可切 claude-code/dsh 等。终端面板快捷启动复用 `custom/client/cockpit/terminal/terminal-tools.ts` 的启动命令映射。

### D5 验收

守门测试四类：AppSidebar 入口标记/顺序、登录落点三处、`router.resolve('/ide')` fullscreen、store 纯逻辑。验证链 `clean→inject→npm test→npm run build→上游 i18n-coverage→dev 冒烟→verify`。
