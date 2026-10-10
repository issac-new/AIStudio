// overlay/custom/server/loop/graph/__tests__/mission-factory.test.ts
// 任务工厂守门（2026-10-10 麦肯锡概念二轮）：deposit-template 端点契约——
// 完成 run 才可沉淀、模板 origin='factory'+meta.factory 溯源、台账追加经
// missionRegistry 注入、失败如实告示（registered=false + registryError）；
// 复用计数：factory 模板起跑 +1；editor POST /specs 伪造 factory origin 拒绝。
import { describe, expect, it } from 'vitest'
import { createGraphRunRouter } from '../graph-rest'
import type { GraphSpec } from '../graph-spec'

function baseSpec(id: string): GraphSpec {
  return {
    id, version: 1,
    channels: { count: { reducer: 'overwrite', default: 0 } },
    nodes: [
      { id: 'a', type: 'function', config: { execute: 'noop' } },
      { id: 'b', type: 'function', config: { execute: 'noop' } },
    ],
    edges: [{ from: 'a', to: 'b' }],
    entryNode: 'a',
    limits: { maxSteps: 50 },
  }
}

function stubStores() {
  const specs = new Map<string, GraphSpec>()
  const specStore = {
    get: (id: string) => specs.get(id) ?? null,
    save: async (s: GraphSpec) => { specs.set(s.id, s) },
    list: () => [...specs.values()],
    delete: async () => true,
  } as any
  return { specs, specStore }
}

function handlerOf(router: any, path: string, method: string): (ctx: any) => Promise<void> {
  const layer = router.stack.find((l: any) => l.path === path && l.methods.includes(method))
  expect(layer, `路由应注册于 ${method} ${path}`).toBeTruthy()
  return layer.stack[layer.stack.length - 1]
}

const run = (status: string) => ({ runId: 'r1', graphId: 'g1', instance: { status, updatedAt: '2026-10-10T00:00:00Z' } })

describe('任务工厂 deposit-template', () => {
  it('完成 run：模板落库（origin=factory+溯源）、台账行追加、registered=true', async () => {
    const { specs, specStore } = stubStores()
    specs.set('g1', baseSpec('g1'))
    const rows: string[][] = []
    const router: any = createGraphRunRouter({
      graphService: { getRun: () => run('completed') } as any,
      eventLog: {} as any,
      specStore,
      missionRegistry: { appendRow: async (row, message) => { rows.push(row); expect(message).toContain('r1') } },
    })
    const handler = handlerOf(router, '/api/graph/runs/:id/deposit-template', 'POST')
    const ctx: any = { params: { id: 'r1' }, request: { body: { name: '支付回归模板' } }, state: { user: { username: 'bella' } } }
    await handler(ctx)
    expect(ctx.status).not.toBe(409)
    expect(ctx.body.ok).toBe(true)
    expect(ctx.body.registered).toBe(true)
    const tpl = specs.get(ctx.body.templateId)!
    expect(tpl.origin).toBe('factory')
    expect(tpl.description).toBe('支付回归模板')
    expect(tpl.meta?.factory).toMatchObject({ sourceRunId: 'r1', depositedBy: 'bella', reuseCount: 0 })
    expect(rows).toHaveLength(1)
    expect(rows[0]![0]).toBe(ctx.body.templateId)
  })

  it('未完成 run 拒绝（409）；spec 缺失拒绝（409）', async () => {
    const { specs, specStore } = stubStores()
    specs.set('g1', baseSpec('g1'))
    const router: any = createGraphRunRouter({
      graphService: { getRun: () => run('running') } as any, eventLog: {} as any, specStore,
    })
    const handler = handlerOf(router, '/api/graph/runs/:id/deposit-template', 'POST')
    const ctxRun: any = { params: { id: 'r1' }, request: { body: {} } }
    await handler(ctxRun)
    expect(ctxRun.status).toBe(409)

    const router2: any = createGraphRunRouter({
      graphService: { getRun: () => run('completed') } as any, eventLog: {} as any, specStore,
    })
    const handler2 = handlerOf(router2, '/api/graph/runs/:id/deposit-template', 'POST')
    const noSpecStore = { ...specStore, get: () => null } as any
    const router3: any = createGraphRunRouter({
      graphService: { getRun: () => run('completed') } as any, eventLog: {} as any, specStore: noSpecStore,
    })
    const handler3 = handlerOf(router3, '/api/graph/runs/:id/deposit-template', 'POST')
    const ctxNoSpec: any = { params: { id: 'r1' }, request: { body: {} } }
    await handler3(ctxNoSpec)
    expect(ctxNoSpec.status).toBe(409)
  })

  it('台账失败不回滚 spec：registered=false + registryError 如实告示', async () => {
    const { specs, specStore } = stubStores()
    specs.set('g1', baseSpec('g1'))
    const router: any = createGraphRunRouter({
      graphService: { getRun: () => run('completed') } as any, eventLog: {} as any, specStore,
      missionRegistry: { appendRow: async () => { throw new Error('git 不可用') } },
    })
    const handler = handlerOf(router, '/api/graph/runs/:id/deposit-template', 'POST')
    const ctx: any = { params: { id: 'r1' }, request: { body: {} }, state: {} }
    await handler(ctx)
    expect(ctx.body.ok).toBe(true)
    expect(ctx.body.registered).toBe(false)
    expect(ctx.body.registryError).toContain('git 不可用')
    // spec 已落库（不因台账失败回滚）
    expect([...specs.values()].some(s => s.origin === 'factory')).toBe(true)
  })
})

describe('任务工厂复用计数与 origin 保留', () => {
  it('factory 模板起跑：reuseCount +1 且 lastReusedAt 落值；非 factory 不动', async () => {
    const { specs, specStore } = stubStores()
    const tpl = { ...baseSpec('f1'), origin: 'factory' as const, meta: { factory: { sourceRunId: 'r1', depositedAt: '2026-10-10T00:00:00Z', reuseCount: 0 } } }
    specs.set('f1', tpl)
    const plain = baseSpec('p1')
    specs.set('p1', plain)
    const router: any = createGraphRunRouter({
      graphService: {} as any, eventLog: {} as any, specStore,
      specRuntime: { startRun: async (id: string) => ({ runId: `new-${id}`, instance: { status: 'running' } }) },
    })
    const handler = handlerOf(router, '/api/graph/specs/:id/runs', 'POST')
    const ctx: any = { params: { id: 'f1' } }
    await handler(ctx)
    expect(ctx.body.runId).toBe('new-f1')
    expect(specs.get('f1')!.meta!.factory!.reuseCount).toBe(1)
    expect(typeof specs.get('f1')!.meta!.factory!.lastReusedAt).toBe('string')
    const ctxP: any = { params: { id: 'p1' } }
    await handler(ctxP)
    expect(specs.get('p1')!.meta?.factory).toBeUndefined()
  })

  it('editor POST /specs 伪造 factory origin 拒绝（与 template 同保留）', async () => {
    const { specStore } = stubStores()
    const router: any = createGraphRunRouter({ graphService: {} as any, eventLog: {} as any, specStore })
    const handler = handlerOf(router, '/api/graph/specs', 'POST')
    const ctx: any = { request: { body: { ...baseSpec('fake-f'), origin: 'factory' } } }
    await handler(ctx)
    expect(ctx.status).toBe(400)
    expect(ctx.body.error).toContain('reserved')
  })
})
