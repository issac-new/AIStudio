# zcode 基底测绘（M1）：真实源码 vs SwarmStudio /ide 对照与差距清单

2026-09-21，基于 upstream/zcode @ 872ad96（开源首日 HEAD）。前序 parity 工程（feat/ide-parity-*、feat/ide-zcode-visual）基于装机版逆向；本文用真实源码重新校验，产出后续吸收轮次的差距清单。数据来源：全仓探查 + 关键文件直读。

**M4 补充测绘（2026-09-21 同日，全量穷举）**：M1 只扫了主干对照面，按目录/通道/类型文件重做文件级穷举后，结论修正为「主干平手不假，但 zcode 的特性面还有约 6 个 M1 完全没看到的系统级块」——工作流可视化族（app-shell + components/workflow-* + CLI dynamic-workflow）、自动化三联（cron 定时/闲时/工作流）、插件生态（plugin-store 主视图 + marketplace + 三种远程同步）、@提及系统、设置页 18 分区中的 12 个、远程工作区（SSH/Docker/WSL）。修订后未迁移清单见 §七（P0-P2 共 39 项，P0 为 5 项）。另核查定论：zcode **没有模型价目表**（§6.7），我方成本估算不能从此仓取数。

## 一、架构事实（修正两个旧认知）

1. **没有 apps/web。** 工作台 UI 全部在 `packages/ui`（React 19 + zustand 5 + Tailwind 4 + Radix），由 `packages/desktop`（Electron）或 `packages/server` + `packages/zcode-server-cli`（浏览器，`/ws` RPC）宿主；`packages/web` 只是 OAuth 回调与分享落地页。导航不走路由，走 `store/tabStore.ts`（tab 种类 workspace|settings，workspace 主视图 chat|automations|plugin-store）。
2. **协议面 = 服务接口方法名。** `packages/rpc` 是 VSCode 风格 proxy-channel：服务方法名直接变 `channel.call(method)`，`onXxx` 属性变 `channel.listen("onXxx")`。通道注册表在 `packages/shared/src/channels.ts`（约 40 个 ServiceChannels）。这与我们的 REST+socket 是两种范式；**不迁移架构，只借语义**（我们的前后端协议单一事实源在 upstream client `api/` + server `routes/`，已经够用）。

技术栈差异：zcode 是 React+zustand，我们是 Vue+pinia。对照停留在概念与数据语义层，不做框架迁移。

## 二、特性面对照（zcode packages/ui/src ↔ overlay /ide）

| 能力 | zcode 实现 | 我方现状 | 裁决 |
|---|---|---|---|
| 会话/对话 | `v4/V4ChatPane` `SessionPane` `ConversationTimeline` `ConversationComposer`（Lexical 富文本） | IdeChatPane 复用 upstream MessageList/ChatInput | 平手 |
| 任务/计划 | `TaskList` + 分组/置顶/时间线/归档区段；`PlanDetailSidePane` | IdeTaskSidebar（分组/项目/时间线 + 置顶/归档）+ IdePlanFloat | 平手 |
| 子代理 | `subagentsStore` + `SubagentDirectorySidePane`/`SubagentSessionSidePane` | IdeSubagentsFloat（chatStore.subagentStreams） | 我方弱在无"目录"视角，先记 backlog |
| 技能管理 | `settings/SkillsSection`（过滤/启停/安装/导入/上传/远程同步） | 无工作台入口（hermes 侧有） | backlog |
| 终端 | xterm + `AnimatedTerminalPanel` + sidePane 注册表 | IdeTerminalDock/Panel（node-pty WS） | 平手 |
| Git | GitPane + 分支切换 + git-graph + checkpoint | IdeGitPane/IdeGitLog（无 checkpoint） | backlog：checkpoint（git-checkpoint 通道） |
| 文件树/预览 | 文件树 + shiki 只读预览（md/code/img/pdf/office/patch）+ TreemappingPane | IdeFilesPane（FileTree + Git 子页） | backlog：treemap、office/pdf 预览 |
| 命令面板 | `command-center/CommandCenterDialog` | IdeCommandPalette | 平手 |
| 嵌入浏览器 | `browser-use/` webview | IdeSidePane browser tab | 平手 |
| 资源监视 | `resource-manager/ResourceManagerApp` | IdeStoragePane | 平手 |
| 模型调用检查器 | `ModelTrajectoryPane`（每请求 usage+duration） | RunTrace L1/L2 模态 | 我方接近，缺每请求 duration |
| 用量面板 | `settings/UsageStatsSection` + heatmap/连续天数/TTFT/工具错误率/Coding Plan | /hermes/usage（模型/代理/日趋势） | 见差距 G7 |
| 白板 | WhiteboardPane | IdeWhiteboardPane | 平手 |
| 会话分享 | ConversationShare 落地页 | 任务 share-export | 形态不同，各自够用 |

## 三、遥测差距（本次测绘最高价值区）

zcode 的数据管道（agent → `usage_update` → UI）字段（`packages/shared/src/zcode-task-types-core.ts`）：

- `ZCodeUsageUpdate`：`size`（窗口总量）、`used`、`cost{amount,currency}`、`cache: ZCodeContextCacheUsage`、`breakdown[]`（按来源 system_prompt/meta_user_context/skills/tool_prompt/system_tool_schemas/mcp_tool_schemas/messages，各 `{source, chars}`）。
- `ZCodeContextCacheUsage`：`inputTokens, cacheReadTokens, cacheWriteTokens, latestHitRate, hitRate`（累计均值）。
- `session-debug.ts`：每轮 `usage{...六项}, hitRate, generationDurationMs, tokensPerSecond`，`calculateOutputTps() = outputTokens*1000/generationDurationMs`。
- `ZCodeTaskGoalStats`：`tokensUsed, tokenBudget, contextUsed, contextWindow, toolCallCount, iterationCount, timeUsedSeconds`。

我方已有（upstream chat/sessions store + overlay）：`inputTokens/outputTokens/contextTokens`（socket `usage.updated`）、SessionSummary 带 `cache_read/write_tokens`、usage store 全局 `cacheHitRate`、ChatInput 上下文条（60%/80% 阈值）。**TPS 全仓零命中。**

差距清单（按优先级，前两条即 M2）：

- **G1 会话级 TPS 仪表**：无任何 tokens/s。原料（output_tokens+时间戳）已有，纯前端可补。→ M2
- **G2 状态栏常驻上下文水位**：水位条只在聊天列 ChatInput 内，无全局常驻。→ M2
- **G3 会话级缓存命中率**：只有全局聚合值，无会话实时值。→ M2（用 SessionSummary cache 字段近似，会话列表刷新时更新）
- G4 上下文构成 breakdown（system/skills/tools/messages 分段）：后端无此数据，需 hermes-agent 插件产 span（仿 run-trace 插件）。→ backlog（后端）
- G5 目标预算（tokenBudget/迭代数/工具调用数 对 goal 的进度）：无。→ backlog
- G6 MCP 配置体验：zcode 有 表单+JSON 草稿+OAuth+外部 agent 导入+远程同步+common/user/workspace 三作用域；kimi 有对话式 `/mcp-config`。我方只有 upstream 表单 CRUD。→ M3（kimi 对话式）+ backlog（导入/同步）
- G7 用量面板升级：heatmap/连续天数/avgTTFT/工具错误率/Coding Plan 配额。→ backlog
- G8 会话内"每轮 rounds 表"（zcode DeveloperToolsPane 的 TPS/命中率逐轮表）：依赖 G1 落地后顺手可扩。→ M3 后再评

## 四、M2 实现要点（本文测绘的落地契约）

dsh-TUI 语义（`src/screens/StatusMetrics.ts`、`src/dsh-adapter/channel/projection.ts`）经裁决后的移植口径：

- 上下文占用 = 最近一次请求 `input + cacheRead + cacheWrite`（dsh/zcode 同口径）；我方无每请求 usage 时退化为 `contextTokens / window`。
- 压力阈值：**用我方 ChatInput 既有 60%/80%**，不用 dsh 的 80/95——同屏两个条两个阈值会误导（ChatInput 常驻聊天列）。已记分歧。
- TPS = Σ步输出 token / Σ步解码时距（首 token → 落定，排除 TTFT 与工具执行）；我方 socket 粒度拿不到首 token 时刻，退化为「流式期间 Δoutput/Δt 滚动窗口 + 轮结束全轮均值」，采样上限 500、火花线 12 点照搬。
- 缓存命中 = `cacheRead / (input + cacheRead + cacheWrite)`（写算 miss），分母 ≤0 不显示；数据源 SessionSummary。
- 速度色阶照搬：≥50 绿 / ≥20 黄 / <20 红；仪表条峰值缩放、地板 40。

## 五、结论

parity 工程的主干（布局、任务、计划、子代理、终端、Git、面板族）已达平手；真实源码暴露的系统性差距集中在**遥测颗粒度**（G1-G5、G7-G8）与 **MCP 配置体验**（G6）。M2/M3 按上文口径执行，G4/G5 需要后端（hermes-agent 插件）配合，排 backlog。

---

## 六、M4 补充测绘（全量穷举）

同日第二轮。方法：对 `packages/ui/src` 做目录级穷举（37 个子目录 + 135 个根级文件逐一归类）、`packages/shared/src/channels.ts` 40 个 ServiceChannels 逐个登记、`apps/zcode-cli` 子命令与 slash 命令全量枚举、类型文件逐个读。我方基线：`overlay/custom/client/ide/`（views 15 文件、components 5、utils 6、api 4、store 1）。判定符号：≈ 平手 / → 未迁移（附 overlay 落点建议）/ × 不适用；✅M2/✅M3 标已迁移项。

### 6.1 UI 面板/视图全量清单（packages/ui/src 按目录穷举）

**根级功能组件**（135 个根级文件归类，去重后 31 组）：

| 组件/族 | 功能 | 我方判定 |
|---|---|---|
| `App.tsx` `Root.tsx` `index.ts` | 应用根/OAuth 引导 | ×（宿主不同，我方 Vue Shell） |
| `WorkspaceHeader(Sections).tsx` `WorkspaceHeaderSections/` | 工作区头部：路径、最近活动、动作区 | ≈（IdeShell 头部 + IdeTaskContextBar） |
| `WorkspaceSidebar(.tsx)` `SortableWorkspaceSidebar.tsx` `WorkspaceSidebar/`（折叠轨/分组切换/远端重连提示） | 多 workspace 可排序侧栏 | ≈（IdeTaskSidebar 项目 chip 模式，无跨窗口多 workspace tab） |
| `TaskList(Item)(ContextMenu)` `WorkspacePinned/Timeline/ArchivedTasksSection` `workspace-grouped-tasks/`（虚拟化列表 22 文件） | 任务列表族：置顶/时间线/归档/分组拖拽 | ≈（IdeTaskSidebar 同构，M1 已评） |
| `NewTaskButtonGroup` `OpenSplitButton` `TaskRenameDialog` `TaskActionMenuContent` `DeleteAllArchivedTasksButton` `TaskListLoadingHint` `TaskListRemoteSyncHint` | 任务操作族 | ≈（重命名经标题内联，其余有） |
| `V4ChatPane` 族（`v4/` 203 文件：Timeline/TurnRow/TurnGroup/TurnNavigator/Composer/QueuePanel/StatusPanel/QuotaBanner/Share 族 10 文件/FileRewindDialog/FileSummaryPanel/HookDetailsAction/PendingGuideList/SelectionTooltip/MarkdownSelectionTooltip/WorkflowDigests/WorkflowCompletion） | 会话主视图 v4：逐轮导航、队列、配额横幅、分享选段、文件级回滚 | → 部分未迁移：TurnNavigator（轮间跳转）、FileRewindDialog（按文件回滚）、QuotaBanner、队列面板（ChatInput 有排队，无面板） |
| `LexicalChatInput.tsx` `SlashCommandPlugin.tsx` `prompt-editor/` `mentions/`（6 provider：file/plugins/sessions/skills/subagents/whiteboard） `chat-input-toolbar/`（上下文用量表/CodingPlan 表/思维链等级/模型选择/显示切换 18 文件） | 富文本输入：@提及六源、slash、思维链等级 | →（ChatInput 有 slash/附件/语音命令；无 @提及、无思维链等级切换） |
| `ToolCallBlocks.tsx` + `renderers/`（62 个渲染器：agent/explore/escalate/submit-result/task-output/task-stop/respond-to-coordinator/send-message/read-session-context/goal/skill/todo/switch-mode/plan-guidance/ask-question/list-models/edit/execute/search/read/mcp/node-repl/cua 族 15/cron-create/offpeak-create/create-workflow/save-workflow/list-saved-workflows/list-workflow-runs/get-workflow-run(-roster/-situation)/resume-workflow-run/eval-workflow-snippet/workflow-diagnostics/resolve-workflow-question/workflow-draft-row/workflow-run-compact-card/changes-group/execute-group/WorkflowCardMetaLine/fallback） | 每种工具一张专属卡 | ≈（MessageList 通用工具卡 + 子代理卡；workflow 工具卡族 → 无对应物） |
| `GitPane(.tsx)` `GitPane/` `GitPaneChangeCard` `git-action-menu/` `git-branch-switcher/` `git-graph/`（DAG 图 6 文件） | Git 面板 + 分支切换 + commit DAG | ≈（IdeGitPane/IdeGitLog；无 DAG 图、无 checkpoint） |
| `PreviewPane.tsx` + `previewPane*Content`（13 文件：code/codeReview/image/markdown/media/office/officeDocx/officeLegacyDoc/officeXlsx/patchFallback/pdf/pptx） | 只读预览：md/代码/图/PDF/docx/xlsx/pptx/旧 doc/patch | →（FilePreview 有 md/code/img/pdf；office 三件套缺） |
| `presentation/`（pptxRendererPreviewEngine/presentationElementModel/presentationPdfPrintExport/previewControls/textSelection） | PPTX 元素级预览 + PDF 打印导出 | →（无） |
| `ModelTrajectoryPane` 族（12 文件：Pane/Details/Parts/Timeline/Search/SearchBar/ExpandableMessage/ExpansionMenu/Format/RoleStyles/ToolPayload/SectionTitle + store） | 模型调用检查器 | ≈（RunTrace L1/L2；M1 已评缺每请求 duration） |
| `DeveloperToolsPane.tsx` | 每轮 rounds 表 + 网络请求头面板 | →（G8，本轮确证 schema 见 §6.6） |
| `TreemappingPane.tsx` | 文件活动 treemap（读/写/浏览热度） | →（M1 已记 backlog） |
| `WhiteboardPane.tsx` | 白板 | ≈（IdeWhiteboardPane；差 whiteboardMentionProvider 接入提及源） |
| `Terminal.tsx` `terminal/` `SidePaneTerminalPane` | 终端族 | ≈（IdeTerminalDock/Panel） |
| `browser-use/`（14 文件：UnifiedBrowserView/HumanBrowserView/ResponsiveBrowserViewport/缩放/截图表面/resize 警告） | 受控浏览器视口（agent 操控 + 人接管） | ≈（IdeSidePane browser tab 复用 DesktopBrowserView；无 agent 操作态图标/截图表面协作） |
| `EmbeddedBrowserPaneParts` `embeddedBrowserHelpers` | 内嵌浏览器面板 | 同上 |
| `SettingsPage(.tsx)` `settings/`（120 个根级文件 + 3 子目录，18 分区见 §6.2 表） | 设置页 | →（12 分区无对应，见 §6.2） |
| `CommandCenterDialog`（`command-center/`）+ 搜索历史 | 命令面板 | ≈（IdeCommandPalette；差搜索历史持久化与关键词中英双语匹配） |
| `quickpick/`（quickPickCommands 17 条 + TaskFindDialog 会话内查找 + 高亮） | 命令注册 + 会话内 find | →（会话内查找无；命令面差距见 §6.2 末） |
| `resource-manager/`（ResourceManagerApp + storage/ 8 文件：扫描/快照/分类清理/磁盘卡） | CPU/内存按基础服务/内置插件/社区插件采样 + `.zcode` 目录存储治理 | →（IdeStoragePane 简版，无进程级采样、无分类清理） |
| `feedback/`（23 文件：中心/提交/截图选择/工单/进度/上传指示） | 用户反馈工单系统 | ×（我方无工单后端） |
| `onboarding/`（21 文件：职业选择/mesh 背景/agents.md 迁移步骤/模式选择） | 首启引导 | ×（SwarmStudio 有自己的首启流程） |
| `login/`（LoginApiKeyForm） | API key 登录 | ×（我方账号体系不同） |
| `remote-connection/` + `RemoteConnectionDialogContent/Fields/WizardChrome` + `SSHDialog` | SSH/Docker/WSL 远程工作区连接向导（历史/日志/取消） | →（无远程工作区概念；价值待产品层裁决） |
| `cua-permission/` + `settings/ComputerUseSection` + `settings/cuaPermission*` | Computer Use 权限引导 | ×（§6.5：开源包为 fail-closed 占位） |
| `UpdateStatus*`（5 文件）+ `UpdateReleaseNotesTooltip` + `updateReleaseNotes.ts` | 自动更新（检查/下载/跳过/重启/版本说明） | ×（我方无桌面分发链） |
| `DesktopTopOverlay/ActionButton/WindowControls/WindowFrame` `WindowsTopLeftLogo` `windowCaptionControls` | 桌面窗口 chrome | ×（Electron 专属） |
| `ConversationShareMenu/PermissionPicker` + `v4/ConversationShare*`（10 文件：选段面板/确认 dock/只读时间线/导入提示/成功 dock/续聊 API） | 会话分享（选段导出 markdown/权限/continuation） | →（我方 exportSession 全量导出；选段/markdown/续聊缺） |
| `PermissionDialog` `ElicitationDialog` `AlertDialogHost` `ConfirmDialog` `SaveWorkflowPermissionBlock` `WorkflowPermissionBlock` `InteractionRequestOriginBadge` `TaskInteractionBadge` | 对话框族：权限/MCP elicitation/保存工作流确认 | ≈（MessageList 审批浮层有 Permission 等价物；Elicitation → 无） |
| `CodingPlanUsageRemainingPanel` `CodingPlanEntryButton/UpgradeDialog/EmbeddedWebviewDialog` `BackgroundTaskElapsedLabel` `ChatEmptyState/ChatErrorBanner/ChatMediaAttachmentPreviewDialog/ChatEmptyScratchWorkspaceDialog` `ControlHintTooltip` `DirectoryBrowser` `ModelConfigSelect` `messageChangeSummaryPreview` `replay.ts` `WorkspaceHelpMenuButton` `WorkspacePluginPreview` `WorkspaceEditorButtonGroup` `openWorkspacePageThemeHero` `WelcomeScreen` | 零散：Coding Plan 余量/升级、媒体附件预览、空态、欢迎页 | →（媒体附件预览 audio/video 缺；其余 × 或 ≈） |

**`app-shell/` 侧栏面板 19 种 tab**（`packages/ui/src/lib/workspaceSidePane.ts:516-535` 的 union 全量）：BackgroundBash、Browser、Git、CodeViewer、Treemapping、Whiteboard、ModelTrajectory、DeveloperTools、Terminal、BrowserUse、SubagentSession、SubagentDirectory、SelectionSideChat、PlanDetail、WorkflowRun、WorkflowRunDirectory、WorkflowActorSession、WorkflowWorkspace、WorkflowArtifact。另有 `app-shell/` 53 个根级文件（PlanDetailSidePane/SubagentDirectorySidePane/SubagentSessionSidePane/SelectionSideChatPane/BackgroundBashOutputSidePane/WorkflowRunSidePane 等 26 个面板组件 + 布局/生命周期 hook）+ `workflow-artifacts/` 产物预设。我方 `IdeSidePane.vue:25-36` 10 个 tab（files/review/browser/wiki/assistant/storage/memory/board/mcp/terminal）：对上 8 个；**SubagentDirectory、BackgroundBash、5 种 Workflow tab、SelectionSideChat（真会话版）未迁移**；我方 assistant tab 是「复制提示词」MVP（IdeSidePane.vue:41-62），zcode 是真子会话。

**workspace 主视图三态**（`packages/ui/src/lib/taskNavigationHistory.ts:20-34`）：chat | automations | plugin-store。automations 内三 tab：scheduled（cron 定时）| idle（闲时）| workflow（工作流）。我方：chat ≈；automations →（仅 IdeTaskSidebar 顶部按钮跳 `hermes.jobs`，IdeTaskSidebar.vue:338；无编辑视图/模板目录/运行历史，见 `settings/AutomationsSection.tsx` 2040 行 + `automationTemplateCatalog.ts`）；plugin-store →（无）。

**状态域清单**（`packages/ui/src/store/` 42 文件 = 41 个 zustand store + index 桶文件，映射扩展面）：tabStore（M1 已录）、zcodeSessionStore 五件套（主会话投影/导航/选择器/task 分片/workspace 分片）、subagents(Context)Store、skillStore、mcpStore 五件套（desktop/helpers/migration/statusList）、plugin(Management/Enabled/Loading)Store、automationManagementStore、offPeakTaskStore、savedWorkflowStore、dynamicWorkflowAvailabilityStore、whiteboardStore、commandsStore、hooksStore、modelTrajectoryStore、codingPlanQuotaResetState、composerAttachmentUploadStore、conversationShareSelectionStore、remote{PinnedTask,TimelineTask,WorkspaceSession}Store、taskQueryCacheStore、workspaceHookReviewStore、alert/confirmDialogStore。我方对应：chat/ide store 覆盖会话与布局；其余扩展面（skill/mcp/plugin/automation/offpeak/workflow/hooks/commands）在 /ide 均无独立状态域，与 §6.2 分区差距一一对应。

**剩余目录归类**（穷举收尾）：`components/ai-elements`（AI 消息原语）、`components/coding-plan-quota-reset`（配额重置提醒弹层）、`components/workflow-{graph,timeline,run-line}`（§6.8 第 1 条）、`components/ui` + `components/icons` + `components/lib`（Radix 基建）、`workers/`（文件搜索过滤 worker 等 Web Worker）、`lib/`（约百个纯逻辑模块：treemappingActivity/workspaceSidePane/settingsNavigation/taskNavigationHistory 等，已按消费处引用）、`hooks/`（98 个 React hook，能力面已被上表吸收）、`i18n/locales`（zh-CN/en-US 双语）、`assets/`（cli-icons/document-skill-icons/notification-sounds/payment-icons/plugin-icons/provider-icons 六族——提示音资产对应任务通知音能力）、`git-action-menu/` `git-branch-switcher/`（已并入 Git 行）、`feedback/` `login/` `onboarding/` `shortcuts/` `settings-sync/` `remote-connection/` `cua-permission/` `presentation/` `prompt-editor/` `quickpick/` `browser-use/` `resource-manager/`（均已单列）。

### 6.2 设置页 18 分区与命令面

`SettingsSectionId` union 全量（`packages/ui/src/lib/settingsNavigation.ts:4-22`，隐藏态 :36-45）：

| 分区 | 内容（锚点） | 我方判定 |
|---|---|---|
| general | 系统设置（SettingsPageParts） | ≈（hermes.settings） |
| appearance | 主题三模式（settingsPageConfig.ts:65-69） | ≈ |
| modelProvider | 模型供应商 + 企业套餐（model-provider-section/） | ≈（模型配置有；企业套餐 ×） |
| migration | Claude Code 历史导入（MigrationSection/MigrationCandidatesCard + services/session/claude-native/） | →（原生语义对我方无意义；改造点见 §七 P1-22：换源成 codex/kimi 会话导入） |
| browser | 内嵌浏览器：Chrome profile 导入/清缓存（BrowserSettingsSection + browserImportSummary.ts） | →（我方 browser tab 无数据治理） |
| memory | 记忆库查看/更新时间（MemorySettingsSection/Viewer） | →（IdeMemoryPane 有简版；差设置化入口） |
| plugin | 插件管理（InstalledPluginManagement + 作用域/卸载/配置组） | → |
| mcp | MCP 表单 CRUD + 外部 agent 导入 + 远程同步（McpSettingsSection/ExternalAgentImportDialog/RemoteMcpSyncDialog） | ≈ 表单 / → 导入+同步（G6 余项，✅M3 已做对话式引导） |
| skill | 技能：过滤/启停/安装/导入/上传/远程同步（SkillsSection + RemoteSkillSyncDialog） | →（IDE 内无入口；/hermes/skills 侧有） |
| plugins（旧） | 隐藏，仅偏好迁移兼容 | × |
| usage | 用量：App 用量 + Coding Plan 两 tab（usage-stats/ 14 文件：heatmap/日模型趋势饼图/折线） | →（G7，M1 已记） |
| subagents | 子代理创建/编辑/模型覆盖（SubagentsSection/SubagentReasoningField） | → |
| commands | 自定义命令管理（CommandsSection/CommandForm/CommandCard） | →（ChatInput slash 是静态） |
| hooks | hooks 列表/表单/工作区信任（HooksSection/HookForm/HooksList/WorkspaceHookTrustNotice） | → |
| workspaceFileSearch | .zcodeignore 搜索范围（隐藏但生效） | →（我方命令面板文件区本来就缺，见 IdeCommandPalette.vue:7 注释） |
| computerUse | CUA 权限（隐藏/桌面条件） | ×（CUA 未开源） |
| automations | 隐藏——已升级为主视图 | ×（语义归 §6.1 主视图） |
| shortcuts | 快捷键录制/冲突检测（ShortcutSettingsSection + shortcuts/ 5 文件） | → |

命令面差距：zcode quickPick 17 条（`quickpick/quickPickCommands.ts:98-291`：new-task/open-workspace/settings×2/toggle-sidebar/toggle-terminal/toggle-preview/add-terminal-tab/add-browser-tab/add-review-tab/switch-theme/skills-settings/mcp-settings/feedback/community/product-docs/login|logout），关键词中英双语。我方 IdeCommandPalette：布局开关 3 + 新会话 + RunTrace + cmd:mcp-config（✅M3）+ 导航 8。差：主题切换、add-tab 类、反馈/文档/社群类（× 无后端）、关键词双语匹配。

### 6.3 RPC 通道全量清单（40 个 ServiceChannels，channels.ts:74-149 按域分组）

| 域 | 通道 | 职责（注释锚点） | 我方判定 |
|---|---|---|---|
| 文件/终端 | File / MediaPreview / Terminal / FileWatcher | 文件读写、媒体预览、终端、FS 监视 | ≈（REST files + pty WS；FileWatcher → 无） |
| Git | Git / GitCheckpoint | Git 操作 / 检查点创建与回滚（:81-82；`services/src/git/gitCheckpointService.ts:63,86` createCheckpoint/restoreBetweenCheckpoints） | Git ≈ / checkpoint → |
| 系统 | System / Setting / Credential / Broadcast / ClientConfig / ClientScenes | 系统信息、设置、凭据、跨窗口广播、客户端配置、场景配置 | ≈（settings API）/ Broadcast ×（单窗口形态） |
| CUA | CuaPermission / CuaPipSession | macOS 权限、画中画会话 | ×（CUA fail-closed） |
| 任务/会话 | ZCodeTask / WindowController / ZCodeAgent / ZCodeSession | 任务包装、窗口聚合投影、agent 服务、会话服务 | ≈（chat sessions API + socket） |
| 分享 | ConversationShare | 分享发布/预览/续聊编排（:100-101） | →（exportSession 单向导出） |
| 账号/模型 | OAuth / ProviderSettings / ModelSelection / ProviderProvisioningTarget | OAuth、供应商配置、模型选择、远端供应商下发 | ≈（模型配置）/ OAuth →（G6 needs-auth 余项） |
| 用量 | UsageStats / CodingPlanSubscription | 本地用量统计、订阅购买 | UsageStats ≈（/hermes/usage）/ 订阅 × |
| 扩展生态 | Skills / SkillSync / McpSync / PluginSync / Plugins / PluginManagement / Subagents / Commands / Hooks / Memory | 技能与三同步、插件、子代理、命令、hooks、记忆（:119-138） | Skills ≈（hermes 侧）/ 其余 → 或 ×（见 §6.2） |
| 用户服务 | SettingsSync / Feedback / OnboardingRecord | 首启设置同步、工单、引导记录（:139-148） | × |
| 传输 | PromptAttachmentTransfer | 附件在 host 与远端运行时预传（:143-144） | ×（无远端运行时） |
| 调度 | OffPeakTask | 闲时任务管理（:145-146） | → |

PlatformChannels（Electron IPC，channels.ts:158-424）约 100 条：目录/文件选择、保存、打印 PDF、远程连接、Docker/WSL 探测、窗口/tab 同步、浏览器 guest 治理、CUA 拖拽授权、OAuth/支付 deep link、系统通知+提示音、资源采样、存储扫描清理、自动更新 13 条、编辑器列表/OpenInEditor、遥测上报族——除「通知+提示音」「OpenInEditor」「导出日志 zip」三条有借鉴价值外，其余依赖 Electron 形态 ×。

### 6.4 CLI/运行时能力（apps/zcode-cli）

- **子命令全量**（`packages/cli/src/run.ts:520-570` switch）：tui（默认交互）、prompt（`-p/--prompt`、`--target` 无头）、app-server、agent-server、doctor、login、logout、commands、plugins、skills、hooks、help、version；内部入口：`__internal-search`（嵌入式搜索 CLI）、plugin-host、dwf-child（工作流沙箱子进程 re-exec）。flags：`--attach --mode --browser-use=headless --browser-executable --surface --memory-bench --force-mcs --resume/--continue --cwd --locale --output-format` + 工具禁用列表（run.ts:35-48 约束文案）。
- **TUI slash 命令全量**（`command-center/slash-commands.ts:23-218`）：compact、expert、effort(/variant)、dwf、fork、help、init、login、logout、locale(/language)、resume(/continue)、new(/clear)、rewind、mode、mcp、plugins(/plugin)、model、goal(/target)、skill `<name> [task]`（:219-233 合成提示词先调 Skill 工具）+ 自定义命令。我方 ChatInput slash 无这批语义（mode/goal/rewind/fork 对应 §6.6 类型）。
- **skills-lock.json**：仅 3 条外部技能锁（opentui、vercel-react-best-practices、vercel-react-view-transitions；GitHub 源 + skillPath + sha256），证明其技能体系 = 仓库内置 + lock 固定的第三方 SKILL.md，与 zcode 主仓 `skills` 服务（`services/src/skills/skillDiscoveryWalk.ts` 扫描 workspace/user/plugin 三作用域，`shared/src/skills-types.ts:1`）配套。
- **packages/ 16 个**：adapters、bootstrap、browser-use-plugin、cli、contracts、core、debug、**dynamic-workflow + dynamic-workflow-runtime**（README：纯库 facade + 编译器类型检查/站点分析/污点解释器，运行时子进程沙箱 + NDJSON 桥——与我方 ZCode 侧 dynamic workflow 同源概念，UI 对应 §6.1 的 workflow 卡族与面板）、i18n、node-repl-host、shared-types、superpowers-plugin、swift-bridge（Swift 桥）、telemetry、tui。

### 6.5 其他包特有能力

- `packages/desktop`：host 进程族（资源/MCP/网络遥测采样、内存诊断）、scheduler（cron/闲时派发结算 `desktop/src/scheduler/offPeakDispatchSettlement.ts`）、main 进程（autoUpdater、原生菜单、deep link、Chrome profile 发现与导入、系统通知+提示音、导出日志 zip、CUA 权限面板、多窗口 broadcastHub）。
- `packages/zcode-cua`：**开源构建为 API 兼容占位包**——`package.json:4` "This build ships without Computer Use: every runtime surface reports unavailable and fails closed"，README 同述。即 Computer Use 未随开源发布，M1 表格的 browser-use/ComputerUse 相关项对开源版不可迁移。
- `packages/web`：OAuth 回调页 + ConversationShareLandingPage 分享落地页（8 文件）。
- `packages/server` + `packages/zcode-server-cli`：浏览器宿主（`/ws`、`/ws/host` 握手，channels.ts:497-498）。
- `packages/rpc`：VSCode 风格 proxy-channel（M1 已录，不迁移只借语义）。
- `packages/formal-proof`：形式化证明组件（仓根另有 architecture-policy.yaml / knip.json 治理）。

### 6.6 数据语义深挖（除 usage 外的有价值结构）

`packages/shared/src/zcode-task-types-core.ts`（export 全量，:27-1020）：

- **goal 族**（:62-148）：`ZCodeTaskGoal`（目标+status active/paused/budget_limited/complete）、`ZCodeTaskGoalStats`（M1 G5 已录）、`ZCodeGoalVerification(Timeline)`（目标完成度校验时间线）、`ZCodeTodoGroup`（TodoWrite 投影分组）、`ZCodeTaskGoalChangedPatch`。
- **模式与转向**：`ZCodeTaskMode` = yolo|plan|edit|auto|autoEdit|build（:149）；`ZCodeTurnSteer*`（:441-469，plan_approval_feedback/workflow_refine_feedback 两来源 + sendText/sendGoalCommand/compact 三命令——运行中转向）。
- **附件**：`ZCodePromptAttachment` 五类 image/file/audio/video/pdf（:185-242）。
- **交互**：`ZCodeTaskPendingInteraction` + autoResolution（snooze 语义，:243-263）。
- **变更摘要**：`ZCodeTaskChangeSummary/ChangedFileSummary`（:346-367，任务级文件变更统计）。
- **时间线元数据**：`ZCodeTimelineTrigger` 含 session_memory、`ZCodeContextCompactionTimelineMeta`（压缩事件留痕）、`ZCodeSessionForkTimelineMeta`（fork 事件，:499-547）。
- **任务快照**：`backgroundBashJobs`、`todoGroups`、`goalVerifications` 均随 snapshot 恢复（:1009-1017）。
- **迁移**：`ZCodeTaskMigrationSource = "claudeCode"`（:61）。

其余类型文件：`automation-types.ts`（cron 规则 unit/interval/run 历史/outcome）、`off-peak-types.ts`（闲时任务 + CodingPlanKind + take-number 可用性）、`hooks.ts`（command/process 两类 hook + ToolCallHookMeta）、`conversation-share.ts`（zod 全家：准备/上传/完整性/确认/预览/续聊/错误码）、`background-bash-jobs.ts`（后台任务控制项）、`session-debug.ts`（**rounds 上限 200 条**：eventKey/requestIndex/usage 六项/hitRate/generationDurationMs/tokensPerSecond；**network 上限 100 条**：五种 statusType 含 retry/stalled + 请求响应头 + attempt/maxAttempts/delayMs/idleMs/timeoutMs；cache 聚合四项，:6-82——这是 G8 的直接数据契约）、`usage-stats.ts`（AppUsage heatmap 周/日模型趋势/工具用量/最爱模型 + CodingPlan 按模型/工具明细，:253-362）、`memoryDiagnostics.ts`（main/renderer/utility_host/agent_node 四角色内存采样）、`localTtft.ts` + `v4/telemetry/localTtftObserver`（本地 TTFT 观测）、`subagents-types.ts`（built-in general-purpose/Explore、三作用域、模型覆盖）、`plugin-types.ts`（六组件类型 agent/command/skill/hook/mcp/lsp + marketplace）、`workspace-hook-*`（工作区 hook 信任库/digest/单调性审查）。

### 6.7 模型路由与定价数据核查（对我方成本估算的直接影响）

**结论：zcode 无模型价目表，喂不了我方成本估算。**证据链：

1. `packages/model-option-map`（compiler/evaluator/parser/tokenizer）是受限 CEL 表达式语言，`ModelOptionName = "reasoningLevel" | "maxOutputTokens"`（`src/types.ts:7`）——按模型计算推理档位与输出上限，与价格无关。
2. 全仓 `price/pricing` 命中仅 Coding Plan 订阅 SKU（`packages/ui/src/settings/model-provider-section/enterpriseCodingPlanProducts.ts`、`services/src/coding-plan-subscription/bigmodelCodingPlanSubscriptionProvider.ts`）与 `root/oauthTeamPricing.ts`——套餐价，非 per-token 价目。
3. 逐 token 成本只在运行时从供应商响应聚合：`ZCodeUsageUpdate.cost{amount,currency}`（M1 §三已录）。
4. 模型路由本体：`packages/provider`（registry/config/resolver/sources + effective-model-selection）+ `provider-node`（zcode-builtin 供应商配置的下载/物化/远端同步 `zcode-builtin-provider-config-materializer.ts`）——目录元数据可参考（模型族/端点结构），无价目字段。

我方成本估算若需价目表，需自建（如 LiteLLM 式 community 价目或各供应商官网手动维护），zcode 此仓不可作为数据源。

### 6.8 M1 遗漏判定

M1 表格 14 行覆盖了会话/任务/子代理/技能/终端/Git/文件树/命令面板/浏览器/资源/检查器/用量/白板/分享——这些判定经本轮复核全部维持。M1 **完全未提**的系统级块（本轮新发现）：

1. **工作流可视化族**：app-shell 5 种 workflow tab + components/workflow-{graph,timeline,run-line}（时间线轨道/站点/弧线/产物条/花名册）+ ToolCallBlocks 的 12 个 workflow 工具卡 + CLI dynamic-workflow 编译器。M1 一行都没有。
2. **自动化三联**：cron 定时 + 闲时任务 + 工作流自动化，含 2040 行 AutomationsSection、模板目录、运行历史、desktop 调度器。
3. **插件生态**：plugin-store 主视图（592 行 PluginStorePage）+ marketplace 多源 + 安装/卸载/作用域/配置 + plugin-sync。
4. **@提及系统**：六 provider（file/plugin/session/skill/subagent/whiteboard）+ Lexical mention 节点 + 序列化。
5. **设置页 12 个无对应分区**（§6.2 表 → 行）。
6. **远程工作区**：SSH/Docker/WSL 连接向导 + 远端供应商下发 + 附件预传。
7. 次级遗漏：mentions、TurnNavigator/FileRewind、Elicitation、background bash 面板、SelectionSideChat 真会话版、Claude 历史导入、快捷键设置、反馈中心、自动更新、onboarding、媒体附件五类。

## 七、修订后的完整未迁移清单（M1 G4-G8 + M4 新发现，按 P0-P2）

符号：价值/成本各一句。P0 = 高价值且可近期启动；P1 = 明确该做、排期；P2 = 视产品方向择机或 × 降级。已迁 ✅M2（TPS/水位/命中）、✅M3（对话式 MCP + IdeMcpPane）不入列。

**P0（5 项）**

1. **G8 每轮 rounds 表**（DeveloperToolsPane 对应物）。价值：会话级性能调试硬需求，M2 的 TPS 管道已备好前端原料。成本：前端中——需 socket 逐轮 usage 事件 + 轮次号（后端小改）；network 请求头子面板可后置。落点：`ide/views/IdeRoundsPane.vue` 或 RunTrace 扩展页签。契约直接抄 `session-debug.ts:15-28`。
2. **子代理目录视角**（SubagentDirectorySidePane）。价值：多代理任务的巡览入口，我方只有浮窗单流。成本：低——chatStore.subagentStreams 已有数据，加目录列表 + 点击切流。落点：IdeSubagentsFloat 内加目录列或独立浮窗。
3. **技能管理工作台入口**（SkillsSection 对应物）。价值：IDE 内完成技能过滤/启停/查看，不必跳 hermes 页。成本：低——/hermes/skills 的 API 已在，IDE 内嵌页签（IdeSidePane 加 skill tab）+ 命令面板已有 nav:skills。
4. **Git checkpoint**（git-checkpoint 通道语义）。价值：任务失败回滚到检查点，dsh-TUI「双击 Esc 回溯」同款刚需。成本：中——需 hermes 后端在任务起止打 checkpoint（`git stash`/shadow commit 实现均可参考 `gitCheckpointService.ts`），前端在 IdeGitPane 加时间轴。落点：后端新 route + `ide/api/git.ts` 扩展。
5. **Workflow 运行可视化 MVP**。价值：动态工作流是我方 agent 已有能力（zcode CLI dynamic-workflow 同源），但 /ide 只有文本摘要，run 的阶段/产物/子代理无图。成本：高——先抄 run-line（`components/workflow-run-line/TaskWorkflowRunLines.tsx` 单文件语义：阶段行 + 状态点），timeline/graph 后置。

**P1（19 项）**

6. G4 上下文构成 breakdown（后端 span，仿 run-trace 插件；zcode 六源口径见 M1 §三）。7. G5 目标预算 goalStats 进度条（后端；`ZCodeTaskGoalStats` 七字段契约现成）。8. G7 用量面板升级（heatmap/连续天数/TTFT/工具错误率；`usage-stats.ts:253-262` heatmap schema）。9. @提及系统（先 file+session 两源，MVP 接 ChatInput；zcode 六源 `mentions/providers/`）。10. 会话内查找 + 轮导航（TaskFindDialog + ConversationTurnNavigator）。11. 任务模式六态切换（yolo/plan/edit/auto/autoEdit/build，ChatInput 工具栏 + switch-mode 卡）。12. 运行中转向 turnSteer（sendText/compact 注入运行轮）。13. G6 余项：MCP 外部 agent 导入 + mcp/skill 远程同步（zcode 三 sync 通道语义）。14. 插件生态 MVP（安装/卸载/作用域；plugin-store 主视图后置）。15. Hooks 管理分区（command/process 两类 + 工作区信任）。16. Memory 设置化入口（MemorySettingsViewer 语义并入 IdeMemoryPane）。17. 子代理设置分区（创建/编辑/模型覆盖，`subagents-types.ts` 契约）。18. SelectionSideChat 真会话版（我方 assistant tab 从复制提示词升级为父/子会话，`OpenSelectionSideChatRequest` 语义）。19. 富文本输入升级（mention 节点 + 粘贴图片；Lexical 语义借、Tiptap 实现）。20. 文件树升级（git 状态角标/sticky folder 头/用编辑器打开）。21. G6 needs-auth OAuth 合成工具（后端通道）。22. Claude 历史导入改造（migration 语义换成 codex/kimi 会话导入我方历史）。23. 分享增强（选段导出 + markdown + 续聊；`conversation-share.ts` 契约）。24. 自定义命令管理（CommandsSection：命令文件解析 + IDE 内增删）。

**P2（15 项）**

25. TreemappingPane 文件活动热力图。26. Office 三件套预览（docx/xlsx/pptx + pptx 元素级 + PDF 导出，`previewPaneOffice*` + `presentation/`）。27. 媒体附件（audio/video/pdf 附件预览对话框）。28. 资源管理器升级（进程级 CPU/内存采样 + 存储分类扫描清理，`resource-manager/storage/`）。29. Cron 自动化编辑视图（模板目录 + 运行历史；当前仅跳 hermes.jobs）。30. OffPeak 闲时任务（依赖我方无 Coding Plan 计费体系，先做「闲时=低优先级排队」近似或 ×）。31. 后台 bash 任务面板（BackgroundBashOutputSidePane + `background-bash-jobs.ts` 契约）。32. 快捷键设置（录制/冲突检测）。33. 自动更新体系（× 除非做桌面分发）。34. 反馈中心（× 无工单后端）。35. Onboarding（× 产品流程自有）。36. 远程工作区 SSH/Docker/WSL（价值取决于是否支持远端开发）。37. 桌面系统能力（通知+提示音/导出日志 zip/OpenInEditor；× 依赖 Electron 装机形态）。38. 模型价目表（zcode 无此数据 §6.7；我方自建数据源）。39. CUA Computer Use（×：开源包 fail-closed 占位，无从迁移）。

**总数 39 项**（P0=5 / P1=19 / P2=15）。× 不适用项（33/34/35/37/39 等）保留在列是为防后续产品形态变化时重新评估；近期可执行主体是 P0 全部 + P1 的 6/8/9/10（纯前端或小后端）。
