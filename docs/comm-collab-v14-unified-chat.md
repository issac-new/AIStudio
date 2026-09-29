# 沟通协作 v14 · 统一聊天轮 —— 设计与分期计划（2026-09-29）

> 本文是本轮的唯一设计正本。输入：用户 2026-09-29 两条指令与整合深度裁定（§0）。产出：
> 双侧栏根因与两套聊天协议的源码实证（§1-§2）、目标架构裁决（§3）、Phase 1 UI 统一与 Phase 2
> 协议统一的分期实施计划（§4-§6）。本轮只落本文档，代码实施按 §6 分期表逐期申请执行。

## 0. 指令与裁定

| 日期 | 输入 | 裁定 |
|---|---|---|
| 2026-09-29 | 指令一：重构沟通协作，整合左栏「工作流」（房间/会话/群聊/agents）与中栏群聊、会话 UI，避免存在两个侧栏 | 纳入 Phase 1 |
| 2026-09-29 | 指令二：统一聊天，不再区分 matrix 群聊、agent 群聊、agent 单聊；一个聊天 UI 支持与本机 agent 单聊/群聊及与远端 matrix 一起聊天 | 拆为 Phase 1（UI 统一）+ Phase 2（协议统一） |
| 2026-09-29 | 整合深度三选一问询 | 用户裁定：UI + 协议层统一（「仅 UI 统一」「仅出文档」两案否决） |

术语约定：**matrix 群聊**指经 homeserver（synapse 服务端）同步的多方房间，远端可达；**agent 群聊**指 hermes group-chat（本地 Socket.IO + SQLite，房间成员含本地 agent）；**agent 单聊**指 hermes session（会话即上下文，单 agent 一问一答）。

## 1. 现状实证：双侧栏与三聊天分置

### 1.1 双侧栏根因：中栏内嵌画布各自带侧栏

中栏按选择类别分派三个画布（`custom/client/ia2/components/flow/SessionCanvas.vue:48-52`）：room → MatrixRoomCanvas、group → 上游 GroupChatView、chat → 上游 ChatView。其中两个上游画布自带完整侧栏，与左栏构成双侧栏：

| 画布 | 内嵌侧栏 | 证据 |
|---|---|---|
| group | 房间列表 + PageSidebarNav + PageSidebarFooter | `upstream/hermes-studio/packages/client/src/components/hermes/group-chat/GroupChatPanel.vue:2133`（`v-if="!props.standalone && showSidebar"`）；GroupChatView 未传 standalone（`upstream/hermes-studio/packages/client/src/views/hermes/GroupChatView.vue:69-73`） |
| chat | 会话列表 + PageSidebarNav | `upstream/hermes-studio/packages/client/src/components/hermes/chat/ChatPanel.vue:2345,2351`（`v-if="currentMode === 'chat' && !standalone"`）；ChatView 的 standalone 只认 `route.meta.standaloneChat`（`upstream/hermes-studio/packages/client/src/views/hermes/ChatView.vue:27`），ia2 路由未设（`custom/client/ia2/routes.ts:98-106`） |
| room | 无（正面先例） | `custom/client/matrix-chat/components/MatrixRoomCanvas.vue` 头注释明示「**无房间列表**（工作台左栏即导航）」 |

两个附带缺陷同源：

- **高度**：两 View 根节点 `height: calc(100 * var(--vh))`（GroupChatView.vue:76-80；ChatView.vue:107-116），嵌入三栏中栏后被外层 `overflow: hidden` 裁切，输入区有被切风险；ChatView 已备 `--standalone { height: 100% }` 兜底但未启用。
- **越界逃逸**：深链指向已失效房间/会话时，兜底 `router.replace` 跳上游整页路由（GroupChatView.vue:36,42 → `hermes.groupChat*`；ChatView.vue:50-55 → `hermes.chat`），用户被踢出工作台。

### 1.2 为什么不能直接挂现成的 `meta.standaloneChat`

`isStandaloneChatPage`（`upstream/hermes-studio/packages/client/src/App.vue:105-107`）除了控制 `showAppSidebar`（:113-125，工作台 `fullscreen` meta 已覆盖）与 `showWebPet`（:170-176），还门控六个全局弹层的显隐：SessionSearchModal（:324）、DefaultCredentialPrompt（:328）、ProviderConfigurationPrompt（:331）、GlobalPendingActions（:334）、RuntimeRestartPrompt（:337）、StudioAnnouncementPrompt（:340）。这批条件不含 fullscreen。ia2 聊天路由若挂 `standaloneChat`，会把上游 GlobalPendingActions（cockpit 深链依赖，见 `custom/client/ia2/routes.ts:9-10`）等全局层从工作台整体砍掉。

**裁定 F**：新增独立 meta key `standaloneEmbed`，只被 ChatView/GroupChatView（经 patch）消费，App.vue 零感知。

### 1.3 三聊天「合一」的实际边界

v12.3 R4b 的「三聊天合一」统一了容器与导航：左栏三小节（`custom/client/ia2/components/flow/FlowNavPanel.vue:66-70`）+ 中栏 SessionCanvas 分派；渲染树、数据源、会话模型仍是三套独立实现。另外存在第四聊天面 IDE IdeChatPane（`custom/client/ide/views/IdeChatPane.vue` 头注释：刻意不嵌 ChatPanel 整面板以避免其自带会话侧栏），本轮不动，列 §7 演进。

## 2. 协议现状：两套系统的实证

### 2.1 matrix 侧（远端可达的协同通道）

| 能力 | 状态 | 锚点 |
|---|---|---|
| 人用房间聊天（列表/消息/线程/反应） | 已存在，客户端 matrix-js-sdk 直连 homeserver | `custom/client/matrix-chat/stores/matrix-client.ts:72-177`；房间列表 `stores/matrix-room.ts:302-308` |
| 后端代理边界 | 已存在但只三类：登录换 JWT、synapse 管理端用户 CRUD、单向出站发送（RACI 派发/每日 Brief/loop 状态）；房间 join/sync/收发不经后端 | `custom/server/matrix/routes.ts:41-104`；`custom/server/matrix/raci-matrix.ts:49-72,94-140`；`custom/server/loop/graph/brief-matrix-delivery.ts:51-57` |
| agent 身份供给 | 部分存在：provision 建人类号 + `@name-agent` 助理双号已产品化；但凭证不落 hermes profile `.env`（`MATRIX_HOMESERVER/ACCESS_TOKEN/USER_ID` 消费侧只读现成值），全靠手工 | `custom/server/governance/registry-admin.ts:79-90`；`custom/server/matrix/gateway-env.ts:93-107` |
| 房间邀请 agent | 部分存在：RACI 建房自动邀（invite 随建房）；网页客户端收邀自动入房；hermes 运行时被邀自动入房但有邀请人白名单门（`MATRIX_ALLOWED_USERS`） | `raci-matrix.ts:56-63`；`matrix-client.ts:144-149`；`upstream/hermes-agent/plugins/platforms/matrix/adapter.py:2244-2256` |
| agent 运行时收发 | 部分存在/未接线：hermes MatrixAdapter 具备 sync/join/send/E2EE/mention 门控全家桶与 `matrix_room_list/invite/create` 工具集，但 SwarmStudio 未把它拉起；loop 的 MatrixBot 定义完好、生产代码零实例化 | `adapter.py:812` 起；`upstream/hermes-agent/plugins/platforms/matrix/tools.py:142,193,249,340-347`；`custom/client/loop/engine/matrix-bot.ts:6-76`（仅测试实例化） |
| 协议事件 | 部分存在：`com.swarmstudio.task.assign/receipt` 的消费方是成员的 Studio 网页客户端（须在线）；`agent.message` 徽章事件两端皆无读写 | `custom/client/matrix-teams/stores/task-dispatch.ts:44-75,175-218`；`custom/client/matrix-teams/protocol.ts:22` |

### 2.2 本地 agent 群聊（hermes group-chat）

架构一句话：单一 Socket.IO namespace `/group-chat` + SQLite `gc_*` 表 + 服务端编排器；人、agent、审批、执行队列共用一条双向实时通道，agent 是「连回本进程的 socket 客户端」且被显式视为不可信传输（mention 路由只认服务端签发的可信元数据）。

- 消息模型是 LLM 对话行：`role/user|assistant|tool` + `tool_calls/tool_name/finish_reason/reasoning*` + 结构化 mention（`upstream/hermes-studio/packages/server/src/modules/studio/sockets/group-chat.ts:59-89`）；一次 run 产生多条流式增量、终态才落库，run 分组是客户端重建（`upstream/hermes-studio/packages/client/src/stores/hermes/group-chat.ts` 的 mapGroupMessages/groupAgentRunMessages）。
- agent 是一等房间成员：`RoomAgent`（agent 类型 hermes/ekko/codex 等、scoped/global、executor server|remote，`sockets/group-chat.ts:244-265`）；agent socket 凭进程内随机密钥接入（`services/group-chat/agent-clients.ts:40`）。
- 编排闭环全在服务端：结构化 mention 或 LLM 路由 → `processMentions` → `runAndWait` → 流式回灌；handoff 深度限制、执行队列、审批/澄清环、房间 summary 压缩均在本地状态。

### 2.3 本地 agent 单聊（hermes session）

会话即上下文：REST 会话 CRUD + `/chat-run` socket 执行；单 agent、一问一答，无成员/mention/路由/handoff/summary（`upstream/hermes-studio/packages/server/src/modules/studio/routes/sessions.ts:7-61`；`upstream/hermes-studio/packages/client/src/stores/hermes/chat.ts:456-502` Session 模型）。

### 2.4 桥接差异清单（协议统一的工程量地图）

| 维度 | 本地群聊现状 | matrix 侧缺口 |
|---|---|---|
| 消息模型 | LLM 语义行（tool_calls/流式/run 分组客户端重建） | 只有 typed events；无流式语义；run 分组需 `m.relates_to` 或桥侧重建 |
| 身份 | agent 一等成员（RoomAgent 元数据在本地表） | agent 需 bot 账号或虚拟用户承载 sender 语义 |
| 执行回灌 | 同 socket 私密回灌 + 可信元数据驱动 handoff；审批/队列/summary 全本地 | 无服务端到客户端的私密通道；编排状态无处安放 |

结论：matrix 能统一传输与身份（消息/媒体/成员/加入），统一不了编排（流式、handoff、队列、审批、summary）。这直接推出 §3 的架构裁决。

## 3. 目标架构与裁决表

| # | 分叉 | 裁定 | 否决的备选 |
|---|---|---|---|
| D1 | 统一到哪层 | matrix 为**传输与身份层**（远端在场）；本地 GroupChatServer 内核保留为**编排器**；新增 ChatBridge 桥服务双挂两侧 | 全量迁 matrix：编排状态无处安放，流式/审批/队列语义全失。纯 UI 统一：用户已否 |
| D2 | 流式语义 | 本地流式、matrix 终态（run 结束后整段发回） | matrix chunk 模拟流式：事件风暴，列演进 |
| D3 | agent 在 matrix 的身份 | 复用 `@<user>-agent` 单 bot 账号，agentId/agentType 随消息 content（援引架构总设计裁决 C） | 每 agent 独立账号 / synapse application service 虚拟用户：侵入大，列演进 |
| D4 | 侧栏 | 工作台左栏是唯一侧栏；画布内嵌侧栏经 `standaloneEmbed` 隐藏 | CSS 藏侧栏：死按钮残留，高度与逃逸缺陷不治 |
| D5 | 新建入口 | 左栏「＋ 新聊天」一个入口选类型（agent 单聊 / agent 群聊 / matrix 房间） | 保留各画布内建入口：侧栏变相回归 |
| D6 | 消息内核 | Phase 1 保留三内核分派（统一壳）；桥接落地后按收敛情况再评估合并 | 本轮重写统一时间线组件：三套消息模型差异大，风险前置 |

## 4. Phase 1 · UI 统一（纯前端 + 2 个 upstream patch）

### 4.1 左栏单列表（FlowNavPanel）

- 房间/群聊/会话三小节并为单一「聊天」列表：按 lastActivityAt 降序混排；行首 kind 小图标（# 房间 / 群聊 / 单聊）替代分节；未读徽标、同名消歧后缀、挂接任务簇、双击进 IDE 语义全部保留（现有实现锚点 `FlowNavPanel.vue:137-174`）。
- 数据侧零新源：`useSessionRows` 已产三类行（`custom/client/ia2/composables/useSessionRows.ts:42-44`），补统一排序键即可。
- 循环节、agents 名册（R7-C）、顶部四个入口（概览/收件箱/治理/账户）不动。
- 群聊行补管理动作：hover 删除按钮走 `store.deleteRoom` + 当前房路由兜底，补偿被隐藏侧栏失去的右键删除。

### 4.2 中栏统一壳（SessionCanvas）

- 统一头部：对象名 + 参与方/成员条 + 动作区（现 SessionWorkbenchPanel 四块收敛为一行 chips 条）；消息区与输入区位置三类别一致。
- **patch A（ChatView）**：standalone 判定改为 `route.meta?.standaloneChat === true || route.meta?.standaloneEmbed === true`；越界兜底 replace 在 standaloneEmbed 分支改跳 `/app`。
- **patch B（GroupChatView）**：同判定；`<GroupChatPanel :standalone="...">`；根节点挂 standalone class 并补 `height: 100%`；越界兜底同步改 `/app`。
- ia2 路由 `s/chat`、`s/chat/:sessionId`、`s/group/:roomId` 三条挂 `meta: { standaloneEmbed: true }`。
- 两个 patch 走 `overlay/zcode-patches/` 纪律（编号顺延 series）。

### 4.3 新建入口（FlowNavPanel foot 重排）

「＋ 新聊天」弹出三选：agent 单聊 → `/app/s/chat`（既有新会话态路由）；agent 群聊 → overlay 侧 NDrawer 容器复用上游 CreateRoomForm（`upstream/hermes-studio/packages/client/src/components/hermes/group-chat/CreateRoomForm.vue`，GroupChatPanel.vue:3528 同源引用）+ `store.createNewRoom` + 跳 `ia2.groupRoom`；matrix 房间 → 沿用现 inline 建房输入（`FlowNavPanel.vue:247-259`）。foot 保留 ＋新循环 与 管理。

### 4.4 i18n 与守门

- 新键（zh/en 成对）走 473 locale 单一事实源流程（加键 → 重生成 → clean + inject）。
- 测试扩展：`custom/client/ia2/__tests__/workbench-flow.test.ts`（单列表/图标/动作断言）、`routes.test.ts`（standaloneEmbed meta 断言）；两个 patch 的注入产物过 tsc。
- 浏览器走查（`npm run dev` :8649）：三类会话各开一例、左栏唯一侧栏、无越界跳转、输入区不被裁切。

### 4.5 明确不做

不动 IdeChatPane；不改上游 standaloneChat 既有语义；不合并三套消息内核；不做 matrix 侧任何服务端改动。

## 5. Phase 2 · 协议统一（server + runtime）

### P2A 身份供给闭环（约 0.5 天，server）

provision 建号后自动完成：初始密码换 access token → 写目标 agent 的 hermes profile `.env`（`MATRIX_HOMESERVER/ACCESS_TOKEN/USER_ID`）→ roster 增记绑定列。锚点：`registry-admin.ts:79-90`（扩展），`gateway-env.ts:93-107`（消费侧不动）。

### P2B 房间对话桥 ChatBridge（核心，约 2-3 天，server）

新 overlay 服务（`custom/server/matrix/chat-bridge.ts` 起步）：

1. 订阅：以 bot 账号 long-poll `/sync`（起步方案；synapse application service 接入列演进）。
2. 入向：桥内房间的 `m.text` → 解析 @agentId mention → 调本地编排入口（GroupChatServer 消息处理等价路径）。
3. 出向：run 终态以 `@<user>-agent` 身份发 `m.text` + `com.swarmstudio.agent.message` 徽章事件（D2/D3）。
4. 编排全留本地：handoff 深度、执行队列、审批环、summary 触发不搬。
5. 验收（实弹）：本机 synapse + element-web 远端账号 @ 本地 agent，agent 回答落房间，工作台左栏该房间行未读可见变化。

### P2C 协议消费者 runtime 化 + 审批远端化（约 2 天）

- hermes-agent 侧新增 `com.swarmstudio.task.assign/receipt` 消费插件，把 `task-dispatch.ts:175-218` 的客户端消费逻辑 runtime 化（assign → 本地 kanban 建卡 → 回执），成员不在线也可执行。
- `approval.requested` 映射 matrix 消息（reaction 面已有基线）或带外链接，远端可批。

### P2D 统一徽章事件（约 0.5 天）

`agent.message` 写读两端落地（bot 徽章渲染 + 发送）；`agent.profile` 能力声明写入（消费侧 `task-dispatch.ts:232` 已就绪）。

## 6. 分期总表与门禁

| 期 | 内容 | 规模 | 门禁 |
|---|---|---|---|
| Phase 1 | UI 统一（§4） | 约 1 天 | overlay 全量 vitest + tsc + 浏览器走查 + patch 注入验证 |
| P2A | 身份供给闭环 | 约 0.5 天 | provision → token → .env 实弹链路测试 |
| P2B | ChatBridge 最小环 | 约 2-3 天 | 双端实弹（synapse + 远端账号）+ 协议事件契约测试 |
| P2C | runtime 消费者 + 审批远端化 | 约 2 天 | 离线成员 assign 实弹 + 审批复测 |
| P2D | 徽章事件 | 约 0.5 天 | 事件读写对账测试 |

实施守则：每期独立 worktree + feature 分支、Conventional Commits、完成合 main 推 origin；upstream 改动只经 patch；涉构建的 inject 验证在共享树空闲时执行。当前在途 worktree 已 4 个（超并行上限 3；其中 2 个为 /tmp 下他会话 detached 残留），Phase 1 开工前先核对收口。

## 7. 风险、未决与演进

- **synapse 可达性**：远端同聊以 homeserver 可达为前提（产品默认本机 synapse，上游 LoginView 默认 localhost:8008）；断连时的降级呈现未决，P2B 实施时定。
- **白名单运维**：`MATRIX_ALLOWED_USERS` 决定谁能邀 agent 入房，P2A 需给出默认配置面。
- **体验差异**：matrix 侧见 run 终态不见流式（D2）；运行中状态呈现（typing 近似 vs 自定义 state）未决。
- **并行在途**：共享树处于 0.7.25 迁移分支（落后 main 111 提交，携带在途未提交改动）；`.claude/worktrees/fix/upstream-sb` 为 09-16 旧上游拷贝残留（仅品牌名差异，与本轮无关，可清理）。Phase 1 实施从最新 origin/main 起。
- **v13 遗留合流**：遗留 1（[STEER] 运行中插话）与遗留 2（@提及五级路由）的依赖面与 P2B 的 mention 路由天然合流，实施 P2B 时一并评估。
- **演进项**（不在本轮）：IdeChatPane 第四面归属；matrix chunk 流式模拟；per-agent 独立账号 / application service；统一时间线组件（三内核收敛）。
