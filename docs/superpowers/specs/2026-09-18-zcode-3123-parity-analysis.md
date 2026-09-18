# ZCode 3.12.3 ↔ /ide 1:1 功能对照表（第二轮：基线 3.11.2 → 3.12.3）

**主旨**：本机已升级 `/Applications/ZCode.app` = **3.12.3**。本文以 3.12.3 为全量功能面事实源，先做版本差分（3.11.2 基线 5005 键/80 命名空间 → 3.12.3 **5446 键/87 命名空间**），再逐命名空间给 `/ide` 三态裁决，供实施计划（plans/2026-09-18-ide-zcode-3123-parity-v2.md）引用。写给维护者与评审，读后应能回答「ZCode 3.12.3 每个 UI 功能在 /ide 里是什么状态、本轮做什么」。

**对照口径**（与 3112 轮一致，锚点升级）：
- 词条锚点 = asar `out/renderer/assets/IntlProvider-DvAen4Dk.js` 内嵌 zh-CN（`p`）/en-US（`m`）扁平目录，提取产物：`/tmp/zcode3123/zh-CN.json`、`en-US.json`、`ns-counts.json`、`ipc-channels.txt`（138 通道）、`keys-<ns>.txt`（新命名空间逐键）。
- 主进程锚点 = `out/{main,preload,renderer,host,scheduler}`；preload 桥 6 个：`index / browserVideoRecorder / codingPlanWebview / cuaPermissionPanel / embeddedBrowserJavaScriptDialog / resourceManager`。
- 三态：**对等**（复用既有组件，列锚点）/ **缺口**（本轮或 backlog）/ **不适用**（ZCode 云端/产品私有，给理由或 SwarmStudio 对应物）。
- /ide 既有锚点：`custom/client/ide/`（Shell/NavRail/TopBar/WorkspacePane[文件+Git 页签]/ChatPane/TerminalPanel/StatusBar/CommandPalette）+ upstream `MessageList/ChatInput/SubagentStreamPanel/FilesPanel(monaco+预览)` + overlay RunTrace；命令面板与 Git 面板已随 0dcf1d9 落地。
- 基线文档：`specs/2026-09-17-zcode-3112-parity-analysis.md`（3.11.2，5005 键/80 ns）。

## 一、版本差分总览（3.11.2 → 3.12.3，+441 键）

| 维度 | 变化 |
|---|---|
| 新增命名空间 13 个 | conversationShare(165) resourceManager(65) startup(41) updateDialog(14) updateReady(8) markdownImage(8) forceUpdate(7) debugInfo(5) modelSelection(2) purchase(2) postUpdateReleaseNotes(2) updateAvailable(1) root(1) |
| 移除/拆分 | processMonitor(6) 上游整体移除；markdownTable 16→10（图片能力拆出为 markdownImage）；update 31→7（拆成 updateDialog/updateReady/updateAvailable/forceUpdate/postUpdateReleaseNotes 更新族）；titleBar 23→21；manualClaimPlan 55→50 |
| 增长 | settings +118（新子域 memory 37、resource 族、taskAutoArchive、indexing 等）；chat +15（排队增强/PDF 视频附件/计划审批）；zcode +10（任务所有权/媒体预算错误）；bots +8（feishu/lark 渠道）；offPeak +9（任务模板轮播）；repoWiki +5（生成配置 meta）；automations +4；feedback +3；common +1；workspace +1 |
| 上游自身缺陷 | en-US 比 zh-CN 多 4 键（`manualClaimPlan.banner.period.daily/oneTime`、`manualClaimPlan.banner.bonus`、`settings.memory.viewer.disabled`）——上游自己 zh 缺翻。/ide 侧继续守 zh/en 成对门禁，**不复制此缺陷** |

## 二、87 命名空间全量三态表

格式：命名空间(3.12.3 键数)[差分标记]。裁决沿用 3112 轮，仅列变化与新增。

| 分组 | ZCode 命名空间（键数） | 裁决 |
|---|---|---|
| 会话核心 | chat(884)[+15] codeBlock(18) diff(10) markdownTable(10)[-6] **markdownImage(8)[新]** | 对等（MessageList/ChatInput 全家）+ 四处缺口见 §三.1-.5 |
| 任务/会话管理 | taskList(57) taskGroup(24) taskTimeline(8) taskNav(4) taskSearch(9) sidebar(55) workspaceSidebar(44) projectSelector(2) | **缺口（M1 首项）**：用户 09-18 裁定 A 案——左栏 1:1 还原富侧栏（任务列表/搜索/置顶/日期分组/归档），正式取代 09-18 NavRail 收敛裁决（9780cfe） |
| 计划/待办 | planTool(15) todo(4) | 对等（TaskPlanCard）；侧栏计划面板 backlog |
| 子智能体 | subagentDirectory(13) | 对等（SubagentStreamPanel 页签） |
| 终端 | terminal(10) | 对等（IdeTerminalPanel，xterm PTY） |
| Git | git(154) gitGraph(27) | MVP 已落地（status/stage/commit/diff）；push/分支切换/graph 维持 backlog（M4） |
| 文件/编辑器 | workspaceFileTree(16) fileTree(2) fileActions(2) codeViewer(71) directoryBrowser(9) | 对等（FilesPanel：树/monaco/office 预览/右键） |
| 面板布局 | sidePane(34) v4Pane(10) appHeader(22) titleBar(21)[-2] workspaceHeader(6) | 部分：三列布局+拖拽已有；分屏（v4Pane）backlog（M4） |
| 命令入口 | quickPick(57) commandCenter(20) | 对等（IdeCommandPalette，Cmd+K，0dcf1d9） |
| 输入增强 | chat.placeholder/attachments/composer 系列（计 chat 内） | 部分：@ 引用、/ slash、图片附件、基础 follow-up 已有；**排队富 UI/PDF 视频附件缺口（M1）** |
| 权限模式 | mode(47) | 部分：codingAgents 配置面；IDE 内快捷切换 backlog |
| 定时/闲时 | automations(171)[+4] offPeak(89)[+9] scheduledPreview(5) | 对应物=Loop 引擎计划项+JobsView（维持）；offPeak 新增模板轮播=云特性不适用 |
| 机器人/远程沟通 | bots(259)[+8] webRemoteControl(104) | 对应物=Matrix 网关+微信网关（维持）；**bots 增量为 feishu/lark 渠道，不适用** |
| 浏览器/电脑控制 | browser(41) cuaPermission(28) | 对等（DesktopBrowserPanel）；CUA Helper 私有不适用（chat.toolCall.cua.zoom 增量同裁决） |
| 远程开发 | remote(51) ssh(34) wsl(11) docker(9) remoteConnection(1) | 不适用（单机桌面；SSH 经终端直达），维持 |
| 知识库 | repoWiki(52)[+5] wikiReference(20) | 缺口 backlog（M4；+5 为生成配置 meta：language/model/maxRetries/timeout/diagrams/commitId） |
| 画板 | whiteboard(15) | 缺口 backlog（M4） |
| 观测 | modelTrajectory(51) usage(6) tokenDebug(15) ~~processMonitor(6)~~ | 对等（RunTrace/UsageView/LogsView）；**上游移除 processMonitor 面，/ide 对应物不受影响** |
| 设置 | settings(1796)[+118] settingsSync(59) developerTools(18) | 大体对等（SettingsView 家族）；**+118 增量逐键复核（M1 盘点）：memory 子域 37 键缺口（M3）、resource 族并入 M2、taskAutoArchive 并入 M4，其余（performanceMode/toolGrouping*/httpProxy/uiFontSize 等）与 SettingsView 逐项对账** |
| 账号/商务 | login(32) logout(5) codingPlan(30) manualClaimPlan(50)[-5] feedback(290)[+3] **purchase(2)[新]** | 对应物=LoginView；套餐/营销不适用，维持 |
| 引导 | onboarding(62) welcome(6) carousel(2) | 对应物=StudioAnnouncementPrompt，维持 |
| **分享** | **conversationShare(165)[新]** | **缺口（M4 对应物）**：云分享服务不照搬；对应物=本地导出 markdown/JSON + Matrix 链接分享，`zcode:share-import` 对应导入。详见 §三.1 |
| **资源管理** | **resourceManager(65)[新]** | **缺口（M2）**：磁盘占用扫描/分类清理/reveal。详见 §三.2 |
| **启动迁移** | **startup(41)[新]** | 不适用：ZCode 本地 DB 迁移启动屏（3.11.3 已裁「内部演进不入 /ide」） |
| **更新族** | **updateDialog(14) updateReady(8) forceUpdate(7) updateAvailable(1) postUpdateReleaseNotes(2)[均新]** update(7)[-24] | 不适用：ZCode 云自动更新重构；SwarmStudio 分发既定走 gh release |
| **模型失效** | **modelSelection(2) root(1)[新]** | 缺口（M1 小步）：模型配置失效 fallback/重选提示 |
| **诊断** | **debugInfo(5)[新]** | 缺口（M1 小步）：消息菜单 Task/Trace/Session ID/Provider popover |
| 其他 UI 基元 | forms(17) confirmDialog(8) common(16)[+1] treemapping(16) notification(11) appError(11) server(12) workspace(14)[+1] zcode(24)[+10] app(5) desktopMenu(5) model(1) locale(1) | 对等；zcode +10 见 §三.11 |

## 三、新增功能面逐项细读（键级锚点）

### 1. conversationShare(165)——会话分享【M4 对应物】
- 面板：标题/权限三档（private 仅自己、linkViewer 链接可看、linkEditor 链接可导入继续）/生成链接/复制/浏览器打开/分享结果弹窗。
- 错误族（13 条）：authenticationRequired、featureDisabled、artifactNotAllowed、limitExceeded、rateLimited、network、safetyCheckTimeout、invalidSelection、invalidConversation、runningTurn、streamingRow、activeToolCall、activeSubagent、inputAttachment、inlineToolImage、unsupportedTimeline。
- IPC：`zcode:share-import`（导入分享）。
- **裁决**：分享服务为 ZCode 云 relay，不照搬；SwarmStudio 对应物=①本地导出会话 markdown/JSON（导入导出双向，对齐 linkEditor 语义）②经 Matrix 房间发送分享卡片（复用既有网关）。列 M4，先出交互稿再动工。

### 2. resourceManager(65)——磁盘资源管理器【M2】
- 扫描：`storage.summaryTotal/scanning/lastScanned/idle/failed/rescan`；磁盘 used/free/total；roots 数据目录树。
- 分类 11 类（category + categoryDescription 双键）：sessionStore 会话记录与数据库 / subagentTranscripts 子代理产物 / toolOutputs 工具输出与临时缓存 / modelTrajectory 模型调用轨迹 / devTraces 开发诊断抓包 / logs 日志与崩溃报告 / backups 备份 / exports 导出与反馈包 / runtimes Agent 运行时与插件 / config 配置凭据工作区 / other。
- 清理：clean/cleaning/cleanSuccess(已释放 {size})/cleanPartial/cleanNothing/cleanFailed/confirmTitle/confirmSize；reveal 在文件管理器显示；estimate 硬链接估算声明；errors 无法读取目录计数。
- IPC：`zcode:storage-start-scan / storage-scan-progress / storage-get-snapshot / storage-clean / storage-reveal-path / storage-cancel-scan`；preload `resourceManager.cjs`。
- **裁决**：纯本地能力，SwarmStudio 无对应物，价值高（runtime 9G/日志/备份清理、防 PTY 泄漏类问题定位）。M2 实施：A 类 server controller（spawn 安全口径同 git.ts）+ 设置页分区。

### 3. markdownImage(8)——聊天图片查看器【M1】
- previous/next 上一张下一张、zoomIn/zoomOut、download（downloadStarted/downloadSucceeded→{path}/downloadFailed）。
- **现状核查**：upstream client 全仓无 lightbox/zoom 实现（rg 零命中）→ 确认缺口。落点：MessageList 图片消息点击放大灯箱。

### 4. chat.queue.*——富排队消息【M1】
- 队列操作：enqueue(.description)/drag 拖拽排序/sendNow/runNow/edit（editDraftConflict/editRestoreFailed）/remove。
- **turnSteer.steering 转向**（运行中插队改向）+ followup.addToQueue。
- 暂停族：paused.stopped/error/generic、resume(.description)、sendConfirm（title/description/clear/keep）。
- **现状核查**：MessageList 仅基础 follow-up（rg 命中 1 文件）→ 确认缺口。落点：ChatInput 排队区 + chatStore。

### 5. chat.attachments——PDF/视频附件【M1】
- 上传扩类：preview.openPdf/openVideo/pdfLoading/pdfUnavailable/videoLoading/videoUnavailable/videoUnsupported、oversizedInlinePdf/oversizedInlineVideo、missingInlinePdfContent、upload.queued、draft.suggestedPrompt.createPdf(.prompt)。
- **现状核查**：chat 类附件 accept 仅 `image/png,image/jpeg,image/webp`（GroupChatPanel 等处）→ PDF/视频缺口。落点：ChatInput accept 扩类 + 消息内预览复用 FilesPanel `PdfFilePreview`，视频预览新增。

### 6. 计划/审批增强（chat 内新增键）【M1 小步】
- elicitation.planApproval.{approve,approveDescription} 计划审批卡片；goal.planModeBlocked、plan.attachmentsBlocked 拦截原因；plan.removeMarker；statusPanel.sessionPlans/planFallback/openPlan；toolbar.model.startPlanGuide(.dismiss)。
- 配额类 planUsage.*/quota.startPlan.*（weeklyQuota/toolQuota/并发限制）= ZCode Start Plan 云特性，**不适用**。

### 7. 模型失效提示【M1 小步】
- modelSelection.invalidated.fallback（已切默认模型）/ .reselect（请重选）+ root.modelSelection.loadFailed + zcode.error.ZCODE_RUNTIME_MODEL_UNAVAILABLE。落点：ChatInput 模型按钮失效态与 toast。

### 8. debugInfo(5)【M1 小步】
- taskId/traceId/sessionId/provider/copied。落点：消息右键/更多菜单诊断 popover，RunTrace 深链。

### 9. settings.memory.*（37 键）——工作区记忆查看器【M3】
- viewer：title/description（按工作区保存的记忆）、projects 工作区选择+搜索、files 树+搜索、记忆条目计数、updated 相对时间族（justNow/minutesAgo/today/yesterday/weekday/date…）、indexMissing=MEMORY.md（未生成）、fileLoading/fileDeleted/fileTooLarge（5 MiB 上限）/fileChanged/noSelection、collapse/expand、localOnly 声明、refresh。
- **裁决**：SwarmStudio 对应物=hermes/zcode 工作区记忆目录（AGENTS.md、memory/）查看器。M3 实施：A 类只读浏览+搜索+预览（复用 FilesPanel 预览器）。

### 10. settings 增量键面（+118）【M1 盘点，缺项分批】
新子域/新键代表（与 SettingsView 逐项对账后补缺）：memory(37→M3)；resourceFilter/resourceActions/resourceGroup(→M2)；taskAutoArchive(Days)(→M4 任务归档)；indexing(6)；toolGroupingExplore/Terminal/Changes（工具输出分组渲染）；performanceMode；modelIoFullRetention；askUserQuestionAutoResolution；zcodeInteractionBehavior(3)；notification/notificationSound；keepAwakeWhileRunning；closeToTrayOnWindows；embeddedBrowserAllowInsecureCertificates；nativeSearchEnhancements；httpProxy 族（NoProxy/CaCertPath）；dataBaseDir 族（browse/copying/copyFailed/forbiddenInstallDir/restartRequired）；receivePreviewUpdates；autoDownloadAndInstallUpdates（更新类不适用）；uiFontSize；integratedTerminalShell；terminalProfile/terminalFontFamily；showLineNumbers/wrapLongLines/fontSize；desktopChromiumHardwareAcceleration。
- 大子域现状：modelProvider(594)/plugins(247)+plugin(39)/usage(143)/skills(125)/mcp(102)+mcpServers(29)/subagents(86)/commands(66)/hooks(60)/migration(46)/browser(44)/computerUse(14)——3112 轮判对等；3.11.3 增量「插件按工作区安装/新版本提醒更新」需复核（见 §四遗留）。

### 11. zcode.error 增量（+10）【P3 backlog】
- 任务所有权族：TASK_OWNED_BY_OTHER_HOST（任务在另一已连接视图运行）/ STALE_TASK_OWNER_COMMAND / NO_ACTIVE_TASK_OWNER / OWNER_COMMAND_FAILED——对应 SwarmStudio 多实例 fleet 的任务归属语义，P3。
- MEDIA_BUDGET_CURRENT_IMAGE/VIDEO_TOO_LARGE → 并入 M1 附件限制提示。
- CLAUDE_UNKNOWN_COMMAND(_WITH_ARGS)、providerBusiness 补码（1005/1006/3001-3010/429/2007）→ 错误文案表对账。

### 12. 其余增量（维持原裁决）
- bots feishu/lark(+8)：飞书/Lark 注册二维码/WebSocket 运行态——对应物=Matrix 网关，不适用。
- offPeak(+9) 任务模板轮播/keepAwakeBanner：云闲时特性，不适用（对应对 Loop 引擎）。
- startup(41)：本地 DB 迁移启动屏，不适用（3.11.3 已裁）。
- 更新族 5 ns（32 键）：自动更新重构，不适用（gh release 分发既定）。
- purchase(2)/manualClaimPlan(-5)/codingPlan：云商务，不适用。
- titleBar(-2)/markdownTable(-6→拆分)/manualClaimPlan(-5)：上游重构或收缩，无 /ide 动作。

## 四、3.11.3 通报项复核（9 条功能，本机已从 3.11.2 升至 3.12.3，全部可复测）
- 会话面 4 条：计划模式排队优化（→ §三.4 M1）、PDF 上传/预览（→ §三.5 M1）、媒体预览（→ §三.3/三.5 M1）、操作拦截显示具体原因（→ §三.6 M1）。
- 管理面 2 条：插件按工作区单独安装、插件新版本提醒更新——**映射 settings.plugins(247+39) 复核项，并入 M1 盘点**。
- 其余 3 条（OpenCode Go 模板/模板横幅/DB 初始化）：不入 /ide 复用面，维持。

## 五、主进程面锚点（防「只看渲染层」遗漏）
- IPC 138 通道全量：`/tmp/zcode3123/ipc-channels.txt`。与 /ide 相关的族：storage-*（M2）、share-import（M4）、browser-view-*（已有 DesktopBrowserPanel 对应）、task-notification*（通知）、window-tabs/focus-tab（多窗）、print-to-pdf/save-file/select-file(s)/select-directory（原生对话框）、open-in-editor/open-in-file-manager（外部打开）。
- preload 6 桥、独立 host/scheduler 进程：SwarmStudio 对应走 desktop patch 体系与 hermes 服务端，不逐桥照搬。

## 六、验证与守门
1. **词条快照守门**：本对照表计数（87 ns/5446 键）与逐 ns 键数固化为守门测试输入（`docs/superpowers/notes/zcode-3123-catalog.json` 入库），防本机再升级后口径漂移。
2. i18n zh/en 成对门禁（patch 286/287 机制）继续；不复制上游 4 键 zh 缺翻。
3. 像素基线：实施计划 M0 采集 ZCode 3.12.3 固定视口逐面截图，与 /ide 同尺寸对照（用户 1:1 要求的验收载体）。
