# ZCode 3.11.2 ↔ /ide 1:1 功能对照表（逐项无遗漏）

**主旨**：以本机安装的 ZCode.app 3.11.2（`/Applications/ZCode.app`，asar 内 i18n 词条 5005 键 / 80 命名空间为全量功能面单一事实源）逐项对照 SwarmStudio `/ide` 主页面的复用现状，标出缺口并裁决本轮实施范围。写给维护者与评审，读后应能回答「ZCode 每个 UI 功能在 /ide 里是什么状态」。

**对照口径**：
- 词条锚点 = asar `out/renderer/assets/IntlProvider-*.js` 内嵌 zh-CN 目录（提取脚本产物 `/tmp/zcode3112/zh.json`，namespace 计数见下）。
- 状态三态：**对等**（upstream/overlay 既有组件复用，列锚点）/ **缺口**（本轮或 backlog）/ **不适用**（ZCode 云端/产品私有特性，给理由或 SwarmStudio 对应物）。
- /ide 既有复用锚点：`custom/client/ide/`（Shell/NavRail/WorkspacePane/TerminalPanel/ChatPane/StatusBar）+ upstream `MessageList/ChatInput/SubagentStreamPanel/FilesPanel(monaco+预览)/WorkspaceDiffPreview` + overlay RunTrace。

## 一、总览计数（80 命名空间 → 分组裁决）

| 分组 | ZCode 命名空间（键数） | 裁决 |
|---|---|---|
| 会话核心 | chat(869) codeBlock(18) diff(10) markdownTable/Image(16) | 对等（MessageList/ChatInput 全家）+ 两处缺口见 §二 |
| 任务/会话管理 | taskList(57) taskGroup(24) taskTimeline(8) taskNav(4) taskSearch(9) sidebar(55) workspaceSidebar(44) projectSelector(2) | 部分：会话切换经 chatStore；**命令面板含任务搜索**（本轮）；分组/置顶/归档 backlog |
| 计划/待办 | planTool(15) todo(4) | 对等（TaskPlanCard 消息内卡）；侧栏计划面板 backlog |
| 子智能体 | subagentDirectory(13) | 对等（SubagentStreamPanel 页签） |
| 终端 | terminal(10) | 对等（IdeTerminalPanel，xterm PTY） |
| Git | git(154) gitGraph(27) | **缺口（本轮 MVP：status/stage/commit/diff；branch 切换/graph/push backlog）** |
| 文件/编辑器 | workspaceFileTree(16) fileTree(2) fileActions(2) codeViewer(71) directoryBrowser(9) | 对等（FilesPanel：树/monaco/docx/pdf/pptx/xlsx/html 预览/右键） |
| 面板布局 | sidePane(34) v4Pane(10) appHeader(22) titleBar(23) workspaceHeader(6) | 部分：三列布局+双列拖拽已有；分屏拆分（v4Pane）backlog |
| 命令入口 | quickPick(57) commandCenter(20) | **缺口（本轮：IdeCommandPalette，Cmd+K）** |
| 输入增强 | （chat.placeholder/attachments/composer 系列，计 chat 内） | 对等（ChatInput：@ 文件引用经 FilesPanel、/ slash、附件、语音、排队 follow-up） |
| 权限模式 | mode(47) | 部分：codingAgents 配置面（CodingAgentConfigView）；IDE 内快捷切换 backlog |
| 定时/闲时 | automations(167) offPeak(80) scheduledPreview(5) | 对等物=Loop 引擎计划项 + JobsView + CockpitScheduleModal（/ide 经命令面板/导航链接）；闲时=ZCode 云特性不适用 |
| 机器人/远程沟通 | bots(251) webRemoteControl(104) | 对等物=Matrix 网关（GroupChatView/ChannelsView/WebhookSettings）+ 微信网关；形态不同（见 §三） |
| 浏览器/电脑控制 | browser(41) cuaPermission(28) | 对等（DesktopBrowserPanel/View）；CUA=ZCode 私有 Helper 不适用 |
| 远程开发 | remote(51) ssh(34) wsl(11) docker(9) remoteConnection(1) | 不适用（SwarmStudio 为本地桌面；远程经 SSH 终端可达） |
| 知识库 | repoWiki(47) wikiReference(20) | 缺口（backlog：仓库 Wiki 生成/引用） |
| 画板 | whiteboard(15) | 缺口（backlog） |
| 观测 | modelTrajectory(51) usage(6) processMonitor(6) tokenDebug(15) | 对等（RunTrace 全家 + UsageView + LogsView/PerformanceView） |
| 设置 | settings(1678) settingsSync(59) developerTools(18) | 对等（SettingsView/ModelsView/McpManagerView/SkillsView/ProfilesView…194 组件面） |
| 账号/商务 | login(32) logout(5) codingPlan(30) manualClaimPlan(55) update*(31) feedback(287) | 对应物=LoginView/登录落点；套餐/营销/自动更新=ZCode 云特性不适用（SwarmStudio 经 gh release 分发） |
| 引导 | onboarding(62) welcome(6) carousel(2) | 对应物=StudioAnnouncementPrompt；弱化不阻塞 |
| 其他 UI 基元 | forms(17) confirmDialog(8) common(15) treemapping(16) notification(11) appError(11) server(12) workspace(13) zcode(14) app(5) desktopMenu(5) mode(47) model(1) locale(1) | 对等（upstream 基元/桌面菜单/desktop patch 体系） |

## 二、本轮实施缺口（feat/ide-zcode-parity）

### G1 命令面板 IdeCommandPalette（对标 quickPick+commandCenter）

- 触发：`Cmd/Ctrl+K`（IdeShell 全局键）+ TopBar 搜索框入口。
- 三区：命令（面板开关/终端切换/新会话/RunTrace/导航到既有功能页：cockpit/loop/kanban/settings…）/ 任务（chatStore.sessions 标题过滤+切换，对标 taskSearch）/ 文件（对标 quickPick.find 文件变更搜索——MVP 经 filesStore 已载入树过滤，深链 FilesPanel）。
- 键盘：↑↓ 选择、Enter 执行、Esc 关闭；分组渲染（命令/任务/文件）。
- 纯 A 类 `custom/client/ide/`，零 server 改动。

### G2 Git 面板 IdeGitPane（对标 git.* 核心 154 键的 MVP 子集）

- server A 类 `custom/server/controllers/ide/git.ts` + patch 285 挂载 `/api/ide/git/*`：
  - `GET status?root=` → `git status --porcelain=v1 -b` 解析（branch/ahead/behind/分组变更列表）
  - `GET diff?root=&file=&staged=` → unified diff 文本
  - `POST stage` {files, staged} → `git add --` / `git restore --staged --`
  - `POST commit` {message} → `git commit -m`
- 安全：spawn 固定参数（零 shell 拼接）、cwd=root、file 参数拒绝绝对路径与 `..`、命令 10s 超时、root 必须通过 `git rev-parse --show-toplevel` 验证为仓库。
- client：`IdeWorkspacePane` 增加「文件 / Git」页签；Git 页 = 变更分组列表（已暂存/未暂存/未跟踪）+ 选中文件 diff 视图（+/- 行着色）+ 暂存/取消暂存 + commit message 输入 + 提交。
- 明确 backlog（本轮不做）：push（需凭据/网络策略）、分支切换器与冲突守卫（git.branchSwitcher.* 46 键）、Git 图谱（gitGraph 27 键）、「上一轮更改」来源（需 checkpoint 体系）。

## 三、不适用项的理由（防止「遗漏」质疑的逐项交代）

- **bots/webRemoteControl**：ZCode 云 relay + 第三方 IM 平台对接。SwarmStudio 对等物是 **Matrix 网关**（群聊/频道/Webhook/桥接，GroupChatView 家族 + loop matrix-bot）与微信网关（iLink），能力同源（远程沟通驱动 agent），产品形态不同，不照搬 UI。
- **offPeak/codingPlan/manualClaimPlan**：ZCode 订阅与云端算力调度。SwarmStudio 本地部署无此商务层；「闲时任务」对等物 = Loop 引擎计划任务（centralized-scheduler）。
- **remote/ssh/wsl/docker 远程工作区**：SwarmStudio 为单机桌面应用；SSH 目标经终端面板直达。若未来出远程形态再立项。
- **cuaPermission/CUA 电脑控制**：ZCode 私有 Helper + macOS 权限体系。SwarmStudio 的桌面自动化走 hermes-agent tools 面。
- **update*/settingsSync**：SwarmStudio 分发走 gh release（用户既定流程），设置本地存储。

## 四、验证

1. server：`custom/server/controllers/ide/__tests__/git.test.ts`——临时目录真实 `git init` 仓 e2e（status 解析/stage/commit/diff/越界参数拒绝）。
2. client：`command-palette.test.ts`（打开/过滤/分组/键盘导航/执行动作）+ `git-pane.test.ts`（渲染分组/stage 调用/commit 调用/错误态）+ workspace 页签切换断言。
3. 门禁：overlay `npm test` 全绿 + `npm run clean && npm run inject` 重放 + `npm run build`（vue-tsc）+ 上游 i18n-coverage（zh/en 成对 patch 286/287）。
