// overlay/custom/server/controllers/ia2/__tests__/identity-chat.test.ts
// 统一身份聊天守门（2026-10-23 五轮）：身份清单目录全集+在线态投影、
// ensureBotChat 找回→mint→冲突兜竞态、chat 超时转 queued 不报错。
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    readFileSync: (p: string) => {
      if (String(p).endsWith('.env')) return 'API_SERVER_KEY=test-key\n'
      return actual.readFileSync(p)
    },
    readdirSync: (p: string) => (String(p).endsWith('profiles') ? ['_shared', 'worker-coder', 'orchestrator', 'data-arch'] : actual.readdirSync(p)),
    statSync: (p: string) => actual.statSync(p),
  }
})

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

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
    expect(ctx.status).toBe(0)
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
