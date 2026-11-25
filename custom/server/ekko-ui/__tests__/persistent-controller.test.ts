// @vitest-environment node
// overlay/custom/server/ekko-ui/__tests__/persistent-controller.test.ts
// 批二路由守门：八个接口的状态码与响应形状；写操作失败一律非 2xx；身份来自请求上下文；
// 缺少 profile 时拒绝；路径参数解析。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Context } from 'koa'
import { persistentSurfaceRoutes, setPersistentSurfaceHost } from '../persistent-controller'
import { PersistentSurfaces } from '../persistent-surfaces'
import { SurfaceStore, _resetSurfaceStoreForTests } from '../surface-store'
import { SurfaceError } from '../contract'

let dir: string
const events: Array<{ sessionId: string; event: string; payload: Record<string, unknown> }> = []

function spec(seats = 8) {
  return {
    protocol: 'ekko-ui/v2',
    surfaceId: 'estimator',
    title: '估算器',
    fallbackText: '可调参数的估算卡片。',
    state: { seats },
    root: { id: 'root', type: 'stack', children: [{ id: 's', type: 'range', bind: 'seats', props: { min: 1, max: 50 } }] },
  }
}

const PREFIX = '/api/studio/surfaces'

interface Layer { path: string | RegExp; methods: string[]; stack: unknown[]; keys: Array<{ name: string }> }

function layers(): Layer[] {
  return (persistentSurfaceRoutes as unknown as { stack: Layer[] }).stack
}

/** 用路由中间件直接调，不真起服务：按「前缀 + 路径」匹配到那一层，路径参数按路由器自己的键名解析。 */
/** 与真实路由器同口径的匹配：路径按斜杠分段，段数相等；':xxx' 段匹配任意不含斜杠的段
 *  （冒号在段内合法，2026-11-25 用路由器实测过），其余段字面相等。 */
function findLayer(method: string, path: string): Layer | undefined {
  const wanted = `${PREFIX}${path}`.split('/').filter(Boolean).map(decodeURIComponent)
  return layers().find(layer => {
    if (!layer.methods.includes(method.toUpperCase())) return false
    const pattern = String(layer.path).split('/').filter(Boolean)
    if (pattern.length !== wanted.length) return false
    return pattern.every((segment, index) => segment.startsWith(':') ? wanted[index] !== '' : segment === wanted[index])
  })
}

function makeCtx(layer: Layer, method: string, path: string, options: {
  body?: unknown
  query?: Record<string, unknown>
  profile?: string | null
  userId?: string | null
} = {}): Context {
  const full = `${PREFIX}${path}`
  // 路径参数：按路由器登记的键，依次取对应位置的段（与真实路由器一样先解码）
  const params: Record<string, string> = {}
  const pattern = String(layer.path).split('/').filter(Boolean)
  const segments = full.split('/').filter(Boolean).map(decodeURIComponent)
  pattern.forEach((segment, index) => { if (segment.startsWith(':')) params[segment.slice(1)] = segments[index] })
  return {
    method: method.toUpperCase(),
    path: full,
    params,
    query: options.query ?? {},
    request: { body: options.body },
    state: {
      profile: options.profile === undefined ? { name: 'default' } : options.profile === null ? undefined : { name: options.profile },
      user: options.userId === undefined ? { id: 'u1' } : options.userId === null ? undefined : { id: options.userId },
    },
    status: 200,
    body: undefined as unknown,
    set: () => {},
  } as unknown as Context
}

async function call(method: string, path: string, options: Parameters<typeof makeCtx>[2] = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const layer = findLayer(method, path)
  if (!layer) throw new Error(`no route for ${method.toUpperCase()} ${PREFIX}${path}`)
  const ctx = makeCtx(layer, method, path, options)
  const handler = (layer.stack as Array<(ctx: Context, next: () => Promise<void>) => Promise<void>>).at(-1)!
  await handler(ctx, async () => {})
  return { status: ctx.status, body: ctx.body as Record<string, unknown> }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ekko-ui-routes-'))
  process.env.EKKO_UI_DB = join(dir, 'surfaces.db')
  delete process.env.EKKO_UI_PERSISTENT
  _resetSurfaceStoreForTests()
  events.length = 0
  setPersistentSurfaceHost(new PersistentSurfaces({
    store: new SurfaceStore(),
    resolveTurn: (_contextId, profile) => profile === 'default' ? { sessionId: 's1', runId: 'r1' } : (() => { throw new SurfaceError('no active turn', 409) })(),
    publish: (sessionId, event, payload) => { events.push({ sessionId, event, payload }) },
    isEnabled: () => process.env.EKKO_UI_PERSISTENT !== '0',
  }))
})

afterEach(() => {
  setPersistentSurfaceHost(null)
  _resetSurfaceStoreForTests()
  delete process.env.EKKO_UI_DB
  rmSync(dir, { recursive: true, force: true })
})

const OWNER = { profile: 'default', userId: 'u1' }

describe('路由表', () => {
  it('注册了规格列出的八个接口', () => {
    const table = layers()
      .map(layer => `${layer.methods.filter(m => m !== 'HEAD' && m !== 'OPTIONS').join(',')} ${PREFIX}${String(layer.path).split('/api/studio/surfaces')[1]}`)
      .sort()
    expect(table).toEqual([
      'GET /api/studio/surfaces/:surfaceId',
      'GET /api/studio/surfaces/catalog',
      'POST /api/studio/surfaces/:surfaceId/actions',
      'POST /api/studio/surfaces/close',
      'POST /api/studio/surfaces/create',
      'POST /api/studio/surfaces/inspect',
      'POST /api/studio/surfaces/update',
      'PUT /api/studio/surfaces/:surfaceId/state',
    ])
    expect(persistentSurfaceRoutes.opts.prefix).toBe(PREFIX)
  })
})

describe('MCP 侧接口', () => {
  it('创建：201 + 回执；不等待、立即返回', async () => {
    const res = await call('POST', '/create', { body: { context_id: 'ctx-1', spec: spec() } })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ ok: true, surface_id: 'srf:s1:estimator', revision: 1, status: 'active', title: '估算器' })
    expect(res.body).not.toHaveProperty('spec')
    expect(events.map(e => e.event)).toEqual(['ui.surface.presented'])
  })

  it('更新：200 + 新版本；校验失败 422 且 problems 逐条可修', async () => {
    await call('POST', '/create', { body: { context_id: 'ctx-1', spec: spec() } })
    const okRes = await call('POST', '/update', { body: { surface_id: 'srf:s1:estimator', base_revision: 1, patches: [{ op: 'set-props', nodeId: 's', props: { max: 99 } }] } })
    expect(okRes.status).toBe(200)
    expect(okRes.body).toMatchObject({ ok: true, revision: 2, changed: ['s'] })

    const bad = await call('POST', '/update', { body: { surface_id: 'srf:s1:estimator', base_revision: 1, patches: [{ op: 'remove-node', nodeId: 'root' }] } })
    expect(bad.status).toBe(422)
    expect(bad.body.ok).toBe(false)
    expect(bad.body.error).toContain('根节点')
    expect(bad.body.problems).toHaveLength(1)
    expect(bad.body.problems[0]).toMatch(/^patches\[0\]\.nodeId：.*根节点.*（patch\.root_removed）$/)
  })

  it('版本冲突 409 + current_revision；不存在 404；入参缺失 400；开关关闭 503', async () => {
    await call('POST', '/create', { body: { context_id: 'ctx-1', spec: spec() } })
    await call('POST', '/update', { body: { surface_id: 'srf:s1:estimator', base_revision: 1, spec: spec(2) } })
    const conflict = await call('POST', '/update', { body: { surface_id: 'srf:s1:estimator', base_revision: 1, spec: spec(3) } })
    expect(conflict.status).toBe(409)
    expect(conflict.body.current_revision).toBe(2)
    expect(conflict.body.error).toContain('current is 2')

    expect((await call('POST', '/inspect', { body: { surface_id: 'srf:nope:x' } })).status).toBe(404)
    expect((await call('POST', '/create', { body: { spec: spec() } })).status).toBe(400)
    expect((await call('POST', '/update', { body: { surface_id: 'srf:s1:estimator', base_revision: 'x', spec: spec(3) } })).status).toBe(400)

    process.env.EKKO_UI_PERSISTENT = '0'
    const off = await call('POST', '/create', { body: { context_id: 'ctx-1', spec: { ...spec(), surfaceId: 'another' } } })
    expect(off.status).toBe(503)
    // 查看与目录不受开关影响
    expect((await call('POST', '/inspect', { body: { surface_id: 'srf:s1:estimator' } })).status).toBe(200)
    expect((await call('GET', '/catalog')).status).toBe(200)
  })

  it('查看与关闭', async () => {
    await call('POST', '/create', { body: { context_id: 'ctx-1', spec: spec() } })
    const seen = await call('POST', '/inspect', { body: { surface_id: 'srf:s1:estimator', include_state: true } })
    expect(seen.status).toBe(200)
    expect(seen.body).toMatchObject({ ok: true, revision: 1, status: 'active', nodes: expect.any(Array), state: {} })
    const closed = await call('POST', '/close', { body: { surface_id: 'srf:s1:estimator' } })
    expect(closed.status).toBe(200)
    expect(closed.body).toMatchObject({ ok: true, status: 'closed' })
    expect(events.at(-1)?.event).toBe('ui.surface.closed')
  })

  it('目录：可按关键词与类别过滤', async () => {
    const all = await call('GET', '/catalog')
    expect(all.status).toBe(200)
    expect((all.body.catalog as { components: unknown[] }).components.length).toBeGreaterThanOrEqual(38)
    const filtered = await call('GET', '/catalog', { query: { q: 'metric' } })
    expect((filtered.body.catalog as { components: Array<{ type: string }> }).components.map(item => item.type)).toEqual(['metric'])
    const byCategory = await call('GET', '/catalog', { query: { category: 'layout' } })
    expect((byCategory.body.catalog as { components: Array<{ type: string }> }).components.map(item => item.type)).toContain('tabs')
  })
})

describe('客户端侧接口', () => {
  it('读取：有则 available:true + surface；归属不符 available:false（200）；缺 profile 400', async () => {
    await call('POST', '/create', { body: { context_id: 'ctx-1', spec: spec() } })
    const mine = await call('GET', '/srf:s1:estimator', { query: { profile: 'default' } })
    expect(mine.status).toBe(200)
    expect(mine.body).toMatchObject({ ok: true, available: true, surface: { surface_id: 'srf:s1:estimator', revision: 1, state: {} } })

    const otherUser = await call('GET', '/srf:s1:estimator', { query: { profile: 'default' }, userId: 'u2' })
    expect(otherUser.status).toBe(200)
    expect(otherUser.body).toEqual({ ok: true, available: false })

    expect((await call('GET', '/srf:s1:estimator', { query: {}, profile: null })).status).toBe(400)
  })

  it('保存状态：需要 profile、revision、state；越界版本 409；关闭后 409', async () => {
    await call('POST', '/create', { body: { context_id: 'ctx-1', spec: spec() } })
    const saved = await call('PUT', '/srf:s1:estimator/state', { query: { profile: 'default' }, body: { revision: 1, state: { seats: 22 } } })
    expect(saved.status).toBe(200)
    expect(saved.body).toMatchObject({ ok: true, state_updated_at: expect.any(Number) })

    expect((await call('PUT', '/srf:s1:estimator/state', { query: {}, body: { revision: 1, state: {} } })).status).toBe(400)
    expect((await call('PUT', '/srf:s1:estimator/state', { query: { profile: 'default' }, body: { state: {} } })).status).toBe(400)
    expect((await call('PUT', '/srf:s1:estimator/state', { query: { profile: 'default' }, body: { revision: 9, state: {} } })).status).toBe(409)
    // 类型不对是入参不合法（400），不是版本冲突（409）
    expect((await call('PUT', '/srf:s1:estimator/state', { query: { profile: 'default' }, body: { revision: 'x', state: {} } })).status).toBe(400)
    expect((await call('PUT', '/srf:s1:estimator/state', { query: { profile: 'default' }, body: { revision: 1.5, state: {} } })).status).toBe(400)
    expect((await call('PUT', '/srf:s1:estimator/state', { query: { profile: 'default' }, body: { revision: 1, state: 'x' } })).status).toBe(400)

    await call('POST', '/close', { body: { surface_id: 'srf:s1:estimator' } })
    expect((await call('PUT', '/srf:s1:estimator/state', { query: { profile: 'default' }, body: { revision: 1, state: {} } })).status).toBe(409)
  })

  it('记录提交：需要 action_id；payload 超限 413；提交不改变界面状态', async () => {
    await call('POST', '/create', { body: { context_id: 'ctx-1', spec: spec() } })
    const recorded = await call('POST', '/srf:s1:estimator/actions', { query: { profile: 'default' }, body: { revision: 1, action_id: 'submit', payload: { seats: 22 } } })
    expect(recorded.status).toBe(200)
    expect(recorded.body).toEqual({ ok: true, surface_id: 'srf:s1:estimator', revision: 1, action_id: 'submit' })
    expect(new SurfaceStore().get('srf:s1:estimator', OWNER)?.status).toBe('active')

    expect((await call('POST', '/srf:s1:estimator/actions', { query: { profile: 'default' }, body: { revision: 1, action_id: '../x', payload: {} } })).status).toBe(400)
    const wide: Record<string, string> = {}
    for (let i = 0; i < 12; i++) wide[`k${i}`] = 'x'.repeat(3000)
    expect((await call('POST', '/srf:s1:estimator/actions', { query: { profile: 'default' }, body: { revision: 1, action_id: 'submit', payload: wide } })).status).toBe(413)
  })

  it('编号不合规直接 400：编码进斜杠、缺段、带非法字符', async () => {
    await call('POST', '/create', { body: { context_id: 'ctx-1', spec: spec() } })
    expect((await call('GET', '/srf%3As1%3Aestimator%2Fstate')).status).toBe(400)
    expect((await call('PUT', '/srf%3As1%3Aestimator%2Fstate/state', { query: { profile: 'default' }, body: { revision: 1, state: {} } })).status).toBe(400)
    expect((await call('GET', '/srf:s1:estimator%20x')).status).toBe(400)
    expect((await call('POST', '/srf%3As1/actions', { query: { profile: 'default' }, body: { revision: 1, action_id: 'close' } })).status).toBe(400)
  })

  it('用户关闭：沿用 actions 接口的 close 动作', async () => {
    await call('POST', '/create', { body: { context_id: 'ctx-1', spec: spec() } })
    const closed = await call('POST', '/srf:s1:estimator/actions', { query: { profile: 'default' }, body: { revision: 1, action_id: 'close' } })
    expect(closed.status).toBe(200)
    expect(closed.body).toMatchObject({ ok: true, status: 'closed' })
    expect(new SurfaceStore().get('srf:s1:estimator', OWNER)?.status).toBe('closed')
    expect(events.at(-1)).toMatchObject({ event: 'ui.surface.closed', payload: { reason: 'user' } })
  })
})
