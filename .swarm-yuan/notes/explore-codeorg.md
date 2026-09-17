# 代码组织探查报告（流A ① 代码组织子代理，2026-09-16）——全量穷举+调用链+编排约束

> 探查根 = overlay/。所有计数命令可复跑核验。

## 一、组件库全量清单

### 1.1 前端 UI 组件（.vue 全量 = 146）

核验：`find custom/client -name "*.vue" | wc -l` → 146

- `chat/`（1）：components/GatewayNoticeBanner.vue
- `cockpit/`（37）：views/CockpitView.vue + components/ 36：CockpitAttention / CockpitChatPane / CockpitCollabBar / CockpitCollabMap / CockpitColumnRail / CockpitCompletionModal / CockpitConfirmDialog / CockpitFileNode / CockpitFilePanel / CockpitFileTree / CockpitFleetGrid / CockpitGraphNode / CockpitHistoryModal / CockpitIcon / CockpitKanban / CockpitModeBar / CockpitNotifyModal / CockpitRunTraceModal / CockpitScheduleModal / CockpitTeamSwitcher / CockpitTemplateManager / CockpitTerminalPane / CockpitTimeline / CockpitTopBar / CockpitWorkspace / RunTraceGraph / RunTraceInspector / RunTraceNodeDetail / RunTraceOverview / RunTraceScrubber / RunTraceSkillDrilldown / RunTraceTimeBand / RunTraceTimelinePanel / RunTraceTopology / TaskLifecycleView / TimeRangeSlider
- `ia2/`（18）：views/ 7（IaShell / LoopCockpitView / OrchestrateView / RunsView / InboxView / TasksView / CommsView）+ components/ 11（AlarmList / AttentionStrip / GraphEnginePolicyCard / MindViz / MindViz3D / RunLinks / SpecDetail / SpecList / StatusDistributionCard / TraceabilityMatrix / TriageQueue）
- `kanban/`（14）：views/SwarmKanbanView.vue + components/ 13（KanbanAttachments / KanbanAttentionStrip / KanbanBoard / KanbanBulkBar / KanbanColumn / KanbanDiagnosticsSection / KanbanInlineCreate / KanbanMarkdown / KanbanOrchestrationPanel / KanbanTaskCard / KanbanTaskDrawer / KanbanTaskForm / KanbanToolbar）
- `loop/`（26）：views/LoopDetailView.vue；components/ 10（LoopApprovalDialog / LoopCreateWizard / LoopDetailPanel / LoopGraph / LoopHealthPanel / LoopListPanel / LoopModal / LoopOnboarding / StageRing / VerifierPanel）；graph/ 3（components/GraphRenderer.vue、views/GraphDetailView.vue、views/GraphSpineView.vue）；orchestrator/ 3（components/EditorCanvas.vue、NodeConfigPanel.vue、views/SpecEditorView.vue）；runcenter/ 9（components/ApprovalPanel、InboxPanel、NodeInspector、RunGraphCanvas、RunListTable、RunStageBadge、RunTimeline + views/RunCenterView.vue、RunDetailView.vue）
- `matrix-chat/`（50）：views/MatrixChatView.vue + components/ 49（MatrixChatPanel / MatrixClearMessagesDialog / MatrixContextMenu / MatrixCreateRoomDialog / MatrixDateSeparator / MatrixEventTileFooter / MatrixExportDialog / MatrixExtensionsCard / MatrixFilePanel / MatrixForwardDialog / MatrixInviteDialog / MatrixJoinRoomDialog / MatrixLeaveRoomDialog / MatrixMemberInfo / MatrixMemberList / MatrixMessageActionBar / MatrixMessageBody / MatrixMessageContextMenu / MatrixMessageInput / MatrixMessageItem / MatrixMessageList / MatrixMessagePanel / MatrixMessageTimestamp / MatrixPinnedMessagesCard / MatrixPollHistoryPanel / MatrixReactionPicker / MatrixReactionsRow / MatrixReadMarker / MatrixReadReceiptGroup / MatrixRedactDialog / MatrixReplyChain / MatrixReportDialog / MatrixRightPanel / MatrixRoomHeader / MatrixRoomList / MatrixRoomSearchView / MatrixRoomSettingsPanel / MatrixRoomSummaryCard / MatrixRoomView / MatrixSenderProfile / MatrixShareDialog / MatrixSpinner / MatrixStateEvent / MatrixThreadMessagePreview / MatrixThreadPanel / MatrixThreadSummary / MatrixThreadView / MatrixTimelinePanel / MatrixTypingNotification）

注：branding/ 无 .vue（仅 index.ts 空壳注册）。

### 1.2 Composables（12 非测试）

| 文件（相对 custom/client/） | 职责 |
|---|---|
| chat/useGatewayNoticeBanner.ts | 网关告警横幅 dismiss 状态（localStorage 按 session 前缀记忆） |
| cockpit/composables/computeGridLayout.ts | Run Observatory 全局聚合视图网格布局（X 轴按任务 cluster 时序分列） |
| cockpit/composables/computeLayeredLayout.ts | 拓扑图分层有向布局（边依赖分层+连通分量分组）——RunTraceTopology.vue 唯一消费 |
| cockpit/composables/sessionTaskId.ts | 会话标题提取 kanban 任务 ID 纯函数（extractKanbanTaskId/matchSessionTaskId） |
| cockpit/composables/useForceLayout.ts | d3-force 力导向布局（cluster 聚拢、cluster 间排斥） |
| cockpit/composables/useKanbanTaskGraph.ts | kanban 任务主轴全局聚合图（拉全 board→BFS 任务树→关联会话重建 trace） |
| cockpit/composables/useRunTrace.ts | RunTrace 核心：live（connectChatRun 订阅 14 种事件）/replay 双模 + L2 拉取合并 |
| cockpit/composables/useRunTraceOverview.ts | 全局聚合视图：跨 profile 全会话 trace 重建合并单一 state |
| cockpit/composables/useTaskLifecycle.ts | 任务全生命周期聚合数据源（TaskLifecycleView 用） |
| loop/runcenter/composables/useRunReplay.ts | 时间轴回放（cursorIndex=已重放事件数语义） |
| matrix-chat/composables/useEventTileClassState.ts | Matrix 事件 tile CSS class 状态推导 |
| matrix-chat/composables/useEventTileData.ts | Matrix 事件 tile 展示数据推导 |

### 1.3 状态管理（Pinia defineStore = 11 + 2 非 store 模块）

| Store id | 文件 | 领域 |
|---|---|---|
| cockpit | cockpit/store/cockpit.ts:104 | AI 协作中心主 store（1638 行级大 store，舰队/任务/布局） |
| ia2 | ia2/store/ia.ts:11 | 驾驶舱单页当前区域 + RETRO 回退开关 |
| ia2-workspace | ia2/store/workspace.ts:52 | 跨 board 任务聚合/workspace 流生命周期（P3 Task 8 从 cockpit store 拆出） |
| graph | loop/graph/store/graph.ts:9 | Graph 实例/定义（loop REST + graph REST 驱动） |
| runCenter | loop/runcenter/store/runs.ts:70 | runs 列表 + /graph socket 订阅增量 + 断线重连 resubscribe |
| loop | loop/store/loop.ts:9 | LoopInstance/contracts 列表 |
| matrix-client | matrix-chat/stores/matrix-client.ts:22 | matrix-js-sdk client 生命周期 |
| matrix-room | matrix-chat/stores/matrix-room.ts:18 | 房间列表/当前房间 |
| matrix-thread | matrix-chat/stores/matrix-thread.ts:17 | 线程 |
| matrix-composer | matrix-chat/stores/matrix-composer.ts:11 | 消息输入框 |
| matrix-right-panel | matrix-chat/stores/matrix-right-panel.ts:27 | 右栏面板状态 |

非 store 模块：cockpit/store/cockpit-kv.ts（KV 持久 helper + PendingLink 草稿类型）、matrix-chat/stores/matrix-events.ts（跨 store 轻量事件总线，破解循环依赖）。

### 1.4 adapters / services / api / types / utils

- cockpit/adapters/（14）：attention-adapter（注意力分级）/ chat-adapter（matrix/chat/group 三类消息归一 ChatMessage）/ collab-adapter / event-adapter（kanban 事件投影）/ fleet-adapter（舰队 WS 客户端类型+流）/ history-adapter / inbox-adapter（统一注意力收件箱纯函数合并排序）/ notify-adapter / run-trace-adapter（TraceState 事实源：applyRunEvent/fetchLayer2Trace/mergeLayer2Data/replayMessagesIntoState）/ search-adapter / task-adapter / teams-adapter（团队注册表 REST 客户端+看板聚合端点）/ topology-adapter / trace-event.ts（统一事件契约，对齐 AgentScope AgentEvent）/ trace-middlewares.ts（中间件洋葱链）
- cockpit/api/（2）：kanban-extras.ts（薄 re-export，wrapper 已迁主 client patch 166）、terminal-tools.ts
- cockpit/terminal/（1）：terminal-tools.ts（TERMINAL_TOOLS 优先级 claude-code > codex > deepseek-harness）
- cockpit/styles/（2）：cockpit.scss、status-colors.ts（语义色统一映射）
- ia2/adapters/（6）：inbox-center（五源聚合介入收件箱+Triage+自动归档投影）/ mind（思维大脑本体论纯投影）/ mind3d（3D 力导向内聚投影）/ orchestrate / overview / traceability（工作项↔run 追溯矩阵投影）
- loop/adapters/stage-adapter.ts；loop/api/（2）：loop-rest.ts、loop-socket.ts
- loop/orchestrator/（2 非组件）：adapters/editor.ts（可视化编排器纯函数层）、spec.ts（GraphSpec 校验/分析 client 薄 re-export）
- loop/runcenter/（非组件）：adapters.ts（投影总入口）、adapters/always-allow.ts、adapters/inbox.ts、adapters/intervention.ts（peek/审批 payload/A2 超时识别）、adapters/run-graph.ts（事件日志→执行图状态机投影）、api.ts（REST+/graph socket 封装）、types.ts（结构化最小形状，避免 custom→server import）
- loop/types.ts：Loop 共享类型 client 出口（事实源 server 侧 custom/server/loop/types.ts）
- matrix-chat/：utils/formatStateEvent.ts、utils/usernameColor.ts（element-web 同款用户名着色）
- kanban/utils/tenant-parser.ts；chat/gateway-notice.ts（isGatewayNotice）

### 1.5 后端 custom/server（72 非测试 .ts + 3 .d.ts + 10 测试）

- controllers/hermes/（3）：fleet.ts（舰队快照/审批/澄清/看板聚合/团队 CRUD）、terminal-tools.ts（PATH 探测 claude/codex/dsh）、trace.ts（RunTrace L2：读 ~/.hermes/traces/ JSONL→TraceNode[]+TraceEdge[]，内联 isPathWithin 防路径遍历，不 import 上游 trace.ts:13-43）
- loop/controllers/（2）：loop.ts（Loop REST）、graph.ts（旧 graph 视角 REST）
- loop/engine/（14）：loop-engine（核心 tick）/ scheduler / centralized-scheduler / verifier / subagent-dispatcher（execFile 派发）/ worktree-manager / budget-guard / billing / stuck-detector / hooks / lease-manager / matrix-bot / task-contract / team-approval（run-spawner 在 graph/）
- loop/connectors/（3）：github-connector / local-git-connector / webhook-connector
- loop/graph/（28）：graph-assembly.ts（**生产装配唯一入口**，factory-DI 零上游 import）/ graph-rest.ts / graph-socket.ts（/graph namespace 转发 GraphService.onEvent）/ graph-service.ts（进程内 Run 注册表+回放数据层）/ graph-runtime.ts（super-step BSP 执行器）/ graph-definition.ts（链式 GraphDef 构建器）/ graph-spec.ts（可序列化 DSL+hydrate+校验）/ graph-compiler.ts（LoopInstance→GraphSpec）/ loop-to-graph.ts / event-log-store.ts（append-only 事实源 InMemory/SQLite）/ checkpoint-manager.ts / channel-store.ts（LangGraph 式分通道 reducer）/ node-registry.ts / phase-nodes.ts（五阶段节点工厂）/ predicate.ts / run-spawner.ts / shadow-runner.ts / spec-runtime.ts / interrupt-timeout.ts / kanban-persistence.ts / daily-brief.ts + brief-matrix-delivery.ts（R1 每日简报 Matrix 投递）/ mind-projection.ts（思维大脑数据源，直读 kanban.db）/ graph-migrate.ts / next-tick.ts / verifier-bridge.ts / workspace-context.ts / types.ts
- loop/services/loop-socket.ts（/loop Socket.IO namespace）
- loop/store/（6）：state-store.ts（接口）/ store-factory.ts（auto-detect local/matrix/saas）/ local-store.ts / matrix-store.ts+matrix-client.ts / saas-store.ts（PG）
- loop/types.ts — Loop 共享类型唯一事实源
- matrix/（5）：index.ts+routes.ts（/api/matrix 空壳 stub）、session-store.ts（应用内 Matrix 登录会话落盘，供 Brief 投递身份）、gateway-env.ts（凭据第三级回落）、admin-service.ts
- security/url-guard.ts（SSRF 出站到私网拦截，kanban attach-URL 用）
- services/hermes/（7）：command-post.ts（2.13 装配 initCommandPost+setupCommandPostWebSockets）、fleet-events.ts、fleet-snapshot.ts、fleet-tap.ts（ChatRunSocket tap 桥）、kanban-overview.ts（看板服务端聚合 10s 缓存+WS 扇出）、teams-store.ts（JSON 原子写）、task-workspace-cache.ts
- kanban/index.ts — 空壳 stub

### 1.6 自定义 API 端点全量（REST 39 条）

| 方法 路径 | 位置 |
|---|---|
| GET /api/hermes/terminal-tools | controllers/hermes/terminal-tools.ts:90 |
| GET /api/hermes/fleet/sessions | fleet.ts:51 |
| POST /api/hermes/fleet/approval | fleet.ts:60 |
| POST /api/hermes/fleet/clarify | fleet.ts:86 |
| GET /api/hermes/kanban/overview | fleet.ts:112 |
| GET /api/hermes/teams | fleet.ts:116 |
| POST /api/hermes/teams | fleet.ts:120 |
| PUT /api/hermes/teams/:id | fleet.ts:137 |
| DELETE /api/hermes/teams/:id | fleet.ts:159 |
| GET /api/hermes/sessions/:id/trace | controllers/hermes/trace.ts:481 |
| GET /api/loop/loops | loop/controllers/loop.ts:67 |
| GET /api/loop/loops/:id | loop.ts:75 |
| POST /api/loop/loops | loop.ts:85 |
| PATCH /api/loop/loops/:id | loop.ts:149 |
| DELETE /api/loop/loops/:id | loop.ts:161 |
| POST /api/loop/loops/:id/tick | loop.ts:170 |
| POST /api/loop/loops/:id/pause | loop.ts:179 |
| GET /api/loop/loops/:id/contracts | loop.ts:188 |
| GET /api/loop/loops/:id/events | loop.ts:194 |
| POST /api/loop/contracts/:id/approve | loop.ts:203 |
| POST /api/loop/webhook/:loopId | loop.ts:222 |
| GET /api/loop/patterns | loop.ts:232 |
| GET /api/graph/graphs | loop/controllers/graph.ts:17 |
| GET /api/graph/graphs/:id | graph.ts:29 |
| GET /api/graph/graphs/:id/events | graph.ts:45 |
| GET /api/graph/runs | loop/graph/graph-rest.ts:150 |
| GET /api/graph/runs/:id | graph-rest.ts:164 |
| POST /api/graph/runs/:id/resume | graph-rest.ts:172 |
| POST /api/graph/runs/:id/fork | graph-rest.ts:191 |
| GET /api/graph/runs/:id/replay | graph-rest.ts:210 |
| GET /api/graph/runs/:id/export | graph-rest.ts:226 |
| GET /api/graph/specs | graph-rest.ts:253 |
| GET /api/graph/specs/:id | graph-rest.ts:258 |
| POST /api/graph/specs | graph-rest.ts:269 |
| DELETE /api/graph/specs/:id | graph-rest.ts:296 |
| POST /api/graph/specs/:id/runs | graph-rest.ts:305 |
| POST /api/graph/runs/:id/start | graph-rest.ts:319 |
| GET /api/graph/engine | loop/graph/graph-assembly.ts:296 |
| GET /api/graph/mind | graph-assembly.ts:312 |

WS 通路 4 条：/loop namespace（loop-socket.ts，patch 135 挂载）；/graph namespace（graph-socket.ts，assembly 惰性绑定）；/api/hermes/fleet/events 与 /api/hermes/kanban/overview/events（patch 197 挂载 + patch 251 白名单放行）。

### 1.7 注册装配 registries/（6 文件）

registries/client/index.ts：registerRoute(L20)/registerNavEntry(L24)/registerComponent(L28)+三 getter。entry.mts=入口 shim（复制上游 main.ts 序列）。bootstrap.ts=调度器。registries/server/{entry.mts,bootstrap.ts,index.ts}=全空壳（entry.mts:12-13 明示预留）。

全部注册点：
- cockpit：registerNavEntry ×1（{id:'hermes.cockpit', label:'AI Collaboration Center', section:'agent'}，cockpit/index.ts:24-28）；路由静态在 patch 240（/hermes/cockpit + chat/session/history/global-agent/swarm-kanban/matrix-chat 嵌套子路由，240:20-74）
- loop：registerRoute ×4（hermes.loop /hermes/loop→LoopCockpitView；hermes.loopRuns /hermes/loop/runs→RunCenterView；hermes.loopRunDetail /hermes/loop/runs/:runId→RunDetailView；hermes.loopDetail /hermes/loop/:id→LoopDetailView，loop/index.ts:21-48）
- loop/graph：registerRoute ×2 redirect（/hermes/graph→/hermes/loop；/hermes/graph/:id 剥 graph- 前缀，graph/index.ts:12-22）
- ia2：registerRoute ×1 含 8 子路由（ia2.shell /app fullscreen→子 ia2.overview/orchestrate/runs/runDetail/inbox/tasks/comms/commsRoom，ia2/index.ts:22-25 + ia2/routes.ts:66-126）+ router.beforeEach 守卫 installIaCompatGuard（旧 loop 深链→ia2.runs，RETRO=1 放行）+ applyColdStartRedirect
- matrix-chat：动态注册均 no-op（路由静态在 patch 071）
- kanban/branding：仅 console.log 无注册项
- registerComponent 全库零调用

### 1.8 配置 config/（3 文件）+ feature flags

config/bootstrap.ts（路径常量 ncwkRoot/upstreamRoot/patchSeriesFile/overlayEntry）；config/loop-config.ts（loop 环境探测参考快照，工厂直读 env）；config/features.ts 客户端旗标：

| Flag | 环境变量 | 默认 | 控制 |
|---|---|---|---|
| matrixChat | VITE_CUSTOM_MATRIX_CHAT | on | bootstrap.ts:12 |
| matrixAuth | VITE_CUSTOM_MATRIX_AUTH | off | matrix 登录链路 |
| matrixAdmin | VITE_CUSTOM_MATRIX_ADMIN | off | matrix admin |
| kanbanEnhancements | VITE_CUSTOM_KANBAN_ENHANCEMENTS | on | bootstrap.ts:16 |
| branding | VITE_CUSTOM_BRANDING | on | bootstrap.ts:20 |
| extendedI18n | VITE_CUSTOM_EXTENDED_I18N | on | 运行时空壳（翻译经 patch 进 locale） |
| loopEngineering | VITE_CUSTOM_LOOP | on | bootstrap.ts:30（loop+graph 双注册） |
| cockpit | VITE_CUSTOM_COCKPIT | on | bootstrap.ts:26 |
| iaRetro | VITE_IA_RETRO | off | ia2 guard 放行旧 loop 落点 |

服务端旗标：GRAPH_ENGINE=legacy|shadow|on（默认 legacy，graph-assembly.ts:29-37 readEngineMode）；LOOP_STATE_ADAPTER + DATABASE_URL/PGURL/LOOP_PG_URL + LOOP_MATRIX_*（store-factory 自动探测）。

### 1.9 patches/（257 个 .patch；series 启用 220；禁用 30；孤儿 4）

核验：`ls patches/*.patch | wc -l` → 257；`grep -cE '^[0-9]{3}-.*\.patch$' patches/series` → 220；禁用 30（044-054 i18n locale stale、v0.6.20 合并退役 076/077/082/083/086/090/091/093、使命完成摘除 108/133/149 等）；孤儿（磁盘存在 series 零引用）142/145/147/152。非 .patch 文件 3 个（series、074/075 同名 _en.ts/_zh.ts payload 副本）。另有 .archived-patches/。

编号段功能分组：000 测试基建（vitest alias）；001-017 Matrix 基建（schema/config/vite presbundle/sessions-db/auth/api/controllers/service/middleware+element-web middleware 008+sdk dep 017）；020-039 Matrix 客户端集成+kanban 增强+branding+kanban routes/service/controller 及测试(037-039)；040-060 desktop rebrand 041-043+i18n locale 044-054（多 stale）+matrix 组件测试 055-060；070-102 Cockpit 落地（070-075 App/router/sidebar/LoginView/i18n）+kanban workspace files(078)+echarts(080)+group-chat(085-089)+gateway-notice(094-096,101-102)+files root(097-100)；103-132 lunar+agent-health proxy(107)+runtime pin(108)+侧栏/设置+rebrand(111)+trace api(114)+sessions parent-id(116)+workspace kind(117)+run-trace 默认(118)+desktop preload/sandbox/window-raise/webui(119-132)+files allowlist(123-124)；133-140 Loop 落地 nav/server routes/socket/cron-parser/lockfile/pg dep+loop i18n；141-157 Windows 兼容轮；158-163 i18n 补缺+vite custom alias(160)；164-186 kanban v0.19/v0.20 迁移全链；187-194 i18n dedup+runtime local priority(188)+terminal tools(189-191)+PTY 泄漏修复(192-194)；195-201 2.13 指挥中心 command-post+vue-tsc 修复(201)；202-216 loop graph P1/P2/P3+runcenter i18n；217-232 ia2 六区域 IA i18n+settings graph engine card(228)+observer/caliber i18n；233-249 desktop identity(233)+sessions tests(235)+cockpit 平行共存(240-241)+always-allow i18n+loop graph 入口(246-248)+matrix keys(249)；250-251 agent health loaded_platforms+fleet WS 白名单；252-264 loop cockpit 单页+思维大脑 mind i18n+three dep(260)+3D/cortex i18n；265-274 Windows/麒麟跨平台轮（ACP 265/发现 266/node-pty 267/沙箱 268/日志 269/cli-shim 270）+mind detail i18n(271-272)+agent tests pin(273)+登录落 cockpit(274)。

### 1.10 测试（140 个 .test.ts，15 个 __tests__ 目录）

- client/__tests__ 1：upstream-terminal-ws-lifecycle（挂上游 TerminalView 验证 patch 192 PTY 修复）
- client/chat/__tests__ 2：gateway-notice、useGatewayNoticeBanner
- client/cockpit/__tests__ 40：全部 14 adapter + cockpit 组件/store + kanban-extras/terminal-tools/files-root-plumbing/swarm-studio-contract/use-force-layout/use-run-trace
- client/cockpit/composables 1：useTaskLifecycle（colocated）
- client/ia2/__tests__ 18：cockpit-view/compat-guard/engine-policy-card/ia-shell/ia-views/inbox-center/inbox-components/mind-adapter/mind3d-adapter/observatory-components/orchestrate(-components/-editor)/overview-adapter/routes/traceability(-components)/workspace-store
- client/loop/__tests__ 29：loop 引擎全谱（**client 目录承载 server 引擎测试**）
- client/loop/graph/__tests__ 23：assembly/brief-matrix-delivery/checkpoint-manager/daily-brief/event-log-store/graph-compiler/graph-e2e/graph-runtime(-guards)/graph-service(-hardening)/graph-spec/graph-specs-store/interrupt-timeout/kanban-persistence/loop-to-graph/node-registry/phase-nodes/predicate/run-spawner/spec-runtime/verifier-bridge/workspace-context
- client/loop/orchestrator/__tests__ 2；client/loop/runcenter/__tests__ 10
- desktop/__tests__ 3：after-pack-combined（patch 267 钩子实跑）、cli-shim-shell-profile（270）、linux-sandbox（268）
- server/controllers/hermes/__tests__ 2；server/loop/graph/__tests__ 1（mind-projection）；server/matrix/__tests__ 2；server/security/__tests__ 1（url-guard）；server/services/hermes/__tests__ 4
- upstream-compat/__tests__ 1：coding-agents-cross-platform（patch 265/266 守门，直 import 上游 server 模块）

## 二、调用链路分析

### 2.1 前端启动链
vite.config.overlay.ts:26 把 /src/main.ts 重定向→registries/client/entry.mts:39-41 createApp→pinia→router→:47-50 i18nReady 后 use(i18n)→:51 动态 import bootstrap→bootstrap.ts:9 bootstrapClient(app)：:12 matrixChat→import（no-op）；:16 kanbanEnhancements；:20 branding；:26 cockpit→registerCockpit（nav+cockpit.scss）；:30 loopEngineering→registerLoopEngineering(4 route)+registerGraphEngineering(2 redirect)；:40-44 无条件 registerIa2+installIaCompatGuard(router)；:49-51 getRegisteredRoutes() 逐个 router.addRoute（mount 前）；:54-57 registerMatrixChatRoutes（no-op）；:62-65 applyIaColdStartRedirect（isReady 后补跑）→entry.mts:53-61 router.isReady+no-match 重导航→:63-65 finally app.mount('#app')。旗标走 config/features.ts:23-33 import.meta.env.VITE_*（:4-7 注释记录 process.env 浏览器崩 ReferenceError 教训）。

### 2.2 Cockpit RunTrace 数据流（最典型链路）
生产侧：custom/hermes-agent-plugins/run-trace/（plugin.yaml hooks+otel_formatter.py）写 JSONL 到 ~/.hermes/traces/，经 patch 118 _seed_run_trace_plugin 植入 profile。服务端：custom/server/controllers/hermes/trace.ts:481 GET /api/hermes/sessions/:id/trace 读 JSONL（TRACE_DIR :48）→llm_span/tool_span/subagent_span 聚合（:342/433）→TraceNode[]+TraceEdge[]；isPathWithin 内联（:36-42）；patch 114 把 traceRoutes 挂进上游 bootstrap/routes.ts。客户端 adapter：run-trace-adapter.ts fetchLayer2Trace(:378)→request('/api/hermes/sessions/${id}/trace')（:397，request 来自上游 @/api/client）；applyRunEvent(:348)→normalizeRunEvent（trace-event.ts）→applyTraceEvent（trace-middlewares.ts 洋葱链）；mergeLayer2Data(:414)；replayMessagesIntoState(:570)；buildCrossSessionEdges(:490)。composable：useRunTrace.ts:72——live 模式 connectChatRun（上游 @/api/studio/chat）订阅 14 种 TRACE_EVENTS(:43-58)；replay 模式 fetchSessionMessagesPage+resumeSession；removeSocketListener(:60) 防泄漏。组件：CockpitRunTraceModal.vue→RunTraceOverview/RunTraceTopology（computeLayeredLayout 算坐标→echarts）/RunTraceTimelinePanel/RunTraceScrubber/RunTraceInspector+RunTraceNodeDetail/RunTraceSkillDrilldown/RunTraceTimeBand；聚合视图 useRunTraceOverview+useKanbanTaskGraph 供 RunTraceGraph/TaskLifecycleView+useTaskLifecycle。

### 2.3 Loop graph 链路
server custom/server/loop/graph/ 是引擎本体：graph-assembly.ts 唯一装配入口（L1-3 factory-DI 零上游 import）；createGraphAssembly(opts)：readEngineMode(:29-37 GRAPH_ENGINE 三态)→EventLogStore 主/影(:133)、GraphService、KanbanPersistenceAdapter、RunSpawner、InterruptTimeoutScanner、ShadowRunner(:228 shadow 时)、createGraphRunRouter+自挂 /api/graph/engine(:296)/api/graph/mind(:312)→tryBindSocket 惰性绑 /graph namespace（graph-socket.ts 转发 onEvent 原值零翻译）。event-log-store.ts append-only 事实源（InMemory 默认/SQLite .loop/graph.db，含 GraphSpecStore 表）。client custom/client/loop/graph/ 是薄消费面：index.ts 仅 2 redirect 路由；store/graph.ts 吃 loop REST+graph REST；views/GraphDetailView/GraphSpineView+GraphRenderer 渲染；runcenter/api.ts+store/runs.ts 吃 /graph socket（断线重连 resubscribe）。client 运行时零 import server（runcenter/types.ts:2）；唯一跨层 import 在测试：client/loop/graph/__tests__/assembly.test.ts:9-22 相对路径直测 server 装配。

### 2.4 后端路由注册链
① inject.mjs:247-279 ensureServerCustomSymlink（server/src/custom→overlay/custom/server）② B 类 patch 直接改上游 packages/server/src/bootstrap/routes.ts：patch 114（trace）/134（loopRouter+graphRouter+LoopEngine/Scheduler 装配）/189（terminal-tools）/196（initCommandPost+fleetRouter）/202（createGraphAssembly+graphAssembly.router）/036（kanbanDashboardUrlRoutes）③ WS 挂载改上游 bootstrap/http.ts：patch 135（/loop）/197（fleet/overview WS+shutdown steps）/251（upgrade catch-all 白名单）④ registries/server/entry.mts:14 仅 import 上游 index（server registry 骨架空置）。

### 2.5 Matrix chat 链路
前端 50 vue+6 stores+2 composables+2 utils，直连 homeserver（matrix-js-sdk 经 patch 017/040 入上游 deps）；行为镜像 element-web（usernameColor.ts 头注释等）。路由双轨：cockpit 子路由（patch 071 静态）+ia2 comms 内联（routes.ts:106-121）。服务端 custom/server/matrix/：session-store/gateway-env/admin-service，routes.ts /api/matrix 空壳。element-web 本体由 patch 008 挂静态中间件。

### 2.6 Electron/IPC 接触面
结论：custom 零直接 IPC/desktop 实现代码；desktop 改动全经 patch 作用于上游 packages/desktop/。证据：custom/desktop 仅 3 个 __tests__；grep ipcMain|ipcRenderer|contextBridge 仅命中测试；desktop 面 patch 041-043/106/109/119/121/126-132/141/143/145-158/177/188/207/233/267-270。

## 三、编排约束清单（11 条，各带证据）

1. **patch series 顺序即语义**：inject 按 series 行序 git apply，后序 context 依赖前序产物。新增 patch 改同一文件必须放既有之后并按当前上游+全前序重放态生成 context；移动/退役须验证后续同文件 patch 仍能 apply。
2. **custom/server 禁止 import 上游模块**（symlink 相对路径错位）：需要上游能力走 factory-DI（patch 在 routes.ts/http.ts 注入依赖）；跨层测试放 custom/upstream-compat/。证据：trace.ts:13-43 内联 isPathWithin；graph-assembly.ts:3；graph-socket.ts:10；kanban-persistence.ts:6。
3. **vite alias 数组顺序+三方同步**：@/custom、@custom 先于 @ 兜底；vitest.config.ts 与 vite.config.overlay.ts 同步；上游由 patch 160/000 注入同款 alias；alias 变更须改 inject.mjs:169-180 生成模板再同步三处。
4. **路由双轨纪律**：cockpit/matrix-chat/swarm-kanban 路由静态在 patch（240/071），禁止动态 addRoute（matrix-chat/index.ts:18-25 教训）；loop/ia2 路由走 registerRoute→bootstrap 统一 addRoute（mount 前，entry.mts:53-61 no-match 重导航依赖此时序）。
5. **WS 通路三件套**：① routes/http patch 挂载 ② upgrade catch-all 白名单（patch 251 教训：fleet/events 自 2.13 起生产从未连通因白名单缺失）③ 守门测试（fleet-ws-whitelist.test.ts）。
6. **i18n 键 zh/en 成对 patch+进上游 locale**：运行时无 merge；成对编号（252/253 等七对）；缺键被上游 i18n-coverage.test.ts 拦截。
7. **共变对**：RunTraceTopology.vue⇄computeLayeredLayout.ts（14 次）；assembly.test.ts⇄graph-assembly.ts（9 次）；CockpitRunTraceModal⇄useRunTrace⇄run-trace-adapter 三角+测试；ia2 cockpit-view.test.ts⇄LoopCockpitView.vue（7 次）；patch 023⇄042（13 次，+043/series/package.json 常同动）。
8. **RELEASE-NOTES.md⇄package.json 版本联动**（20 次全库最高频）：版本号严格对应；发布还须同步 patch 042 desktop pkg 区与 patch 207 runtime pin。
9. **登录落点四处联动**：patch 071 路由守卫+patch 274 修订+ia2/guard.ts:25-66+bootstrap.ts:62-65 补查时序；compat-guard.test.ts 锁定行为。
10. **inject.mjs 路径/前缀双写**：inject.mjs:5-6 与 config/bootstrap.ts 两处同步；hermes-agent 路由前缀表 apply(:64-68)/reverse(:115-119) 两侧同改（patch 273 带 tests/hermes_cli/ 例）。
11. **GRAPH_ENGINE 三态三面同步**：graph-assembly.ts:29-37+296-307 导出；ia2 GraphEnginePolicyCard 渲染；patch 228 注入上游 SettingsView 卡片锚点。
