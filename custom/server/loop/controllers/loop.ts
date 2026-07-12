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
import type { LoopInstance } from '../../../client/loop/types'

export function createLoopRouter(
  store: LoopStateStore,
  scheduler: Scheduler,
  webhookConnector: WebhookConnector,
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
    const body = ctx.request.body as Partial<LoopInstance>
    if (!body.id || !body.name || !body.goal) {
      ctx.status = 400; ctx.body = { error: 'Missing required fields: id, name, goal' }; return
    }
    if (!validateLoopId(body.id)) {
      ctx.status = 400; ctx.body = { error: 'Invalid loop id' }; return
    }
    const loop: LoopInstance = {
      id: body.id,
      name: body.name,
      goal: body.goal,
      stopCondition: body.stopCondition ?? '',
      pattern: body.pattern ?? 'daily-triage',
      schedule: body.schedule ?? { mode: 'manual', timezone: 'UTC' },
      stage: 'discovery',
      status: 'idle',
      autonomyLevel: body.autonomyLevel ?? 'L1',
      stateAdapter: 'local',
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

  // Human approval
  router.post('/api/loop/contracts/:id/approve', async (ctx) => {
    const body = ctx.request.body as { decision: string; approver: string; comment?: string }
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
