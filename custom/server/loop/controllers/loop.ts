// overlay/custom/server/loop/controllers/loop.ts
//
// REST API controller for Loop Engineering.
//
// Unlike trace.ts (which exports a default Router instance), this module exports
// a factory `createLoopRouter(...)` that wires the loop subsystem's runtime
// dependencies (store + scheduler + webhook connector) into a fresh @koa/router
// and returns it. The B-class patch 134-loop-server-routes.patch imports this
// factory, constructs the router with the live singletons, and registers its
// routes on the Koa app inside `registerRoutes()`.
//
// Design note: the factory shape (vs. a module-level singleton) keeps the
// controller testable — the vitest suite can construct a router with mock
// dependencies and assert the returned object exposes `.routes`.
//
// Auth note (I11): all `/api/loop/*` routes are mounted via patch 134 inside
// `registerRoutes(app, authMiddleware, ...)`. The Koa app applies the
// authMiddleware chain (requireUserJwt + resolveUserProfile) BEFORE any
// router middleware is registered, so every loop route inherits that auth
// ordering by virtue of being registered after the global middleware stack.
// No per-route auth decorator is needed here; adding one would be redundant
// with the global stack. If the global auth posture changes, revisit this.
import Router from '@koa/router'
import type { LoopStateStore } from '../store/state-store'
import type { Scheduler } from '../engine/scheduler'
import type { WebhookConnector } from '../connectors/webhook-connector'
import type { LoopInstance } from '../types'
import { PATTERN_TEMPLATES } from '../types'
import type { GraphSpecMeta } from '../graph/graph-spec'

/** 图引擎审批桥接（P1 Task 7）：契约 id → graph interrupt resume。缺省走旧 stub。
 *  approver（2026-09-10 风险审查 #1）：REST 层从 ctx.state.user 注入的认证用户名，
 *  服务端不信任客户端自报身份；缺省 undefined 保持旧 decision 直传行为。 */
export interface GraphApprovalBridge {
  resumeApproval(
    contractId: string,
    decision: 'approved' | 'rejected' | 'changes-requested',
    approver?: string,
  ): Promise<{ ok: boolean; runId?: string }>
}

/** 模板源（T5 模板语义随实例化，2026-09-11）：specId → 模板 GraphSpec 的只读视图。
 *  由装配层注入（graphAssembly.specStore 的适配；patch 202 需同步传参——controller
 *  保持与图引擎解耦，不直接 import graph 模块）。缺省注入时 body.template 请求 400
 *  显式失败，不静默忽略（所见非所得的旧坑不再以丢参形态回归）。 */
export interface TemplateSource {
  getTemplate(specId: string): Promise<{ meta?: GraphSpecMeta; description?: string } | null>
}

export function createLoopRouter(
  store: LoopStateStore,
  scheduler: Scheduler,
  webhookConnector: WebhookConnector,
  graphBridge?: GraphApprovalBridge,
  templateSource?: TemplateSource,
): Router {
  const router = new Router()

  // Path safety: loop IDs are used to build LocalStore paths and event rooms,
  // so reject anything outside a safe charset (and forbid traversal sequences).
  // Mirrors the constraints enforced by assertAllowedWorkspaceFolder upstream.
  function validateLoopId(id: string): boolean {
    return /^[A-Za-z0-9._-]+$/.test(id) && !id.includes('..')
  }

  // List loops
  router.get('/api/loop/loops', async (ctx) => {
    const status = ctx.query.status as string | undefined
    const filter = status ? { status: status.split(',') as any } : undefined
    const loops = await store.listLoops(filter)
    ctx.body = { loops }
  })

  // Get single loop
  router.get('/api/loop/loops/:id', async (ctx) => {
    if (!validateLoopId(ctx.params.id)) {
      ctx.status = 400; ctx.body = { error: 'Invalid loop id' }; return
    }
    const loop = await store.getLoop(ctx.params.id)
    if (!loop) { ctx.status = 404; ctx.body = { error: 'Loop not found' }; return }
    ctx.body = { loop }
  })

  // Create loop
  router.post('/api/loop/loops', async (ctx) => {
    const body = ctx.request.body as Partial<LoopInstance> & { template?: string }
    // T5（模板语义随实例化）：template=specId → 取模板 spec.meta 合成 loop 配置。
    //  goal 缺省补 meta.goal；其余 meta 持久化进 loop.template（编译时透传/合成，
    //  见 graph-assembly compile 闭包与 graph-compiler meta 投影）。
    let templateMeta: GraphSpecMeta | undefined
    if (body.template !== undefined) {
      const specId = typeof body.template === 'string' ? body.template.trim() : ''
      if (!specId) {
        ctx.status = 400; ctx.body = { error: 'template must be a non-empty spec id' }; return
      }
      if (!templateSource) {
        ctx.status = 400; ctx.body = { error: 'Template source not configured' }; return
      }
      const tpl = await templateSource.getTemplate(specId)
      if (!tpl) {
        ctx.status = 404; ctx.body = { error: `Template not found: ${specId}` }; return
      }
      templateMeta = tpl.meta ?? {}
    }
    const goal = body.goal ?? templateMeta?.goal
    if (!body.id || !body.name || !goal) {
      ctx.status = 400; ctx.body = { error: 'Missing required fields: id, name, goal' }; return
    }
    if (!validateLoopId(body.id)) {
      ctx.status = 400; ctx.body = { error: 'Invalid loop id' }; return
    }
    const loop: LoopInstance = {
      id: body.id,
      name: body.name,
      goal,
      stopCondition: body.stopCondition ?? '',
      pattern: body.pattern ?? 'daily-triage',
      schedule: body.schedule ?? { mode: 'manual', timezone: 'UTC' },
      stage: 'discovery',
      status: 'idle',
      autonomyLevel: body.autonomyLevel ?? 'L1',
      stateAdapter: 'local',
      // P2 Task 4 随修 2：tenant 显式白名单拷贝——persistence 的 kanban board 解析
      // （KanbanPersistenceAdapter）以 loop.tenant 为唯一来源，不透传则写入永不发生
      tenant: typeof body.tenant === 'string' && body.tenant.trim() ? body.tenant.trim() : null,
      // P3 台账（Task 1 审查转来）：maxAttempts 显式白名单拷贝——图编译器据此取 repair
      // 回边 guard.maxIterations（resolveRepairMaxAttempts），不透传则创建请求配置的
      // 契约重试上限静默丢失、回退 3。校验语义与编译器一致（正整数，非法即缺省）。
      maxAttempts: typeof body.maxAttempts === 'number' && Number.isFinite(body.maxAttempts) && body.maxAttempts >= 1
        ? Math.floor(body.maxAttempts)
        : undefined,
      // T5：模板溯源持久化（编译产物 origin/description/meta 的数据源）
      template: body.template !== undefined
        ? { specId: body.template.trim(), meta: templateMeta ?? {} }
        : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastTickAt: null,
      nextTickAt: null,
      budget: body.budget ?? { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
      stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
    }
    await store.createLoop(loop)
    scheduler.scheduleLoop(loop)
    ctx.body = { loop }
  })

  // Update loop
  router.patch('/api/loop/loops/:id', async (ctx) => {
    if (!validateLoopId(ctx.params.id)) {
      ctx.status = 400; ctx.body = { error: 'Invalid loop id' }; return
    }
    const patch = ctx.request.body as Partial<LoopInstance>
    await store.updateLoop(ctx.params.id, patch)
    const loop = await store.getLoop(ctx.params.id)
    if (loop) scheduler.scheduleLoop(loop)
    ctx.body = { loop }
  })

  // Delete loop
  router.delete('/api/loop/loops/:id', async (ctx) => {
    if (!validateLoopId(ctx.params.id)) {
      ctx.status = 400; ctx.body = { error: 'Invalid loop id' }; return
    }
    await store.deleteLoop(ctx.params.id)
    ctx.body = { ok: true }
  })

  // Manual tick
  router.post('/api/loop/loops/:id/tick', async (ctx) => {
    if (!validateLoopId(ctx.params.id)) {
      ctx.status = 400; ctx.body = { error: 'Invalid loop id' }; return
    }
    await scheduler.manualTick(ctx.params.id)
    ctx.body = { ok: true }
  })

  // Pause loop
  router.post('/api/loop/loops/:id/pause', async (ctx) => {
    if (!validateLoopId(ctx.params.id)) {
      ctx.status = 400; ctx.body = { error: 'Invalid loop id' }; return
    }
    await store.updateLoop(ctx.params.id, { status: 'paused' })
    ctx.body = { ok: true }
  })

  // List contracts
  router.get('/api/loop/loops/:id/contracts', async (ctx) => {
    const contracts = await store.queryContracts(ctx.params.id)
    ctx.body = { contracts }
  })

  // Get events
  router.get('/api/loop/loops/:id/events', async (ctx) => {
    const since = ctx.query.since as string | undefined
    const limit = ctx.query.limit ? parseInt(ctx.query.limit as string) : undefined
    const events = await store.queryEvents(ctx.params.id, since, limit)
    ctx.body = { events }
  })

  // Human approval —— P1 起内部桥接到图引擎 resume（approval:<contractId> interrupt）；
  // 无桥接（legacy 装配）时保持旧行为
  router.post('/api/loop/contracts/:id/approve', async (ctx) => {
    const body = ctx.request.body as { decision: string; approver: string; comment?: string }
    const decision = body.decision as 'approved' | 'rejected' | 'changes-requested'
    if (graphBridge && (decision === 'approved' || decision === 'rejected' || decision === 'changes-requested')) {
      // 审批身份以认证主体为准（requireUserJwt 写入 ctx.state.user，username 与前端
      // getStoredUsername 同源）——body.approver 是可伪造的自报字段，仅作展示参考
      const username = (ctx.state as { user?: { username?: string } }).user?.username
      const result = await graphBridge.resumeApproval(ctx.params.id, decision, username)
      if (result.ok) {
        ctx.body = { ok: true, decision, bridged: 'graph', runId: result.runId }
        return
      }
    }
    // The verifier will poll for this — store the approval
    // For now, append an event
    ctx.body = { ok: true, decision: body.decision }
  })

  // Webhook endpoint
  router.post('/api/loop/webhook/:loopId', async (ctx) => {
    if (!validateLoopId(ctx.params.loopId)) {
      ctx.status = 400; ctx.body = { error: 'Invalid loop id' }; return
    }
    const body = ctx.request.body as { source: string; eventType: string; payload: unknown }
    await scheduler.handleWebhook(ctx.params.loopId, body.source, body.eventType, body.payload)
    ctx.body = { ok: true }
  })

  // Pattern templates
  router.get('/api/loop/patterns', async (ctx) => {
    ctx.body = { patterns: Object.values(PATTERN_TEMPLATES) }
  })

  return router
}
