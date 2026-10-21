# ZCode v3.15.1 功能面清点（源码实证）

> **历史快照**：源码基线已于 2026-10-21 前移至 `origin/main` v3.16.1（`0a1fc56`），安装版 3.16.2；
> 本文锚点只保证在 v3.15.1 tag 下成立。当前正本见
> `docs/superpowers/specs/2026-10-21-zcode-3161-baseline-upgrade.md`。
>
> 仓库：`/Users/cuishi/lab/ncwk/upstream/zcode`
> 基线：tag `v3.15.1`（`aac47556`）。本文所有 `path:line` 锚点均指 **v3.15.1 该 tag 下的文件内容**（用 `git show v3.15.1:<path>` 读取；工作区 HEAD 实际停在 v3.14.3，直接读本地文件会读到旧版）。
> 方法：`git show` / `git grep` / `git diff --name-status` / `defaults read`。未运行构建、未启动应用；所有结论均来自源码与命令输出。

---

## 0. 结论摘要

1. ZCode 是"桌面（Electron）+ Web（浏览器远控/分享落地页）+ 终端 TUI/Agent CLI + Android 远控壳"四端一体的 AI 编程工作台，核心是"会话/任务"而不是"文件/编辑器"：仓库里没有内置代码编辑器，代码查看器只读，编辑动作交给外部 IDE（`packages/ui/src/lib/openWithEditors.ts:3`）。
2. 产品确有"编程/办公"两种界面模式（`office` / `coding`），但**没有独立的"工作模式"运行时**：办公模式只是同一会话 UI 的呈现降噪（隐藏终端/审查入口、工具卡折叠、强制换行、主动推荐），底层 Agent、协议、权限完全一致。
3. v3.15.1 与 v3.14.3 之间只有 **1 个 squash 提交**，因此不存在"逐特性 commit subject"；能力变化必须靠目录/文件/i18n/协议差异判定（见 §5）。
4. v3.15.1 最实质的新增集中在四块：**生成式 UI（Gen UI）与插件 UI（MCP Apps 沙箱）**、**Highspeed 加速卡**、**手机远控（Web 移动壳 + Android 壳）**、**动态工作流的"留白补全/保存复用"**；插件生态一次性增加了 14 个官方插件包。
5. 协议层非常成熟：旧协议 25 种会话事件、V4 37 条命令、48 个 RPC 服务频道、9 种会话行类型、SQLite 会话持久化（`node:sqlite`）。重实现的主要成本在协议投影与工具卡，而不是"画聊天窗口"。
6. "仓库 Wiki / 代码库语义索引"在本版源码中**找不到实现**：只有工作区文件清单（用于 @ 提及/命令面板）、会话索引、嵌入式 grep/find。能力地图文档提到 Repo Wiki/Repo Snapshot，但源码仅有日志导出分类字符串（见 §3.5、§7）。

---

## 1. 版本、仓库结构、构建与运行入口

### 1.1 版本证据

| 项 | 值 | 锚点 |
|---|---|---|
| 本仓 HEAD | `29628c9a`，tag `v3.14.3`，2026-09-23 17:36:31 +0800，`feat: update v3.14.3` | `git log -1 HEAD` |
| 调研基线 | `aac47556`（tag `v3.15.1`，`origin/main`），2026-10-10 18:57:01 +0800，`feat: update to v3.15.1` | `git log -1 v3.15.1` |
| 根包版本 | `"version": "3.15.1"` | `package.json:3` |
| 已安装桌面 App | `3.15.3` | `/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" /Applications/ZCode.app/Contents/Info.plist` |
| CLI 子仓版本 | `zcode-cli` `0.16.9`（与桌面版本号独立） | `apps/zcode-cli/package.json:3` |
| 运行时要求 | Node `>=24.0.0`，pnpm `10.33.2` | `package.json:110-115` |

注意：安装包 3.15.3 比源码 tag 3.15.1 新两个补丁版本；本文只对 3.15.1 源码负责。

### 1.2 仓库结构

`pnpm-workspace.yaml:1-5` 定义 workspace：`apps/dev-docs`、`packages/*`、`apps/zcode-cli`、`apps/zcode-cli/packages/*`、`apps/zcode-cli/tools/*`。

**apps**

| 目录 | 作用 | 锚点 |
|---|---|---|
| `apps/zcode-cli` | Agent CLI / TUI / Web 发行包；内部再分 30 个包（core、bootstrap、adapters、cli、tui、dynamic-workflow、各官方插件…） | `apps/zcode-cli/package.json:1-5`；`apps/zcode-cli/packages/` 目录列表 |
| `apps/dev-docs` | 内部研发文档站，含人工维护的"产品能力地图"（系统/分组/节点/边 + 代码行数估算） | `apps/dev-docs/src/data/productCapabilityMap.ts:1-70` |

**packages（19 个）**

| 包 | 作用（按源码证据） |
|---|---|
| `ui` | React 19 + Tailwind + Radix 的完整产品 UI（1872 个源文件），被 desktop/web 复用 |
| `desktop` | Electron 主进程/预加载/渲染宿主、窗口、托盘、更新、远程连接、CUA、浏览器宿主 |
| `web` | 浏览器入口：OAuth 登录、`/remote` 手机远控、`/share` 分享落地页 | 
| `web-share` + `share-ui` | 独立分享静态站（Vite `base=/cn/share/`）与只读时间线复用层 |
| `server` | Hono HTTP/WS 服务：`/api/server-info`、`/ws/host`、`/api/connect-remote`、`/api/bots/:provider` | `packages/server/src/http.ts:332-435` |
| `zcode-server-cli` | `zcode` 统一启动器/守护进程：`serve/status/stop/restart/update/uninstall` | `packages/zcode-server-cli/src/cli.ts:89-103` |
| `services` | Host 侧服务实现：会话/任务索引、Git、终端、文件、插件、技能、MCP、自动化、Bots、分享、用量…（413 源文件） |
| `shared` | 三端共享 schema/类型：协议、渠道、快捷键、插件、离线任务、Highspeed…（281 源文件） |
| `rpc` | 进程间 Channel/Proxy 协议（无业务） |
| `client` | Renderer 侧连接客户端（协议/WS/relay） |
| `provider` / `provider-node` | 模型 Provider 抽象与 Node 实现 |
| `zcode-cua` | Computer Use 辅助层 |
| `model-option-map` / `formal-proof` | 模型选项映射；形式化校验/可视化实验包（`formal-proof` 是 Vite 应用） |
| `e2e-report` | E2E 报告/失败制品（内部） |
| `stream-animate` | 内部流式帧图表工具（Vite + server，非用户功能） |
| `android` | Kotlin/Compose 的 ZCode 手机远控壳（新） | `packages/android/app/src/main/java/com/example/zcode_mobile/MainActivity.kt` |

### 1.3 构建与运行入口

| 入口 | 命令/文件 | 锚点 |
|---|---|---|
| 桌面开发 | `pnpm dev:desktop`（= `dev:desktop:prod`，准备运行时资源后启 Electron + watch） | `package.json:9`；`packages/desktop/package.json:10` |
| 桌面主进程入口 | `out/main/index.js` | `packages/desktop/package.json:7` |
| Web 开发 | `pnpm dev:web`：Vite 5173 + 后端 3030；`/ws`、`/api` 代理到本地后端 | `README.md:75-81` |
| 统一 CLI | `zcode`（无参进 TUI；`--web` 起 Web；其余交给 Agent CLI） | `README.md:87-101` |
| 打包 | `pnpm build:zcode`、`pnpm bundle:desktop`、`pnpm build:sea` | `package.json:47-56` |
| 运行时数据目录 | `ZCODE_DATA_BASE_DIR` 下的 `.zcode/` | `README.md:150` 附近；`packages/desktop/src/main/desktopDataBaseDirBootstrap.ts` |
| 内置 Provider 配置 | `config/provider/zcode-builtin.json`，`revision: 31`，内置模型含 `GLM-5.3`、`GLM-5.3-Flash`、`GLM-5V-Turbo`、`GLM-5.1-Highspeed` 等 | `config/provider/zcode-builtin.json:2-45` |

---

## 2. "编程模式 / 办公模式"（即 work/general mode）

### 2.1 定义与入口

- 类型：`InterfaceMode = "office" | "coding"`；localStorage key `zcode-interface-mode`；旧值 `general`/`concise` 迁移到 `office`（否则升级后静默变 coding）。`packages/ui/src/lib/interfaceMode.ts:1-8`
- 判定 hook：`useIsOfficeMode()` 等价于 `interfaceMode === "office"`。`packages/ui/src/hooks/useInterfaceMode.ts:3-5`
- 持久化：随用户设置记录 `interfaceMode`（onboarding 记录 schema 为 `coding|office|null`）。`packages/shared/src/onboardingRecord.ts:16-21`
- 入口三处：设置页"外观"分区（界面模式下拉）、侧栏底部头像菜单、首次引导的职业/模式选择。`packages/ui/src/SettingsPage.tsx:1709`；`packages/ui/src/WorkspaceSidebarFooter.tsx:374-386`；`packages/ui/src/onboarding/OccupationOnboarding.tsx:61-70`
- 快捷键：`CmdOrCtrl+Shift+U` 切换。`packages/shared/src/shortcutCommands.ts:98`

### 2.2 两种模式的真实差异（全部为呈现层）

| 行为 | 编程模式 | 办公模式 | 锚点 |
|---|---|---|---|
| 终端/审查入口 | 可新建终端、审查（Git）标签 | 隐藏"新建"入口；已打开标签保留、PTY 不断 | `packages/ui/src/hooks/useAppPanels.ts:808,1544,1598-1604`；e2e `packages/desktop/test/e2e/ui-shell/general-coding-mode.test.ts:57-118` |
| 头部区域 | 显示 Git 分支切换器 | 改为"插件预览"入口 | `packages/ui/src/app-shell/WorkspaceShellLayout.tsx:1711-1719` |
| 工具卡 | 展开命令输出、diff 计数、可折叠 | 折叠为摘要：无 toggle/forceOpen/diffCount/命令输出 | `packages/ui/src/ToolCallBlocks/renderers/execute.tsx:348-379`；`edit.tsx:319-327`；`changes-group.tsx:301-309` |
| 终端内容 | 完整 | 精简（`conciseCompleted` 等文案） | `packages/ui/src/Terminal.tsx:48`；i18n `packages/ui/src/i18n/locales/zh-CN.ts:2245` |
| 正式回答 | 遵循用户代码换行设置 | 强制代码换行 | `packages/ui/src/components/ai-elements/message.tsx:355-357` |
| 空态推荐 | 小型场景入口 | 默认显示"主动任务推荐"（受设置开关控制） | `packages/ui/src/v4/SessionPane.tsx:5375-5381` |
| "打开方式" | 所有已装编辑器 | 只保留文件管理器（Finder/Explorer/QSpace） | `packages/ui/src/WorkspaceEditorButtonGroup.tsx:69`；`packages/ui/src/lib/openWithEditors.ts:3` |
| 任务内搜索 | 全部范围 | 仅"changes"范围 | `packages/ui/src/quickpick/TaskFindDialog.tsx:307` |

结论：仓库里**没有**独立的 "work mode" 业务对象；`office` 就是历史"通用模式（general）"的现名。测试仍沿用旧称"通用模式"（`general-coding-mode.test.ts:34,128`），i18n 已统一为"办公模式"（`zh-CN.ts:2237`）。搜索 `工作模式/work mode/general mode` 除上述遗留外无产品定义。

---

## 3. 编辑器/IDE 界面功能清单

UI 主入口：`packages/ui/src/App.tsx:96`（`App`），工作区壳层 `packages/ui/src/app-shell/WorkspaceShellLayout.tsx:292`。主视图类型为 `chat | automations | plugin-store`（`packages/ui/src/app-shell/types.ts:128`）。

### 3.1 任务/会话管理

| 能力 | 说明 | 锚点 |
|---|---|---|
| 任务侧栏 | 工作区分组、置顶、最近、归档、折叠、拖拽排序 | `packages/ui/src/WorkspaceSidebar.tsx:228`；`WorkspacePinnedTasksSection.tsx`、`WorkspaceGroupedTasksSection.tsx`、`WorkspaceArchivedTasksFlatSection.tsx` |
| 任务项状态 | 流式/恢复中/就绪/完成、未读、相对时间、运行工作流计数 | i18n `zh-CN.ts:2098-2101,2047` |
| 任务操作 | 重命名、置顶、归档/取消归档、标记未读、删除、复制路径/任务路径/日志路径/会话 ID、在 Finder 打开、反馈、查看调用轨迹、分屏打开 | `packages/ui/src/TaskActionMenuContent.tsx:110-238`；`packages/ui/src/useTaskListItemContextActions.ts:298-305` |
| 新建任务 | 入口带快捷键；`NewTaskButtonGroup` | `packages/ui/src/NewTaskButtonGroup.tsx:1-40`；i18n `zh-CN.ts:2048` |
| 任务搜索 | 独立 `TaskSearchDialog` + Command Center（`#` 前缀） | `packages/ui/src/TaskSearchDialog.tsx:1-30`；`packages/ui/src/command-center/CommandCenterDialog.tsx:202-217` |
| 分屏工作台 | 会话窗格可向右/下拆分、拖拽换位、布局持久化，会话关闭后仍运行 | `packages/ui/src/v4/WorkbenchPane.tsx:342`；`packages/ui/src/v4/paneLayoutTree.ts`；i18n `zh-CN.ts:2078-2087` |
| 会话标题 | 默认/模型生成/用户自定义三态，改名不被覆盖 | `packages/shared/src/zcode-protocol-v4/snapshot.ts:176-181` |
| 自动化/插件商店 | 作为工作区主视图，带顶部导航与返回 | `WorkspaceShellLayout.tsx:1276-1291,2163,2724` |

### 3.2 输入与 Composer

**模式（权限）**：枚举 `plan | build | edit | yolo | guarded | auto`（`packages/shared/src/zcode-protocol-legacy-types.ts:76`）。工具栏把 Plan 拆为独立勾选项，权限单选为 build/yolo/guarded（新菜单隐藏 edit，但历史草稿仍可回显）。`packages/ui/src/v4/composer/V4ComposerModeControls.tsx:41-120`。中文标签：默认模式/变更前确认/自动编辑/计划模式/自主模式/完全访问（`zh-CN.ts:6129-6140`）。

**Composer 组成**：

| 能力 | 说明 | 锚点 |
|---|---|---|
| 主编辑器 | Lexical 富文本、草稿持久化/跨工作区迁移、外部文本插入、恢复 | `packages/ui/src/v4/ConversationComposer.tsx:509,2546`；`LexicalChatInput.tsx` |
| 模型/思考档位/模式/上下文用量 | 工具条三件套 + 上下文额度条；只改下一次提交意图 | `packages/ui/src/v4/composer/V4ComposerToolbar.tsx:1-30,1189` |
| 思考档位 | off/minimal/low/medium/high/xhigh/max/ultra | `zh-CN.ts:4927-4935` |
| 附件 | 本地/远程附件、拖放、上传事务、图片/视频能力门控、文本预览 | `packages/ui/src/v4/composer/useComposerAttachments.ts`；`packages/ui/src/v4/composer/attachmentUpload.ts` |
| @ 提及 | 文件、插件、会话、技能、子代理、白板 | `packages/ui/src/mentions/providers/`（6 个 provider） |
| 电脑操作入口 | 输入框常驻 CUA 按钮，含权限/启动状态 tooltip | `packages/ui/src/v4/composer/V4ComposerCuaEntry.tsx`；`zh-CN.ts:4915-4920` |
| 草稿推荐 | 官方/场景化提示词、插件推荐、办公模式"主动推荐" | `packages/ui/src/v4/ConversationDraftSuggestedPrompts.tsx`；`officeSuggestedPrompts.ts` |
| 快捷键发送 | Enter 发送、Shift+Enter 换行；`Ctrl/Cmd+Enter` 立即发送（覆盖 busy 输入） | `packages/shared/src/zcode-protocol-v4/command.ts:96-99` |

**队列/引导（queue / steer）**：

- 提交时可请求 `startNow | queue | guide`；CLI 准入后可能回退并记录 `fallbackReasonCode`。`packages/shared/src/zcode-protocol-v4/command.ts:91-100`；`packages/shared/src/zcode-protocol-v4/input-intent.ts:38-49`
- 会话快照暴露 `inputRouting.mode = startNow|enqueue|guide|reject|choice`（`choice` 用于"队列暂停时先问用户清空还是保留"）。`packages/shared/src/zcode-protocol-v4/snapshot.ts:164-171`
- 队列面板支持删除、撤回编辑、立即发送、拖拽排序、"继续队列"（`setAutoDrain`）。`packages/ui/src/v4/ConversationQueuePanel.tsx:36-60,427`
- 当前轮进行中发送的输入以"待引导"气泡渲染（`turn.steerQueued` / `steerDrained`）。`packages/ui/src/v4/ConversationPendingGuideList.tsx:1-60`；`packages/shared/src/zcode-protocol/index.ts:1539-1577`
- 默认 followup 行为读应用设置 `zcodeInteractionBehavior`（guide → guide，其余 → queue）。`packages/ui/src/v4/composer/followupModeSettings.ts:5-10`

**桌面端本地斜杠命令**：`/plan`（空命令只切 Plan；带任务文本 compare-and-set 切换并提交）、`/compact|/compress`、`/goal|/target`（resume/pause/clear/replace）、`/side|/btw`（选中内容开辅助副屏）。`packages/ui/src/v4/slashCommands.ts:53-140`

### 3.3 对话渲染（工具卡、审批、计划、Diff、子代理）

**行模型**：`turnHeader | userInput | assistantText | reasoning | toolCall | artifact | subagent | hookInvocation | timelineMarker`（`packages/shared/src/zcode-protocol-v4/rows.ts:68-425,433`）。行自包含、结构变化整行替换、文本增量 append；行内 `actions` 只在可执行时为 true（fork/edit/retry/rewindFiles）。`rows.ts:17-42`

| 能力 | 说明 | 锚点 |
|---|---|---|
| 虚拟化时间线 | 行窗口 + 滚动锚点 + 行高缓存 | `packages/ui/src/v4/ConversationTimeline.tsx:2122`；`timelineRowHeightCache.ts`、`timelineScrollAnchor.ts` |
| 轮次导航 | 右侧条，可跳到第 N 条用户问题 | `packages/ui/src/v4/ConversationTurnNavigator.tsx:1-35`；`zh-CN.ts:2206-2210` |
| 会话内查找 | `Cmd/Ctrl+F` 高亮 + 索引 | `packages/ui/src/v4/ConversationTimelineFind`、`conversationFindIndex.ts` |
| 状态面板 | Git 分支/更改、目标、计划、进程（todo）、终端、智能体、工作流、后台运行数与停止 | `packages/ui/src/v4/ConversationStatusPanel.tsx:1-45`；`zh-CN.ts:4852-4877` |
| 待办面板 | 计划步骤 pending/in_progress/completed，运行中渐变文字 | `packages/ui/src/TodoPanel.tsx:1-45` |
| 消息变更摘要 | 每轮文件变更、可展开/撤销/打开 Diff | `packages/ui/src/MessageChangeSummaryPanel.tsx:1-50` |
| 工具卡 | 注册表按 identity/family 分派 40+ 专用卡：Read/Edit/Execute/Explore/Search/Skill/Todo/Agent/AskUserQuestion/CUA/MCP/Node REPL/Goal/计划引导/工作流（创建、修订、留白、运行、保存、列举、评测、恢复、提问） | `packages/ui/src/ToolCallBlocks/resolveRenderer.ts:58-200` |
| 工具组折叠 | 连续 execute 合并、changes 合并、CUA 合并 | `renderers/execute-group.tsx`、`changes-group.tsx`、`cua-group.tsx` |
| 权限审批 | 按工具类型渲染 edit/execute/mcp/search/skill/workflow/saveWorkflow/fallback 块；支持 once/session、规则范围、反馈文本、子代理来源徽标、工作流运行参数（并发/模型/留白） | `packages/ui/src/PermissionDialog.tsx:442`（文件头 50-120 行为块类型与常量） |
| 工作流确认 | 运行确认块可改并发上限、子代理模型；留白确认块 | `packages/ui/src/WorkflowPermissionBlock.tsx`；`WorkflowPermissionHoles.tsx`；`SaveWorkflowPermissionBlock.tsx` |
| 计划详情 | `ExitPlanMode` 后打开计划副屏，展示步骤与操作 | `packages/ui/src/app-shell/PlanDetailSidePane.tsx:79` |
| 子代理钻取 | 会话内最多 20 行摘要，可打开子代理会话/目录 | `packages/ui/src/v4/SubagentDrilldown.tsx:21-37`；`app-shell/SubagentDirectorySidePane.tsx` |
| 工作流卡片 | CreateWorkflow 因果图/阶段、运行态紧凑卡、完成卡、产物 chips、留白行 | `ToolCallBlocks/renderers/create-workflow.tsx`；`components/workflow-timeline/WorkflowTimeline.tsx:1` |
| 分享只读时间线 | 复用同一 presentation | `packages/ui/src/v4/ConversationShareReadonlyTimeline.tsx` |
| 消息操作 | fork/编辑重试/文件回退/助手反馈 | `rows.ts:30-42`；`v4/ConversationFileRewindDialog.tsx` |

### 3.4 文件 / 编辑器 / 终端 / Git / 浏览器

| 能力 | 说明 | 锚点 |
|---|---|---|
| 文件树 | 懒加载、目录深度、工作区过滤、在文件管理器显示 | `packages/ui/src/workspace-file-tree/WorkspaceFileTree.tsx:81-88` |
| 预览 | 代码、图片、Markdown、音视频、PDF、DOCX/DOC、XLSX、PPTX、patch | `PreviewPane.tsx` + `previewPane*Content.tsx`（9 个文件） |
| 只读代码查看器 | 带 sourceKey 的侧栏 tab；无内置编辑能力 | `packages/ui/src/lib/workspaceSidePane.ts:53-64`；`lib/codeViewer.ts` |
| 外部编辑器 | 检测已装 IDE 并"打开方式"；办公模式仅文件管理器 | `hooks/useWorkspaceOpenInEditorTarget.ts`；`lib/openWithEditors.ts:3` |
| 终端 | 多标签 PTY、工作区级会话、cwd、远程会话、后台 bash 输出独立 tab | `SidePaneTerminalPane.tsx:5`；`workspaceSidePane.ts:100-120,530` |
| Git 审查面板 | 分支列表/切换/新建、提交图、变更（unstaged/staged/branch/last-turn）、stage/unstage/discard、生成提交信息、commit、push、identity | `packages/services/src/git/git.ts:33-52`；`GitPane.tsx:43` |
| 内置浏览器 | 地址栏/前进后退/刷新/更多菜单、空态/错误态、站点权限、Chrome Cookie/登录态导入、缓存清理 | `EmbeddedBrowserPaneParts.tsx:44-260`；`settings/BrowserSettingsSection.tsx`；`zh-CN.ts:2607-2670` |
| 浏览器自动化视图 | `browser-use` 受控页（webview + CDP）、操作指示、常驻/挂起 | `workspaceSidePane.ts:121-151`；`useAppPanels.ts:1068` |
| 白板 | 画笔/颜色/粗细/撤销重做/插入对话/@ 提及 | `WhiteboardPane.tsx:30-60`；`mentions/providers/whiteboardMentionProvider.ts` |
| Treemapping | 文件活动树图（侧栏入口被隐藏/过滤） | `TreemappingPane.tsx:1`；`workspaceSidePane.ts:592-596` |
| 开发者工具 | 网络请求列表/筛选/分页 | `DeveloperToolsPane.tsx`；`resourceManager/NetworkSection.tsx`；`zh-CN.ts:2644-2658` |
| 模型调用轨迹 | 以 task/session 为单位的调用时间线与详情 | `ModelTrajectoryPane.tsx`；`workspaceSidePane.ts:86-96` |

### 3.5 上下文与记忆

| 能力 | 说明 | 锚点 |
|---|---|---|
| 记忆开关 + 项目记忆浏览器 | 按工作区浏览已保存记忆、搜索、更新时间 | `packages/ui/src/settings/MemorySettingsSection.tsx:46`；`MemorySettingsViewer.tsx`；`zh-CN.ts:2336-2367` |
| 记忆运行时 | 提取、召回选择、manifest、项目根、后台"dream"整理（24h 最小间隔/10min 扫描节流） | `apps/zcode-cli/packages/core/src/memory/{extraction,recall,dream}.ts:12-30` |
| 上下文压缩 | 自动压缩阈值 + microcompact（清理旧工具结果，默认保留最近 5 条、最小节省 256 token、阈值 0.9） | `core/src/compact/microcompact.ts:12-21,79-81`；`compact/policy.ts` |
| 手动压缩 | `/compact [instructions]`，可排队为维护意图 | `packages/shared/src/zcode-slash-command-help.ts:36-42`；`input-intent.ts:84-86` |
| AGENTS.md | `/init` 生成/更新工作区 AGENTS.md；子代理可配置注入 AGENTS.md | `zcode-slash-command-help.ts:43-50`；`shared/src/subagents-types.ts:62-70`；`zh-CN.ts:4028` |
| 文件/工作区索引 | 工作区文件清单（分块传输避免主线程冻结）；会话索引 | `workspace-file-search/fetchWorkspaceFileEntries.ts:1-30`；`v4/useSessionsIndex.ts` |
| Repo Wiki / 语义索引 | **未找到实现**；只有能力地图描述与日志分类字符串 | `apps/dev-docs/src/data/productCapabilityMap.ts:217`；`packages/desktop/src/main/exportLogs.ts:144`（`"repo-wiki"`） |

### 3.6 智能体 / 子代理 / 工作流

| 能力 | 说明 | 锚点 |
|---|---|---|
| 内置子代理 | `general-purpose`（全工具、注入 AGENTS.md）与 `Explore`（只读搜索，限定工具集） | `packages/services/src/subagents/subagentsService.ts:88-142`；`shared/src/subagents-types.ts:10` |
| 自定义代理 | 用户/工作区/插件三级；字段含模型、工具允许/禁止、技能、权限模式、最大轮次、后台、MCP | `shared/src/subagents-types.ts:50-95` |
| 子代理交互 | `Agent`/`Task` 派发、`SendMessage`/`RespondToCoordinator`、`escalate` 升级提问、`submit_result` 工作流 actor 提交 | `core/src/tool/handlers/index.ts:100-135`；`template` 见 `resolveRenderer.ts:100-140` |
| 后台任务 | 后台 bash、后台子代理、任务输出/停止、状态面板汇总 | `core/src/tool/handlers/task-output.ts`；`v4/ConversationBackgroundWorks.tsx` |
| 计划模式 | `EnterPlanMode`/`ExitPlanMode`，计划步骤投影 | `core/src/tool/handlers/plan-mode.ts:1`；`snapshot.ts:446-455` |
| 目标持续执行 | `/goal`、`GoalRead`、完成校验循环、状态提醒 | `runtime/methods/target-continuation-loop.ts`；`zcode-slash-command-help.ts:190-200` |
| 动态工作流 | 脚本编译/静态分析/引擎；11 个受灰度控制工具；运行可暂停/恢复/修订/补留白/保存复用 | `core/src/tool/handlers/index.ts:78-150,166-180`；`dynamic-workflow-feature.ts:1-60` || 工作流灰度的三档 | `disabled / onDemand / alwaysOn`（服务端 key + 本地 env 覆盖 + 用户选择） | `packages/shared/src/dynamic-workflow-feature.ts:9-11,22-30` |

### 3.7 MCP / 技能 / 插件 / Hooks / 自动化

| 能力 | 说明 | 锚点 |
|---|---|---|
| MCP 设置 | 服务器列表/表单、失败诊断、连接状态、远程同步（SSH/WSL） | `settings/McpServerList.tsx`、`McpServerForm.tsx`、`McpFailurePresentation.tsx`、`RemoteMcpSyncDialog.tsx` |
| MCP 运行时 | 工具发现、官方 MCP、MCP Apps（`ui://` 资源、app tools、sampling） | `core/src/mcp/`；`packages/shared/src/mcp-apps/`（15 文件） |
| 技能 | 列表/启用/来源（用户/项目/插件）、`/skill <name>` 强制加载 | `settings/SkillsSection.tsx`；`zcode-slash-command-help.ts:181-188` |
| 插件商店 | 公开/个人分段、Featured、已安装条、管理视图、分类、搜索、详情、示例提示词、来源管理 | `settings/PluginStorePage.tsx:62`；`PluginStoreListView.tsx`；`CONTEXT.md:1-80` |
| 插件能力 | 组件类型 `agent/command/skill/hook/mcp/lsp`；兼容 `.zcode-plugin` 与 `.claude-plugin` 清单 | `shared/src/plugin-types.ts:9-14`；`apps/zcode-cli/README.md:60-90` |
| Hooks | 7 类事件：SessionStart、UserPromptSubmit、PreToolUse、PermissionRequest、PostToolUse、PostToolUseFailure、Stop；command/process 两类；工作区 Hook 信任审核 UI | `shared/src/hooks.ts:4-12`；`settings/HooksSection.tsx`；`v4/WorkspaceHookPendingBanner.tsx` |
| 自定义命令 | Markdown 命令（命令运行时），设置页可增删改 | `settings/CommandsSection.tsx`；`packages/services/src/commands/` |
| 定时任务 | 5 段 cron/自定义重复规则（分/时/日/周/月/年）、立刻运行、暂停、历史、上限 20 条 | `shared/src/automation-types.ts:9,24-55`；`settings/AutomationsSection.tsx:516` |
| 闲时任务 | 取号排队、暂停/继续、模板、绑定会话、完成通知、6 状态 | `shared/src/off-peak-types.ts:12-40`；`settings/OffPeakTaskList.tsx:148` |
| 机器人 | Telegram/Webhook/飞书/Lark/微信/Discord/企业微信；私聊/群聊、话题历史、命令策略、回推粒度 | `shared/src/bots.ts:25-40`；`services/src/bots/`（44 文件）；`BotsDialog.tsx:1037` |

### 3.8 可观测性 / 用量

| 能力 | 说明 | 锚点 |
|---|---|---|
| 使用统计 | "应用用量"（本地会话历史）与"个人套餐"（供应商真实 Token/工具调用）双 tab；工具分布图 | `settings/UsageStatsSection.tsx:9`；`zh-CN.ts:3578-3589` |
| 上下文额度 | 输入框旁 context window 用量、压缩阈值、按类分解 | `chat-input-toolbar/contextUsage.tsx`；`snapshot.ts:184-202` |
| Coding Plan 额度 | 5 小时/每周/工具调用/MCP 额度，重置提醒 | `chat-input-toolbar/CodingPlanContextUsage.tsx`；`zh-CN.ts:3703-3708` |
| 模型轨迹 | 完整调用 IO 查看与搜索 | `ModelTrajectoryPane.tsx` |
| 网络/资源 | 网络请求捕获、存储占用分类清理、进程监视 | `resource-manager/`；`main/networkCaptureBuffer.ts`；`helpResourceManager` |
| 反馈与日志 | 工单、自动带任务上下文、导出日志、诊断包 | `settings/MigrationSection.tsx` 旁；`desktopMain` feedback；`sidebar.exportLogs` |
| 遥测 | 会话遥测、TTFT 本地记录、ARMS/RUM、性能与可靠性 | `v4/telemetry/`；`packages/services/src/conversation-telemetry/` |

### 3.9 协作 / 分享

- 分享发布：选择已完成的 product turn、编辑分享标题、权限 `private | public_readonly | public_importable`、确认 Dock、成功 Dock、链接行。`packages/ui/src/ConversationShareMenu.tsx:10`；`v4/ConversationShareSelectionPanel.tsx:229`；`v4/ConversationShareConfirmationDock.tsx`
- 分享落地页：`packages/web/src/share/ConversationShareLandingPage.tsx`，独立 `web-share` 构建（`base=/cn/share/`），匿名可看 public，private 走 Web OAuth，`zcode://share/import` 唤起桌面继续。`docs/conversation-share-v1.md:22-45`
- 导入：新会话 + `shared_context` + 产物，只读来源标记。`snapshot.ts:190-200`；`v4/ConversationShareImportNotice.tsx`

### 3.10 远程工作区 / 移动远控

| 能力 | 说明 | 锚点 |
|---|---|---|
| 远程类型 | `ssh | server | docker | wsl` 四类，向导式连接（主机/认证/目录） | `packages/ui/src/RemoteConnectionDialogContent.tsx:44-150`；`packages/shared/src/protocol.ts:128-156` |
| 远程运行时 | 远端部署 Agent bundle、资源缓存/资产安装、WSL 代理、Docker backend | `packages/server/src/remote/`（30+ 文件） |
| 远程同步 | 技能/MCP/插件同步到远端 | `settings/RemoteSkillSyncDialog.tsx`、`RemoteMcpSyncDialog.tsx`、`RemotePluginSyncDialog.tsx` |
| Web 远控 | 桌面生成二维码/链接，手机打开 `/remote`；任务索引、移动任务首页、主题菜单、终端传输 | `WebRemoteControlDialog.tsx`；`WebRemoteControlMobileShell.tsx:69`；`WebRemoteControlMobileTaskHome.tsx`；`packages/web/src/webRemoteControl*` |
| Android 壳 | 粘贴/扫码/deep link 打开 `/remote`；最近 5 条链接；前台保活；不创建独立 Agent | `docs/mobile-remote-control-android.md:1-30`；`packages/android/.../RemoteControlKeepAliveService.kt` |

### 3.11 设置页、命令面板、快捷键、斜杠命令

**设置分区**（`packages/ui/src/settings/settingsPageConfig.ts:27-160`）：

| 分组 | 分区 |
|---|---|
| 基础 | 通用（systemTitle）、外观、模型供应商、浏览器、电脑控制（仅桌面）、快捷键、工作区搜索（隐藏） |
| 智能体能力 | 记忆、子代理、插件、MCP、技能、命令、Hooks、自动化（隐藏，迁为工作区主视图） |
| 数据与统计 | 使用统计 |

**命令面板**：`Cmd/Ctrl+K` 或 `Cmd/Ctrl+Shift+P`；支持 `>` 命令、`#` 会话、`@` 文件前缀；分建议/聊天/导航/面板/配置/应用六段；含新建任务、打开工作区、设置、主题、技能、MCP、终端/浏览器/审查 tab、反馈、社群、文档、登录/登出。`packages/ui/src/command-center/CommandCenterDialog.tsx:202-217,404`；`packages/ui/src/quickpick/quickPickCommands.ts:26-260`。

**可配置快捷键（23 条，唯一事实源）**：`packages/shared/src/shortcutCommands.ts:61-99`。核心默认值：命令面板 `CmdOrCtrl+K` / `CmdOrCtrl+Shift+P`、设置 `CmdOrCtrl+,`、任务内查找 `CmdOrCtrl+F`、侧栏 `CmdOrCtrl+B`、主题 `CmdOrCtrl+Shift+L`、终端 `CmdOrCtrl+J`、侧边面板 `CmdOrCtrl+Alt+B`、上/下会话 `CmdOrCtrl+Shift+[ ]`、历史前进后退 `CmdOrCtrl+[ ]`、模型菜单 `Ctrl+M`、模式循环 `Ctrl+Shift+M`、思考档循环 `Ctrl+T`、新建任务 `CmdOrCtrl+N`、打开工作区 `CmdOrCtrl+O`、关闭 `CmdOrCtrl+W`、缩放 `=/-/0`、发送 `Enter`、换行 `Shift+Enter`、编程/办公 `CmdOrCtrl+Shift+U`、引导 `CmdOrCtrl+Shift+O`。

**内置斜杠命令（20 条）**：`help`、`login`、`logout`、`compact`、`init`、`expert`、`effort`(`variant`)、`dwf`、`fork`、`locale`(`language`)、`mcp`、`plugins`(`plugin`)、`mode`、`model`、`new`(`clear`)、`resume`(`continue`)、`rewind`、`skill`、`goal`(`target`)、`workflow`。`packages/shared/src/zcode-slash-command-help.ts:9-218`

**桌面菜单**：文件（新建任务/打开工作区/关闭窗口）、编辑、视图（全屏/缩放）、窗口、帮助（关于/更新日志/检查更新/DevTools/资源管理器/抓取 stdio/Endpoint 切换/反馈/导出日志/清除所有数据）。`packages/shared/src/desktopMenu.ts:3-55`

---

## 4. 运行时 / CLI 能力

### 4.1 分层与入口

- 分层（官方能力地图）：Renderer（Desktop/Web/Mobile UI）→ Host（本地/远程 Host、平台服务、协议路由）→ ZCode CLI（Agent/会话/模型/工具权威运行时）→ 工程基础设施。`apps/dev-docs/src/data/productCapabilityMap.ts:70-100`
- CLI 命令面：`tui`（默认）、`app-server`/`agent-server`（桌面 host 内部协议子进程）、`-p/--prompt` 单次、`--target` 目标持续、`--attach`、`--resume`、`--continue`、`--mode`、`--workflow-mode`、`--browser-use=headless`、`--stdio`、`--surface`。`apps/zcode-cli/packages/cli/src/arguments.ts:1-90`；`cli/src/run.ts:40-60`
- 统一启动器 `zcode`：`serve/status/stop/restart/update/uninstall`。`packages/zcode-server-cli/src/cli.ts:83-103`

### 4.2 事件词表（旧协议）

`packages/shared/src/zcode-protocol/index.ts:1446-1471`：`session.created/resumed/updated/titleUpdated/closed`、`turn.started/steerQueued/steerDrained/completed/failed`、`message.upserted/removed`、`part.started/delta/upserted/removed`、`model.streaming`、`tool.updated`、`permission.requested/resolved`、`userInput.requested/resolved`、`checkpoint.created`、`rewind.triggered`、`streamRecovery.updated`（25 种）。

### 4.3 V4 协议（桌面新链路）

- 命令全集（37 条）：`createSession`、`createSelectionSideSession`、`sendText`、`sendGoalCommand`、`stop`、`compact`、`forkAssistant`、`applyFileRewind`、`editUserQuery`、`retryTurn`、`setAssistantFeedback`、`setHighspeedMetrics`、`sendQueuedNow`、`editQueueItem`、`reorderQueueItem`、`deleteQueueItem`、`setAutoDrain`、`resolveInteraction`、`respondWorkspaceHookReview`、`toggleWorkspaceHookReviewItem`、`revokeWorkspaceHookTrust`、`requestWorkspaceHookReview`、`snoozeInteractionAutoResolution`、`switchModelConfig`、`switchCollaborationMode`、`setFollowupMode`、`pauseGoal`、`resumeGoal`、`cancelBackgroundWork`、`resumeWorkflowRun`、`startSavedWorkflow`、`amendWorkflowRunSettings`、`renameSession`、`deleteSession`、`discardSharedContext`（另有 `inputAccepted`/`inputDisposition` 回执）。`packages/shared/src/zcode-protocol-v4/command.ts:52-289`
- 命令信封：`commandId/clientId/sessionId/baseRevision/baseLogEpoch/type/payload/issuedAt`；ACK 状态 `accepted|rejected|stale|duplicate|noop|failed` + `reasonCode/revisionAtDecision/result`。`command.ts:343-460`
- 快照（会话状态）：control、availability（fork/compact/switchModelConfig/setFollowupMode/queueEdit/sendQueuedNow/pauseGoal/resumeGoal）、inputRouting、meta、sharedContextImport、config、modelTransition、usage（contextWindow/cumulative）、queue、pendingInteractions、pendingCommands、backgroundWorks、subagents、workflowRuns、goal、plan、workspaceHookAdmission、rows 窗口。`packages/shared/src/zcode-protocol-v4/snapshot.ts:146-500`
- 增量：`StatePatch` 字段与快照同构，按段可选。`packages/shared/src/zcode-protocol-v4/delta.ts:40-80`
- 输入意图：`kind sendText|sendGoalCommand|compact`、delivery（requested/admitted/fallback）、order（admissionSeq/queuePosition）、steer 状态、dispatch 状态、provenance、source（pluginUi/genUi）。`packages/shared/src/zcode-protocol-v4/input-intent.ts:19-110`

### 4.4 RPC 服务频道（48 个）

`packages/shared/src/channels.ts:91-178`。按域分组：

- 工作台：`file`、`media-preview`、`system`、`terminal`、`git`、`git-checkpoint`、`file-watcher`
- 会话/Agent：`zcode-task`、`zcode-agent`、`zcode-session`、`window-controller`、`off-peak-task`、`highspeed-card`
- 账户/模型：`setting`、`credential`、`oauth`、`provider-settings`、`model-selection`、`provider-provisioning-target`、`usage-stats`、`coding-plan-subscription`、`onboarding-record`
- 扩展：`skills`、`skill-sync`、`mcp-sync`、`plugin-sync`、`plugins`、`plugin-management`、`plugin-ui-bridge`、`plugin-ui-sampling`、`plugin-ui-app-tools`、`subagents`、`commands`、`hooks`、`memory`、`output-style`、`settings-sync`
- 运行时/平台：`cua-permission`、`cua-pip-session`、`broadcast`、`conversation-share`、`bots`、`feedback`、`prompt-attachment-transfer`、`highspeed-card`、`client-config`、`client-scenes`、`cloud-content`、`marketing-touch`
- 另有 `gen-ui`（`packages/services/src/gen-ui/contract.ts:27`）不在常量表内，按字符串注册。

RPC 原语：`call/listen` + 请求类型 100/101/102/103、响应类型 200-204。`packages/rpc/src/channels.shared.ts:13-58`

### 4.5 会话持久化

- `node:sqlite` 的 `DatabaseSync`，单库 `session-store`，迁移 0020/0021/0022。`apps/zcode-cli/packages/adapters/src/storage/session-store/sqlite-session-store.ts:2,245`
- 表/仓储：sessions、session-entries、messages、session-inputs、todos、usage、input-history、local-settings、permission-full-access、script-workflow-runs/activities、dwf-journal（含 artifacts/fields/pages/reads）。`.../repositories/` 目录
- 工作区级任务索引：`tasks-index.sqlite`（`off_peak_tasks`、`automation`/`automation_runs` 同库不同表）。`packages/shared/src/off-peak-types.ts:10-12`；`packages/shared/src/automation-types.ts:8-10`

### 4.6 动态工作流引擎

- 包 `@zcode/dynamic-workflow`：`analysis/`（AST、因果、fanout、hole 站点、mermaid）、`compiler/compile.ts`、`engine/`（launch/resume/holes/artifacts/cache/concurrency/settlement）。`apps/zcode-cli/packages/dynamic-workflow/src/`（2058 文件，含测试/文档）
- 工具族：`CreateWorkflow`、`AmendWorkflow`、`FillWorkflowHole`（新）、`EvalWorkflowSnippet`、`GetWorkflowRun`、`ListWorkflowRuns`、`ResumeWorkflowRun`、`ResolveWorkflowQuestion`、`SaveWorkflow`、`ListSavedWorkflows`、`ListModels`；灰度关闭时 11 个工具全部不注册。`core/src/tool/handlers/index.ts:115-180,166-180`
- 运行编排：可并发 actor、留白（运行到未写分支暂停等人补全）、运行中改并发/模型、产物（board/chart/metrics/table）、保存为可复用工作流、再次运行。`packages/ui/src/app-shell/WorkflowRunSidePane.tsx:451`；`settings/saved-workflows/`

### 4.7 定时任务 / 闲时任务

- 定时：`CronCreate/CronList/CronUpdate/CronDelete` 工具；调度器在桌面 main（`desktopCronScheduler.ts`）；运行回推可到 Bot。`core/src/tool/handlers/index.ts:90-93`；`packages/shared/src/automation-types.ts`
- 闲时：`OffPeakCreate/OffPeakList`；服务端取号 (ticket) + 3h 到期重取 + resume 续跑；闲时轮隐藏 `OffPeakCreate` 防递归。`core/src/tool/handlers/index.ts:94-95`；`bootstrap/src/zcode-protocol/offpeak-port.ts:20-100`
- 两套共用 scheduler 进程与派发管道，但数据表/状态机独立。`packages/shared/src/off-peak-types.ts:5-8`

### 4.8 子代理 / 目标 / 记忆 / 压缩

- 子代理：父会话派生 child runtime，支持模型继承/覆盖、工具白名单、后台、注入 AGENTS.md、权限模式；交互通过 `SendMessage`/`RespondToCoordinator`/`escalate`。`packages/services/src/subagents/subagentsService.ts`；`core/src/subagent/`
- 目标：`target-continuation-loop` 在 turn 结束后校验是否满足目标并继续，带迭代记录与 telemetry。`core/src/runtime/methods/target-continuation-loop.ts`；`snapshot.ts:420-445`
- 记忆：召回 manifest/selector、项目根、按工作区存储、dream 整理。`core/src/memory/`
- 压缩：自动阈值 + microcompact + 手动 `/compact`；模型切换前上下文守卫会要求先压缩。`zh-CN.ts:4901-4912`；`core/src/compact/`

### 4.9 CLI/插件运行时与沙箱

- CLI 插件目录：`browser-use`、`superpowers`、`documents`、`pdf`、`presentations`、`spreadsheets`、`image-search`、`visualize`、`skill-creator`、`plugin-creator`、`restore-legacy-sessions`、`ios-simulator`、`android-emulator`、`computer-use`、`zcode-guide`。`apps/zcode-cli/packages/*/.zcode-plugin/plugin.json`
- 插件 manifest 兼容 `.zcode-plugin/plugin.json` 与 `.claude-plugin/plugin.json`；支持 skills/commands/mcpServers/userConfig。`apps/zcode-cli/README.md:60-120`
- 插件 UI 沙箱：Electron 独立 `plugin-sandbox` 页面 + `postMessage` 端口 + CSP/权限门 + 页面容量（30 任务/64 活页面，离屏 5 分钟回收）。`packages/desktop/src/main/pluginSandbox/CONTRACT.md`；`packages/ui/src/plugin-ui/CONTRACT.md:1-30`

---

## 5. v3.14.3 → v3.15.1 变更

### 5.1 证据口径与限制

- `git log --oneline v3.14.3..v3.15.1` 输出 **1 条**：`aac47556 feat: update to v3.15.1`；`git log --merges` 为 0。**无法给出逐特性 commit subject**，以下按目录/文件/i18n/协议差异判定。
- `git diff --stat v3.14.3 v3.15.1`：**11,736 files changed, 1,942,918 insertions(+), 25,090 deletions(-)**；`apps+packages` 为 9,232 files。v3.14.3 快照缺 `docs/`（0 文件）与大量测试目录，因此"新增文件"不能直接等同"新功能"；本节把证据分成"强（新目录/新 i18n 前缀/新协议符号）"与"弱（可能是拆分/改名）"。
- 新增 i18n key 的前缀分布（`git diff -U0 ... zh-CN.ts`）：`chat` 117、`webRemoteControl` 90、`manualClaimPlan` 49、`browser` 47、`settings` 38、`bots` 32、`genUi` 21、`globalNotice` 19、`pluginUi` 14、`resourceManager` 13、`server` 12、`conversationShare` 10。

### 5.2 新增能力（强证据）

| 能力 | 证据 | 锚点 |
|---|---|---|
| **Gen UI（生成式 UI）** | 新目录 `packages/ui/src/gen-ui/`（18 文件）、`services/src/gen-ui/`（13 文件）、`shared/src/mcp-apps` 新增；助手消息中的 `::visualize{path=...}` 指令被投影为内联沙箱页面，可展开/全屏/Tweak | `packages/ui/src/gen-ui/CONTRACT.md:1-15`；`gen-ui/components/GenUiCard.tsx:47`；`gen-ui/index.ts:1-3` |
| **Plugin UI（MCP Apps 沙箱）** | 新目录 `ui/src/plugin-ui/`（72 文件）、`services/src/plugin-ui-bridge/`（15 文件）、`desktop/src/main/pluginSandbox/`（21 文件）；工具结果 `display.ui` 渲染内联/侧栏页面，支持 app tools、sampling、follow-up、widgetState | `packages/ui/src/plugin-ui/index.ts:1-40`；`plugin-ui/CONTRACT.md:1-20`；`packages/shared/src/channels.ts:139-143` |
| **Highspeed 加速卡** | 新目录 `ui/src/highspeed/`（17 文件）、`services/src/highspeed/`（4 文件）、`shared/src/highspeed.ts`；发送时 1 秒预算抽卡、模型锁定、时长节省统计、分享卡、全局通知 | `packages/shared/src/highspeed.ts:1-100`；`ui/src/highspeed/highspeedSend.ts:104`；`ui/src/i18n/locales/zh-CN.ts:7002-7015` |
| **Web 手机远控（移动壳）** | 新文件 `WebRemoteControlMobileShell/TaskIndex/TaskHome/ThemeMenu`；`packages/web/src` 的 `webRemoteControl*` 从 0 个增至 11 个（原 `webThemeSeed.ts` 演化为 `webRemoteControlThemeSeed.ts`）；90 个 `webRemoteControl.*` i18n key | `ui/src/WebRemoteControlMobileShell.tsx:69`；`ui/src/WebRemoteControlMobileTaskHome.tsx`；`packages/web/src/webRemoteControlLifecycle.ts` |
| **Android 远控壳** | 新包 `packages/android`（45 文件，Kotlin/Compose，CameraX + ML Kit 扫码，前台保活） | `docs/mobile-remote-control-android.md:1-30`；`packages/android/app/src/main/.../RemoteControlKeepAliveService.kt` |
| **奖励中心 / 手动领取套餐** | 新目录 `ui/src/rewards/`；新 i18n `manualClaimPlan.*` 49 个 key；`RewardsWebview` 覆盖层 | `ui/src/rewards/RewardsProvider.tsx:1-30`；`ui/src/components/manual-claim-plan/manualClaimPlanStartUsing.ts:1-20`；`zh-CN.ts:121-125` |
| **动态工作流：留白补全** | `FillWorkflowHole` 工具为 3.15.1 新符号（3.14.3 零引用）；新 i18n `workflow.hole.*`；新 UI 行 `workflow-fill-row.tsx`、`WorkflowRunHoleParts.tsx` | `shared/src/tool-identity.ts:34-36,94`；`core/src/tool/handlers/index.ts:136`；`ui/src/ToolCallBlocks/renderers/workflow-fill-row.tsx` |
| **动态工作流：保存/再次运行** | 新 i18n `workflow.saveRun.*`（30+ key）、`workflows.hub.global.*`；新 store `workflowRunSavedStore.ts`、`savedWorkflowHubContext.tsx`、`WorkflowRunPaneSaveSlots.tsx` | `ui/src/store/workflowRunSavedStore.ts:1-40`；`ui/src/v4/savedWorkflowHubContext.tsx:1-30`；`ui/src/app-shell/WorkflowRunPaneSaveSlots.tsx` |
| **工作流运行中改设置** | 新 i18n `workflow.run.settings.limit/concurrency`、`settingsChange.limitDefault`；`AmendWorkflowRunSettings` 命令在 3.14.3 已有，3.15.1 增加 UI | `ui/src/components/workflow-timeline/WorkflowRunSettingsFields.tsx`；`zh-CN.ts:5608-5646` |
| **Bot 群聊/话题** | 新 i18n `bots.boundGroups.*`、`bots.topic.*`、`bots.group.*`；新 v4 组件 `BotTopicPreparation`、`ChannelMentionContent`、`BotGroupDeliveryAction` | `ui/src/v4/BotTopicPreparation.tsx`；`ui/src/v4/ChannelMentionContent.tsx`；`zh-CN.ts:183-207` |
| **浏览器站点权限治理** | 新 `main/embeddedBrowserPermissionPolicy.ts`、`embeddedBrowserSitePermissionStore.ts`、`embeddedBrowserPermissionUiBridge.ts`；新 store + hook；47 个 `browser.permission.*` key | `packages/desktop/src/main/embeddedBrowserSitePermissionStore.ts`；`ui/src/hooks/useBrowserSitePermissions.ts`；`zh-CN.ts:949-960` |
| **资源管理器：网络页** | 新 `main/networkCaptureBuffer.ts`、`resourceManager/NetworkSection.tsx`；13 个 `resourceManager.network.*` key | `ui/src/resource-manager/NetworkSection.tsx`；`zh-CN.ts:6211-6214` |
| **文档/办公官方插件套件** | 新增 CLI 插件包：`documents`(docx)、`pdf`、`presentations`(pptx)、`spreadsheets`(xlsx)、`image-search`、`visualize`、`skill-creator`、`plugin-creator`、`restore-legacy-sessions`、`ios-simulator`、`android-emulator`、`computer-use`、`zcode-guide` | 各包 `.zcode-plugin/plugin.json`（如 `apps/zcode-cli/packages/documents-plugin/.zcode-plugin/plugin.json:2-8`） |
| **Linux 关闭驻留托盘** | 托盘本身 3.14.3 已有（`desktopTray.ts`）；3.15.1 新增 DBus `StatusNotifierWatcher` 能力探测与设置页提示，避免 GNOME 无托盘时静默失败 | `packages/desktop/src/main/desktopTraySupport.ts:1-20`；新增 i18n `settings.closeToTrayUnavailable/closeToTrayGnomeHint` |
| **研发文档站** | 新 `apps/dev-docs`（能力地图 + YAML + React Flow/ELK 可视化） | `apps/dev-docs/package.json`；`apps/dev-docs/src/data/productCapabilityMap.ts` |
| **分享独立站拆分** | 新包 `share-ui`、`web-share`（3.14.3 的分享页在 `packages/web/src/share/`，3.15.1 独立构建） | `packages/web-share/package.json:1-15`；`packages/share-ui/src/index.ts:1-6` |

### 5.3 变更（行为/命名/协议）

| 变更 | 证据 |
|---|---|
| 第三方 Agent Provider 归一 | `zcode-agent-policy.ts` 新增 `legacyZCodeProviderSchema`，把历史 `claude/opencode/gemini/codex` 全部归一为 `glm`，仅保留 `glm` 为可用 provider（`packages/shared/src/zcode-agent-policy.ts:10-27`）。3.14.3 只有 `zcodeAgentProviderSchema = z.literal("glm")`，没有归一函数。 |
| 工具 identity 增加 `FillWorkflowHole` | `packages/shared/src/tool-identity.ts:33-36,92-96` |
| 快捷命令/斜杠命令集合 | 与 3.14.3 **完全相同**（对 `zcode-slash-command-help.ts` 提取 name 集合逐项比对；`shortcutCommands.ts` diff 为空） |
| V4 命令全集 | 与 3.14.3 **相同**（命令 key 逐项比对） |
| 设置页分区 | 结构不变，仅导出修饰符变化（`settingsPageConfig.ts` diff 仅 `type`→`export type`） |
| 模型供应商表单 | 新增 Anthropic/OpenAI/Gemini 自定义 endpoint、Claude 模型槽位映射（haiku/sonnet/opus/reasoning）、Lite 套餐摘要（`zh-CN.ts` 新增 `settings.modelProvider.*` key） |
| 子代理权限模式文案 | 新增 `default/acceptEdits/auto/bypassPermissions/dontAsk/plan` 六档中文 key（`zh-CN.ts:4043-4048`） |
| 插件市场来源 | 新增 "Claude Code 插件" 过滤与 "仅 ZCode" 标识（`settings.plugins.marketplace.claudeCodePlugins/zcodeOnly`） |
| 发送消息来源标记 | userInput 行新增 `source`（pluginUi/genUi），并在气泡上标注来源（`input-intent.ts:19-35`；`v4/ConversationUserInputBubble.tsx`） |
| 会话侧分享 | 新增 `ConversationShareLinkRow`、发布进度/错误 i18n（10 个 key） |

### 5.4 删除

`git diff --diff-filter=D` 共 15 个文件，用户可见影响有限：

| 删除 | 说明 |
|---|---|
| `packages/ui/test/nonCliAcpRetirement.test.ts`、`packages/services/test/nonCliAcpRetirement.test.ts` | 旧 ACP 第三方 Agent 退役守卫测试 |
| `packages/services/src/device/deviceMid.ts` | 设备 ID 迁移到其他位置（桌面 `desktopDeviceMid.ts` 仍在） |
| `packages/shared/src/endpointHostname.ts` | endpoint 主机名工具移除 |
| `packages/shared/src/sessionCreateSource.ts` | 会话创建来源类型移除 |
| `apps/zcode-cli/packages/bootstrap/src/app/workflow-concurrency-ceiling.ts` | 工作流并发上限模块移除（改由运行设置承载） |
| `apps/zcode-cli/packages/core/src/subagent/profile-model-selection.ts` | 子代理模型选择重构 |
| `packages/desktop/src/shared/armsRumShared.*` | 构建产物残留清理 |

### 5.5 需要标注的不确定项

- v3.14.3 快照没有 `docs/`，所以文档里描述的大量能力（Repo Wiki、Repo Snapshot 等）无法用"3.15.1 新增"来判定；它们可能在更早版本已存在，也可能只是规划。
- 3.15.1 新增的 `packages/stream-animate` 是内部流式图表工具（`src/server/deepseekRunner.ts`），不是用户功能。
- `packages/ui/src/request-security-edition/` 在 3.15.1 新增，但组件全部返回 `null`（`index.ts:1-10`），属于未启用的企业版占位，不应视为能力。
- 由于 repo 是快照式（每版一个提交），"3.15.1 新增 vs 3.14.3 已有"的判断基于文件/符号存在性；若某能力在 3.14.3 以其他名字实现，本报告可能高估新增。

---

## 6. 面向 Vue 版 IDE 工作台的重实现 Top 20（含锚点）

> 目标不是复刻 ZCode 的后端，而是让 `overlay/custom/client/ide` 的交互骨架对齐。每条给"最小可用行为"与源码锚点。

| # | 能力 | 最小可用行为 | 源码锚点 |
|---|---|---|---|
| 1 | **会话时间线与行模型** | 按 turn 分组渲染 9 类行；结构变化整行替换、文本增量追加；虚拟滚动 + 滚动锚点 | `packages/shared/src/zcode-protocol-v4/rows.ts:68-433`；`packages/ui/src/v4/ConversationTimeline.tsx:2122` |
| 2 | **Composer 与模式/权限** | 模型、思考档、权限模式（build/yolo/guarded）+ Plan 独立开关；只影响下一次提交 | `packages/ui/src/v4/composer/V4ComposerModeControls.tsx:41-223`；`packages/ui/src/v4/composer/V4ComposerToolbar.tsx:1189` |
| 3 | **输入队列 / Steering** | Enter 入队、Ctrl+Enter 立即发送、busy 时"引导"；队列可删/改/排序/立即发送/暂停恢复 | `packages/ui/src/v4/ConversationQueuePanel.tsx:36-427`；`packages/shared/src/zcode-protocol-v4/input-intent.ts:65` |
| 4 | **工具卡渲染注册表** | 按工具 identity 分派专用卡片；未知工具降级为原始 JSON；连续命令/变更可合并 | `packages/ui/src/ToolCallBlocks/resolveRenderer.ts:58-200`；`ToolCallBlocks/renderers/*` |
| 5 | **权限/审批弹窗** | 按 edit/execute/mcp/search/skill/workflow 渲染预览；once/session、规则范围、拒绝反馈；子代理来源 | `packages/ui/src/PermissionDialog.tsx:442` |
| 6 | **计划审批与计划侧板** | ExitPlanMode 打开计划详情，展示步骤/进度/操作 | `packages/ui/src/app-shell/PlanDetailSidePane.tsx:79`；`core/src/tool/handlers/plan-mode.ts` |
| 7 | **Git 审查面板** | 分支切换/新建、变更分组（未暂存/已暂存/分支/上一轮）、Diff、stage/unstage/discard、提交/推送 | `packages/ui/src/GitPane.tsx:43`；`packages/services/src/git/git.ts:33-52` |
| 8 | **终端面板** | 多标签 PTY、cwd/远程会话、后台 bash 输出独立 tab | `packages/ui/src/SidePaneTerminalPane.tsx:5`；`packages/ui/src/lib/workspaceSidePane.ts:100-120` |
| 9 | **侧边多标签面板体系** | 统一 tab 模型（浏览器/终端/审查/文件/子代理/工作流/插件），可拖拽、恢复最近关闭、按父会话作用域可见 | `packages/ui/src/lib/workspaceSidePane.ts:530-552`；`ui/src/app-shell/SidePaneTabOverview.tsx` |
| 10 | **内置浏览器 / 浏览器自动化** | 地址栏与导航、权限提示、与 Agent 受控页（browser-use）分离 | `packages/ui/src/EmbeddedBrowserPaneParts.tsx:44-260`；`workspaceSidePane.ts:121-151` |
| 11 | **文件树 + 预览** | 懒加载文件树；代码/图片/Markdown/PDF/Office/媒体预览；只读代码查看器 | `packages/ui/src/workspace-file-tree/WorkspaceFileTree.tsx:88`；`PreviewPane.tsx` |
| 12 | **任务/工作区侧栏** | 工作区分组、置顶、最近、归档、未读、拖拽、搜索入口 | `packages/ui/src/WorkspaceSidebar.tsx:228`；`TaskList.tsx:29` |
| 13 | **设置页框架** | 三分组 17 个分区、搜索、面包屑、按平台显隐、深链 intent | `packages/ui/src/settings/settingsPageConfig.ts:27-160`；`lib/settingsNavigation.ts:1-60` |
| 14 | **命令面板** | `>`/`#`/`@` 三域搜索；命令+会话+文件；历史；快捷键提示 | `packages/ui/src/command-center/CommandCenterDialog.tsx:202-404` |
| 15 | **可配置快捷键** | 23 条命令 + 序列化/解析/校验；菜单 accelerator 与 renderer 分发共用一张表 | `packages/shared/src/shortcutCommands.ts:61-99,190-260` |
| 16 | **斜杠命令** | 20 条内置命令 + 自定义 Markdown 命令；桌面本地消费 `/plan`、`/compact`、`/goal`、`/side` | `packages/shared/src/zcode-slash-command-help.ts:9-218`；`ui/src/v4/slashCommands.ts:53-140` |
| 17 | **子代理钻取** | 会话内摘要行 + 打开子代理会话/目录；状态面板汇总 | `packages/ui/src/v4/SubagentDrilldown.tsx:37`；`workspaceSidePane.ts:530` |
| 18 | **动态工作流运行面板** | 阶段/轨道/actor/产物/留白/运行设置；运行卡与详细侧板双视图 | `packages/ui/src/app-shell/WorkflowRunSidePane.tsx:451`；`components/workflow-timeline/WorkflowTimeline.tsx` |
| 19 | **会话分享** | 选轮次、设权限（private/public readonly/public importable）、发布、只读时间线、导入续作 | `packages/ui/src/ConversationShareMenu.tsx:10`；`v4/ConversationShareSelectionPanel.tsx:229`；`docs/conversation-share-v1.md:22-45` |
| 20 | **Web 远控移动壳** | 任务索引 + 移动任务首页 + 主题菜单 + 重连/失败态；与桌面 host 共享会话 | `packages/ui/src/WebRemoteControlMobileShell.tsx:69`；`WebRemoteControlMobileTaskHome.tsx` |

补充（不在 Top 20、但重实现时容易漏）：Highspeed 卡（`ui/src/highspeed/highspeedSend.ts:104`）、Gen UI 内联页（`ui/src/gen-ui/components/GenUiCard.tsx:47`）、Plugin UI 沙箱（`ui/src/plugin-ui/CONTRACT.md`）、记忆设置（`settings/MemorySettingsSection.tsx:46`）、用量看板（`settings/UsageStatsSection.tsx:9`）、定时/闲时任务（`settings/AutomationsSection.tsx:516`、`OffPeakTaskList.tsx:148`）、Bots（`BotsDialog.tsx:1037`）、奖励中心（`rewards/RewardsProvider.tsx`）。

---

## 7. 未知与边界（明确标注）

1. **无逐特性提交历史**：仓库每版一个 squash 提交，无法用 `git log` 还原"哪个提交加了哪个功能"；本报告的变更归因来自文件/符号/i18n diff。
2. **Repo Wiki / Repo Snapshot / 语义索引**：`apps/dev-docs` 的能力地图把它们列为"工作台服务"，但 `packages/services/src` 与 `packages/desktop/src/main` 中没有对应实现；只在日志导出分类中出现 `"repo-wiki"`（`packages/desktop/src/main/exportLogs.ts:144`）。本版是否由服务端提供，源码无法证明，标记为**未验证**。
3. **Android 包未构建**：只做了源码结构清点，没有运行 Gradle；`packages/android` 的构建可用性未验证。
4. **桌面 3.15.3 与源码 3.15.1 有差异**：安装包为 3.15.3，本文未反编译 asar 对照，3.15.2/3.15.3 的修复内容未知。
5. **`packages/formal-proof` 与 `packages/stream-animate`** 属于内部/实验工具，未纳入用户功能面。
6. **`request-security-edition`** 是空实现占位（所有导出组件返回 `null`），不作为能力计入。
7. **官方 MCP / 云内容 / 计费** 依赖远端服务；源码只能证明调用面存在（如 `services/src/official-mcp/`、`cloud-content/`、`coding-plan-subscription/`），实际行为未验证。
