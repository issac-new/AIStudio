# IDE 工作台编程/工作双模式（2026-10-18）

**主旨三句话**：把 IDE 工作台从"只有编程形态"补齐为 zcode 3.15.x 同款的「编程模式 / 工作模式」双形态——工作模式是同一任务会话内核上的呈现降噪，并让新建任务按模式分流到编码引擎或通用助手。受众是 IDE 日常使用者，读完应能验收切换入口、模式差异与任务创建行为。

## 依据（2026-10-18 全量调研，锚点见 `docs/upstream-analysis/2026-10-18-latest-coding-tools-matrix.md`）

- zcode v3.15.1 自身有 `InterfaceMode = "office" | "coding"`（`upstream/zcode/packages/ui/src/lib/interfaceMode.ts:1-8`），存储键 `zcode-interface-mode`，历史值 `general`/`concise` 归一到 `office`；默认快捷键 `CmdOrCtrl+Shift+u`（`packages/shared/src/shortcutCommands.ts:98`）。
- 办公模式的差异全部在呈现层：隐藏终端与审查入口（`App.tsx:997-998`、`WorkspaceTerminalToggleButton.tsx:29`）、工具卡不展开、执行细节不显示（`ToolCallBlocks/renderers/execute-group.tsx:55`、`changes-group.tsx:301-309`）、仅保留文件管理器打开方式（`WorkspaceEditorButtonGroup.tsx:69`）、设置页有模式说明（`settingsPageHelpers.tsx:325-344`）。
- 外部产品同样把工作模式定义为共享内核：OpenAI Work 隐藏 Git/shell/diff 但不换引擎；Qoder 编程/通用共享任务引擎、权限与执行器；MiniMax 用 `AppMode = coding | work` 切提示词；Antigravity 干脆不切模式。详见 `web-products.md` §5 与 `tools-batch1.md` §4。
- 当前 IDE 新建任务永远创建 zcode 编码会话并绑工作区（`custom/client/ide/views/IdeTaskSidebar.vue:335-347`、`IdeChatPane.vue:153-174`），工作型任务没有落点。

## 设计

### 1. 界面模式（呈现层，单一事实源）

- 类型 `IdeInterfaceMode = 'coding' | 'work'`；存储键 `hermes_ide_interface_mode`；`normalizeInterfaceMode` 接受 `work|office|general|concise` → work，其余 → coding（兼容 zcode 历史值语义）。
- 效果表集中在 `custom/client/ide/utils/interface-mode.ts` 的 `interfaceModeEffects(mode)`，返回 `{ showTerminal, showReview, collapseToolDetails, wrapCode, defaultSideTab }`，组件只消费这张表，不各写判断。
- 入口三处：状态栏模式 chip（点击切换）；命令面板「切换编程/工作模式」；快捷键 `Cmd/Ctrl+Shift+U`（编辑态不劫持，避免吞输入法/字母键）。
- 工作模式的具体差异：
  - 右侧辅助栏隐藏 `terminal`、`review` 两个页签；若当前停留在被隐藏页签，回落 `defaultSideTab`（files）。
  - 命令面板隐藏终端/审查直达项。
  - 工具卡只保留摘要（`collapseToolDetails` → 聊天列加 `is-ide-work-mode` 类，CSS 折叠工具详情区并强制 `pre-wrap`）。
  - 会话列头部仍保留权限/模型/计划等控件；不隐藏能力，只降噪（与 zcode 一致）。

### 2. 工作任务（内核分流）

- 模式派生：`sessionTaskMode(session)` = `session.codingAgentId ? 'coding' : 'work'`。不新增服务端字段，历史会话按同一规则解释（hermes 原生会话即工作会话）。
- 新建任务：
  - 编程 → 现有配方 `newChat({ agent: zcode, codingAgentId: zcode, codingAgentMode: 'scoped', source: 'coding_agent', workspace: root, ...默认模型 })`。
  - 工作 → `newChat({ agent: 'hermes', source: 'cli', workspace: null })`；不绑仓库，模型取 Hermes 当前选择。
- `IdeChatPane.ensureSession`：
  - 有活动会话就保留（工作会话不再被"agent 不匹配"顶掉）。
  - 无活动会话时按 `ide.taskMode`（新建任务模式偏好）决定创建哪种。
  - 编码 agent 切换只对编程会话重建；工作会话不因 agent 选择变化重建。
- 模型取源：编程会话用 Ycode/zcode 目录（既有逻辑）；工作会话用 `appStore.modelGroups`，避免把 zcode 模型写到 hermes 会话上。
- 任务侧栏：顶部新增「编程 / 工作」双按钮（同时是新建模式选择），任务行显示模式徽标（编/工），搜索同时匹配标题与模式词。
- 工作会话空态：显示四类起步提示（写文档/做表格/出幻灯片/做调研），点击把一句起始指令发到当前会话（真实发送，不做假按钮）。

### 3. 不做

- 不复制 zcode 的 office 模式"主动推荐/文件管理器打开方式"（依赖桌面宿主能力，Vue 工作台无对应面）。
- 不改上游 `MessageList` 组件接口；工具卡折叠用 IDE 容器 CSS 实现。
- 不接执行模式（plan/build/edit/yolo）会话内生效——另一并行会话已接服务端会话档 REST；本轮不重复、不冲突。
- 不做 artifacts 统一评审面板、SSH/Docker/WSL 远程工作区、Gen UI/Plugin UI 沙箱（记录在矩阵 G4-G7，后续轮次）。

## 决策记录

- D-1：工作模式以 zcode 的 office 模式语义实现为呈现层模式，而不是第二套运行时。理由=底座 zcode 3.15.1 的源码定义如此（`interfaceMode.ts`），Qoder/OpenAI 也共享内核；另造运行时会让权限、协议、事件三套分叉。
- D-2：模式词用「工作模式」对用户，内部值 `work`；归一化接受 zcode 的 `office/general/concise`。理由=用户指令用词是 work 模式；同时保证从 zcode 迁来的存量选择不丢。
- D-3：效果表单一事实源 `interfaceModeEffects`，组件不各写判断。理由=模式差异横跨侧栏/命令面板/聊天列/状态栏，散写必然漂移（本仓 2026-10-18 模型目录双形态漂移同因）。
- D-4：快捷键用 `Cmd/Ctrl+Shift+U`，与 zcode 默认绑定一致；编辑态不劫持。理由=保持跨工具肌肉记忆，且避免在输入框里误吞字符。
- D-5：工作模式隐藏终端与审查，不隐藏文件/记忆/工具/看板等。理由=zcode 原文只禁 `supportsTerminal`/`supportsReview`；隐藏过多会让工作模式不可用。
- D-6：工作任务创建 hermes 原生会话（无 codingAgentId、不绑仓库）。理由=Qoder 通用模式按 folder 组织、OpenAI Work 隐藏 Git/shell/diff；工作型任务不应被迫进仓库上下文。
- D-7：任务模式由 `codingAgentId` 派生，不加服务端字段。理由=零迁移、历史数据同一规则可解释；新增字段需要跨客户端/服务端/会话投影三处改动，收益不足。
- D-8：模型取源按会话类型分流。理由=Ycode 目录里的模型 id 不在 Hermes 目录内，混用会误报失效（2026-10-18 已发生过同型事故）。
- D-9：工作会话空态提示点击即真实发送一条起始指令。理由=假按钮违反本仓"不装已实现"纪律；发送后用户仍可在输入框改写。
- D-10：不改上游 MessageList 接口，工具卡折叠用容器 CSS。理由=上游复用件无插槽，开 patch 的维护成本高于 CSS；zcode 的差异本身也是呈现层。

## 验收

- 单测：`interface-mode.test.ts`（归一化/效果表/快捷键匹配）、`task-mode.test.ts`（会话派生）、`task-sidebar`（双模式新建与徽标）、`side-pane`（工作模式隐藏终端/审查并回落）、`command-palette`（工作模式隐藏入口）、`statusbar`（chip 切换与持久化）、`ide-chat-work`（工作会话保留/创建、模型取源）。
- 双 tsc 零错；全量 vitest 零失败；`build:full` 通过；IDE 冒烟 11/11、自检 CLI 0 失败。
- 8649 浏览器走查：切换模式后侧栏/命令面板/工具卡/代码换行四处差异可见；快捷键与状态栏 chip 双向同步；刷新后模式保持；工作模式新建任务不绑工作区、任务行徽标正确。
