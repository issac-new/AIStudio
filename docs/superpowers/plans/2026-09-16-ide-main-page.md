# IDE 工作台主页面实施计划

**实施者必读**：只改 `overlay/`；B 类 patch 追加到 `patches/series` 尾部（编号 = 当前最大号顺延，本轮 276-280）；测试只跑 `custom/`（`npm test`）；守门测试跑在 inject 之后直读注入态上游文件。

**spec**：`docs/superpowers/specs/2026-09-16-ide-main-page-design.md`

## 验收门禁

1. `npm run clean && npm run inject` 全绿
2. `npm test`：custom 全量通过，含新增 `custom/client/ide/__tests__/` 四类守门
3. `npm run build` 通过
4. 上游 `tests/client/i18n-coverage.test.ts` 两条断言通过（ide.* 键 en/zh 齐）
5. dev 冒烟：登录落 `/ide`；codex 会话一轮；文件树/编辑器/终端/各功能链接可用
6. `npm run clean && npm run verify` 后合入 main

## 范围控制

- 不动 upstream 文件（全部经 patch）；不改 cockpit//app/loop 既有行为与路由
- ChatPanel 整面板不嵌入（自带会话侧栏）；嵌入其子组件 MessageList/ChatInput
- 语音/浏览器面板等 IDE 场景外功能显式不接（不装样子）

## 任务表

| # | 任务 | 产出 |
|---|------|------|
| T1 | A 类骨架 | `custom/client/ide/{index,routes,store/ide}.ts`、`views/IdeShell.vue`、features.ts + bootstrap.ts 接线、`__tests__/routes.test.ts` |
| T2 | Explorer + 编辑区 | `IdeExplorerPane.vue`（FileTree root=workspace）、`IdeEditorPane.vue`（monaco 页签 + diff 页签） |
| T3 | 终端 | `IdeTerminalPanel.vue`（xterm→WS，非 superadmin 禁用态；codex TUI 快捷启动） |
| T4 | 会话列 | `IdeChatPane.vue`（codex 默认 runtime + MessageList/ChatInput + SubagentStreamPanel/RunTrace 页签）、provide 契约 |
| T5 | 导航 | `IdeTopBar.vue`（workspace/agent 状态/功能链接）、`IdeNavRail.vue`、`IdeStatusBar.vue` |
| T6 | B 类 patch | 276 router 落点、277 LoginView 落点、278 AppSidebar 入口、279/280 i18n zh/en；series 尾部追加 + 注释块 |
| T7 | 守门测试 | `appsidebar-ide-entry.test.ts`、`landing-ide.test.ts`、store 纯逻辑测试 |
| T8 | 验证链 + 合入 | 门禁 1-6 全过 → merge main（feat 分支保留） |

## 不做（记台账）

- IDE 内嵌语音输入、桌面浏览器面板（超场景）
- monaco side-by-side DiffEditor（沿用 WorkspaceFileDiff patch 视图）
- 非 superadmin 的终端能力（上游 WS 权限所限，显示禁用态）
