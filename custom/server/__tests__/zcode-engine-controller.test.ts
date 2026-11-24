// overlay/custom/server/__tests__/zcode-engine-controller.test.ts
// S6 守门：/projection/watch 带 sessionId 先 watchWorkspace 再 watchSession（不再首调必失败）；
// retained 按真实意图状态回报（不再无条件 true 谎报意图保留）。
// S8 守门：/checkpoint/recover 逐条 try、逐条回报，ok 由全部命令推导——
// 部分成功 partial:true（防整单重试双写），逐条 rejected 不再谎报 ok:true。
// X1 收口：/projection/watch|unwatch 同归属闸（403 invocation_not_allowed，引擎侧零调用）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'

const runtimeMock = vi.hoisted(() => {
  const state = {
    calls: [] as string[],
    intents: new Set<string>(),
    failWorkspace: false,
    failWorkspaceEarly: false,
    failSession: false,
    agentCalls: 0,
    agentQueue: [] as Array<{ status?: string; reasonCode?: string } | Error>,
    /** 下发给引擎的信封（按发送顺序）。 */
    sent: [] as Array<Record<string, unknown>>,
    /** 只读取水位的应答队列（N34-1）：空队列回默认基线。 */
    rowsRangeQueue: [] as Array<Record<string, unknown> | Error>,
  }
  const defaultBase = { rows: [], atSeq: 1, atRevision: 7, atLogEpoch: 'epoch-1', hasMore: false }
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
    /** 建会话调用（N34-2 守门：须带 projectId）。 */
    createSessionCalls: [] as Array<Record<string, unknown>>,
    savedProjects: [] as Array<Record<string, unknown>>,
    async withBridge(fn: (bridge: unknown) => Promise<unknown>) {
      state.agentCalls += 1
      return fn({
        project: {
          readProjects: async () => [],
          saveProject: async (input: Record<string, unknown>) => { state.savedProjects.push(input); return { id: 'proj-1', hostId: 'remote:server:h', name: 'w', roots: [{ rootPath: input.roots?.[0] }] } },
        },
        agent: {
          createSession: async (params: Record<string, unknown>) => { state.createSessionCalls.push(params); return { session: { sessionId: 's-9' } } },
          sendConversationCommandV4: async () => ({ status: 'accepted' }),
        },
      })
    },
    async withAgent(fn: (agent: unknown) => Promise<unknown>) {
      state.agentCalls += 1
      return fn({
        sendConversationCommandV4: async (params: { envelope: Record<string, unknown> }) => {
          state.sent.push(params.envelope)
          const next = state.agentQueue.shift()
          if (next instanceof Error) throw next
          return next ?? { status: 'accepted' }
        },
        conversationRowsRangeV4: async () => {
          const next = state.rowsRangeQueue.shift()
          if (next instanceof Error) throw next
          return next ?? defaultBase
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
import { loadEngineCommandValidator } from './helpers/engine-command-validator'
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
  runtimeMock.state.sent = []
  runtimeMock.state.rowsRangeQueue = []
  runtimeMock.state.createSessionCalls = []
  runtimeMock.state.savedProjects = []
})

describe('测试隔离', () => {
  it('测试进程的派单台账不指向真实数据目录（用例会把派发结果写进台账）', async () => {
    const { dispatchLedgerPath } = await import('../governance/dispatch-ledger')
    const real = join(homedir(), '.hermes-web-ui', 'overlay', 'dispatch-ledger.jsonl')
    expect(dispatchLedgerPath()).not.toBe(real)
  })
})

describe('派单建会话前的项目登记（N34-2）', () => {
  it('引擎端口：先按工作区登记项目，再带 projectId 建会话（独立形态引擎要求会话属于已登记项目）', async () => {
    const { getMentionDispatch } = await import('../zcode/engine-controller')
    const service = getMentionDispatch() as unknown as { engine: { createSession: (p: { workspacePath: string }) => Promise<unknown> } }
    const r = await service.engine.createSession({ workspacePath: '/w/p' })
    expect(r).toMatchObject({ session: { sessionId: 's-9' } })
    expect(runtimeMock.state.savedProjects).toEqual([{ roots: ['/w/p'], defaultName: 'p' }])
    expect(runtimeMock.state.createSessionCalls).toEqual([{ workspacePath: '/w/p', projectId: 'proj-1' }])
  })
})

describe('比对基线字段（N34-1）：引擎对分叉、检查点恢复的命令强制要求 baseRevision/baseLogEpoch', () => {
  const forkBody = { workspacePath: '/w/p', sessionId: 's1', rowId: 3, entityId: 'e1' }
  const base = (revision: number) => ({ rows: [], atSeq: revision, atRevision: revision, atLogEpoch: 'epoch-1', hasMore: false })

  it('/fork：信封带基线并通过引擎的 parseCommandEnvelope', async () => {
    const ctx = fakeCtx({ ...forkBody })
    await handlerFor('POST', '/fork')(ctx)
    expect(ctx.body).toMatchObject({ ok: true, status: 'accepted' })
    const env = runtimeMock.state.sent
    expect(env).toHaveLength(1)
    expect(env[0]).toMatchObject({ type: 'forkAssistant', sessionId: 's1', baseRevision: 7, baseLogEpoch: 'epoch-1', payload: { target: { rowId: 3, entityId: 'e1' } } })
    expect(typeof env[0].issuedAt).toBe('number')
    const v = (await loadEngineCommandValidator())(env[0])
    expect(v.ok, v.issues.join('；')).toBe(true)
  })

  it('/fork：引擎回「基线已旧」→ 重取基线用同一 commandId 重发', async () => {
    runtimeMock.state.rowsRangeQueue = [base(7), base(8)]
    runtimeMock.state.agentQueue = [{ status: 'stale', reasonCode: 'proto.staleRevision' }]
    const ctx = fakeCtx({ ...forkBody })
    await handlerFor('POST', '/fork')(ctx)
    expect(ctx.body).toMatchObject({ ok: true, status: 'accepted' })
    const env = runtimeMock.state.sent
    expect(env).toHaveLength(2)
    expect(env[1]).toMatchObject({ baseRevision: 8 })
    expect(env[1].commandId).toBe(env[0].commandId)
  })

  it('/fork：连续过时到达上限 → 如实回报 stale，不再重试', async () => {
    runtimeMock.state.agentQueue = [
      { status: 'stale', reasonCode: 'proto.staleRevision' },
      { status: 'stale', reasonCode: 'proto.staleRevision' },
      { status: 'stale', reasonCode: 'proto.staleRevision' },
    ]
    const ctx = fakeCtx({ ...forkBody })
    await handlerFor('POST', '/fork')(ctx)
    expect(ctx.body).toMatchObject({ ok: false, status: 'stale', reasonCode: 'proto.staleRevision' })
    expect(runtimeMock.state.sent).toHaveLength(3)
  })

  it('取不到基线（引擎没有该会话）→ 409 session_base_unavailable，命令零下发', async () => {
    runtimeMock.state.rowsRangeQueue = [new Error('proto.sessionNotFound')]
    const ctx = fakeCtx({ ...forkBody })
    await handlerFor('POST', '/fork')(ctx)
    expect(ctx.status).toBe(409)
    expect(ctx.body).toMatchObject({ ok: false, reason: 'session_base_unavailable', reasonCode: 'session_base_unavailable' })
    expect(runtimeMock.state.sent).toHaveLength(0)
  })

  it('/checkpoint/recover：四档下发的每个信封都通过引擎校验；取不到基线时零下发', async () => {
    const validate = await loadEngineCommandValidator()
    for (const mode of ['code-and-conversation', 'conversation-only', 'code-only', 'summarize-from-here']) {
      runtimeMock.state.sent = []
      runtimeMock.state.agentQueue = []
      const ctx = fakeCtx({ ...forkBody, mode })
      await handlerFor('POST', '/checkpoint/recover')(ctx)
      expect(ctx.body, mode).toMatchObject({ ok: true })
      expect(runtimeMock.state.sent.length, mode).toBeGreaterThan(0)
      for (const env of runtimeMock.state.sent) {
        const v = validate(env)
        expect(v.ok, `${mode} / ${String(env.type)} 被引擎拒绝：${v.issues.join('；')}`).toBe(true)
      }
    }
    runtimeMock.state.sent = []
    runtimeMock.state.rowsRangeQueue = [new Error('boom')]
    const refused = fakeCtx({ ...forkBody, mode: 'code-only' })
    await handlerFor('POST', '/checkpoint/recover')(refused)
    expect(refused.status).toBe(409)
    expect(refused.body).toMatchObject({ ok: false, reason: 'session_base_unavailable' })
    expect(runtimeMock.state.sent).toHaveLength(0)
  })
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
