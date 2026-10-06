// overlay/custom/server/loop/graph/__tests__/graph-rest-external-run.test.ts
// 外部源 run 详情骨架守门（backlog②）：无内存实例、只有事件骨架的 run（sim-*）详情
// 返回回放骨架而非 404——「列表有、详情 404」半截态根治；空事件仍 404。
import { describe, expect, it } from 'vitest'
import { InMemoryEventLogStore } from '../event-log-store'
import { createGraphRunRouter } from '../graph-rest'

function handlerOf(router: any, path: string, method = 'GET'): (ctx: any) => Promise<void> {
  const layer = router.stack.find((l: any) => l.path === path && l.methods.includes(method))
  expect(layer, `路由应注册于 ${method} ${path}`).toBeTruthy()
  return layer.stack[layer.stack.length - 1]
}

describe('graph-rest 外部源 run 详情骨架', () => {
  it('有事件无实例：200+骨架（status 由事件推导、graphDefId=null、external=true）', async () => {
    const eventLog = new InMemoryEventLogStore()
    await eventLog.append({ runId: 'sim-20261006-v8-run10', graphId: 'sim-run-progress', ts: 1791288000000, kind: 'run.started', payload: { done: 0, total: 26 } })
    await eventLog.append({ runId: 'sim-20261006-v8-run10', graphId: 'sim-run-progress', ts: 1791288060000, kind: 'run.progress', payload: { done: 4, total: 26 } })
    const router: any = createGraphRunRouter({ graphService: { getRun: () => undefined } as any, eventLog })
    const handler = handlerOf(router, '/api/graph/runs/:id')
    const ctx: any = { params: { id: 'sim-20261006-v8-run10' }, body: undefined }
    await handler(ctx)
    expect(ctx.status).not.toBe(404)
    expect(ctx.body.runId).toBe('sim-20261006-v8-run10')
    expect(ctx.body.graphId).toBe('sim-run-progress')
    expect(ctx.body.instance).toMatchObject({ status: 'running', graphDefId: null, external: true, eventCount: 2 })
    expect(typeof ctx.body.instance.updatedAt).toBe('string')
  })

  it('状态推导：末状态事件优先（run.completed），awaiting-input 亦可判', async () => {
    const eventLog = new InMemoryEventLogStore()
    const base = { runId: 'sim-x', graphId: 'sim-run-progress', payload: {} }
    await eventLog.append({ ...base, ts: 1, kind: 'run.started' })
    await eventLog.append({ ...base, ts: 2, kind: 'run.completed' })
    await eventLog.append({ ...base, ts: 3, kind: 'run.progress' })
    const router: any = createGraphRunRouter({ graphService: { getRun: () => undefined } as any, eventLog })
    const handler = handlerOf(router, '/api/graph/runs/:id')
    const ctxDone: any = { params: { id: 'sim-x' }, body: undefined }
    await handler(ctxDone)
    expect(ctxDone.body.instance.status).toBe('completed')

    await eventLog.append({ runId: 'sim-y', graphId: 'sim-run-progress', ts: 4, kind: 'interrupt.raised', payload: {} })
    const ctxWait: any = { params: { id: 'sim-y' }, body: undefined }
    await handler(ctxWait)
    expect(ctxWait.body.instance.status).toBe('awaiting-input')
  })

  it('零事件仍 404；非法 id 仍 400（原守卫不变）', async () => {
    const eventLog = new InMemoryEventLogStore()
    const router: any = createGraphRunRouter({ graphService: { getRun: () => undefined } as any, eventLog })
    const handler = handlerOf(router, '/api/graph/runs/:id')
    const ctx404: any = { params: { id: 'sim-nobody' }, body: undefined }
    await handler(ctx404)
    expect(ctx404.status).toBe(404)
    const ctx400: any = { params: { id: 'bad id!' }, body: undefined }
    await handler(ctx400)
    expect(ctx400.status).toBe(400)
  })
})
