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
// overlay[terminal-tools]: Cockpit 终端编码工具可用性探测
import terminalToolsRoutes from '../custom/controllers/hermes/terminal-tools'
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
const loopRouter = createLoopRouter(lazyStore, loopScheduler, loopWebhookConnector)
const graphRouter = createGraphRouter(lazyStore)
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
  app.use(loopRouter.routes())
  app.use(graphRouter.routes())
  initLoopSubsystem().catch(e => console.error('[loop] init failed:', e))
}
