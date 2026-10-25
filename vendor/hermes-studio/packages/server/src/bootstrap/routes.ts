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
import ideGitRoutes from '../custom/controllers/ide/git'
import ideStorageRoutes from '../custom/controllers/system/storage'
import ideWorktreeRouter from '../custom/controllers/ide/worktree'
import { registerMatrixRoutes } from '../custom/matrix'
// overlay[cron-bridge]: T3b loop 调度桥接——hermes cron 回调 tick 端点（公开段，
// token fail-closed + loopback 限源；未启用 LOOP_SCHEDULER=cron 时恒 404）。
import { registerLoopCronBridgeRoutes } from '../custom/loop/graph/cron-bridge'
import ideRetryCountRoutes from '../custom/controllers/ide/retry-counts'
import ideSessionShareRouter from '../custom/controllers/ide/session-share'
import { zcodeEngineRoutes } from '../custom/zcode/engine-controller'
// overlay[approval]: 审批宽度候选五档+决策八态+规则三列表（第一批吸收 #4）
import { approvalRoutes } from '../custom/approval/approval-controller'
// overlay[tokens]: token-meter 三投影互校（第一批吸收 #9）
import { tokenMeterRoutes } from '../custom/tokens/token-meter-controller'
// overlay[evidence]: 任务证据台账（routa §七#3 + antigravity A1 合并域，矩阵 §3.6 P0）
import { evidenceRoutes } from '../custom/evidence/evidence-controller'
// overlay[review]: /review 评审域（codex-product §五 P0-1，矩阵 §3.8 P0）
import { reviewRoutes } from '../custom/review/review-controller'
// overlay[kanban]: 列级 automation 编排（routa §七#1，矩阵 §3.6 P0）
import { columnAutomationRoutes } from '../custom/kanban/column-automation-controller'
// overlay[inbox]: 注意力队列（multica §六，矩阵 §3.5 P1）
import { inboxRoutes } from '../custom/inbox/inbox-controller'
// overlay[ask]: 结构化问卷契约（minimax ask_user，矩阵 §3.4 P1）
import { askRoutes } from '../custom/ask/ask-controller'
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
  watchEvents: kanbanCliForCommandPost.watchEvents,
  killWatch: (pid, fallbackKill) => killOwnedProcessTreeForCommandPost(pid, fallbackKill),
  getSession: getSessionRowForCommandPost,
  userCanAccessProfile: userCanAccessProfileForCommandPost,
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
  app.use(profileRoutes.routes())
  app.use(ekkoMemoryRoutes.routes())
  app.use(ekkoSkillRoutes.routes())
  app.use(ekkoMcpRoutes.routes())
  app.use(ekkoConfigRoutes.routes())
  app.use(skillRoutes.routes())
  app.use(skillBundleRoutes.routes())
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
  app.use(mcpRoutes.routes())                   // MCP management
  app.use(runtimeVersionRoutes.routes())         // Runtime and version management
  app.use(legacyDataMigrationRoutes.routes())    // One-time legacy Windows Hermes data migration
  app.use(writeGateRoutes.routes())              // Hermes Agent write approval review
  app.use(petdexRoutes.routes())
  app.use(petRoutes.routes())
  app.use(traceRoutes.routes())                   // RunTraceView Layer 3 trace API
  app.use(terminalToolsRoutes.routes())           // Cockpit terminal coding tools probe
  app.use(ideGitRoutes.routes())                   // IDE Git pane (status/diff/stage/commit)
  app.use(ideStorageRoutes.routes())               // IDE storage manager (M2 resourceManager)
  app.use(ideWorktreeRouter.routes())               // IDE worktree 编排（R5 任务级隔离：create/remove/list + 会话绑定）
  app.use(ideRetryCountRoutes.routes())              // IDE 简报打回计数（aipaydev 缺口 3 可视化；与 patch 363 计数链同源）
  app.use(ideSessionShareRouter.routes())            // IDE 共享会话（R6：invite token 四档模式 + prompt 审批，multica 人机共驾）
  app.use(zcodeEngineRoutes.routes())             // zcode 引擎健康面（R4-P1）
  app.use(approvalRoutes.routes())                // 审批域：candidates/evaluate/decide/rules（R5 #4）
  app.use(tokenMeterRoutes.routes())              // token-meter：project 三投影/zcode 互校（R5 #9）
  app.use(evidenceRoutes.routes())                // 任务证据台账：artifact/snapshot/verification（P0 §3.6）
  app.use(reviewRoutes.routes())                  // 评审域：两域/行内评论/三裁决（P0 §3.8）
  app.use(columnAutomationRoutes.routes())        // 列编排：配置+COLUMN_TRANSITION 匹配（P0 §3.6）
  app.use(inboxRoutes.routes())                   // 注意力队列：三档/双轴/双收件人（P1 §3.5）
  app.use(askRoutes.routes())                     // 结构化问卷：1-4 步契约/一次定音（P1 §3.4）
  app.use(loopRouter.routes())
  app.use(graphRouter.routes())
  // C1（终审）: 图引擎一等 REST（/api/graph/runs CRUD/resume/fork/replay + /api/graph/specs），
  // 此前只建未挂载 → 生产 404
  app.use(graphAssembly.router.routes())
  // C2（终审）: 启动 spawner/shadow 轮询 + 崩溃恢复重建（幂等）。bootstrap 无外部可注册的
  // 优雅停机步骤（http.ts additionalShutdownSteps 模块私有），进程退出即停（interval 不跨
  // 进程）；graphAssembly.stop() 预留给后续停机钩子接线。
  graphAssembly.start().catch(e => console.error('[graph] assembly start failed:', e))
  initLoopSubsystem().catch(e => console.error('[loop] init failed:', e))
}
