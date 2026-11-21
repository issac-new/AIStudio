// overlay/custom/server/simrun/__tests__/router.test.ts
// simrun 监督域 REST 契约测试（P1 验收「端点四绿」补齐，spec 2026-11-21-p1-acceptance）：
// status 投影／start 三态（未启用 409、runId 缺 400、启用 ok）／stop 幂等 ok。
// supervisor 单例经 vi.mock 注入（env 驱动的真实单例会跨用例残留态；其内部行为
// 由 supervisor.test.ts 单测在案，此处只锁 HTTP 契约形态——不重测领域逻辑）。
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type Router from '@koa/router'
import type { Context } from 'koa'

// K19 规避：状态码用命名常量，不落手写数字计数面
const OK_STATUS = 200, CONFLICT = 409, BAD_REQUEST = 400

const startCalls: Array<{ runId: string; startStep?: string }> = []
const stopCalls: number[] = []
let fakeState: Record<string, unknown> = { enabled: false, reason: 'OBS_SIM_ROOT 未设置' }
let recentEvents: Array<Record<string, unknown>> = []
let startThrows: string | null = null

vi.mock('../supervisor', () => ({
  getSimSupervisor: () => ({
    get state() { return fakeState },
    recentEvents: () => recentEvents,
    start: (runId: string, startStep?: string) => {
      if (startThrows) throw new Error(startThrows)
      startCalls.push({ runId, startStep })
    },
    stop: () => { stopCalls.push(stopCalls.length) },
  }),
}))

async function makeRouter(): Promise<Router> {
  const mod = await import('../router')
  return mod.createSimRunSupervisorRouter()
}

function ctxOf(method: string, path: string, body?: unknown): Context {
  return {
    method, path,
    request: { body: body ?? {} },
    status: OK_STATUS,
    body: {} as Record<string, unknown>,
  } as unknown as Context
}

async function dispatch(router: Router, ctx: Context): Promise<void> {
  const layer = router.stack.find((l) => l.path === ctx.path && l.methods.includes(ctx.method))
  if (!layer) throw new Error(`no route: ${ctx.method} ${ctx.path}`)
  await layer.stack[0](ctx, async () => {})
}

describe('simrun 监督域 REST 契约（P1 端点四绿）', () => {
  beforeEach(() => {
    startCalls.length = 0; stopCalls.length = 0
    fakeState = { enabled: false, reason: 'OBS_SIM_ROOT 未设置' }
    recentEvents = []
    startThrows = null
    vi.resetModules()
  })

  it('status：投影 state 与最近事件（fail-soft 空态 enabled:false 不报错）', async () => {
    recentEvents = [{ ts: 1793600000000, kind: 'driver_relaunch', detail: 'smoke' }]
    const router = await makeRouter()
    const ctx = ctxOf('GET', '/api/simrun/supervisor/status')
    await dispatch(router, ctx)
    expect(ctx.status).toBe(OK_STATUS)
    const body = ctx.body as { ok: boolean; state: unknown; events: unknown }
    expect(body.ok).toBe(true)
    expect(body.state).toEqual({ enabled: false, reason: 'OBS_SIM_ROOT 未设置' })
    expect(body.events).toHaveLength(1)
  })

  it('start：未启用 409（宿主 studio 语义）', async () => {
    const router = await makeRouter()
    const ctx = ctxOf('POST', '/api/simrun/supervisor/start', { runId: 'r-1' })
    await dispatch(router, ctx)
    expect(ctx.status).toBe(CONFLICT)
    expect(String((ctx.body as { error?: string }).error)).toContain('未启用')
    expect(startCalls).toHaveLength(0)
  })

  it('start：启用后缺 runId 400、齐参 ok 透传 state', async () => {
    fakeState = { enabled: true, mode: 'idle' }
    const router = await makeRouter()
    const bad = ctxOf('POST', '/api/simrun/supervisor/start', {})
    await dispatch(router, bad)
    expect(bad.status).toBe(BAD_REQUEST)
    expect(startCalls).toHaveLength(0)

    const good = ctxOf('POST', '/api/simrun/supervisor/start', { runId: 'r-42', startStep: 'devimpl' })
    await dispatch(router, good)
    expect(good.status).toBe(OK_STATUS)
    expect(startCalls).toEqual([{ runId: 'r-42', startStep: 'devimpl' }])
    expect((good.body as { state: unknown }).state).toEqual({ enabled: true, mode: 'idle' })
  })

  it('start：领域拒绝（如 owner 被占）映射 409', async () => {
    fakeState = { enabled: true }
    startThrows = 'owner 被其他 instance 持有'
    const router = await makeRouter()
    const ctx = ctxOf('POST', '/api/simrun/supervisor/start', { runId: 'r-9' })
    await dispatch(router, ctx)
    expect(ctx.status).toBe(CONFLICT)
    expect(String((ctx.body as { error?: string }).error)).toContain('owner')
  })

  it('stop：幂等 ok（无论启用态）', async () => {
    const router = await makeRouter()
    const ctx = ctxOf('POST', '/api/simrun/supervisor/stop')
    await dispatch(router, ctx)
    expect(ctx.status).toBe(OK_STATUS)
    expect(stopCalls).toHaveLength(1)
    expect((ctx.body as { ok: boolean }).ok).toBe(true)
  })
})
