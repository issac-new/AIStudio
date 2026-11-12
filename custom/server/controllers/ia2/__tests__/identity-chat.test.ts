// overlay/custom/server/controllers/ia2/__tests__/identity-chat.test.ts
// 统一身份聊天守门（2026-10-23 五轮）：身份清单目录全集+在线态投影、
// ensureBotChat 找回→mint→冲突兜竞态、chat 超时转 queued 不报错。
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  // profiles 夹具条目无真身：readdirSync 已劫持为固定清单，statSync 必须随夹具
  // 语义返回目录真（此前透传真盘——本机恰好存在同名真实 ~/.hermes/profiles
  // 档案才绿＝测宿主状态；CI 上 statSync ENOENT 被实现吞成空清单，identities 恒 []，
  // 2026-11-12 CI 平台差异清偿）。
  const PROFILE_FIXTURE = ['_shared', 'worker-coder', 'orchestrator', 'data-arch']
  return {
    ...actual,
    readFileSync: (p: string) => {
      if (String(p).endsWith('.env')) return 'API_SERVER_KEY=test-key\n'
      return actual.readFileSync(p)
    },
    readdirSync: (p: string) => (String(p).endsWith('profiles') ? PROFILE_FIXTURE : actual.readdirSync(p)),
    statSync: (p: string) => {
      const s = String(p)
      const name = s.slice(Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')) + 1)
      if (/(^|[/\\])profiles[/\\]/.test(s) && PROFILE_FIXTURE.includes(name)) {
        return { isDirectory: () => true } as unknown as ReturnType<typeof actual.statSync>
      }
      return actual.statSync(p)
    },
  }
})

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// ── 批2（Matrix 远程身份）可变夹具：默认空/缺席，既有网关用例不受影响 ──
let rosterMarkdown = ''
let sessionFixture: { homeserverUrl: string; userId: string; accessToken: string } | null = null
const sendMock = vi.fn(async () => {})
vi.mock('../../../governance/registry-admin', () => ({
  readRegistry: vi.fn(async () => ({ markdown: rosterMarkdown, commit: 'test' })),
}))
vi.mock('../../../matrix/gateway-env', () => ({
  readGatewayMatrixEnv: vi.fn(() => null),
}))
vi.mock('../../../matrix/session-store', () => ({
  loadMatrixSession: vi.fn(() => sessionFixture),
}))
vi.mock('../../../matrix/raci-matrix', () => ({
  matrixSendMessage: sendMock,
}))

const mod = await import('../identity-chat')

function jsonRes(body: unknown, ok = true, status = 200): Response {
  return { ok, status, text: async () => JSON.stringify(body) } as unknown as Response
}

describe('身份清单（identities）', () => {
  beforeEach(() => { fetchMock.mockReset() })

  it('目录全集（排除 _ 前缀）+ platforms 前缀在线态', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({
      platforms: { 'orchestrator:matrix': { state: 'connected' }, api_server: { state: 'connected' }, feishu: { state: 'retrying' } },
    }))
    const mw = (mod as unknown as { identityChatNativeRoutes: () => (c: unknown, n: () => Promise<void>) => Promise<void> }).identityChatNativeRoutes()
    const ctx = { method: 'GET', path: '/api/ia2/identities', set: vi.fn(), status: 0, body: null }
    await mw(ctx, async () => {})
    const body = ctx.body as { identities: Array<{ id: string; online: boolean }> }
    expect(body.identities.map(i => i.id)).toEqual(['data-arch', 'orchestrator', 'worker-coder'])
    expect(body.identities.find(i => i.id === 'orchestrator')?.online).toBe(true)
    expect(body.identities.find(i => i.id === 'worker-coder')?.online).toBe(false)
  })

  it('网关不可达 → 身份清单照常返回（全部离线态，在线探测 fail-soft）', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const mw = (mod as unknown as { identityChatNativeRoutes: () => (c: unknown, n: () => Promise<void>) => Promise<void> }).identityChatNativeRoutes()
    const ctx = { method: 'GET', path: '/api/ia2/identities', set: vi.fn(), status: 0, body: null }
    await mw(ctx, async () => {})
    // K19 清偿后成功路径经 lib/http ok() 显式置 200（旧断言 0＝未设态的实现怪癖，
    // 真 koa 下两者行为等同 200）
    expect(ctx.status).toBe(200)
    const body = ctx.body as { identities: Array<{ id: string; online: boolean }> }
    expect(body.identities.map(i => i.id)).toEqual(['data-arch', 'orchestrator', 'worker-coder'])
    expect(body.identities.every(i => !i.online)).toBe(true)
  })
})

describe('身份聊天中间件路由', () => {
  it('非匹配路径放行 next', async () => {
    const mw = (mod as unknown as { identityChatNativeRoutes: () => (c: unknown, n: () => Promise<void>) => Promise<void> }).identityChatNativeRoutes()
    const ctx = { method: 'GET', path: '/api/other', set: vi.fn() }
    let nexted = false
    await mw(ctx, async () => { nexted = true })
    expect(nexted).toBe(true)
  })

  it('POST chat：ensure（找回已有）→ 转发网关 → 回执投影', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ data: [{ id: 'local-s1', title: 'Bot Chat' }] }))
    fetchMock.mockResolvedValueOnce(jsonRes({ object: 'hermes.session.chat.completion', message: { content: '收到' } }))
    const mw = (mod as unknown as { identityChatNativeRoutes: () => (c: unknown, n: () => Promise<void>) => Promise<void> }).identityChatNativeRoutes()
    const ctx = { method: 'POST', path: '/api/ia2/identity-chat/worker-coder/chat', set: vi.fn(), request: { body: { message: 'hi' } }, body: null as unknown, status: 0 }
    await mw(ctx, async () => {})
    const body = ctx.body as { ok: boolean; sessionId: string; reply: string; queued: boolean }
    expect(body.ok).toBe(true)
    expect(body.sessionId).toBe('local-s1')
    expect(body.reply).toBe('收到')
    // 序：calls[0]=findBotChat(list) → calls[1]=chat 转发（带 profile 前缀）
    const chatCall = fetchMock.mock.calls.at(-1)?.[0] as string
    expect(chatCall).toContain('/p/worker-coder/api/sessions/local-s1/chat')
  })
})

describe('身份聊天 profile 授权', () => {
  const deps = {
    canAccessProfile: (user: { id: number }, profile: string) => user.id === 1 && profile === 'worker-coder',
  }
  const mw = () => (mod as unknown as {
    identityChatNativeRoutes: (deps?: unknown) => (c: unknown, n: () => Promise<void>) => Promise<void>
  }).identityChatNativeRoutes(deps)

  beforeEach(() => { fetchMock.mockReset() })

  it('身份清单只返回当前账户可见 profiles；无可见 profile 时为空', async () => {
    fetchMock.mockResolvedValue(jsonRes({ platforms: {} }))
    const alice = {
      method: 'GET', path: '/api/ia2/identities', set: vi.fn(), status: 0, body: null as unknown,
      state: { user: { id: 1, role: 'user' } },
    }
    await mw()(alice, async () => {})
    expect((alice.body as { identities: Array<{ id: string }> }).identities.map(identity => identity.id)).toEqual(['worker-coder'])

    const nobody = {
      method: 'GET', path: '/api/ia2/identities', set: vi.fn(), status: 0, body: null as unknown,
      state: { user: { id: 2, role: 'user' } },
    }
    await mw()(nobody, async () => {})
    expect((nobody.body as { identities: unknown[] }).identities).toEqual([])
  })

  it('历史读取在 ensure Bot Chat 和网关调用之前拒绝他人 profile', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/messages')) return jsonRes({ messages: [{ role: 'assistant', content: '他人历史' }] })
      return jsonRes({ data: [{ id: 'other-s1', title: 'Bot Chat' }] })
    })
    const ctx = {
      method: 'GET', path: '/api/ia2/identity-chat/orchestrator/messages', query: {}, set: vi.fn(), status: 0, body: null as unknown,
      state: { user: { id: 1, role: 'user' } },
    }
    await mw()(ctx, async () => {})
    expect(ctx.status).toBe(403)
    expect(ctx.body).toMatchObject({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('聊天调用在 ensure Bot Chat 和消息入队之前拒绝他人 profile', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/chat')) return jsonRes({ object: 'hermes.session.chat.completion', message: { content: '不应执行' } })
      return jsonRes({ data: [{ id: 'other-s1', title: 'Bot Chat' }] })
    })
    const ctx = {
      method: 'POST', path: '/api/ia2/identity-chat/orchestrator/chat', set: vi.fn(), status: 0, body: null as unknown,
      request: { body: { message: '越权调用' } }, state: { user: { id: 1, role: 'user' } },
    }
    await mw()(ctx, async () => {})
    expect(ctx.status).toBe(403)
    expect(ctx.body).toMatchObject({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('super_admin 不受 profile 清单过滤，无鉴权上下文维持原目录全集', async () => {
    fetchMock.mockResolvedValue(jsonRes({ platforms: {} }))
    const root = {
      method: 'GET', path: '/api/ia2/identities', set: vi.fn(), status: 0, body: null as unknown,
      state: { user: { id: 9, role: 'super_admin' } },
    }
    await mw()(root, async () => {})
    expect((root.body as { identities: unknown[] }).identities).toHaveLength(3)

    const local = { method: 'GET', path: '/api/ia2/identities', set: vi.fn(), status: 0, body: null as unknown }
    await mw()(local, async () => {})
    expect((local.body as { identities: unknown[] }).identities).toHaveLength(3)
  })
})

describe('批2：Matrix 远程身份（roster→DM）', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    sendMock.mockClear()
    rosterMarkdown = ''
    sessionFixture = { homeserverUrl: 'http://hs.test', userId: '@self:hs.test', accessToken: 'tok' }
  })

  it('identities 混入 roster 身份（kind:matrix，排除自身，AI/人类都收）', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ platforms: {} }))
    rosterMarkdown = '# 账号绑定台账（roster）\n\n| 账号 | AI 助理账号 | 角色 |\n| --- | --- | --- |\n| @self:hs.test | @self-agent:hs.test | 本机 |\n| @peer-a:hs.test | @peer-a-agent:hs.test | 研发 |\n'
    const mw = (mod as unknown as { identityChatNativeRoutes: () => (c: unknown, n: () => Promise<void>) => Promise<void> }).identityChatNativeRoutes()
    const ctx = { method: 'GET', path: '/api/ia2/identities', set: vi.fn(), status: 0, body: null }
    await mw(ctx, async () => {})
    const body = ctx.body as { identities: Array<{ kind: string; id: string; online: boolean }> }
    const matrix = body.identities.filter(i => i.kind === 'matrix')
    // 自身（人类号）排除；自身 AI 号/对端双号保留——都是可聊对象
    expect(matrix.map(i => i.id).sort()).toEqual(['@peer-a-agent:hs.test', '@peer-a:hs.test', '@self-agent:hs.test'])
    expect(matrix.every(i => i.online === false)).toBe(true)
  })

  it('roster 缺席 → 网关身份照常（fail-soft）', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ platforms: {} }))
    const mw = (mod as unknown as { identityChatNativeRoutes: () => (c: unknown, n: () => Promise<void>) => Promise<void> }).identityChatNativeRoutes()
    const ctx = { method: 'GET', path: '/api/ia2/identities', set: vi.fn(), status: 0, body: null }
    await mw(ctx, async () => {})
    const body = ctx.body as { identities: Array<{ kind: string }> }
    expect(body.identities.every(i => i.kind === 'gateway')).toBe(true)
  })

  it('POST chat（matrix 分支）：无既有 DM → 建房→回写映射→发送→queued 回执', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({}, false, 404))   // m.direct account_data 无
      .mockResolvedValueOnce(jsonRes({ room_id: '!r1:hs.test' })) // createRoom
      .mockResolvedValueOnce(jsonRes({}))               // 回写 m.direct（best-effort）
    const mw = (mod as unknown as { identityChatNativeRoutes: () => (c: unknown, n: () => Promise<void>) => Promise<void> }).identityChatNativeRoutes()
    const ctx = { method: 'POST', path: '/api/ia2/identity-chat/' + encodeURIComponent('@peer-a:hs.test') + '/chat', set: vi.fn(), request: { body: { message: 'hi matrix' } }, body: null, status: 0 }
    await mw(ctx, async () => {})
    const body = ctx.body as { ok: boolean; sessionId: string; queued: boolean }
    expect(body.ok).toBe(true)
    expect(body.sessionId).toBe('!r1:hs.test')
    expect(body.queued).toBe(true)
    expect(sendMock).toHaveBeenCalledTimes(1)
    const [envArg, roomId, text] = sendMock.mock.calls[0] as unknown as [unknown, string, string]
    expect(roomId).toBe('!r1:hs.test')
    expect(text).toBe('hi matrix')
    const createCall = fetchMock.mock.calls[1]
    expect(String(createCall[0])).toContain('/createRoom')
    expect(JSON.parse(String(createCall[1]?.body))).toMatchObject({ is_direct: true, invite: ['@peer-a:hs.test'] })
  })

  it('GET messages（matrix 分支）：既有 DM 房时间线→role 映射（自己=user 对端=assistant）', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ content: { '@peer-a:hs.test': ['!r1:hs.test'] } })) // m.direct 命中
      .mockResolvedValueOnce(jsonRes({ chunk: [
        { type: 'm.room.message', sender: '@peer-a:hs.test', content: { msgtype: 'm.text', body: '你好' }, origin_server_ts: 2 },
        { type: 'm.room.message', sender: '@self:hs.test', content: { msgtype: 'm.text', body: 'hi matrix' }, origin_server_ts: 1 },
        { type: 'm.room.member', sender: '@self:hs.test', content: {} }, // 非文本事件过滤
      ] }))
    const mw = (mod as unknown as { identityChatNativeRoutes: () => (c: unknown, n: () => Promise<void>) => Promise<void> }).identityChatNativeRoutes()
    const ctx = { method: 'GET', path: '/api/ia2/identity-chat/' + encodeURIComponent('@peer-a:hs.test') + '/messages', set: vi.fn(), status: 0, body: null }
    await mw(ctx, async () => {})
    const body = ctx.body as { sessionId: string; messages: Array<{ role: string; content: string }> }
    expect(body.sessionId).toBe('!r1:hs.test')
    expect(body.messages).toEqual([
      { role: 'user', content: 'hi matrix', at: 1 },
      { role: 'assistant', content: '你好', at: 2 },
    ])
  })

  it('matrix 通道缺席 → 409 fail-closed（不猜通道）', async () => {
    sessionFixture = null
    const mw = (mod as unknown as { identityChatNativeRoutes: () => (c: unknown, n: () => Promise<void>) => Promise<void> }).identityChatNativeRoutes()
    const ctx = { method: 'POST', path: '/api/ia2/identity-chat/' + encodeURIComponent('@peer-a:hs.test') + '/chat', set: vi.fn(), request: { body: { message: 'x' } }, body: null, status: 0 }
    await mw(ctx, async () => {})
    expect(ctx.status).toBe(409)
  })

  it('isMatrixIdentityId 形态判定（@local:server 才走 matrix 分支）', () => {
    const f = (mod as unknown as { isMatrixIdentityId: (id: string) => boolean }).isMatrixIdentityId
    expect(f('@peer-a:hs.test')).toBe(true)
    expect(f('worker-coder')).toBe(false)
    expect(f('@nodomain')).toBe(false)
  })
})
