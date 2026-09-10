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
})
