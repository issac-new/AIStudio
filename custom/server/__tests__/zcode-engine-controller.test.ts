// overlay/custom/server/__tests__/zcode-engine-controller.test.ts
// S6 守门：/projection/watch 带 sessionId 先 watchWorkspace 再 watchSession（不再首调必失败）；
// retained 按真实意图状态回报（不再无条件 true 谎报意图保留）。
// S8 守门：/checkpoint/recover 逐条 try、逐条回报，ok 由全部命令推导——
// 部分成功 partial:true（防整单重试双写），逐条 rejected 不再谎报 ok:true。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const runtimeMock = vi.hoisted(() => {
  const state = {
    calls: [] as string[],
    intents: new Set<string>(),
    failWorkspace: false,
    failWorkspaceEarly: false,
    failSession: false,
    agentQueue: [] as Array<{ status?: string; reasonCode?: string } | Error>,
  }
  const runtime = {
    connected: false,
    watching: [] as unknown[],
    hasWatchIntent: (p: string) => state.intents.has(p),
    async watchWorkspace(p: string) {
      state.calls.push(`watchWorkspace:${p}`)
      if (state.failWorkspaceEarly) throw new Error('workspacePath 非法')
      state.intents.add(p)
      if (state.failWorkspace) throw new Error('connect ECONNREFUSED 127.0.0.1:3030')
    },
    async watchSession(p: string, s: string) {
      state.calls.push(`watchSession:${s}`)
      if (!state.intents.has(p)) throw new Error(`workspace 未 watch：${p}`)
      if (state.failSession) throw new Error('subscription_failed: boom')
    },
    async unwatch() { /* 测试未用 */ },
    async withAgent(fn: (agent: unknown) => Promise<unknown>) {
      return fn({
        sendConversationCommandV4: async () => {
          const next = state.agentQueue.shift()
          if (next instanceof Error) throw next
          return next ?? { status: 'accepted' }
        },
      })
    },
  }
  return { state, runtime }
})

vi.mock('../zcode/projection-runtime', () => ({
  getZcodeProjectionRuntime: () => runtimeMock.runtime,
}))

import { zcodeEngineRoutes } from '../zcode/engine-controller'

type Handler = (ctx: Record<string, unknown>) => Promise<void>

/** 从 @koa/router 的 layer 栈取裸 handler（不经 HTTP，直接喂 fake ctx）。 */
function handlerFor(method: string, path: string): Handler {
  const layers = (zcodeEngineRoutes as unknown as {
    stack: Array<{ path: string; methods: string[]; stack: Array<(...a: unknown[]) => unknown> }>
  }).stack
  const layer = layers.find((l) => l.path.endsWith(path) && l.methods.includes(method))
  if (!layer) throw new Error(`route not found: ${method} ${path}`)
  return layer.stack[layer.stack.length - 1] as Handler
}

function fakeCtx(body: Record<string, unknown>): Record<string, unknown> {
  return { request: { body }, status: 200, body: undefined }
}

beforeEach(() => {
  runtimeMock.state.calls = []
  runtimeMock.state.intents.clear()
  runtimeMock.state.failWorkspace = false
  runtimeMock.state.failWorkspaceEarly = false
  runtimeMock.state.failSession = false
  runtimeMock.state.agentQueue = []
})

describe('/projection/watch（S6）', () => {
  it('带 sessionId：先 watchWorkspace 再 watchSession（对齐 /mention 路径顺序）', async () => {
    const ctx = fakeCtx({ workspacePath: '/w/p', sessionId: 's1' })
    await handlerFor('POST', '/projection/watch')(ctx)
    expect(runtimeMock.state.calls).toEqual(['watchWorkspace:/w/p', 'watchSession:s1'])
    expect(ctx.body).toMatchObject({ ok: true })
  })

  it('watchSession 失败：503 且 retained 反映真实意图（已登记 → true）', async () => {
    runtimeMock.state.failSession = true
    const ctx = fakeCtx({ workspacePath: '/w/p', sessionId: 's1' })
    await handlerFor('POST', '/projection/watch')(ctx)
    expect(ctx.status).toBe(503)
    expect(ctx.body).toMatchObject({ ok: false, retained: true })
  })

  it('watchWorkspace 未登记意图即失败：retained=false（不再无条件谎报 true）', async () => {
    runtimeMock.state.failWorkspaceEarly = true
    const ctx = fakeCtx({ workspacePath: '/w/p', sessionId: 's1' })
    await handlerFor('POST', '/projection/watch')(ctx)
    expect(ctx.status).toBe(503)
    expect(ctx.body).toMatchObject({ ok: false, retained: false })
  })
})

describe('/checkpoint/recover 逐条结果（S8）', () => {
  const recoverBody = { workspacePath: '/w/p', sessionId: 's1', rowId: 3, entityId: 'e1', mode: 'summarize-from-here' }

  it('全成功 → ok:true，逐条回报（summarize 档两条命令）', async () => {
    runtimeMock.state.agentQueue = [{ status: 'accepted' }, { status: 'accepted' }]
    const ctx = fakeCtx({ ...recoverBody })
    await handlerFor('POST', '/checkpoint/recover')(ctx)
    expect(ctx.body).toMatchObject({ ok: true, mode: 'summarize-from-here' })
    expect((ctx.body as { commands: Array<{ ok: boolean }> }).commands.map((c) => c.ok)).toEqual([true, true])
  })

  it('一条成功一条失败 → ok:false + partial:true + landed 计数（不再一条失败即 503，防整单重试双写）', async () => {
    runtimeMock.state.agentQueue = [{ status: 'accepted' }, new Error('WS closed')]
    const ctx = fakeCtx({ ...recoverBody })
    await handlerFor('POST', '/checkpoint/recover')(ctx)
    expect(ctx.status).toBe(200)
    expect(ctx.body).toMatchObject({ ok: false, partial: true, landed: 1, total: 2 })
    expect((ctx.body as { commands: Array<{ ok: boolean }> }).commands.map((c) => c.ok)).toEqual([true, false])
  })

  it('逐条 rejected → ok:false（不再谎报 ok:true），reason=command_rejected', async () => {
    runtimeMock.state.agentQueue = [
      { status: 'rejected', reasonCode: 'session_busy' },
      { status: 'rejected', reasonCode: 'session_busy' },
    ]
    const ctx = fakeCtx({ ...recoverBody })
    await handlerFor('POST', '/checkpoint/recover')(ctx)
    expect(ctx.status).toBe(200)
    expect(ctx.body).toMatchObject({ ok: false, partial: false, landed: 0, reason: 'command_rejected' })
  })

  it('全部传输层失败 → 503 + reason 词表值（什么都没生效，重试安全）', async () => {
    runtimeMock.state.agentQueue = [
      new Error('connect ECONNREFUSED 127.0.0.1:3030'),
      new Error('connect ECONNREFUSED 127.0.0.1:3030'),
    ]
    const ctx = fakeCtx({ ...recoverBody })
    await handlerFor('POST', '/checkpoint/recover')(ctx)
    expect(ctx.status).toBe(503)
    expect(ctx.body).toMatchObject({ ok: false, partial: false, reason: 'engine_unreachable' })
  })
})
