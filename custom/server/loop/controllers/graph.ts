// overlay/custom/server/loop/controllers/graph.ts
// Graph Engineering REST API controller
// 把 Loop 数据映射为 Graph 视角，复用现有 LoopStateStore

import Router from '@koa/router'
import type { LoopStateStore } from '../store/state-store'
import type { LoopInstance, TaskContract, LoopEvent } from '../types'
import type { GraphInstance, GraphEvent } from '../graph/types'
import { loopToGraphInstance, loopToGraphDef, loopEventsToGraphEvents } from '../graph/loop-to-graph'

export function createGraphRouter(store: LoopStateStore): Router {
  const router = new Router()

  // GET /api/graph/graphs — 列出所有图实例（从 loops 映射）
  router.get('/api/graph/graphs', async (ctx) => {
    const status = ctx.query.status as string | undefined
    const loops = await store.listLoops(status ? { status: status.split(',') as any } : undefined)
    const instances: GraphInstance[] = []
    for (const loop of loops) {
      const contracts = await store.queryContracts(loop.id)
      instances.push(loopToGraphInstance(loop, contracts))
    }
    ctx.body = { graphs: instances }
  })

  // GET /api/graph/graphs/:id — 单图详情（loop ID 映射）
  router.get('/api/graph/graphs/:id', async (ctx) => {
    const loopId = ctx.params.id.replace(/^graph-/, '')
    if (!/^[A-Za-z0-9._-]+$/.test(loopId)) {
      ctx.status = 400; ctx.body = { error: 'Invalid graph id' }; return
    }
    const loop = await store.getLoop(loopId)
    if (!loop) {
      ctx.status = 404; ctx.body = { error: 'Graph not found' }; return
    }
    const contracts = await store.queryContracts(loopId)
    const graphDef = loopToGraphDef(loop)
    const instance = loopToGraphInstance(loop, contracts)
    ctx.body = { graph: instance, def: graphDef }
  })

  // GET /api/graph/graphs/:id/events — 图事件轨迹（从 loop 事件映射）
  router.get('/api/graph/graphs/:id/events', async (ctx) => {
    const loopId = ctx.params.id.replace(/^graph-/, '')
    if (!/^[A-Za-z0-9._-]+$/.test(loopId)) {
      ctx.status = 400; ctx.body = { error: 'Invalid graph id' }; return
    }
    const since = ctx.query.since as string | undefined
    const limit = ctx.query.limit ? parseInt(ctx.query.limit as string) : undefined
    const loopEvents = await store.queryEvents(loopId, since, limit)
    const graphEvents = loopEventsToGraphEvents(loopEvents, loopId)
    ctx.body = { events: graphEvents }
  })

  // POST /api/graph/graphs/:id/tick — 触发图执行（映射为 loop tick）
  router.post('/api/graph/graphs/:id/tick', async (ctx) => {
    const loopId = ctx.params.id.replace(/^graph-/, '')
    if (!/^[A-Za-z0-9._-]+$/.test(loopId)) {
      ctx.status = 400; ctx.body = { error: 'Invalid graph id' }; return
    }
    // 映射为 loop tick — 需要 scheduler，但 controller 没有 scheduler 引用
    // 简化：返回 ok，由客户端调用 loop tick endpoint
    ctx.body = { ok: true, note: 'Use /api/loop/loops/:id/tick for direct execution' }
  })

  // POST /api/graph/graphs/:id/fork — 从检查点分叉（LangGraph 模式）
  router.post('/api/graph/graphs/:id/fork', async (ctx) => {
    const loopId = ctx.params.id.replace(/^graph-/, '')
    if (!/^[A-Za-z0-9._-]+$/.test(loopId)) {
      ctx.status = 400; ctx.body = { error: 'Invalid graph id' }; return
    }
    const body = ctx.request.body as { name?: string }
    const loop = await store.getLoop(loopId)
    if (!loop) {
      ctx.status = 404; ctx.body = { error: 'Graph not found' }; return
    }
    // 创建 fork：复制 loop，继承 state
    const forkId = `${loopId}-fork-${Date.now()}`
    const forked: LoopInstance = {
      ...loop,
      id: forkId,
      name: body.name ?? `${loop.name} (fork)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'idle',
      stats: { ...loop.stats, currentIteration: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0 },
    }
    await store.createLoop(forked)
    const contracts = await store.queryContracts(forkId)
    ctx.body = { graph: loopToGraphInstance(forked, contracts) }
  })

  return router
}
