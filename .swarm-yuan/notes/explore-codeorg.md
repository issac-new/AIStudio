# overlay 仓「代码组织与外部资源」探查报告（路C · 2026-10-16 全量重生成轮）

范围：`/Users/cuishi/lab/ncwk/overlay` 内的 `custom/` 与 `patches/`（不含 upstream 树本体）。关键计数均附来源命令。

## 1. 模块级清单

`custom/` 一级目录 6 个：`client`（前端，经 vite alias `@/custom` 注入上游）、`server`（后端，经 inject.mjs 符号链接到上游 `packages/server/src/custom`）、`desktop`（现仅 `__tests__`；rebrand 走 patch 041-043）、`hermes-agent-plugins/run-trace`（Python 插件：plugin.yaml/__init__.py/otel_formatter.py）、`qgate`（独立子项目：src 37 ts：core/executors/ontology + plugin/ + gate-packs/ + evidence/ + examples/）、`upstream-compat`（兼容垫片，1 测试）。

### custom/client 二级模块（16 个功能模块）

| 模块 | 用途 | .vue 数 |
|---|---|---|
| bpa | BPA 业务流程架构治理面板 | 7 |
| branding | 品牌变量注入（仅 index.ts，配合 patch 032/329/494） | 0 |
| chat | 聊天横幅（GatewayNoticeBanner） | 1 |
| cockpit | 驾驶舱/集群巡检可视化（RunTrace 时序/拓扑/技能钻取） | 16 |
| eval | Eval Studio 面板 | 4 |
| governance | 治理中心 21 个 Section | 21 |
| ia2 | 「AI 协作中心」二代壳（IaShell/flow 编排/gov 治理/scenes） | 69 |
| ide | IDE 工作台（最大前端模块） | 71 |
| kanban | 看板（SwarmKanbanView + 卡片/抽屉/编排/容量） | 18 |
| loop | 循环编排（orchestrator 规格编辑器 + runcenter 运行中心） | 16 |
| matrix-chat | Matrix 聊天完整 UI | 52 |
| matrix-teams | Matrix 团队协作（派发/评审/交付/值班） | 7 |
| ontology | 本体约束面板 | 2 |
| settings-layers | 设置分层（仅 index.ts） | 0 |
| skillgov | 技能治理视图 | 1 |
| zcode | zcode 引擎前端（纯 TS：api/ store/） | 0 |
| test | 测试 setup | 0 |

### custom/server 二级模块（127 个 + __tests__）

代表性分组（用途取自各模块头注，大量标注八源调研矩阵吸收来源）：

- **协作/编排核心**：loop（循环引擎+graph 图编排+cron bridge）、kanban（列级 automation）、squadcoord、swarm（批量并行子代理扇出）、taskgroups、orgloop（闸修复状态机+受控合并）、autosched（排期）
- **治理域**：governance（聚合+registry-admin+change-governance+domain-audit+prov-o）、govbus（治理事件总线）、harness（工作台基线+virtual-pl）、autonomyladder、skillgov、bpa、ontology（spec/实例/校验/watch）、kgevolution/kgtrigger/knowledge、decisiongraph
- **审批/评审/证据**：approval+approvals、escalation、review、evidence、heldout、incident、report
- **评估**：eval（四步管线）、expcandidates、distillgate/learndistill/memorytax/memscope
- **集群运维（最热）**：clusterinspector、pipeline、progress（+联邦）、humansim、observability、harnesshealth、faileroute
- **IDE/zcode 桥**：zcode（13 文件+vendor rpc）、controllers/ide|hermes|sim|system、enginemodels、importer、sessionfork、sessionarchive
- **工具语义/安全**：bashcontract、codesec、browsersec、security（url-guard）、toolpipeline、toolresultguard、permmodes/permpresets/rulesscope、websearch、shelldetach、fileundo/filehistory、videoref、speech、whiteboard、browserloop
- **长尾**（各 1 文件为主）：a2a、agentidentity、agentsmd、ask、automations、autosteps、benchmarkforge、boardorg、boost、brief、btw、cacheattr、changedfiles、cmdmeta、commandtask、compactthreshold、configlayers、constraints、contextarchive、crdt、ctxnotes、delivery-contract、disclosurerules、dispatchpreview、draft、extmarket、goalautonomy/goalbudget/goalpreempt、graph、handoff、hookswrite、inbox、keymap、managerhub、matrix（10 文件：admin-service/chat-bridge/gateway-env/raci-matrix/routes/session-store/simulation/task-protocol/agent-identity）、mcpcatalog、mcpconfig、modelroute、notify、optadvice、plan、prefixreuse、prdelivery、resume、runlog、runtime、runtime-verify、runtimecaps、secguidance、sections、services（hermes/kanban 服务层）、slashcmd、statusline、studio、teamsummary、tokens（token-meter 三投影）、tooldesc、tuicopy、urgencyesc、windowshift、workdir、workerabs、wsgroups

## 2. 前端维度枚举

### 2.1 视图组件（285 个 .vue 全量，views 56 + components 229）

来源：`find custom/client -name '*.vue' | wc -l` → 285。按模块分布：ide 71（components 50 + views 21）、ia2 69（components 30 + flow 13 + gov 11 + views 7+gov 9+orchestration 1+scenes 1）、matrix-chat 52（views 1 + components 51）、governance 21、kanban 18、cockpit 16、loop 16、bpa 7、matrix-teams 7、eval 4、ontology 2、chat 1、skillgov 1。

全量清单（填充 reference-manual §4 时按此搬运，文件名去 .vue 后缀）：

**bpa**：components/{BpaGovernancePanel,BpaLinkPanel,BpaMapPanel,BpaMaturityPanel,BpaPcfPanel,BpaTreePanel} + views/BpaView
**chat**：components/GatewayNoticeBanner
**cockpit**：components/{ApprovalPanel,CockpitAttention,CockpitFilePanel,CockpitIcon,CockpitRunTraceModal,CockpitScheduleModal,CockpitTerminalPane,RunTraceGraph,RunTraceInspector,RunTraceNodeDetail,RunTraceOverview,RunTraceScrubber,RunTraceSkillDrilldown,RunTraceTimeBand,RunTraceTimelinePanel,RunTraceTopology}
**eval**：components/{EvalAdvicePanel,EvalOraclePanel,EvalReportPanel} + views/EvalView
**governance**：components/{AgentIdentitySection,AuditSection,AutonomyLadderSection,CapabilityCatalogSection,ChangeGovernanceSection,CostAccountsSection,DecisionGraphSection,DecisionRulesSection,EfficiencyRuntimeSection,EvalLayersSection,GovEventStreamSection,IncidentReportSection,KnowledgeGraphSection,LedgerSection,MaturitySection,OrgDiagnosisSection,PrimitivesSection,RsiMaturitySection,RuntimeSection,StateModelSection,VirtualPnlSection}
**ia2**：components/{AccountsNavEntry,AttentionStrip,BackgroundWorkStrip,BpaNavEntry,EvalNavEntry,GovernanceNavEntry,GraphEnginePolicyCard,IaColumnControls,IaGlobalTop,IaLocaleToggle,IaOverviewEntry,IaPopoutBar,IaSettingsSidebar,IaShellHeader,IaViewSwitcher,InboxNavEntry,NotifyDropdownPanel,OntologyNavEntry,RunLinks,SitDetailPanel,SitlineBar,SkillgovNavEntry,SpecDetail,SpecList,SpotlightPanel,TabIntroBanner,TraceabilityMatrix} + flow/{AttentionList,ChainBar,CockpitOverview,FlowNavPanel,LinkedTaskList,RunCanvas,SessionCanvas,SessionWorkbenchPanel,StageFlow,TaskDecisionPanel,TaskFeed,TaskFlowTimeline,WaitQueue} + gov/{AppRegistryEditor,GovAgentSection,GovDetailPanel,GovOverlay,GovPeopleSection,GovReviewSection,GovSessionSection,GovStatsSection,GovTaskSection,GovTeamSection,OrgEditor} + views/{AccountAdminView,IaLegacyShell,IaShell,InboxView,OrchestrateView,TasksView,WorkbenchView} + views/gov/{GovAuditChangeView,GovClusterSection,GovDocsReviewView,GovHarnessView,GovHealthSection,GovOntologySection,GovOrgKnowledgeView,GovRegistryRulesView,GovSessionHealthSection} + views/orchestration/OrchestrationView + views/scenes/EngScene
**ide**：components 50 {IdeAgentsView,IdeAskCard,IdeBgTasksPanel,IdeBtwPanel,IdeCommandPalette,IdeCompactionCard,IdeContextArchivePane,IdeContextBar,IdeEngineModelsDialog,IdeFindInSession,IdeFloatPanel,IdeHandoffCard,IdeHistoryBrowser,IdeImportHistory,IdeInlineDiff,IdeKeymapCard,IdeKnowledgeBar,IdeLandingHero,IdeMentionChip,IdeMentionPicker,IdeModBand,IdePermissionSwitcher,IdePlanFloat,IdeQueuePanel,IdeRecapCard,IdeRecoveryDialog,IdeReplayTheater,IdeResumeAdvisor,IdeReviewPanel,IdeRosterTree,IdeRunLogPanel,IdeSecurityBoostBar,IdeSideSessionPane,IdeSubagentsFloat,IdeTaskContextBar,IdeTaskGroupsPanel,IdeTeamSummaryBar,IdeTodoBar,IdeTrajectoryPane,IdeTurnRail,IdeVideoFramesDialog,IdeWorkflowRunLines,TaskBriefingPanel,WorkflowObservationPanel} + views 21 {IdeActivityInbox,IdeChatPane,IdeFilesPane,IdeGitLog,IdeGitPane,IdeGoalBudgetFloat,IdeHooksPane,IdeKanbanPane,IdeMcpPane,IdeMemoryPane,IdeMetricsPopover,IdeModelSwitcher,IdeRunResultCard,IdeShareEntry,IdeShell,IdeSidePane,IdeSlashCommandsPane,IdeStatusBar,IdeStoragePane,IdeTaskSidebar,IdeTerminalDock,IdeTerminalPanel,IdeToolsPane,IdeWhiteboardPane,IdeWikiPane,IdeWorkflowPane,IdeWorktreeBadge}
**kanban**：components 17 {CapacitySection,KanbanAttachments,KanbanAttentionStrip,KanbanBoard,KanbanBulkBar,KanbanColumn,KanbanDiagnosticsSection,KanbanHandoffSection,KanbanInlineCreate,KanbanMarkdown,KanbanOrchestrationPanel,KanbanTaskCard,KanbanTaskDrawer,KanbanTaskForm,KanbanToolbar,ManagementAccountsPanel,SkillgovSection} + views/SwarmKanbanView
**loop**：components/LoopCreateWizard + orchestrator/components/{EditorCanvas,NodeConfigPanel} + orchestrator/views/SpecEditorView + runcenter/components/{ApprovalPanel,BlueprintGalleryPanel,GoalLoopStandingPanel,InboxPanel,NodeInspector,RunGraphCanvas,RunListTable,RunStageBadge,RunTimeline,TaskRunsPanel} + runcenter/views/{RunCenterView,RunDetailView}
**matrix-chat**：views/MatrixChatView + components 51 {MatrixChatPanel,MatrixClearMessagesDialog,MatrixContextMenu,MatrixCreateRoomDialog,MatrixDateSeparator,MatrixEventTileFooter,MatrixExportDialog,MatrixExtensionsCard,MatrixFilePanel,MatrixForwardDialog,MatrixInviteDialog,MatrixJoinRoomDialog,MatrixLeaveRoomDialog,MatrixMemberInfo,MatrixMemberList,MatrixMessageActionBar,MatrixMessageBody,MatrixMessageContextMenu,MatrixMessageInput,MatrixMessageItem,MatrixMessageList,MatrixMessagePanel,MatrixMessageTimestamp,MatrixPinnedMessagesCard,MatrixPollHistoryPanel,MatrixReactionPicker,MatrixReactionsRow,MatrixReadMarker,MatrixReadReceiptGroup,MatrixRedactDialog,MatrixReplyChain,MatrixReportDialog,MatrixRightPanel,MatrixRoomCanvas,MatrixRoomHeader,MatrixRoomList,MatrixRoomSearchView,MatrixRoomSettingsPanel,MatrixRoomSummaryCard,MatrixRoomView,MatrixSenderProfile,MatrixShareDialog,MatrixSpinner,MatrixStateEvent,MatrixThreadMessagePreview,MatrixThreadPanel,MatrixThreadSummary,MatrixThreadView,MatrixTimelinePanel,MatrixTopUnreadBar,MatrixTypingNotification}
**matrix-teams**：components/{AgentTeamEditor,DispatchList,DutyAssignPanel,GateReviewCard,TaskCard} + views/{DeliveryCasesView,TeamsManagePanel}
**ontology**：components/ConstraintsPanel + views/OntologyView
**skillgov**：views/SkillgovView

### 2.2 Pinia store（22 个文件 / 22 store id，全量）

cockpit/store/cockpit.ts（`cockpit`）；ia2/store/{ia.ts（`ia2`）,flow.ts（`ia2-flow`）,notify-read.ts（`ia2-notify-read`）,platforms.ts（`ia2-platforms`）,workspace.ts（`ia2-workspace`）}；ide/store/ide.ts（`ide`）；loop/store/loop.ts（`loop`）；loop/runcenter/store/runs.ts（`runCenter`）；matrix-chat/stores/{matrix-client,matrix-composer,matrix-right-panel,matrix-room,matrix-thread}；matrix-teams/stores/{delivery-cases（`matrix-teams-delivery-cases`）,ide-linkage（`matrix-ide-linkage`）,qgate-bridge（`matrix-qgate-bridge`）,review-center（`matrix-review-center`）,task-dispatch（`matrix-task-dispatch`）,task-linkage（`matrix-task-linkage`）,team-registry（`matrix-team-registry`）}。另 packages/client/src/stores/hermes/auth.ts 为注入上游的 auth 薄片。

### 2.3 composables（26 个 use* 文件）

chat/useGatewayNoticeBanner；cockpit/composables/{useForceLayout,useKanbanTaskGraph,useRunTrace,useRunTraceOverview,useTaskLifecycle}；ia2/composables/{useAgentActivity,useAttentionRows,useDecisionActions,useDecisionRows,useFitSlice,useIdeJump,useNowTick,useSessionRows,useSharedArm,useSitCounts,useTaskProgress}；ide/composables/{useIdeSessionHooks,useModBand,useSessionMetrics}；loop/runcenter/composables/useRunReplay；matrix-chat/composables/{useEventTileClassState,useEventTileData}；matrix-chat/utils/usernameColor.ts（命中 use* 实为工具）。

### 2.4 路由注册方式

- 客户端：上游 router/index.ts 被 patch 改写——071（删上游 workflow/group-chat 路由）、240（**custom 视图挂载主通道** component: () => import('@/custom/...')）、276（登录默认落点 /ide）、198/296/297/351（group-chat 恢复/场景路由收尾）。alias 解析在 vite.config.overlay.ts L44-66。
- 服务端：custom 控制器导出带 prefix 的 koa-router；patch 修改上游 bootstrap/routes.ts 加 import + app.use 两行（先例 036 首批、402/455/489/538/542-545/559/562/572/577-582/590/591/597/606/624-628/631/636）。物理注入=inject.mjs 把 custom/server 符号链接为上游 packages/server/src/custom。
- 旁路挂载：controllers/ide/native-routes.ts 原生中间件 if(method/path) 直判（PUT /api/ide/engine-models、POST /api/ide/video-frames、GET /api/ide/semantica-status、GET /api/ide/cache-attribution、GET /api/ide/replay/:id、GET /api/ide/slash-commands、POST /api/ide/slash-commands/save）。

## 3. 后端维度枚举

### 3.1 路由总体

49 个带前缀 koa-router（grep "Router({ prefix"）；端点 router.(get|post|put|delete|patch) 291 条 + 变量名路由 39 条 + 原生中间件 7 条 ≈ **337 个 REST 端点**。handler 绝大多数内联 async (ctx) => {}。

### 3.2 端点表（按文件，prefix 拼全路径）

| 文件（custom/server/） | prefix | 端点 |
|---|---|---|
| approval/approval-controller.ts | /api/approval | GET /rules；POST /candidates；POST /evaluate；POST /decide；DELETE /rules/:index |
| approvals/pending-controller.ts | /api/approvals | GET /pending；POST /:id/decide；GET /history；POST /impact-preview；GET /spotcheck；POST /spotcheck/:id/resolve |
| ask/ask-controller.ts | /api/ask | POST /；GET /:id；POST /:id/answer |
| autonomyladder/…controller.ts | /api/hermes/autonomy-ladder | GET /；GET /:target；PUT /:target；DELETE /:target |
| autosched/schedule-generator.ts | /api/hermes/autosched | POST /schedule |
| bpa/bpa-controller.ts | /api/bpa | GET /architecture；PUT /node；DELETE /node/:id；PUT /config；POST /validate；GET /audit；GET /export；GET /e2e；GET /pcf；POST /seed；GET /task-links；PUT /task-link；DELETE /task-link；GET /maturity；POST /maturity |
| clusterinspector/cluster-inspector-controller.ts | /api/hermes/cluster-inspector | GET /snapshot；POST /run（+子路由 pipeline） |
| constraints/constraint-controller.ts | /api/constraints | GET /；POST /；PATCH /:id；DELETE /:id；POST /preview |
| contextarchive/…controller.ts | /api/context-archive | GET /sessions；GET /windows；GET /window；GET /search；GET /state；POST /advance |
| controllers/ide/automations.ts | /api/ide/automations | GET /；POST /rules；PATCH /rules/:id；DELETE /rules/:id；POST /events |
| controllers/ide/compaction-trace.ts | /api/ide | GET /compaction-trace/:sessionId |
| controllers/ide/engine-models.ts | /api/ide/engine-models | GET /；PUT / |
| controllers/ide/git.ts | /api/ide/git | GET /status；GET /diff；POST /stage；POST /commit；GET /branches；POST /checkout；POST /push；GET /log |
| controllers/ide/run-undo.ts | /api/ide | POST /run-undo |
| controllers/ide/session-share.ts | 全路径写死 | POST /api/ide/session-share/create；GET /api/ide/session-share/:token；POST /api/ide/session-share/:token/prompt |
| controllers/ide/video-frames.ts | /api/ide | POST /video-frames；POST /engine-models-put |
| controllers/ide/worktree.ts | 全路径写死 | POST /api/ide/worktree/create；POST /api/ide/worktree/remove；GET /api/ide/worktree/list |
| controllers/ide/retry-counts.ts | 全路径写死 | GET /api/ide/retry-count |
| controllers/system/storage.ts | /api/ide/storage | GET /snapshot；POST /clean；POST /reveal |
| controllers/hermes/fleet.ts | 全路径写死 | GET /api/hermes/fleet/sessions；POST /api/hermes/fleet/approval；POST /api/hermes/fleet/clarify；GET /api/hermes/kanban/overview；GET /api/hermes/teams；POST /api/hermes/teams；PUT /api/hermes/teams/:id；DELETE /api/hermes/teams/:id |
| controllers/hermes/terminal-tools.ts | — | GET /api/hermes/terminal-tools |
| controllers/hermes/trace.ts | — | GET /api/hermes/sessions/:id/trace（handleSessionTrace）；GET /api/studio/sessions/:id/trace |
| controllers/sim/run-progress.ts | — | GET /api/sim/run-progress |
| ctxnotes/…controller.ts | /api/ctx-notes | GET /；POST /；PUT /:id；DELETE /:id；GET /search |
| escalation/…controller.ts | /api/escalation | POST /；GET /pending；POST /:id/decide；POST /:id/attribution；GET /:id |
| eval/controller.ts | /api/hermes/eval | GET /sets；POST /sets；GET /sets/:id；POST /sets/:id/seal；GET /sets/:id/export；POST /sets/:id/tasks/:taskId/rubric；POST /runs；GET /runs；GET /runs/compare；POST /runs/:id/reflow；GET /runs/:id；POST /runs/:id/verdicts；POST /runs/:id/attributions；GET /runs/:id/iterations；GET /iterations；GET /oracle/cases；POST /oracle/cases；POST /oracle/cases/:id/run；GET /oracle/runs；GET /outcome-verifiers（24 条） |
| evidence/…controller.ts | /api/evidence | POST /:taskId；GET /:taskId/card；GET /:taskId/changed-files；GET /:taskId/verdict；GET /:taskId/chain；GET /:taskId/gaps；GET /:taskId |
| expcandidates/exp-controller.ts | /api/expcandidates | GET /；POST /extract；POST /:id/curate |
| faileroute/…controller.ts | /api/faileroute | GET /table；POST /resolve |
| govbus/govbus-controller.ts | /api/hermes/governance-events | GET /；POST /compact |
| governance/governance-controller.ts | /api/governance | GET /overview；GET /doc；PUT /doc；GET /ledger；GET /metrics-defs；GET /usage；GET /slo；GET /cost-summary；GET /audit-log；GET /contracts；GET /state-model；GET /impact；GET /org-diagnosis；GET /decision-graph/status；GET /decision-graph/decisions；GET /decision-graph/chain；GET /qgate-verdicts；POST /decision-graph/sync-gates；GET /decision-graph/replay；GET /decision-graph/snapshots；GET /audit-log/prov-o；POST /knowledge-graph/sync；GET /knowledge-graph/summary；GET /knowledge-graph/conflicts；POST /knowledge-graph/conflicts/resolve；GET /decision-rules；GET /dispatch-stats；GET /capacity/overview；GET /registry/:kind；PUT /registry/:kind；POST /matrix-users；POST /matrix-offboard；GET /agent-identity；POST /agent-identity/register；POST /agent-identity/:id/update；POST /agent-identity/:id/credential；POST /agent-identity/:id/credential/revoke；POST /agent-identity/:id/delegate；POST /agent-identity/:id/delegation/:did/revoke；GET /agent-identity/:id/chain；GET /heldout/sets；POST /heldout/sets；POST /heldout/sets/:id/score；GET /board-status（44 条） |
| governance/change-governance-controller.ts | /api/change-gov | GET /meta；GET /requests；POST /requests；动态 router.post(path) 若干；PATCH /requests/:id；POST /requests/:id/decide；POST /requests/:id/implement；GET /metrics；GET /freeze-windows；POST /freeze-windows；PATCH /freeze-windows/:id；GET /requests/:id |
| governance/domain-audit.ts | 挂 governance router | POST /api/governance/domains/run；GET /api/governance/domains |
| harness/harness-controller.ts | /api/harness | GET /capability-catalog；GET /cost-accounts；GET /maturity；GET /primitives；GET /eval-layers；GET /rsi-maturity |
| harness/virtual-pl-controller.ts | /api/hermes/virtual-pl | GET / |
| humansim/…controller.ts | /api/hermes/humansim | POST /send；GET /audit |
| inbox/…controller.ts | /api/inbox | POST /；GET /:kind/:recipient；POST /:kind/:recipient/mark |
| incident/…controller.ts | /api/incident | GET /sessions/:id/report；GET /sessions/:id/report.md；GET /sessions/:id/autonomy |
| kanban/column-automation-controller.ts | /api/column-automation | GET /；GET /presets；GET /match；POST /dispatch |
| kgevolution/…controller.ts | /api/kg-evolution | GET /status；POST /tick；POST /arm；POST /disarm；GET /versions；POST /rollback |
| loop/controllers/loop.ts | /api/loop | GET /loops；GET /loops/:id；POST /loops；PATCH /loops/:id；DELETE /loops/:id；POST /loops/:id/tick；POST /loops/:id/pause；GET /loops/:id/contracts；GET /loops/:id/events；POST /contracts/:id/approve；POST /webhook/:loopId；GET /patterns（12 条） |
| loop/controllers/graph.ts | /api/graph | GET /graphs；GET /graphs/:id；GET /graphs/:id/events |
| loop/graph/graph-assembly.ts | /api/graph | GET /engine；GET /mind |
| loop/graph/graph-rest.ts | /api/graph | GET /runs；GET /runs/:id；POST /runs/:id/resume；POST /runs/:id/fork；GET /runs/:id/replay；GET /runs/:id/export；GET /specs；POST /runs/:id/deposit-template；GET /specs/:id；POST /specs；DELETE /specs/:id；POST /specs/:id/runs；POST /runs/:id/start（13 条） |
| matrix/routes.ts | /api/matrix | GET /gateway-credentials（loopback 四闸） |
| mcpconfig/…controller.ts | /api/mcp-config | POST /；GET /；GET /needs-auth；POST /:name/auth |
| observability/…controller.ts | /api/hermes/observability | GET /run-state |
| ontology/…controller.ts | /api/hermes/ontology | GET /spec；PUT /spec；GET /instances；POST /instances；PUT /instances/:id；DELETE /instances/:id；POST /validate；GET /export；GET /versions；POST /rollback；POST /seed；GET /kanban-overview；POST /ingest；POST /validate-task；GET /watch/status；POST /watch/tick（16 条） |
| optadvice/…controller.ts | /api/optadvice | GET /report |
| orgloop/…controller.ts | /api/hermes/orgloop | POST /gate-repair；POST /gate-repair/:id/transition；GET /gate-repairs；POST /merge-run |
| permmodes/session-mode-controller.ts | /api/hermes/permmodes/session-mode | GET /:profileId；PUT /:profileId |
| pipeline/pipeline-controller.ts | /api/hermes/cluster-inspector/pipeline | GET /status；POST /run；GET /review/status；POST /review/start |
| progress/task-progress-controller.ts | /api/progress | GET /machines；GET /tasks（联邦聚合视图） |
| report/report-controller.ts | /api/hermes/report | POST /part1-skeleton；POST /acceptance |
| review/review-controller.ts | /api/review | POST /；POST /:id/comments；POST /:id/comments/:cid/resolve；POST /:id/verdict；GET /:id |
| runtime-verify/runtime-verify.ts | /api/hermes/runtime-verify | GET /health；GET /verifiers；POST /miniprogram |
| runtimecaps/…controller.ts | /api/runtime-caps | GET /credentials；GET /approval-suggestions；GET /cron-runs；GET /gateway/status；GET /gateway/blueprints；POST /gateway/blueprints/instantiate；GET /gateway/sessions；POST /gateway/sessions/:id/fork |
| skillgov/skillgov-controller.ts | /api/skillgov | POST /scan；GET /scan/latest；GET /generator/status；POST /generator/run |
| skillgov/skillgov-store.ts | /api/skillgov | GET /role-mappings；PUT /role-mappings；GET /lessons |
| tokens/token-meter-controller.ts | /api/token-meter | POST /project；POST /zcode；GET /runtime-ledger；POST /cost |
| zcode/engine-controller.ts | /api/zcode-engine | GET /health；POST /projection/watch；POST /projection/unwatch；POST /mention；GET /rows；GET /workflow/runs；GET /workflow/run-events；GET /workflow/saved；GET /workflow/saved-runs；POST /fork；POST /checkpoint/recover；POST /mention/preview；POST /queue/enqueue；POST /queue/yield；POST /queue/drain；GET /queue/:workspacePath；GET /import/history-preview；POST /import/history；GET /squad/roster；GET /squad/evaluations；GET /projection（20 条） |

### 3.3 service/store 层

*-store.ts 26 个：approval,bpa,constraints,contextarchive/archive-store,ctxnotes/notes-store,draft,escalation,evidence,expcandidates/exp-store,change-governance-store,heldout/held-out-store,inbox,loop/graph/channel-store,**loop/graph/event-log-store**,loop/store/local-store,loop/store/matrix-store,**loop/store/saas-store**,loop/store/state-store,matrix/session-store,ontology,session-mode-store,progress/**task-progress-store**,review,services/hermes/teams-store,services/kanban/retry-store,skillgov-store。
*-service.ts 3 个：loop/graph/graph-service、matrix/admin-service、optadvice/optadvice-service。
services/ 目录 9 文件：hermes/{command-post,fleet-events,fleet-snapshot,fleet-tap,kanban-overview,task-workspace-cache,teams-store} + kanban/{raci-dispatch,retry-guard,retry-store}。

### 3.4 sqlite/数据模型

CREATE TABLE 3 文件 9 表：saas-store.ts（loops/loop_contracts/loop_events/loop_verifications）、event-log-store.ts（graph_events/graph_specs/graph_checkpoints）、change-governance-store.ts（change_requests/freeze_windows）。其余 JSON/JSONL 文件态（pipeline-state.json、parallel-review-state.json、cluster-inspector-convergence.json 落 <home>/runtime/）；clusterinspector 用 node:sqlite 直读上游 kanban.db tasks 表（controller L91-109）；env 入口 RUN_UNDO_DB/HERMES_INCIDENT_DB/CHANGE_GOV_DB/HARNESS_STUDIO_DB/DATABASE_URL/LOOP_PG_URL。

## 4. clusterinspector 模块深化（6 文件 2254 行）

| 文件 | 行数 | 职责 |
|---|---|---|
| collectors.ts | 443 | 采集层：四采集器（gateway/sessions/profiles/session-telemetry）全 fail-soft，产出 ClusterSnapshot |
| detectors.ts | 681 | 检测层：纯函数 ClusterSnapshot→Anomaly[]，无 IO |
| inspector.ts | 607 | 编排层：周期采集→检测→定级→处置（notify 必发 govbus system 域；safe-act 默认关；destructive 永远人工门）；冷却去重防自风暴；CLUSTER_INSPECTOR=off 关 |
| convergence.ts | 261 | 收敛性追踪：指纹 detector::subject 复发记账，熵增时升级/熔断/降级三联动；持久化 runtime/cluster-inspector-convergence.json |
| cluster-inspector-controller.ts | 234 | REST 面 + 数据面接线（9 provider）+ 巡检环启动 startInspectorIfEnabled |
| route-hint.ts | 28 | 检测器→前端路由提示映射 |

检测器 28 个 id：gateway.unreachable/degraded/platform-attention/slot-inflation/capacity-pump、kanban.stale-worker、session.stalled/context-watermark/empty-streak/runaway-loop、anomaly.storm、task.agent-silent、machine.silent、card.blocked-stale/unassigned-stale/body-empty、review.fail-stall、delivery.anchor-missing/branch-stale/pushed、dispatcher.stuck、completion.no-realwork、load.imbalance、idle.with-work、work.expected-silent、runtime.spawn-health。
REST：GET /api/hermes/cluster-inspector/snapshot、POST /run；子路由挂 pipeline。注册=patch 582 两行；数据面经 InspectorDeps 注入（含 hermes kanban CLI 桥与 git/node:sqlite 直读）。

## 5. 2026-09 之后新增服务端模块

| 模块 | 入口 | 说明 |
|---|---|---|
| pipeline/ | pipeline-engine.ts、pipeline-controller.ts、parallel-review.ts | 持续流水线 v1（V8.33）：分支 push 触发评审/测试令；状态机 dev→pushed→tested→merged；PIPELINE/PIPELINE_TRIGGER 开关；状态落 runtime/pipeline-state.json。并行评审（V8.35）：会签大评审拆 N 路交叉取证+单点终判，PARALLEL_REVIEW=off 旁路 |
| delivery-contract/ | delivery-contract.ts | 交付形态感知契约：六型×每型运行证据要求，四方消费 |
| prdelivery/ | pr-delivery.ts | PR 交付链提示词规约：buildPrPrompt+validatePr 纯函数 |
| progress/ | task-progress-controller/store/analytics/federation(.ts/-controller.ts) | 进度可感知链（订阅 zcode projection）+跨机联邦（Matrix 房 [progress:event] 上行→聚合→跨机巡检 machine.silent；MX_FEDERATION_ROOM） |
| constraints/、expcandidates/、optadvice/、faileroute/ | 各 controller | 阿里调研轮 A/B1/D/E 批 |
| humansim/ + observability/ | 各 controller | 人类模拟受控发送+审计、推演运行状态只读；fail-closed（缺 env 即 503）；挂载=patch 631 |
| autosched/ + orgloop/ | schedule-generator.ts、orgloop-controller.ts | 排期产品源、闸修复状态机+受控合并流水线（ORGLOOP_REPO_ROOT fail-closed）；挂载=patch 636 |
| approvals/ + escalation/ + evidence/ + review/ | pending-controller 等 | P1 人工审批收件箱批（挂载 402/455） |
| governance/change-governance* | change-governance-controller.ts | L1-L4 分级评审/SLA/五维影响/三级冻结窗口（511） |
| incident/、report/、runtime-verify/、skillgov/、bpa/、runtimecaps/、kgevolution 等 | — | 同窗口新增（挂载 542-582/590/597/606） |

## 6. patch 面向

series 有效 359 条 + 347 注释/空行（706 行）；patches/ 目录 408 .patch 文件（含退役）。zcode-patches/ 5 文件 series 有效 4 条。按域：server 120 / agent-runtime 71 / client 68 / 早期 matrix 基建 28 / desktop 打包 rebrand 18 / kanban 7 / 构建依赖 8 / i18n 5 / loop-graph 3 / test 1 / 其他 30。

最重要 8 条：036（首批路由挂载范式起点）、016（JWT 扩 matrix_user_id）、240（客户端路由注入主通道）、582（集群巡检官挂载+巡检环）、473（locale 重基线）、489（IDE 原生中间件直挂）、631（humansim/observability 挂载）、636（autosched/orgloop 挂载最新批）。

## 7. 安全机制

- 认证：上游 studio JWT（signUserJwt/verifyUserJwt，getJwtSecret()）；patch 016 扩 payload；Matrix 登录 POST /api/auth/matrix-login（收 access_token 非密码）；agent 身份凭据五型 api-key|jwt|matrix-account|token|none（agentidentity L18）
- Matrix 管理操作：body 携 adminToken 经 synapse whoami 校验后走 Admin API v2（whoami 失败拒落盘）
- loopback 四闸（matrix/routes.ts）：①socket.remoteAddress 必须回环（不用可伪造 ctx.ip）②XFF/Forwarded 含非回环即 403 ③Origin 白名单 ④Host 回环名
- CORS：无全局中间件；ws 升级 rejectUpgradeOrigin(corsOrigins)
- 输入校验：prdelivery/validatePr、pipeline review/start 三字段、ontology validate、security/url-guard、per-tool allowlist（patch 593）、toolresultguard
- 密钥：全 env（MATRIX_ACCESS_TOKEN/LOOP_MATRIX_TOKEN/CHAT_BRIDGE_MATRIX_ACCESS_TOKEN/ZCODE_SERVER_AUTH_TOKEN/LOOP_CRON_BRIDGE_TOKEN/QGATE_TEST_SECRET/QGATE_LLM_API_KEY）；统一经 readGatewayMatrixEnv

## 8. 外部资源与端口

- 端口：server PORT||8647（8657 次实例）；LOOP_CRON_BRIDGE_PORT+TOKEN；agent gateway 8650
- GATEWAY_BASE 网关 /health 探测；zcode 引擎经 custom/server/zcode/（vendor rpc、projection-socket）
- Matrix/Synapse：MATRIX_HOMESERVER 等；CS API v3 + Admin API v2；127.0.0.1 hostname→server_name matrix.test；联邦房 MX_FEDERATION_ROOM
- env 变量 203 唯一。高频：HERMES_HOME(61)/HERMES_APPROVAL_RULES_FILE(20)/HERMES_EVIDENCE_DIR(17)/HERMES_APPROVALS_LOG_FILE(16)/GOVERNANCE_DISPATCH_LEDGER(15)/HERMES_TOOL_ENFORCE_MODE(14)/SEMANTICA_PYTHON(13)/CLUSTER_INSPECTOR_NUDGE_ROOM(13)/CLUSTER_INSPECTOR_NUDGE_REPO(12)/GOVERNANCE_REPO(11)。开关族：CLUSTER_INSPECTOR/PIPELINE/PIPELINE_TRIGGER/PARALLEL_REVIEW/MX_FEDERATION/CHAT_BRIDGE_ENABLED/ONTOLOGY_WATCH/KG_AUTO_SYNC（多为 =off 关闭语义）。目录类：CLUSTER_INSPECTOR_NUDGE_REPO/ORGLOOP_REPO_ROOT/GOVERNANCE_REPO/OBS_SIM_ROOT/HUMANSIM_CREDS_DIR/MX_SIMHARNESS_ROOT/BI_REPO/BI_WORK/EVAL_OUTCOME_ALLOWED_ROOTS

## 9. 类型与工具

export interface 1359 条 / export type 404 条 / 含类型导出文件 485 个（不含 qgate）。前端 utils 目录 5 个：client/{ide,ia2,kanban,governance,matrix-chat}/utils/ + matrix-teams/utils.ts；服务端通用件 middleware/（cli-fast-gates、kanban-read-cache）、security/url-guard.ts。

## 10. 测试

628 测试文件；__tests__ 目录 170 个。按模块 Top：client/ide 89、client/ia2 61、client/cockpit 34、server/loop/graph 30、client/loop 28、server 根 22、client/matrix-teams 21、qgate 19、server/governance 13、server/loop/engine 12、client/loop/runcenter 12、server/matrix 10、client/matrix-chat 10、client/kanban 10、server/harness 9、server/knowledge 8、server/clusterinspector 8、client 根 8；其余 130+ 目录各 1-7。
