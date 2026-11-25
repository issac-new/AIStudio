// @vitest-environment node
// overlay/custom/server/ekko-ui/__tests__/persistent-lifecycle-http.test.ts
// 批二持久式界面的活体链路：真 Koa + 真 HTTP + 临时库，把任务卡的五步走完——
// 创建即返回回执 → 按版本续改同一块界面 → 读回最新版本与用户已填的值 → 记录提交 → 关闭变只读。
//
// 为什么要有这一份（2026-11-25）：persistent-controller.test.ts 用「手工匹配路由层」调接口，
// 绕开了真实请求体解析、路径参数解码与响应序列化；而真实会话走查依赖开发服务与自主智能体，
// 会触碰宿主环境。这一份夹在中间——链路是真的，环境是隔离的。
// 轮次登记表模拟上游 SurfaceRuns 的职责（一个活跃轮对应一个会话），语义与 resolveTurn 一致。
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SurfaceError } from '../contract'
import type { SurfaceStore } from '../surface-store'
import type { PersistentSurfaces } from '../persistent-surfaces'

const dir = mkdtempSync(join(tmpdir(), 'ekko-lifecycle-'))
process.env.EKKO_UI_DB = join(dir, 'surfaces.db')

/** 上游 SurfaceRuns 的替身：登记一个活跃轮；轮次表里没有即视为无活跃轮。 */
const turns = new Map<string, { sessionId: string; runId: string }>()
const published: Array<{ sessionId: string; event: string; payload: Record<string, unknown> }> = []
const deps = {
  store: undefined as unknown as SurfaceStore,
  resolveTurn: (contextId: string, profile: string) => {
    const turn = turns.get(`${profile}\0${contextId}`)
    if (!turn) throw new SurfaceError('Surface context is unavailable or has expired', 409)
    return turn
  },
  publish: (sessionId: string, event: string, payload: Record<string, unknown>) => {
    published.push({ sessionId, event, payload })
  },
  isEnabled: () => process.env.EKKO_UI_PERSISTENT !== '0',
}

const PREFIX = '/api/studio/surfaces'
let base = ''
let server: ReturnType<typeof createServer>
let host: PersistentSurfaces

/** 2026-11-25 真实会话里模型最终写对的规格（座位估算器）。 */
const estimator = {
  protocol: 'ekko-ui/v2', surfaceId: 'seat-estimator', title: '座位估算器', fallbackText: '座位估算卡片。',
  state: { seats: 8 },
  root: { id: 'root', type: 'stack', children: [
    { id: 'seats-slider', type: 'range', bind: 'seats', props: { min: 1, max: 50 } },
    { id: 'hint', type: 'text', props: { text: '拖动滑杆估算' } },
    { id: 'submit-btn', type: 'button', props: { text: '提交估算', variant: 'primary' },
      events: { click: [{ type: 'surface.submit', actionId: 'submit', payload: { kind: 'state', path: '' } }] } },
  ] },
}

async function call(method: string, path: string, options: { body?: unknown; profile?: string | null; userId?: string | null } = {}): Promise<{ status: number; body: any }> {
  const profile = options.profile === undefined ? 'orchestrator' : options.profile
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  // 登录态由测试中间件按请求头置入（对应上游 requireUserJwt 的产物）
  if (options.userId !== null) headers['x-test-user'] = options.userId ?? '7'
  // 档位按客户端 surface-sync.ts 的 call() 同一口径：拼进查询串（服务端据此做归属校验，spec D11）
  const query = profile ? `?profile=${encodeURIComponent(profile)}` : ''
  const res = await fetch(`${base}${PREFIX}${path}${query}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

beforeAll(async () => {
  const { SurfaceStore, _resetSurfaceStoreForTests } = await import('../surface-store')
  _resetSurfaceStoreForTests()
  deps.store = new SurfaceStore()
  const { PersistentSurfaces } = await import('../persistent-surfaces')
  const { persistentSurfaceRoutes, setPersistentSurfaceHost } = await import('../persistent-controller')
  host = new PersistentSurfaces(deps as unknown as ConstructorParameters<typeof PersistentSurfaces>[0])
  setPersistentSurfaceHost(host)
  const app = new Koa()
  app.use(bodyParser())
  app.use(async (ctx, next) => {
    const user = ctx.get('x-test-user')
    if (user) ctx.state.user = { id: user }
    // 服务端的档位有两个来源：MCP 接口读请求上下文，客户端接口读 ?profile= 查询参数。
    // 这里让请求上下文始终带默认档位，专查「带错档位」时是否被归属校验挡下。
    ctx.state.profile = { name: 'orchestrator' }
    await next()
  })
  app.use(persistentSurfaceRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server?.close()
  delete process.env.EKKO_UI_DB
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => { turns.clear(); published.length = 0 })

describe('持久式界面的生命周期（真 HTTP）', () => {
  it('五步链路：创建 → 续改 → 读回（含用户已填的值）→ 提交 → 关闭', async () => {
    const SESSION = 'sess-lifecycle'
    turns.set(`orchestrator\0ctx-1`, { sessionId: SESSION, runId: 'run-1' })

    // 1. 创建即返回回执：编号、版本、状态、摘要，不带规格本体
    const created = await call('POST', '/create', { body: { context_id: 'ctx-1', spec: estimator } })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ surface_id: `srf:${SESSION}:seat-estimator`, revision: 1, status: 'active' })
    expect(created.body).not.toHaveProperty('spec')
    expect(published.map(e => e.event)).toEqual(['ui.surface.presented'])

    const id = created.body.surface_id as string

    // 2. 用户先填一个值（第 1 版），再被续改——续改不得丢掉已填的值
    const saved = await call('PUT', `/${id}/state`, { body: { revision: 1, state: { seats: 23 } } })
    expect(saved.status).toBe(200)

    // 3. 按基准版本续改：把滑杆上限从 50 调到 100，并在提示后面插一行说明
    const patched = await call('POST', '/update', {
      body: { surface_id: id, base_revision: 1, patches: [
        { op: 'set-props', nodeId: 'seats-slider', props: { max: 100 } },
        { op: 'insert-child', parentId: 'root', afterId: 'hint', node: { id: 'note', type: 'text', props: { text: '上限已调到 100' } } },
      ] },
    })
    expect(patched.status, JSON.stringify(patched.body)).toBe(200)
    expect(patched.body).toMatchObject({ surface_id: id, revision: 2 })
    expect(patched.body.changed).toEqual(expect.arrayContaining(['seats-slider', 'note']))
    // 更新事件带完整新规格，客户端不必再取一次
    const updated = published.find(e => e.event === 'ui.surface.updated')
    expect(updated?.payload).toMatchObject({ surface_id: id, revision: 2, base_revision: 1 })
    expect((updated?.payload.spec as typeof estimator).root.children[2].id).toBe('note')

    // 4. 读回：规格是第 2 版（上限 100），用户填的值（23）仍在，且记着它对应的版本
    const view = await call('GET', `/${id}`)
    expect(view.status).toBe(200)
    expect(view.body.available).toBe(true)
    expect(view.body.surface.revision).toBe(2)
    const slider = (view.body.surface.spec as typeof estimator).root.children[0]
    expect(slider.props?.max).toBe(100)
    expect(view.body.surface.state).toEqual({ seats: 23 })

    // 5. 提交：服务端记一笔；界面保持可用（不因提交而关闭）
    const submitted = await call('POST', `/${id}/actions`, {
      body: { revision: 2, action_id: 'submit', payload: { seats: 23 } },
    })
    expect(submitted.status).toBe(200)
    expect(submitted.body).toMatchObject({ surface_id: id, revision: 2, action_id: 'submit' })
    expect(published.filter(e => e.event === 'ui.surface.closed')).toEqual([])
    const afterSubmit = await call('GET', `/${id}`)
    expect(afterSubmit.body.surface.status).toBe('active')
    expect(afterSubmit.body.surface.last_submission).toMatchObject({ action_id: 'submit', payload: { seats: 23 } })

    // 6. 关闭：变只读，之后再写被拒
    const closed = await call('POST', '/close', { body: { surface_id: id } })
    expect(closed.status).toBe(200)
    expect(closed.body.status).toBe('closed')
    expect(published.at(-1)).toMatchObject({ sessionId: SESSION, event: 'ui.surface.closed' })
    const lateWrite = await call('POST', '/update', { body: { surface_id: id, base_revision: 2, patches: [{ op: 'set-props', nodeId: 'hint', props: { text: 'x' } }] } })
    expect(lateWrite.status).toBeGreaterThanOrEqual(400)
    expect(lateWrite.status).toBeLessThan(500)
    const final = await call('GET', `/${id}`)
    expect(final.body.surface.status).toBe('closed')
  })

  it('旧版本号的续改被拒并带当前版本号，库里不变', async () => {
    turns.set('orchestrator\0ctx-2', { sessionId: 'sess-conflict', runId: 'run-1' })
    const { body } = await call('POST', '/create', { body: { context_id: 'ctx-2', spec: estimator } })
    await call('POST', '/update', { body: { surface_id: body.surface_id, base_revision: 1, patches: [{ op: 'set-props', nodeId: 'hint', props: { text: '第一处改动' } }] } })
    const stale = await call('POST', '/update', { body: { surface_id: body.surface_id, base_revision: 1, patches: [{ op: 'set-props', nodeId: 'hint', props: { text: '过期改动' } }] } })
    expect(stale.status).toBe(409)
    expect(String(stale.body.error)).toContain('2')
    const view = await call('GET', `/${body.surface_id}`)
    expect((view.body.surface.spec as typeof estimator).root.children[1].props?.text).toBe('第一处改动')
  })

  it('补丁引入未知部件：整份补丁被拒，库里不出现非法规格', async () => {
    turns.set('orchestrator\0ctx-3', { sessionId: 'sess-badpatch', runId: 'run-1' })
    const { body } = await call('POST', '/create', { body: { context_id: 'ctx-3', spec: estimator } })
    const bad = await call('POST', '/update', { body: { surface_id: body.surface_id, base_revision: 1, patches: [
      { op: 'set-props', nodeId: 'hint', props: { text: '这条本应生效' } },
      { op: 'insert-child', parentId: 'root', afterId: 'hint', node: { id: 'evil', type: 'sparkline', props: {} } },
    ] } })
    expect(bad.status).toBe(422)
    const view = await call('GET', `/${body.surface_id}`)
    expect(view.body.surface.revision).toBe(1)
    expect((view.body.surface.spec as typeof estimator).root.children.some(child => child.id === 'evil')).toBe(false)
  })

  it('没有活跃轮不能创建；开关关闭时创建与续改返回 503', async () => {
    const noTurn = await call('POST', '/create', { body: { context_id: 'ctx-none', spec: estimator } })
    expect(noTurn.status).toBe(409)
    process.env.EKKO_UI_PERSISTENT = '0'
    try {
      turns.set('orchestrator\0ctx-4', { sessionId: 'sess-off', runId: 'run-1' })
      const off = await call('POST', '/create', { body: { context_id: 'ctx-4', spec: estimator } })
      expect(off.status).toBe(503)
      const catalog = await call('GET', '/catalog')
      expect(catalog.status).toBe(200)
      expect(catalog.body.catalog.actionShapes.map((item: { type: string }) => item.type)).toContain('surface.submit')
    } finally {
      delete process.env.EKKO_UI_PERSISTENT
    }
  })

  it('归属：另一个档位或另一个用户读不到、也改不了这块界面；读不泄露是否存在', async () => {
    turns.set('orchestrator\0ctx-5', { sessionId: 'sess-owner', runId: 'run-1' })
    const { body } = await call('POST', '/create', { body: { context_id: 'ctx-5', spec: estimator } })
    const id = body.surface_id as string
    // 读：与「不存在」同形——200 + available:false，不带任何界面内容，不泄露是否存在（spec D11）
    const absent = await call('GET', '/srf:sess-owner:no-such-surface')
    for (const foreign of [await call('GET', `/${id}`, { profile: 'default' }), await call('GET', `/${id}`, { userId: '8' })]) {
      expect(foreign.status).toBe(absent.status)
      expect(foreign.body).toEqual(absent.body)
      expect(foreign.body.available).toBe(false)
      expect(foreign.body).not.toHaveProperty('surface')
    }
    // 写：一律 404
    const foreignWrite = await call('POST', '/update', { body: { surface_id: id, base_revision: 1, patches: [{ op: 'remove-node', nodeId: 'hint' }] }, userId: '8' })
    expect(foreignWrite.status).toBe(404)
    const foreignState = await call('PUT', `/${id}/state`, { body: { revision: 1, state: { seats: 1 } }, profile: 'default' })
    expect(foreignState.status).toBe(404)
    // 本人仍完好：没被他人改动。state 是「用户填过的值」——没人改过所以为空；
    // 初值在 spec.state 里，客户端读回时以「规格初值 + 用户值」合成（spec D10）。
    const mine = await call('GET', `/${id}`)
    expect(mine.body.surface.state).toEqual({})
    expect((mine.body.surface.spec as typeof estimator).state).toEqual({ seats: 8 })
    expect((mine.body.surface.spec as typeof estimator).root.children[1].id).toBe('hint')
  })

  it('提交内容超过大小上限被拒', async () => {
    turns.set('orchestrator\0ctx-6', { sessionId: 'sess-big', runId: 'run-1' })
    const { body } = await call('POST', '/create', { body: { context_id: 'ctx-6', spec: estimator } })
    const big = await call('POST', `/${body.surface_id}/actions`, { body: { revision: 1, action_id: 'submit', payload: { blob: 'x'.repeat(40 * 1024) } } })
    expect(big.status).toBeGreaterThanOrEqual(400)
    expect(big.status).toBeLessThan(500)
  })
})
