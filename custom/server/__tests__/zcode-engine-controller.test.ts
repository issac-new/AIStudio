// overlay/custom/server/__tests__/zcode-engine-controller.test.ts
// S6 守门：/projection/watch 带 sessionId 先 watchWorkspace 再 watchSession（不再首调必失败）；
// retained 按真实意图状态回报（不再无条件 true 谎报意图保留）。
// S8 守门：/checkpoint/recover 逐条 try、逐条回报，ok 由全部命令推导——
// 部分成功 partial:true（防整单重试双写），逐条 rejected 不再谎报 ok:true。
// X1 收口：/projection/watch|unwatch 同归属闸（403 invocation_not_allowed，引擎侧零调用）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const runtimeMock = vi.hoisted(() => {
  const state = {
    calls: [] as string[],
    intents: new Set<string>(),
    failWorkspace: false,
    failWorkspaceEarly: false,
    failSession: false,
    agentCalls: 0,
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
    async unwatch(p: string) { state.calls.push(`unwatch:${p}`) },
    async withAgent(fn: (agent: unknown) => Promise<unknown>) {
      state.agentCalls += 1
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
import { canUseWorkspace, setWorkspaceAccessDepsForTests } from '../zcode/workspace-access'

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

function fakeCtx(body: Record<string, unknown>, state: Record<string, unknown> = {}): Record<string, unknown> {
  return { request: { body }, state, status: 200, body: undefined }
}

beforeEach(() => {
  runtimeMock.state.calls = []
  runtimeMock.state.intents.clear()
  runtimeMock.state.failWorkspace = false
  runtimeMock.state.failWorkspaceEarly = false
  runtimeMock.state.failSession = false
  runtimeMock.state.agentCalls = 0
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

describe('X1 归属闸（mention/checkpoint 须注册于 Studio 会话注册表）', () => {
  const asUser = (role = 'admin') => ({ user: { id: 1, username: 'alice', role } })
  const registeredDeps = {
    listSessions: () => [{ profile: 'default', workspace: '/w/p' }],
    userCanAccessProfile: (_id: number | string, profile: string) => profile === 'default',
  }

  beforeEach(() => { setWorkspaceAccessDepsForTests(registeredDeps) })
  afterEach(() => { setWorkspaceAccessDepsForTests(null) })

  it('登录用户对未注册路径：/mention 403 invocation_not_allowed，引擎零调用', async () => {
    const ctx = fakeCtx({ workspacePath: '/w/other', text: '@zcode hi' }, asUser())
    await handlerFor('POST', '/mention')(ctx)
    expect(ctx.status).toBe(403)
    expect(ctx.body).toMatchObject({ ok: false, reason: 'invocation_not_allowed' })
    expect(runtimeMock.state.agentCalls).toBe(0)
    expect(runtimeMock.state.calls).toEqual([])
  })

  it('登录用户对未注册路径：/checkpoint/recover 同样 403，命令零下发', async () => {
    const ctx = fakeCtx({ workspacePath: '/w/other', sessionId: 's1', rowId: 3, entityId: 'e1', mode: 'summarize-from-here' }, asUser())
    await handlerFor('POST', '/checkpoint/recover')(ctx)
    expect(ctx.status).toBe(403)
    expect(ctx.body).toMatchObject({ ok: false, reason: 'invocation_not_allowed' })
    expect(runtimeMock.state.agentCalls).toBe(0)
  })

  it('登录用户对未注册路径：/projection/watch|unwatch 同样 403，投影零建立/零拆除（X1 收口）', async () => {
    const watch = fakeCtx({ workspacePath: '/w/other', sessionId: 's1' }, asUser())
    await handlerFor('POST', '/projection/watch')(watch)
    expect(watch.status).toBe(403)
    expect(watch.body).toMatchObject({ ok: false, reason: 'invocation_not_allowed' })
    expect(runtimeMock.state.calls).toEqual([]) // 引擎侧零连接/零订阅
    const unwatch = fakeCtx({ workspacePath: '/w/other' }, asUser())
    await handlerFor('POST', '/projection/unwatch')(unwatch)
    expect(unwatch.status).toBe(403)
    expect(unwatch.body).toMatchObject({ ok: false, reason: 'invocation_not_allowed' })
    expect(runtimeMock.state.calls).toEqual([])
  })

  it('已注册且 profile 可见 → /projection/watch 正常建立投影（归属闸不误伤本人路径）', async () => {
    const ctx = fakeCtx({ workspacePath: '/w/p', sessionId: 's1' }, asUser())
    await handlerFor('POST', '/projection/watch')(ctx)
    expect(ctx.body).toMatchObject({ ok: true })
    expect(runtimeMock.state.calls).toEqual(['watchWorkspace:/w/p', 'watchSession:s1'])
  })

  it('已注册且 profile 可见 → 放行（checkpoint 正常下发命令）', async () => {
    runtimeMock.state.agentQueue = [{ status: 'accepted' }, { status: 'accepted' }]
    const ctx = fakeCtx({ workspacePath: '/w/p/', sessionId: 's1', rowId: 3, entityId: 'e1', mode: 'summarize-from-here' }, asUser())
    await handlerFor('POST', '/checkpoint/recover')(ctx)
    expect(ctx.body).toMatchObject({ ok: true, mode: 'summarize-from-here' })
  })

  it('super_admin 直通；未启用鉴权（无 ctx.state.user）放行（单用户部署）', async () => {
    const asRoot = fakeCtx({ workspacePath: '/w/anywhere', text: '@zcode hi' }, asUser('super_admin'))
    await handlerFor('POST', '/mention')(asRoot)
    expect(asRoot.status).not.toBe(403)
    const anon = fakeCtx({ workspacePath: '/w/anywhere', text: '@zcode hi' })
    await handlerFor('POST', '/mention')(anon)
    expect(anon.status).not.toBe(403)
    setWorkspaceAccessDepsForTests(null) // 归属面不可用 → 对登录用户 fail closed
    const locked = fakeCtx({ workspacePath: '/w/anywhere', text: '@zcode hi' }, asUser())
    await handlerFor('POST', '/mention')(locked)
    expect(locked.status).toBe(403)
  })
})

describe('X1 归属判定（canUseWorkspace 纯面）', () => {
  const deps = {
    listSessions: () => [
      { profile: 'default', workspace: '/w/p' },
      { profile: 'ops', workspace: '/w/ops' },
    ],
    userCanAccessProfile: (_id: number | string, profile: string) => profile === 'default',
  }

  it('未注册 → 拒；已注册但 profile 不可见 → 拒；可见 → 过（路径归一化后比对）', () => {
    const alice = { id: 1, username: 'alice', role: 'admin' }
    expect(canUseWorkspace(alice, '/w/p', deps)).toBe(true)
    expect(canUseWorkspace(alice, '/w/p/', deps)).toBe(true) // 尾分隔符归一化
    expect(canUseWorkspace(alice, '/w/other', deps)).toBe(false)
    expect(canUseWorkspace(alice, '/w/ops', deps)).toBe(false) // profile 不可见
  })

  it('无调用方（未启用鉴权）放行；super_admin 放行；无归属面 fail closed', () => {
    expect(canUseWorkspace(null, '/w/anything', deps)).toBe(true)
    expect(canUseWorkspace({ id: 2, role: 'super_admin' }, '/w/anything', deps)).toBe(true)
    expect(canUseWorkspace({ id: 1, role: 'admin' }, '/w/p', null)).toBe(false)
  })
})
