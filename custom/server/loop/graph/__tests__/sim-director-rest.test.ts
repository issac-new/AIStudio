// overlay/custom/server/loop/graph/__tests__/sim-director-rest.test.ts
// 产品内导演三端点守门（2026-10-20 接管兄弟会话在途导演台波补钉）：
// scenarios/plan/start 的入参校验、JWT 闸、runtime 工厂注入与 spec 落库溯源。
import { describe, expect, it } from 'vitest'
import { InMemoryEventLogStore } from '../event-log-store'
import { createGraphRunRouter } from '../graph-rest'
import { DEFAULT_SIMULATION_SCENARIO } from '../../../graph/simulation-graph-template'

function handlerOf(router: any, path: string, method = 'GET'): (ctx: any) => Promise<void> {
  const layer = router.stack.find((l: any) => l.path === path && l.methods.includes(method))
  expect(layer, `路由应注册于 ${method} ${path}`).toBeTruthy()
  return layer.stack[layer.stack.length - 1]
}

function makeRouter(extra: Record<string, unknown> = {}): any {
  return createGraphRunRouter({
    graphService: { getRun: () => undefined } as any,
    eventLog: new InMemoryEventLogStore(),
    ...extra,
  } as any)
}

const VALID_INPUT = {
  title: '订单履约链路改造',
  description: '从接收需求到验收的全流程推演场景',
  modules: ['alpha', 'beta'],
  assignees: { alpha: 'alice', beta: 'bob' },
}

describe('sim-director scenarios/plan', () => {
  it('GET scenarios：返回默认场景（title/description 来自 DEFAULT_SIMULATION_SCENARIO）', async () => {
    const handler = handlerOf(makeRouter(), '/api/graph/sim-director/scenarios')
    const ctx: any = {}
    await handler(ctx)
    expect(ctx.status).not.toBe(400)
    expect(ctx.body.scenarios).toHaveLength(1)
    expect(ctx.body.scenarios[0].title).toBe(DEFAULT_SIMULATION_SCENARIO.title)
    expect(ctx.body.scenarios[0].description).toBe(DEFAULT_SIMULATION_SCENARIO.description)
  })

  it('POST plan 合法入参：编译出 spec 且过 validateGraphSpec，cast/闸数/模块如实返回', async () => {
    const handler = handlerOf(makeRouter(), '/api/graph/sim-director/plan', 'POST')
    const ctx: any = { request: { body: VALID_INPUT } }
    await handler(ctx)
    expect(ctx.status).not.toBe(400)
    expect(ctx.body.spec.nodes.length).toBeGreaterThan(0)
    expect(ctx.body.gateCount).toBe(ctx.body.spec.nodes.filter((n: any) => n.type === 'human-gate').length)
    expect(ctx.body.cast).toContain('alice')
    expect(ctx.body.cast).toContain('bob')
    expect(ctx.body.modules).toEqual(['alpha', 'beta'])
  })

  it('POST plan 空 body：落默认场景不报错', async () => {
    const handler = handlerOf(makeRouter(), '/api/graph/sim-director/plan', 'POST')
    const ctx: any = { request: { body: {} } }
    await handler(ctx)
    expect(ctx.status).not.toBe(400)
    expect(ctx.body.scenario.title).toBe(DEFAULT_SIMULATION_SCENARIO.title)
  })

  it('POST plan 非法入参：title 超长 / 模块名非法字符 → 400 人话错误', async () => {
    const handler = handlerOf(makeRouter(), '/api/graph/sim-director/plan', 'POST')
    const ctx1: any = { request: { body: { title: 'x'.repeat(121) } } }
    await handler(ctx1)
    expect(ctx1.status).toBe(400)
    expect(String(ctx1.body.error)).toContain('title')
    const ctx2: any = { request: { body: { modules: ['bad name!'] } } }
    await handler(ctx2)
    expect(ctx2.status).toBe(400)
    expect(String(ctx2.body.error)).toContain('模块名')
  })
})

describe('sim-director start', () => {
  it('无 Authorization 头 → 401（导演启动需要登录 JWT）', async () => {
    const handler = handlerOf(makeRouter({
      specStore: { save: async () => {} },
      directorRuntimeFactory: () => ({ startRun: async () => ({ runId: 'r', instance: {} }) }),
    }), '/api/graph/sim-director/start', 'POST')
    const ctx: any = { headers: {}, request: { body: VALID_INPUT }, state: {} }
    await handler(ctx)
    expect(ctx.status).toBe(401)
  })

  it('无 directorRuntimeFactory → 501 如实告示', async () => {
    const handler = handlerOf(makeRouter({ specStore: { save: async () => {} } }), '/api/graph/sim-director/start', 'POST')
    const ctx: any = { headers: { authorization: 'Bearer tok' }, request: { body: VALID_INPUT }, state: {} }
    await handler(ctx)
    expect(ctx.status).toBe(501)
  })

  it('完整起跑：spec 落库（meta.director.scenario+createdBy）且 JWT 透传 runtime 工厂', async () => {
    let saved: any = null
    let factoryToken: string | undefined
    const router = makeRouter({
      specStore: { save: async (spec: unknown) => { saved = spec } },
      directorRuntimeFactory: (token?: string) => {
        factoryToken = token
        return { startRun: async (specId: string) => ({ runId: 'run-dir-1', instance: { status: 'running', specId } }) }
      },
    })
    const handler = handlerOf(router, '/api/graph/sim-director/start', 'POST')
    const ctx: any = {
      headers: { authorization: 'Bearer jwt-abc' },
      request: { body: VALID_INPUT },
      state: { user: { username: 'tester' } },
    }
    await handler(ctx)
    expect(ctx.status).not.toBe(400)
    expect(ctx.body.ok).toBe(true)
    expect(ctx.body.runId).toBe('run-dir-1')
    expect(factoryToken).toBe('jwt-abc')
    expect(saved).toBeTruthy()
    expect(saved.origin).toBe('editor')
    expect(saved.meta?.director?.scenario).toBe(true)
    expect(saved.meta?.director?.createdBy).toBe('tester')
    expect(ctx.body.specId).toBe(saved.id)
  })
})
