// overlay/custom/client/loop/__tests__/loop-controller.test.ts
//
// Integration smoke test for the Loop Engineering REST controller.
//
// Verifies that createLoopRouter() returns a @koa/router Router instance whose
// `.routes` method is callable when wired with mock loop subsystem dependencies.
// The controller is constructed with mock implementations of LoopStateStore,
// Scheduler, and WebhookConnector so the test does not touch the filesystem
// (LocalStore) or spawn subagents.
import { describe, it, expect, vi } from 'vitest'
// Note: server tests can't use @ alias; use relative imports

describe('Loop Controller (integration)', () => {
  it('createLoopRouter returns a Router', async () => {
    const { createLoopRouter } = await import('../../../server/loop/controllers/loop')
    const mockStore = {
      listLoops: vi.fn().mockResolvedValue([]),
      getLoop: vi.fn(), createLoop: vi.fn(), updateLoop: vi.fn(), deleteLoop: vi.fn(),
      appendContract: vi.fn(), getContract: vi.fn(), queryContracts: vi.fn().mockResolvedValue([]),
      updateContract: vi.fn(), appendVerification: vi.fn(), appendEvent: vi.fn(),
      queryEvents: vi.fn().mockResolvedValue([]), detectDrift: vi.fn(),
    }
    const mockSched = { scheduleLoop: vi.fn(), manualTick: vi.fn(), handleWebhook: vi.fn() }
    const mockWC = { enqueue: vi.fn() }
    const router = createLoopRouter(mockStore as any, mockSched as any, mockWC as any)
    expect(router).toBeDefined()
    expect(router.routes).toBeDefined()
    expect(typeof router.routes).toBe('function')
  })

  // P2 Task 4 随修 2：tenant 写入通路——create 白名单拷贝 body.tenant。
  // KanbanPersistenceAdapter 以 loop.tenant 为 board 解析唯一来源，通路缺失则真实写入永不发生。
  it('POST /api/loop/loops persists body.tenant (trimmed); absent/blank tenant → null', async () => {
    const { createLoopRouter } = await import('../../../server/loop/controllers/loop')
    const { default: Koa } = await import('koa')
    const created: Array<Record<string, unknown>> = []
    const mockStore = {
      listLoops: vi.fn().mockResolvedValue([]),
      getLoop: vi.fn(), deleteLoop: vi.fn(),
      createLoop: vi.fn(async (l: Record<string, unknown>) => { created.push(l) }),
      updateLoop: vi.fn(), appendContract: vi.fn(), getContract: vi.fn(),
      queryContracts: vi.fn().mockResolvedValue([]), updateContract: vi.fn(),
      appendVerification: vi.fn(), appendEvent: vi.fn(),
      queryEvents: vi.fn().mockResolvedValue([]), detectDrift: vi.fn(),
    }
    const mockSched = { scheduleLoop: vi.fn(), manualTick: vi.fn(), handleWebhook: vi.fn() }
    const mockWC = { enqueue: vi.fn() }
    const router = createLoopRouter(mockStore as any, mockSched as any, mockWC as any)

    const app = new Koa()
    // 生产由全局 body-parser 填 ctx.request.body；测试内联等价实现（自包含，不引额外依赖）
    app.use(async (ctx, next) => {
      if (ctx.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const chunk of ctx.req) chunks.push(chunk as Buffer)
        ctx.request.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      }
      await next()
    })
    app.use(router.routes())
    const server = app.listen(0)
    const port = (server.address() as { port: number }).port
    try {
      const post = (body: Record<string, unknown>) => fetch(`http://127.0.0.1:${port}/api/loop/loops`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      const withTenant = await post({
        id: 'loop-tenant', name: 'T', goal: 'g',
        tenant: '跨团队协作群01:记忆服务讨论:@testuser3:!room:$sess:matrix',
      })
      expect(withTenant.status).toBe(200)
      expect(created[0]?.tenant).toBe('跨团队协作群01:记忆服务讨论:@testuser3:!room:$sess:matrix')
      expect(mockSched.scheduleLoop).toHaveBeenCalled()

      const blank = await post({ id: 'loop-blank', name: 'T', goal: 'g', tenant: '   ' })
      expect(blank.status).toBe(200)
      expect(created[1]?.tenant).toBeNull()

      const absent = await post({ id: 'loop-absent', name: 'T', goal: 'g' })
      expect(absent.status).toBe(200)
      expect(created[2]?.tenant).toBeNull()
    } finally {
      server.close()
    }
  })

  // P3 台账（Task 1 审查转来）：maxAttempts 写入通路——create 白名单拷贝 body.maxAttempts，
  // 图编译器据此取 repair 回边 guard.maxIterations；缺省/非法值 → undefined（编译器回退 3）
  it('POST /api/loop/loops persists body.maxAttempts (positive int); absent/invalid → undefined', async () => {
    const { createLoopRouter } = await import('../../../server/loop/controllers/loop')
    const { default: Koa } = await import('koa')
    const created: Array<Record<string, unknown>> = []
    const mockStore = {
      listLoops: vi.fn().mockResolvedValue([]),
      getLoop: vi.fn(), deleteLoop: vi.fn(),
      createLoop: vi.fn(async (l: Record<string, unknown>) => { created.push(l) }),
      updateLoop: vi.fn(), appendContract: vi.fn(), getContract: vi.fn(),
      queryContracts: vi.fn().mockResolvedValue([]), updateContract: vi.fn(),
      appendVerification: vi.fn(), appendEvent: vi.fn(),
      queryEvents: vi.fn().mockResolvedValue([]), detectDrift: vi.fn(),
    }
    const mockSched = { scheduleLoop: vi.fn(), manualTick: vi.fn(), handleWebhook: vi.fn() }
    const mockWC = { enqueue: vi.fn() }
    const router = createLoopRouter(mockStore as any, mockSched as any, mockWC as any)

    const app = new Koa()
    app.use(async (ctx, next) => {
      if (ctx.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const chunk of ctx.req) chunks.push(chunk as Buffer)
        ctx.request.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      }
      await next()
    })
    app.use(router.routes())
    const server = app.listen(0)
    const port = (server.address() as { port: number }).port
    try {
      const post = (body: Record<string, unknown>) => fetch(`http://127.0.0.1:${port}/api/loop/loops`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      const withMax = await post({ id: 'loop-max', name: 'T', goal: 'g', maxAttempts: 5 })
      expect(withMax.status).toBe(200)
      expect(created[0]?.maxAttempts).toBe(5)

      const floatMax = await post({ id: 'loop-float', name: 'T', goal: 'g', maxAttempts: 4.8 })
      expect(floatMax.status).toBe(200)
      expect(created[1]?.maxAttempts).toBe(4) // 截断为正整数

      const invalid = await post({ id: 'loop-invalid', name: 'T', goal: 'g', maxAttempts: 0 })
      expect(invalid.status).toBe(200)
      expect(created[2]?.maxAttempts).toBeUndefined() // 非法 → 缺省（编译器回退 3）

      const absent = await post({ id: 'loop-no-max', name: 'T', goal: 'g' })
      expect(absent.status).toBe(200)
      expect(created[3]?.maxAttempts).toBeUndefined()
    } finally {
      server.close()
    }
  })

  // T5（模板语义随实例化，2026-09-11）：POST /api/loop/loops 增可选 body.template（specId）
  // → 从模板源取 spec.meta：goal 缺省补 meta.goal；其余 meta 持久化进 loop.template
  //（编译时透传 spec.meta / gateCommands 并入编译 deps，见 graph-compiler/graph-assembly）。
  it('POST /api/loop/loops with body.template merges template meta into the loop config (T5)', async () => {
    const { createLoopRouter } = await import('../../../server/loop/controllers/loop')
    const { default: Koa } = await import('koa')
    const created: Array<Record<string, unknown>> = []
    const mockStore = {
      listLoops: vi.fn().mockResolvedValue([]),
      getLoop: vi.fn(), deleteLoop: vi.fn(),
      createLoop: vi.fn(async (l: Record<string, unknown>) => { created.push(l) }),
      updateLoop: vi.fn(), appendContract: vi.fn(), getContract: vi.fn(),
      queryContracts: vi.fn().mockResolvedValue([]), updateContract: vi.fn(),
      appendVerification: vi.fn(), appendEvent: vi.fn(),
      queryEvents: vi.fn().mockResolvedValue([]), detectDrift: vi.fn(),
    }
    const mockSched = { scheduleLoop: vi.fn(), manualTick: vi.fn(), handleWebhook: vi.fn() }
    const mockWC = { enqueue: vi.fn() }
    const templateSource = {
      getTemplate: vi.fn(async (specId: string) => specId === 'spec-tpl'
        ? {
            meta: {
              goal: '模板目标：清偿技术债', permissionLevel: 'auto-edit',
              sensitivePaths: ['secrets/**'], worktreePolicy: 'manual', gateCommands: ['npm test'],
            },
            description: '模板卡描述',
          }
        : null),
    }
    const router = createLoopRouter(mockStore as any, mockSched as any, mockWC as any, undefined, templateSource)

    const app = new Koa()
    app.use(async (ctx, next) => {
      if (ctx.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const chunk of ctx.req) chunks.push(chunk as Buffer)
        ctx.request.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      }
      await next()
    })
    app.use(router.routes())
    const server = app.listen(0)
    const port = (server.address() as { port: number }).port
    try {
      const post = (body: Record<string, unknown>) => fetch(`http://127.0.0.1:${port}/api/loop/loops`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      // goal 缺省补 meta.goal；其余 meta 持久化进 loop.template
      const withTemplate = await post({ id: 'loop-tpl', name: 'T', template: 'spec-tpl' })
      expect(withTemplate.status).toBe(200)
      expect(created[0]?.goal).toBe('模板目标：清偿技术债')
      expect(created[0]?.template).toEqual({
        specId: 'spec-tpl',
        meta: {
          goal: '模板目标：清偿技术债', permissionLevel: 'auto-edit',
          sensitivePaths: ['secrets/**'], worktreePolicy: 'manual', gateCommands: ['npm test'],
        },
      })
      expect(mockSched.scheduleLoop).toHaveBeenCalled()

      // 显式 goal 优先（模板 goal 不覆写调用方显式值）
      const explicit = await post({ id: 'loop-tpl-2', name: 'T', goal: '显式目标', template: 'spec-tpl' })
      expect(explicit.status).toBe(200)
      expect(created[1]?.goal).toBe('显式目标')

      // 模板不存在 → 404
      const miss = await post({ id: 'loop-miss', name: 'T', template: 'spec-nope' })
      expect(miss.status).toBe(404)
      expect(await miss.json()).toMatchObject({ error: expect.stringContaining('spec-nope') })

      // 空 template → 400
      const blank = await post({ id: 'loop-blank-tpl', name: 'T', template: '   ' })
      expect(blank.status).toBe(400)
    } finally {
      server.close()
    }
  })

  it('POST /api/loop/loops with body.template but no template source fails 400 explicitly (T5)', async () => {
    const { createLoopRouter } = await import('../../../server/loop/controllers/loop')
    const { default: Koa } = await import('koa')
    const created: Array<Record<string, unknown>> = []
    const mockStore = {
      listLoops: vi.fn().mockResolvedValue([]),
      getLoop: vi.fn(), deleteLoop: vi.fn(),
      createLoop: vi.fn(async (l: Record<string, unknown>) => { created.push(l) }),
      updateLoop: vi.fn(), appendContract: vi.fn(), getContract: vi.fn(),
      queryContracts: vi.fn().mockResolvedValue([]), updateContract: vi.fn(),
      appendVerification: vi.fn(), appendEvent: vi.fn(),
      queryEvents: vi.fn().mockResolvedValue([]), detectDrift: vi.fn(),
    }
    const mockSched = { scheduleLoop: vi.fn(), manualTick: vi.fn(), handleWebhook: vi.fn() }
    const mockWC = { enqueue: vi.fn() }
    // 不注入 templateSource（patch 接线前的装配形态）
    const router = createLoopRouter(mockStore as any, mockSched as any, mockWC as any)

    const app = new Koa()
    app.use(async (ctx, next) => {
      if (ctx.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const chunk of ctx.req) chunks.push(chunk as Buffer)
        ctx.request.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      }
      await next()
    })
    app.use(router.routes())
    const server = app.listen(0)
    const port = (server.address() as { port: number }).port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/loop/loops`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'loop-tpl-3', name: 'T', template: 'spec-tpl' }),
      })
      // 显式失败而非静默忽略（防"丢参回归"——所见非所得旧坑）
      expect(res.status).toBe(400)
      expect(created).toHaveLength(0)
      // 无 template 的请求不受影响
      const plain = await fetch(`http://127.0.0.1:${port}/api/loop/loops`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'loop-plain', name: 'T', goal: 'g' }),
      })
      expect(plain.status).toBe(200)
      expect(created).toHaveLength(1)
    } finally {
      server.close()
    }
  })
})
