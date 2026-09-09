// overlay/custom/server/loop/controllers/graph.ts
// Graph Engineering REST API controller
// 把 Loop 数据映射为 Graph 视角，复用现有 LoopStateStore

import Router from '@koa/router'
import type { LoopStateStore } from '../store/state-store'
import type { TaskContract } from '../types'
import type { GraphInstance, GraphEvent } from '../graph/types'
import { loopToGraphInstance, loopToGraphDef, loopEventsToGraphEvents } from '../graph/loop-to-graph'
// P1：tick/fork stub 已删除——运行级操作走 graph-rest（POST /api/graph/runs/:id/fork|resume|start），
// loop 级 tick 走 /api/loop/loops/:id/tick（GRAPH_ENGINE=on 时由装配分流到 RunSpawner）

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



  return router
}
