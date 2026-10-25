import { desktopBrowserRoutes } from '../modules/studio/routes/desktop-browser'
import type { Context, Next } from 'koa'
import './hermes-ops-adapter'
import './agent-log-adapter'
import './mcu-voice-adapter'
import './workflow-runtime-adapter'
import './chat-agent-runtime-adapter'
import './group-chat-agent-runtime-adapter'
import './session-agent-runtime-adapter'
import { apiDocsRoutes } from '../modules/studio'
import { healthRoutes } from './health'
import { updateRoutes } from './update'
import { themeRoutes } from '../modules/studio/routes/theme'
import { announcementRoutes } from '../modules/studio/routes/announcements'
import { appConnectionRoutes, appRelayRoutes } from './app-relay'
import { socialMessageRoutes } from '../modules/studio/routes/social-messages'
import {
  claudeCodeProxyRoutes,
  codexProxyRoutes,
  codingAgentRoutes,
} from './coding-agents'

// Studio and agent route modules composed into one HTTP application.
import { uploadRoutes } from '../modules/studio/routes/upload'
import { appUploadRoutes } from '../modules/studio/routes/app-upload'
import { authPublicRoutes, authProtectedRoutes } from '../modules/studio/routes/auth'
import { mcuDevicePublicRoutes, mcuDeviceRoutes } from '../modules/studio/routes/mcu-devices'

import { sessionRoutes } from '../modules/studio/routes/sessions'
import { modelApiRoutes } from '../modules/studio/routes/model-api'
import { sessionSharePublicRoutes, sessionShareRoutes } from '../modules/studio/routes/session-shares'
import { profileRoutes } from '../modules/hermes/routes/profiles'
// overlay[perf]（2026-09-30 性能批）：CLI 读端点缓存中间件（GET 白名单 TTL +
// 非 GET 失效；挂载位置见下方 profileRoutes / fleetRouter 之前）
import { profileReadCache, kanbanReadCache } from '../custom/middleware/kanban-read-cache'
// overlay[perf]（2026-10-14 回归轮 D4/D5）：CLI 读端点扩面缓存（skills/plugins/
// mcp/runtime-versions 四域）+ 快 404 闸（不存在的看板任务/profile 秒回，不再
// 付 CLI spawn 全额成本）
import { skillsReadCache, pluginsReadCache, mcpReadCache, runtimeVersionsReadCache } from '../custom/middleware/kanban-read-cache'
import { kanbanTaskFast404, createProfileFast404 } from '../custom/middleware/cli-fast-gates'
import { listProfileNamesFromDisk } from '../modules/hermes/services/profiles/profile'
// overlay[perf]（2026-09-30 性能批二轮）：快道库根解析用（见 initCommandPost）
import { homedir } from 'node:os'
import { join } from 'node:path'
import { skillRoutes } from '../modules/hermes/routes/skills'
import { skillBundleRoutes } from '../modules/hermes/routes/skill-bundles'
import { pluginRoutes } from '../modules/hermes/routes/plugins'
import { memoryRoutes } from '../modules/hermes/routes/memory'
import { modelRoutes } from '../modules/hermes/routes/models'
import { providerRoutes } from '../modules/hermes/routes/providers'
import { configRoutes } from '../modules/hermes/routes/config'
import { logRoutes } from '../modules/studio/routes/logs'
import { codexAuthRoutes } from '../modules/hermes/routes/codex-auth'
import { nousAuthRoutes } from '../modules/hermes/routes/nous-auth'
import { copilotAuthRoutes } from '../modules/hermes/routes/copilot-auth'
import { xaiAuthRoutes } from '../modules/hermes/routes/xai-auth'
import { anthropicAuthRoutes } from '../modules/hermes/routes/anthropic-auth'
import { minimaxAuthRoutes } from '../modules/hermes/routes/minimax-auth'
import { weixinRoutes } from '../modules/hermes/routes/weixin'
import { fileRoutes } from '../modules/studio/routes/files'
import { downloadRoutes } from '../modules/studio/routes/download'
import { jobRoutes } from '../modules/hermes/routes/jobs'
import { cronHistoryRoutes } from '../modules/hermes/routes/cron-history'
import { kanbanDashboardUrlRoutes, kanbanRoutes } from '../modules/hermes/routes/kanban'
import { workflowRoutes } from '../modules/studio/routes/workflows'
import { ttsRoutes, ttsProtectedRoutes } from '../modules/studio/routes/tts'
import { sttProtectedRoutes } from '../modules/studio/routes/stt'
import { jevRoutes } from '../modules/studio/routes/jev'
import { mcuFirmwareRoutes } from '../modules/studio/routes/mcu-firmware'
import { mediaRoutes } from '../modules/studio/routes/media'
import { groupChatPublicRoutes, groupChatRoutes } from '../modules/studio/routes/group-chat'
import { chatRunRoutes } from '../modules/studio/routes/chat-run'
import { chatWebhookPublicRoutes, chatWebhookRoutes } from '../modules/studio/routes/chat-webhooks'
import { performanceMonitorRoutes } from '../modules/studio/routes/performance-monitor'
import { journeyRoutes } from '../modules/hermes/routes/journey'
import { mcpRoutes } from '../modules/hermes/routes/mcp'
import { runtimeVersionRoutes } from '../modules/hermes/routes/runtime-versions'
import { legacyDataMigrationRoutes } from '../modules/hermes/routes/legacy-data-migration'
import { agentStatusRoutes } from '../modules/studio/routes/agent-status'
import { writeGateRoutes } from '../modules/hermes/routes/write-gate'
import { ekkoMemoryRoutes } from '../modules/ekko/routes/memory'
import { ekkoSkillRoutes } from '../modules/ekko/routes/skills'
import { ekkoMcpRoutes } from '../modules/ekko/routes/mcp'
import { ekkoConfigRoutes } from '../modules/ekko/routes/config'
import { petdexPublicRoutes, petdexRoutes } from '../modules/studio/routes/petdex'
import { petRoutes } from '../modules/studio/routes/pets'
import traceRoutes from '../custom/controllers/hermes/trace'
import runtimeCapsRoutes from '../custom/runtimecaps/runtime-caps-controller'
import ideGitRoutes from '../custom/controllers/ide/git'
import ideStorageRoutes from '../custom/controllers/system/storage'
import ideWorktreeRouter from '../custom/controllers/ide/worktree'
import { registerMatrixRoutes } from '../custom/matrix'
// overlay[cron-bridge]: T3b loop 调度桥接——hermes cron 回调 tick 端点（公开段，
// token fail-closed + loopback 限源；未启用 LOOP_SCHEDULER=cron 时恒 404）。
import { registerLoopCronBridgeRoutes } from '../custom/loop/graph/cron-bridge'
import ideRetryCountRoutes from '../custom/controllers/ide/retry-counts'
import ideSessionShareRouter from '../custom/controllers/ide/session-share'
import ideTaskWorkspaceRoutes from '../custom/controllers/ide/task-workspace'
import ideEngineModelsRouter from '../custom/controllers/ide/engine-models'
import ideAutomationsRouter from '../custom/controllers/ide/automations'
import ideRunUndoRouter from '../custom/controllers/ide/run-undo'
import ideCompactionTraceRouter from '../custom/controllers/ide/compaction-trace'
import ideVideoFramesRouter from '../custom/controllers/ide/video-frames'
import { ideNativeRoutes } from '../custom/controllers/ide/native-routes'
import { zcodeEngineRoutes } from '../custom/zcode/engine-controller'
// overlay[approval]: 审批宽度候选五档+决策八态+规则三列表（第一批吸收 #4）
import { approvalRoutes } from '../custom/approval/approval-controller'
// overlay[approvals]: P1 人工审批收件箱——待审聚合/就地裁决/决策历史（2026-09-28 产品 UI 缺陷修复 §二）
import { approvalsRoutes } from '../custom/approvals/pending-controller'
import { changeGovRoutes } from '../custom/governance/change-governance-controller'
import { governanceRoutes } from '../custom/governance/governance-controller'
// overlay[tokens]: token-meter 三投影互校（第一批吸收 #9）
import { tokenMeterRoutes } from '../custom/tokens/token-meter-controller'
// overlay[kg-evolution]: KG 演化治理——板级 KG 自动同步/版本快照回滚 REST + 启动接线
import { kgEvolutionRoutes } from '../custom/kgevolution/kg-evolution-controller'
import { startKgAutoSync } from '../custom/kgtrigger/auto-sync'
// overlay[harness]: 驾驭工程治理面（能力目录/六类成本账/成熟度自检/八原语对账）
import { harnessRoutes } from '../custom/harness/harness-controller'
import simRunRouter from '../custom/controllers/sim/run-progress'
// overlay[progress]: 按任务的研发进度（台账×会话投影聚合，进度可感知链）
import { progressRoutes } from '../custom/progress/task-progress-controller'
// overlay[eval]: Eval Studio 评测域（/api/hermes/eval/*：评测集/运行/人工仲裁/归因双 Loop）
import { evalRoutes } from '../custom/eval/controller'
// overlay[evidence]: 任务证据台账（routa §七#3 + antigravity A1 合并域，矩阵 §3.6 P0）
import { evidenceRoutes } from '../custom/evidence/evidence-controller'
// overlay[incident]: Agent 事故报告汇编器（六文调研轮 A+B，arXiv 2609.24515 三类
// 17 要素 + 理论/实际自治度对账；/api/incident/sessions/:id/report[.md]、/autonomy）
import { incidentRoutes } from '../custom/incident/incident-controller'
// overlay[virtual-pl + govbus]（六文调研轮 E+F）：AI 虚拟损益表（/api/hermes/virtual-pl）
// + 治理事件总线查询面（/api/hermes/governance-events）
import { virtualPlRoutes } from '../custom/harness/virtual-pl-controller'
import { govBusRoutes } from '../custom/govbus/govbus-controller'
// overlay[autonomy-ladder]（六文调研轮 H2）：自治阶梯配置面（洞察/辅助/自动执行 +
// 人工确认点清单；执行面拦截是 H3 单独轮）。/api/hermes/autonomy-ladder
import { autonomyLadderRoutes } from '../custom/autonomyladder/autonomy-ladder-controller'
// overlay[report]（报告链落地轮）：报告链能力正本=产品侧——PART1 骨架出稿+报告验收断言
// （六闸工件/承载率/QGate 纪律）。/api/hermes/report/*；simharness 为兼容消费壳。
import { reportRoutes } from '../custom/report/report-controller'
// overlay[session-mode]（permmodes v4 通道轮）：会话权限档查/切/清——引擎
// createSession.config.mode 建会话生效+switchCollaborationMode 会话内切（可切子集）；
// 执法=enforce-gate 阶梯>会话档>全局档。/api/hermes/permmodes/session-mode/*
import { sessionModeRoutes } from '../custom/permmodes/session-mode-controller'
// overlay[cluster-inspector]（集群巡检官）：分布式集群异常监控与处置（采集→检测→
// 定级→govbus system 域留痕；周期 60s，CLUSTER_INSPECTOR=off 关）。/api/hermes/cluster-inspector
import { clusterInspectorRoutes, startInspectorIfEnabled } from '../custom/clusterinspector/cluster-inspector-controller'
// overlay[humansim+observability]（PR-0 通道面）：人类模拟受控发送+审计留痕
// （/api/hermes/humansim/{send,audit}，HUMANSIM_CREDS_DIR 缺席=503 fail-closed）
// 与推演运行状态只读查询（/api/hermes/observability/run-state，OBS_SIM_ROOT
// 缺席=503 fail-closed）——生产不开 env 即关。631 挂载。
import { humansimRouter } from '../custom/humansim/humansim-controller'
import { observabilityRouter } from '../custom/observability/observability-controller'
// overlay[autosched+orgloop]（PR-5/6/7 组织回路面）：排期产品源（/api/hermes/autosched/
// schedule——dispatch-preset 代偿退役路径）+闸修复状态机与受控合并流水线（/api/hermes/
// orgloop/*——run20 G2 悬置与导演代合并的产品正身；ORGLOOP_REPO_ROOT 缺席=503）。636 挂载。
import { autoschedRouter } from '../custom/autosched/schedule-generator'
import { orgloopRouter } from '../custom/orgloop/orgloop-controller'
// overlay[simcenter]（三中心重构·波 1 服务端契约先行件）：推演中心 11 端点
// （/api/hermes/sim/{run-state,journal,topology,dispatcher-health,sleeping-workers,
// deliverables,branches,anchor,trace,evidence-mark,issues}——run-state 透传 631 正身、
// dispatcher-health/sleeping-workers 包 hermes-agent 634/635 CLI、branches=分支新鲜度
// 三态唯一实现；OBS_SIM_ROOT 缺席=503 fail-closed）。638 挂载。
import { simcenterRouter } from '../custom/simcenter/simcenter-controller'
// overlay[runtime-verify]（长会话治理 B5 挂载件）：真工具运行时验证器注册表——
// /api/hermes/runtime-verify/{health,verifiers,miniprogram}。原模块早落而路由从未
// 挂载（悬空件），606 补登。
import { runtimeVerifyRoutes } from '../custom/runtime-verify/runtime-verify'
// overlay[ontology]（本体工作台）：GB/T 48000.3 方法论产品化——五要素本体
// （类型/数据属性/对象属性/公理/规则）+ SHACL 式写入校验 + IRI/版本管理 +
// JSON-LD/SHACL/Turtle 导出。/api/hermes/ontology
// 四阶段：+结卡校验面（watcher 轮询 column_transition→单任务校验→收件箱；
// ONTOLOGY_WATCH=off 关，30s 档）
import { ontologyRoutes, registerOntologyAgentBridgeRoutes, startOntologyWatchIfEnabled } from '../custom/ontology/ontology-controller'
// overlay[bpa]: 流程架构工作台（企业级 BPA 方法论：APQC PCF 分级 + OES/POS 流程地图
// + PEMM 成熟度 + 治理八规则硬约束；spec 2026-10-14-bpa-process-architecture-spec.md）
import bpaRoutes from '../custom/bpa/bpa-controller'
// overlay[skillgov]: 技能治理（swarm-yuan 生成器产品面+角色映射+教训库）
import skillgovGeneratorRoutes from '../custom/skillgov/skillgov-controller'
import { router as skillgovStoreRoutes } from '../custom/skillgov/skillgov-store'
// overlay[review]: /review 评审域（codex-product §五 P0-1，矩阵 §3.8 P0）
import { reviewRoutes } from '../custom/review/review-controller'
// overlay[kanban]: 列级 automation 编排（routa §七#1，矩阵 §3.6 P0）
import { columnAutomationRoutes } from '../custom/kanban/column-automation-controller'
// overlay[inbox]: 注意力队列（multica §六，矩阵 §3.5 P1）
import { inboxRoutes } from '../custom/inbox/inbox-controller'
// overlay[ask]: 结构化问卷契约（minimax ask_user，矩阵 §3.4 P1）
import { askRoutes } from '../custom/ask/ask-controller'
// overlay[escalation]: 权限升级协议（routa §七#7，矩阵 §3.6 P1）
import { escalationRoutes } from '../custom/escalation/escalation-controller'
// overlay[mcpconfig]: MCP 配置管理（kimi /mcp-config 余项，矩阵 §3.3 P1）
import { mcpConfigRoutes } from '../custom/mcpconfig/mcp-config-controller'
// overlay[contextarchive]: 上下文无损滚存——旧窗 verbatim 归档/召回（C1/C4，dsh-smart-compact）
import { contextArchiveRoutes } from '../custom/contextarchive/context-archive-controller'
// overlay[ctxnotes]: 跨窗工作笔记——压缩换窗后保留，落后于归档即 STALE（C3）
import { ctxNotesRoutes } from '../custom/ctxnotes/ctx-notes-controller'
// overlay[constraints]: 约束卡注册表（2026-10-14 阿里 15-Agent 调研轮 D）——架构级约束
// 登记维护，派单简报按列/specialist 命中注入（封顶 5 条，fail-soft）。/api/constraints
import { constraintsRoutes } from '../custom/constraints/constraint-controller'
// overlay[optadvice]: 优化建议报告（2026-10-14 阿里 15-Agent 调研轮 A+F）——半自动挡：
// 烧钱会话/瓶颈阶段/关卡拦截三张 Top-N + 交付周期瀑布，聚合既有面不新增采集。/api/optadvice
import { optAdviceRoutes } from '../custom/optadvice/optadvice-controller'
// overlay[faileroute]: 失败路由显式表（2026-10-14 阿里调研轮 E）——失败类型→回退点→
// 携带物三档显式化（原地修/带证据回上游/人闸），出路由决定+卡标注不改派。/api/faileroute
import { failerouteRoutes } from '../custom/faileroute/faileroute-controller'
// overlay[expcandidates]: 经验候选提取（2026-10-14 阿里调研轮 B1）——自动挡第一半环：
// 看板轨迹提取反模式/较优路径/流程签名三类候选，只出候选不改行为，审核后入 B2。
import { expCandidatesRoutes } from '../custom/expcandidates/exp-controller'
// overlay[terminal-tools]: Cockpit 终端编码工具可用性探测
import terminalToolsRoutes from '../custom/controllers/hermes/terminal-tools'
// overlay[command-post]: 2.13 指挥中心 —— 舰队/看板聚合/团队 REST
import { initCommandPost } from '../custom/services/hermes/command-post'
import { getSession as getSessionRowForCommandPost } from '../modules/studio/repositories/session-store'
import { userCanAccessProfile as userCanAccessProfileForCommandPost } from '../modules/studio/repositories/users-store'
import * as kanbanCliForCommandPost from '../modules/hermes/services/kanban/kanban-service'
import { killOwnedProcessTree as killOwnedProcessTreeForCommandPost } from '../modules/studio/public/process-tree'
// overlay[loop-routes]: Loop Engineering REST API
import { createLoopRouter } from '../custom/loop/controllers/loop'
import { createGraphRouter } from '../custom/loop/controllers/graph'
import { createStateStore } from '../custom/loop/store/store-factory'
import { Scheduler } from '../custom/loop/engine/scheduler'
import { LoopEngine } from '../custom/loop/engine/loop-engine'
import { Verifier } from '../custom/loop/engine/verifier'
import { SubagentDispatcher } from '../custom/loop/engine/subagent-dispatcher'
import { WorktreeManager } from '../custom/loop/engine/worktree-manager'
import { BudgetGuard } from '../custom/loop/engine/budget-guard'
import { StuckDetector } from '../custom/loop/engine/stuck-detector'
import { HookManager } from '../custom/loop/engine/hooks'
import { WebhookConnector } from '../custom/loop/connectors/webhook-connector'
import { emitLoopEvent } from '../custom/loop/services/loop-socket'
import { getGroupChatServer } from '../modules/studio/controllers/group-chat'
// overlay[loop-graph-assembly]: P1 graph engine (GRAPH_ENGINE=legacy|shadow|on, 默认 legacy)
import { createGraphAssembly } from '../custom/loop/graph/graph-assembly'
import { createProductionVerifierDeps } from '../custom/loop/graph/verifier-bridge'
import { makeInjectWorkspaceContext } from '../custom/loop/graph/workspace-context'
// overlay[loop-graph-p2]: persistence 真实 kanban 写入（Task 4，替换 P1 stub adapter）
import { KanbanPersistenceAdapter, defaultKanbanBoardResolver } from '../custom/loop/graph/kanban-persistence'
import * as kanbanCli from '../modules/hermes/services/kanban/kanban-service'
// overlay[loop-graph-r1]: 每日 Brief Matrix 投递传输——身份=本机最近一次应用内 Matrix 登录
import { createMatrixBriefDelivery } from '../custom/loop/graph/brief-matrix-delivery'
import { legacyAppApiCompatibility } from '../modules/studio/middleware/legacy-app-api'

let loopStore: any = null
const lazyStore = new Proxy({} as any, {
  get(_, prop) {
    if (!loopStore) throw new Error('Loop subsystem not yet initialized')
    const val = loopStore[prop]
    return typeof val === 'function' ? val.bind(loopStore) : val
  }
})
const loopWebhookConnector = new WebhookConnector()
const loopEngine = new LoopEngine({
  store: lazyStore,
  verifier: new Verifier(),
  dispatcher: new SubagentDispatcher(),
  worktreeManager: new WorktreeManager(),
  budgetGuard: new BudgetGuard(() => {}),
  stuckDetector: new StuckDetector(lazyStore),
  hookManager: new HookManager(),
  emitEvent: async (event: any) => {
    if (loopStore) {
      await loopStore.appendEvent(event)
      const gcs = getGroupChatServer()
      if (gcs) emitLoopEvent(gcs.getIO(), event as any)
    }
  },
})
const loopScheduler = new Scheduler(lazyStore, loopEngine, loopWebhookConnector)
const graphAssembly = createGraphAssembly({
  io: () => {
    try { const gcs = getGroupChatServer() as any; return gcs?.getIO?.() ?? null } catch { return null }
  },
  engineDeps: {
    store: lazyStore,
    dryRun: false,
    // I8（终审）: 与 patch 134 同源 connector 装配——WebhookConnector 单例（webhook REST
    // 入队 payload 经 discover 排空为契约）。GitHub/本地 Git 连接器需 repo/token 配置面，
    // P1 未引入配置源，与 legacy 生产一致（仅 webhook 发现）。
    connectors: [loopWebhookConnector],
    worktreeManager: new WorktreeManager(),
    dispatcher: new SubagentDispatcher(),
    // I5（终审）: 人工审批门禁闭环——requestHumanApproval 返回 'pending'，validation
    // 节点转 approval:<contractId>@<n> interrupt（run → awaiting-input），真人经
    // POST /api/loop/contracts/:id/approve（下方 resumeApproval 桥）或
    // POST /api/graph/runs/:id/resume 应答。judge 在 P1 无模型调用方，不注入（桥内 warn 一次）。
    verifier: new Verifier(createProductionVerifierDeps()),
    // P2 Task 4：产物落库为真实 kanban 写入（替换 P1 stub `artifact:<id>`）——按 loop.tenant
    // 六段解析 board、title `[loop.name] contract.id` 查重幂等、CLI 失败收敛为
    // loop.persist-failed 事件 + repair 队列守卫回边（失败不炸 run）。dryRun（shadow 双跑）
    // 语义不变。kanbanCli 经 DI 注入（graph 模块自身零上游 import）。
    persistence: new KanbanPersistenceAdapter({ kanban: kanbanCli, boardResolver: defaultKanbanBoardResolver }),
    // I6（终审）: R2 workspace 上下文注入——handoff 派发前物化 GRAPH-CONTEXT.md 进
    // worktree（并给 CLAUDE.md/AGENTS.md 追加引用行）；失败不阻断派发（handoff 节点兜底）
    injectWorkspaceContext: makeInjectWorkspaceContext({ store: lazyStore }),
    log: (m: string) => { console.log(`[graph] ${m}`) },
  },
  // R1 每日 Brief Matrix 投递接线：身份=本机最近一次应用内 Matrix 登录
  //（~/.hermes-web-ui/matrix-session.json，patch 012 matrixLogin 成功路径落盘），
  // 未登录过回退 LOOP_MATRIX_HOMESERVER/TOKEN/USER env；无凭据返回 undefined，
  // 装配层 warn 一次并保持 event-log-only（delivered:false 审计）。房间仍由 LOOP_BRIEF_ROOM 配置。
  briefDelivery: createMatrixBriefDelivery(),
})
// GRAPH_ENGINE=on：loop REST tick/webhook/schedule 分流到 RunSpawner；legacy/shadow 保持 patch 134 装配
const loopRouter = createLoopRouter(
  lazyStore,
  graphAssembly.mode === 'on'
    ? graphAssembly.loopTickTarget as unknown as typeof loopScheduler
    : loopScheduler,
  loopWebhookConnector,
  { resumeApproval: (id, d, approver) => graphAssembly.resumeApproval(id, d, approver) },
  // P4 T5：模板语义随实例化——createLoop payload.template(specId)经 specStore 取 meta
  { getTemplate: async id => graphAssembly.specStore.get(id) ?? null },
)
const graphRouter = createGraphRouter(lazyStore)
// overlay[command-post]: 指挥中心单例（舰队 REST + 看板聚合 + 团队注册表）。
// WS 挂载由 bootstrap/http.ts 的 setupCommandPostWebSockets 完成（此处先建
// 单例，保证 http.ts 取得到）。
const commandPost = initCommandPost({
  listBoards: kanbanCliForCommandPost.listBoards,
  listTasks: kanbanCliForCommandPost.listTasks,
  // overlay[perf]（2026-10-17 回归轮）：单板列表 service 缓存的板事件失效——注入
  // 同一模块实例的 flush（patch 646），command-post 侧 custom require 会解析成
  // 第二实例导致 flush 填错对象。
  flushListTasksCache: kanbanCliForCommandPost.flushKanbanListTasksCache,
  watchEvents: kanbanCliForCommandPost.watchEvents,
  killWatch: (pid, fallbackKill) => killOwnedProcessTreeForCommandPost(pid, fallbackKill),
  getSession: getSessionRowForCommandPost,
  userCanAccessProfile: userCanAccessProfileForCommandPost,
  // overlay[perf]（2026-09-30 二轮；2026-10-14 回归轮 D2 修正）：快道库根=CLI
  // 同源根——agent CLI 的 kanban_home() 优先 HERMES_KANBAN_HOME（kanban_db.py:523），
  // 快道须同序，否则两根分叉时 boards 计数走 CLI、任务快道读错根，泳道静默清空。
  resolveKanbanDir: () => process.env.HERMES_KANBAN_HOME || process.env.HERMES_HOME || join(homedir(), '.hermes'),
})
async function initLoopSubsystem(): Promise<void> {
  if (loopStore) return
  const { store, adapterType, detectedFrom } = await createStateStore()
  loopStore = store
  console.log('[loop] state adapter: ' + adapterType + ' (' + detectedFrom + ')')
}

/**
 * Register all routes on the Koa app.
 * Public routes are registered first, then auth middleware,
 * then all protected routes.
 */
export function registerRoutes(app: any, authMiddleware: Array<(ctx: Context, next: Next) => Promise<void>>) {
  app.use(legacyAppApiCompatibility)

  // --- Public routes (no auth required) ---
  app.use(healthRoutes.routes())
  app.use(authPublicRoutes.routes())
  app.use(mcuDevicePublicRoutes.routes())
  app.use(claudeCodeProxyRoutes.routes())
  app.use(codexProxyRoutes.routes())
  app.use(ttsRoutes.routes())
  app.use(apiDocsRoutes.routes())
  app.use(petdexPublicRoutes.routes())
  app.use(groupChatPublicRoutes.routes())
  app.use(sessionSharePublicRoutes.routes())
  app.use(chatWebhookPublicRoutes.routes())
  // HERMES_CUSTOM[c2-gateway-credentials]: matrix 网关凭据端点须公开（自动登录在认证前调用）。
  registerMatrixRoutes(app)
  // overlay[cron-bridge]: hermes cron no-agent 脚本的到期回调（认证前挂载，自带 token 校验）。
  registerLoopCronBridgeRoutes(app)
  // overlay[ontology-agent-bridge]（本体轮四阶段）：agent validatorExec 的无鉴权
  // 通道——限本机回环 + 可选 ONTOLOGY_BRIDGE_TOKEN（cron-bridge 同款安全形态）。
  registerOntologyAgentBridgeRoutes(app)

  // --- Auth middleware: all routes below require authentication ---
  authMiddleware.forEach((middleware) => app.use(middleware))

  // --- Protected routes (auth required) ---
  app.use(authProtectedRoutes.routes())
  app.use(desktopBrowserRoutes.routes())
  app.use(mcuDeviceRoutes.routes())
  app.use(appConnectionRoutes.routes())
  app.use(uploadRoutes.routes())
  app.use(appUploadRoutes.routes())
  app.use(updateRoutes.routes())           // Must be before proxy (proxy catch-all matches everything)
  app.use(codingAgentRoutes.routes())
  app.use(agentStatusRoutes.routes())
  app.use(themeRoutes.routes())
  app.use(announcementRoutes.routes())
  app.use(appRelayRoutes.routes())
  app.use(socialMessageRoutes.routes())
  app.use(sessionRoutes.routes())
  app.use(modelApiRoutes.routes())
  app.use(sessionShareRoutes.routes())
  // overlay[perf]（2026-09-30 性能批）：profiles 读缓存——GET /api/hermes/profiles
  // 实测 8.7s（CLI 子进程），且 profileRoutes 挂载先于 fleetRouter，须在此直挂；
  // 任一非 GET /api/hermes/profiles* 落定即全量失效（见 custom/server/middleware/
  // kanban-read-cache.ts profileReadCache）。
  app.use(profileReadCache)
  // overlay[perf]（2026-10-14 回归轮 D5）：profiles 快 404 闸——不存在的 profile
  // 详情/runtime-status 原要付 8-12s CLI spawn（回归实测超时），磁盘清单预检秒回。
  app.use(createProfileFast404({ listProfileNames: listProfileNamesFromDisk }))
  app.use(profileRoutes.routes())
  app.use(ekkoMemoryRoutes.routes())
  app.use(ekkoSkillRoutes.routes())
  app.use(ekkoMcpRoutes.routes())
  app.use(ekkoConfigRoutes.routes())
  // overlay[perf]（2026-10-14 回归轮 D4）：skills/plugins 读缓存（CLI 列表 3-8s；
  // 同前缀写路径落定即失效，见 kanban-read-cache.ts D4 扩面注）
  app.use(skillsReadCache)
  app.use(skillRoutes.routes())
  app.use(skillBundleRoutes.routes())
  app.use(pluginsReadCache)
  app.use(pluginRoutes.routes())
  app.use(memoryRoutes.routes())
  app.use(modelRoutes.routes())
  app.use(providerRoutes.routes())
  app.use(configRoutes.routes())
  app.use(logRoutes.routes())
  app.use(codexAuthRoutes.routes())
  app.use(nousAuthRoutes.routes())
  app.use(copilotAuthRoutes.routes())
  app.use(xaiAuthRoutes.routes())
  app.use(anthropicAuthRoutes.routes())
  app.use(minimaxAuthRoutes.routes())
  app.use(weixinRoutes.routes())
  app.use(chatRunRoutes.routes())
  app.use(chatWebhookRoutes.routes())
  app.use(groupChatRoutes.routes())
  app.use(fileRoutes.routes())
  app.use(downloadRoutes.routes())
  app.use(jobRoutes.routes())
  app.use(cronHistoryRoutes.routes())
  app.use(kanbanDashboardUrlRoutes.routes())
  // overlay[perf]（2026-09-30 性能批）：看板读端点缓存——顶层直挂（router.use
  // 仅在同 router 有匹配路由时才执行，fleetRouter 无 boards 等路由故拦不住，
  // 最小复现实证）；须在 fleetRouter/kanbanRoutes 之前、鉴权之后（键含用户）。
  // boards/stats/assignees 实测 4.4-5.6s/个（CLI 子进程），页面一次并发 4-5 个。
  // overlay[perf]（2026-10-14 回归轮 D4）：看板任务快 404 闸——不存在的任务 id
  // （含 /log、/attachments 子路径）原要付 9-11s CLI spawn 才得 404；sqlite 直读
  // 任务库预检秒回（库读不到 fail-open 放行 CLI，语义只快不慢）。
  app.use(kanbanTaskFast404)
  app.use(kanbanReadCache)
  app.use(commandPost.fleetRouter.routes())      // overlay[command-post]: 舰队/看板聚合/团队（须先于 kanbanRoutes 挂载：/api/hermes/kanban/overview 否则被上游 /api/hermes/kanban/:id 抢答 404，聚合端点失效触发客户端 N+1 风暴）
  app.use(kanbanRoutes.routes())
  app.use(workflowRoutes.routes())
  app.use(ttsProtectedRoutes.routes())
  app.use(sttProtectedRoutes.routes())
  app.use(jevRoutes.routes())
  app.use(mcuFirmwareRoutes.routes())
  app.use(mediaRoutes.routes())
  app.use(performanceMonitorRoutes.routes())
  app.use(journeyRoutes.routes())
  // overlay[perf]（2026-10-14 回归轮 D4）：mcp/runtime-versions 读缓存（CLI 列表
  // 3-10s；同前缀写路径落定即失效）
  app.use(mcpReadCache)
  app.use(mcpRoutes.routes())                   // MCP management
  app.use(runtimeVersionsReadCache)
  app.use(runtimeVersionRoutes.routes())         // Runtime and version management
  app.use(legacyDataMigrationRoutes.routes())    // One-time legacy Windows Hermes data migration
  app.use(writeGateRoutes.routes())              // Hermes Agent write approval review
  app.use(petdexRoutes.routes())
  app.use(petRoutes.routes())
  app.use(traceRoutes.routes())                   // RunTraceView Layer 3 trace API
  app.use(runtimeCapsRoutes.routes())             // 吸收批 9：hermes 暗能力只读代理（凭证池/放行建议/cron 运行史）
  app.use(terminalToolsRoutes.routes())           // Cockpit terminal coding tools probe
  app.use(ideGitRoutes.routes())                   // IDE Git pane (status/diff/stage/commit)
  app.use(ideStorageRoutes.routes())               // IDE storage manager (M2 resourceManager)
  app.use(ideWorktreeRouter.routes())               // IDE worktree 编排（R5 任务级隔离：create/remove/list + 会话绑定）
  app.use(ideRetryCountRoutes.routes())              // IDE 简报打回计数（aipaydev 缺口 3 可视化；与 patch 363 计数链同源）
  app.use(ideSessionShareRouter.routes())            // IDE 共享会话（R6：invite token 四档模式 + prompt 审批，multica 人机共驾）
  app.use(ideTaskWorkspaceRoutes.routes())           // IDE 任务 workspace 解析（Ycode 工作区↔kanban 任务关联：path/materialized/branch）
  app.use(ideEngineModelsRouter.routes())             // IDE 编码引擎独立模型配置（2026-09-26 用户指令：与 hermes agent 模型独立设置）
  app.use(ideAutomationsRouter.routes())               // IDE Automations 事件触发（A2：规则 CRUD+事件摄入；file watcher/git poll 在控制器内挂载）
  app.use(ideRunUndoRouter.routes())                   // IDE run 逐文件 Undo（UI 融合 UI-5：patch 反向应用）
  app.use(ideCompactionTraceRouter.routes())            // IDE compaction 留痕卡数据面（UI-2 v1）
  app.use(ideVideoFramesRouter.routes())                // IDE 视频抽帧（层 2 独立文件模式）
  // 404 缺陷修复：新增非 GET koa-router 路由真进程不生效——原生中间件直挂两端点
  // （PUT /api/ide/engine-models 与 POST /api/ide/video-frames，koa 洋葱层绕开 router）。
  app.use(ideNativeRoutes())
  app.use(zcodeEngineRoutes.routes())             // zcode 引擎健康面（R4-P1）
  app.use(approvalRoutes.routes())                // 审批域：candidates/evaluate/decide/rules（R5 #4）
  app.use(approvalsRoutes.routes())               // 审批收件箱：pending 聚合/decide 就地裁决/history 决策历史（P1 §二）
  app.use(changeGovRoutes.routes())               // 变更治理：L1-L4 分级评审/决策时效/五维影响/冻结窗口/管控基准（调研落地 2026-09-29）
  app.use(governanceRoutes.routes())              // 治理中心：六闸工件 overview + doc markdown（补功能主清单 2026-09-28）
  app.use(tokenMeterRoutes.routes())              // token-meter：project 三投影/zcode 互校（R5 #9）
  app.use(kgEvolutionRoutes.routes())             // KG 演化治理：status/tick/arm/disarm/versions/rollback（A1/A4）
  app.use(harnessRoutes.routes())                // 驾驭工程：capability-catalog/cost-accounts/maturity/primitives
  app.use(simRunRouter.routes())                   // 推演运行态（后台感知③）：run-progress.json 只读
  app.use(progressRoutes.routes())                  // 研发任务进度：/api/progress/tasks（taskId 联表）
  app.use(evalRoutes.routes())                     // Eval Studio：评测集/回放判分/pass@k 报告/归因双 Loop（spec 2026-10-07）
  app.use(evidenceRoutes.routes())                // 任务证据台账：artifact/snapshot/verification（P0 §3.6）
  app.use(incidentRoutes.routes())                // 事故报告：17 要素汇编 + 自治度对账（六文调研轮 A+B）
  app.use(virtualPlRoutes.routes())               // AI 虚拟损益表：单位产出成本 + 日成本异常（六文调研轮 E）
  app.use(govBusRoutes.routes())                  // 治理事件总线：查询面 + compact（六文调研轮 F）
  app.use(autonomyLadderRoutes.routes())          // 自治阶梯：配置面 CRUD + govbus 审计（六文调研轮 H2）
  app.use(reportRoutes.routes())                  // 报告链：PART1 骨架出稿 + 验收断言（报告链落地轮）
  app.use(sessionModeRoutes.routes())             // 会话权限档：查/切/清 + 引擎 v4 切档（permmodes v4 通道轮）
  startInspectorIfEnabled()                       // 集群巡检官：周期巡检环（RunSpawner 同款 .unref() timer）
  app.use(clusterInspectorRoutes.routes())        // 集群巡检官：snapshot/run REST
  app.use(humansimRouter.routes())                // 人类模拟：受控发送+审计（PR-0①，env fail-closed）
  app.use(observabilityRouter.routes())
  app.use(autoschedRouter.routes())                   // 排期生成：PR-7 产品源（无状态纯计算）
  app.use(orgloopRouter.routes())                     // 组织回路：PR-5 闸修复状态机 + PR-6 受控合并           // 可观测性：run-state 只读查询（PR-0②，env fail-closed）
  app.use(simcenterRouter.routes())                 // 推演中心：11 端点契约族（OBS_SIM_ROOT fail-closed）
  app.use(runtimeVerifyRoutes.routes())           // runtime-verify：验证器注册表 REST（B5）
  app.use(ontologyRoutes.routes())                // 本体工作台：spec/instances/validate/export/versions REST
  app.use(skillgovGeneratorRoutes.routes())         // 技能治理：生成器 status/run
  app.use(skillgovStoreRoutes.routes())             // 技能治理：角色映射+教训库
  startOntologyWatchIfEnabled()                   // 本体结卡校验环：column_transition 增量→单任务校验→收件箱（四阶段路线一）
  app.use(bpaRoutes.routes())                     // 流程架构：architecture/node/config/validate/seed/maturity REST
  app.use(reviewRoutes.routes())                  // 评审域：两域/行内评论/三裁决（P0 §3.8）
  app.use(columnAutomationRoutes.routes())        // 列编排：配置+COLUMN_TRANSITION 匹配（P0 §3.6）
  app.use(inboxRoutes.routes())                   // 注意力队列：三档/双轴/双收件人（P1 §3.5）
  app.use(askRoutes.routes())                     // 结构化问卷：1-4 步契约/一次定音（P1 §3.4）
  app.use(escalationRoutes.routes())              // 权限升级：urgency 三档/批准即改沙箱（P1 §3.6）
  app.use(mcpConfigRoutes.routes())              // MCP 配置：scope 三选一/needs-auth 闭环（P1 §3.3）
  app.use(contextArchiveRoutes.routes())          // 上下文档案：sessions/windows/window/search/state/advance（C1 召回 + C4 可观测）
  app.use(ctxNotesRoutes.routes())                // 跨窗笔记：CRUD/search + 新鲜度门（C3）
  app.use(constraintsRoutes.routes())             // 约束卡注册表：CRUD+预演（阿里调研轮 D）
  app.use(optAdviceRoutes.routes())                 // 优化建议报告：半自动挡清单+周期瀑布（阿里调研轮 A+F）
  app.use(failerouteRoutes.routes())               // 失败路由显式表：table/resolve（阿里调研轮 E）
  app.use(expCandidatesRoutes.routes())            // 经验候选：extract/list/curate（阿里调研轮 B1）
  app.use(loopRouter.routes())
  app.use(graphRouter.routes())
  // C1（终审）: 图引擎一等 REST（/api/graph/runs CRUD/resume/fork/replay + /api/graph/specs），
  // 此前只建未挂载 → 生产 404
  app.use(graphAssembly.router.routes())
  // C2（终审）: 启动 spawner/shadow 轮询 + 崩溃恢复重建（幂等）。bootstrap 无外部可注册的
  // 优雅停机步骤（http.ts additionalShutdownSteps 模块私有），进程退出即停（interval 不跨
  // 进程）；graphAssembly.stop() 预留给后续停机钩子接线。
  graphAssembly.start().catch(e => console.error('[graph] assembly start failed:', e))
  // overlay[kg-evolution]: 板级 KG 自动同步（60s tick + 攒批窗口触发；env KG_AUTO_SYNC=0 关闭）
  startKgAutoSync()
  initLoopSubsystem().catch(e => console.error('[loop] init failed:', e))
}
