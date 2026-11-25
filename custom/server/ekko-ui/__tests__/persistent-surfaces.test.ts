// @vitest-environment node
// overlay/custom/server/ekko-ui/__tests__/persistent-surfaces.test.ts
// 批二非阻塞宿主守门：创建/更新/查看/关闭/存状态/记提交的行为与事件、版本冲突、归属、
// 开关、没有活动轮时创建被拒、校验失败带可修复错误。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PersistentSurfaces } from '../persistent-surfaces'
import { SurfaceStore, _resetSurfaceStoreForTests, type StoredSurface } from '../surface-store'
import { SurfaceError } from '../contract'

let dir: string
const events: Array<{ sessionId: string; event: string; payload: Record<string, unknown> }> = []
const turn = { sessionId: '', calls: 0 }
let enabled: boolean

function spec(seats = 8, surfaceId = 'estimator') {
  return {
    protocol: 'ekko-ui/v2',
    surfaceId,
    title: '估算器',
    fallbackText: '可调参数的估算卡片。',
    state: { seats },
    root: { id: 'root', type: 'stack', children: [{ id: 's', type: 'range', bind: 'seats', props: { min: 1, max: 50 } }] },
  }
}

function host() {
  return new PersistentSurfaces({
    store: new SurfaceStore(),
    resolveTurn: (contextId: string, profile: string) => {
      turn.calls += 1
      if (!turn.sessionId) throw new SurfaceError('Surface context has no active turn', 409)
      if (profile !== 'default') throw new SurfaceError('Surface context is unavailable or has expired', 409)
      return { sessionId: turn.sessionId, runId: `run-${contextId}` }
    },
    publish: (sessionId, event, payload) => { events.push({ sessionId, event, payload }) },
    isEnabled: () => enabled,
  })
}

const owner = { profile: 'default', userId: 'u1' }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ekko-ui-host-'))
  process.env.EKKO_UI_DB = join(dir, 'surfaces.db')
  _resetSurfaceStoreForTests()
  events.length = 0
  turn.sessionId = 's1'
  turn.calls = 0
  enabled = true
})

afterEach(() => {
  _resetSurfaceStoreForTests()
  delete process.env.EKKO_UI_DB
  rmSync(dir, { recursive: true, force: true })
})

describe('创建', () => {
  it('立即返回回执、落库、发布 presented；不阻塞', async () => {
    const h = host()
    const receipt = await h.create({ context_id: 'ctx-1', spec: spec() }, owner)
    expect(receipt).toEqual({ surface_id: 'srf:s1:estimator', revision: 1, status: 'active', digest: expect.stringMatching(/^[0-9a-f]{8}$/), title: '估算器' })
    expect(new SurfaceStore().get('srf:s1:estimator', owner)?.spec_json).toEqual(spec())
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ sessionId: 's1', event: 'ui.surface.presented' })
    expect(events[0].payload).toMatchObject({ event: 'ui.surface.presented', session_id: 's1', surface_id: 'srf:s1:estimator', revision: 1, title: '估算器' })
    expect((events[0].payload as { spec: unknown }).spec).toEqual(spec())
  })

  it('入参形状：缺 context_id、缺 spec、非对象', async () => {
    const h = host()
    await expect(h.create({ spec: spec() }, owner)).rejects.toMatchObject({ status: 400 })
    await expect(h.create({ context_id: 'ctx-1' }, owner)).rejects.toMatchObject({ status: 400 })
    await expect(h.create({ context_id: 'ctx-1', spec: 'x' }, owner)).rejects.toMatchObject({ status: 400 })
    expect(events).toHaveLength(0)
  })

  it('规格不合法返回 422，错误文案列出可用值，不落库不发布', async () => {
    const h = host()
    const bad = { ...spec(), root: { id: 'r', type: 'sparkline', props: {} } } as unknown as ReturnType<typeof spec>
    await expect(h.create({ context_id: 'ctx-1', spec: bad }, owner)).rejects.toMatchObject({ status: 422 })
    try {
      await h.create({ context_id: 'ctx-1', spec: bad }, owner)
    } catch (error) {
      expect((error as SurfaceError).message).toContain('sparkline')
      expect((error as SurfaceError).message).toContain('chart')
      expect((error as Error & { problems?: unknown }).problems?.[0]).toMatchObject({ code: 'node.type.unknown', path: 'root.type' })
    }
    expect(new SurfaceStore().get('srf:s1:estimator')).toBeNull()
    expect(events).toHaveLength(0)
  })

  it('没有活动轮时创建被拒（后台子代理与委派任务不可用）', async () => {
    turn.sessionId = ''
    await expect(host().create({ context_id: 'ctx-1', spec: spec() }, owner)).rejects.toMatchObject({ status: 409 })
    expect(events).toHaveLength(0)
  })

  it('开关关闭时 503，不解析会话不落库', async () => {
    enabled = false
    await expect(host().create({ context_id: 'ctx-1', spec: spec() }, owner)).rejects.toMatchObject({ status: 503 })
    expect(turn.calls).toBe(0)
  })

  it('同一会话同一编号重复创建 409，文案给出下一步', async () => {
    const h = host()
    await h.create({ context_id: 'ctx-1', spec: spec() }, owner)
    await expect(h.create({ context_id: 'ctx-2', spec: spec() }, owner)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('surface_update') })
  })
})

describe('更新', () => {
  async function created() {
    const h = host()
    await h.create({ context_id: 'ctx-1', spec: spec() }, owner)
    events.length = 0
    return h
  }

  it('按补丁续改：版本递增、发布 updated 并带完整新规格', async () => {
    const h = await created()
    const result = await h.update({ surface_id: 'srf:s1:estimator', base_revision: 1, patches: [
      { op: 'set-props', nodeId: 's', props: { max: 100 } },
      { op: 'insert-child', parentId: 'root', node: { id: 'note', type: 'text', props: { text: '上限已调' } } },
    ] }, owner)
    expect(result).toEqual({ surface_id: 'srf:s1:estimator', revision: 2, digest: expect.stringMatching(/^[0-9a-f]{8}$/), changed: ['s', 'root', 'note'] })
    const row = new SurfaceStore().get('srf:s1:estimator') as StoredSurface
    expect(row.revision).toBe(2)
    expect(row.spec_json.root.children?.map(node => node.id)).toEqual(['s', 'note'])
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('ui.surface.updated')
    expect(events[0].payload).toMatchObject({ surface_id: 'srf:s1:estimator', revision: 2, base_revision: 1, changed: ['s', 'root', 'note'] })
    expect((events[0].payload as { spec: { root: { children: unknown[] } } }).spec.root.children).toHaveLength(2)
  })

  it('整版替换同样递增版本', async () => {
    const h = await created()
    const result = await h.update({ surface_id: 'srf:s1:estimator', base_revision: 1, spec: spec(20) }, owner)
    expect(result.revision).toBe(2)
    expect(new SurfaceStore().get('srf:s1:estimator')?.spec_json.state).toEqual({ seats: 20 })
  })

  it('补丁与整版二选一：都给或都不给都是 400', async () => {
    const h = await created()
    await expect(h.update({ surface_id: 'srf:s1:estimator', base_revision: 1 }, owner)).rejects.toMatchObject({ status: 400 })
    await expect(h.update({ surface_id: 'srf:s1:estimator', base_revision: 1, patches: [], spec: spec(2) }, owner)).rejects.toMatchObject({ status: 400 })
  })

  it('旧版本号 409 并带当前版本号', async () => {
    const h = await created()
    await h.update({ surface_id: 'srf:s1:estimator', base_revision: 1, spec: spec(20) }, owner)
    events.length = 0
    let caught: unknown
    try { await h.update({ surface_id: 'srf:s1:estimator', base_revision: 1, spec: spec(30) }, owner) } catch (error) { caught = error }
    expect(caught).toMatchObject({ status: 409, currentRevision: 2 })
    expect((caught as SurfaceError).message).toContain('surface_inspect')
    expect(new SurfaceStore().get('srf:s1:estimator')?.spec_json.state).toEqual({ seats: 20 })
    expect(events).toHaveLength(0)
  })

  it('补丁目标不存在 422，错误文案列出可用 id，不落库不发布', async () => {
    const h = await created()
    let caught: unknown
    try {
      await h.update({ surface_id: 'srf:s1:estimator', base_revision: 1, patches: [{ op: 'set-props', nodeId: 'ghost', props: { a: 1 } }] }, owner)
    } catch (error) { caught = error }
    expect(caught).toMatchObject({ status: 422 })
    expect((caught as SurfaceError).message).toContain('ghost')
    expect((caught as SurfaceError).message).toContain('root')
    expect((caught as Error & { problems?: unknown }).problems?.[0]).toMatchObject({ code: 'patch.target_missing' })
    expect(new SurfaceStore().get('srf:s1:estimator')?.revision).toBe(1)
    expect(events).toHaveLength(0)
  })

  it('补丁引入非法内容 422（打完后整体重校验）', async () => {
    const h = await created()
    await expect(h.update({ surface_id: 'srf:s1:estimator', base_revision: 1, patches: [
      { op: 'insert-child', parentId: 'root', node: { id: 's', type: 'text', props: { text: 'x' } } },
    ] }, owner)).rejects.toMatchObject({ status: 422 })
    expect(new SurfaceStore().get('srf:s1:estimator')?.revision).toBe(1)
  })

  it('关闭后不可更新（409）', async () => {
    const h = await created()
    await h.close({ surface_id: 'srf:s1:estimator' }, owner)
    await expect(h.update({ surface_id: 'srf:s1:estimator', base_revision: 1, spec: spec(2) }, owner)).rejects.toMatchObject({ status: 409 })
  })

  it('归属不符与不存在都是 404，不区分', async () => {
    const h = await created()
    const body = { surface_id: 'srf:s1:estimator', base_revision: 1, spec: spec(2) }
    await expect(h.update(body, { profile: 'other', userId: 'u1' })).rejects.toMatchObject({ status: 404 })
    await expect(h.update(body, { profile: 'default', userId: 'u2' })).rejects.toMatchObject({ status: 404 })
    await expect(h.update({ ...body, surface_id: 'srf:nope:x' }, owner)).rejects.toMatchObject({ status: 404 })
    // 归属不符的尝试不改库
    expect(new SurfaceStore().get('srf:s1:estimator', owner)?.revision).toBe(1)
  })

  it('开关关闭时更新 503，不改库', async () => {
    const h = await created()
    enabled = false
    await expect(h.update({ surface_id: 'srf:s1:estimator', base_revision: 1, spec: spec(2) }, owner)).rejects.toMatchObject({ status: 503 })
    enabled = true
    expect(new SurfaceStore().get('srf:s1:estimator', owner)?.revision).toBe(1)
  })
})

describe('查看与关闭', () => {
  it('查看返回精简结构，可选节点与状态', async () => {
    const h = host()
    await h.create({ context_id: 'ctx-1', spec: spec() }, owner)
    await h.saveState('srf:s1:estimator', { seats: 11 }, 1, owner)
    const brief = await h.inspect({ surface_id: 'srf:s1:estimator' }, owner)
    expect(brief).toMatchObject({ surface_id: 'srf:s1:estimator', revision: 1, status: 'active', title: '估算器', digest: expect.stringMatching(/^[0-9a-f]{8}$/) })
    expect(brief.nodes).toEqual([{ id: 'root', type: 'stack', children: ['s'] }, { id: 's', type: 'range', bind: 'seats', props: { min: 1, max: 50 } }])
    expect(brief).not.toHaveProperty('state')

    const full = await h.inspect({ surface_id: 'srf:s1:estimator', include_state: true }, owner)
    expect(full.state).toEqual({ seats: 11 })
    expect(full).not.toHaveProperty('last_submission')

    const one = await h.inspect({ surface_id: 'srf:s1:estimator', node_id: 's' }, owner)
    expect(one.node).toEqual(spec().root.children?.[0])
    expect(one.nodes).toHaveLength(2)
  })

  it('查看不存在的节点 404，查看别人的界面 404', async () => {
    const h = host()
    await h.create({ context_id: 'ctx-1', spec: spec() }, owner)
    await expect(h.inspect({ surface_id: 'srf:s1:estimator', node_id: 'ghost' }, owner)).rejects.toMatchObject({ status: 404 })
    await expect(h.inspect({ surface_id: 'srf:s1:estimator' }, { profile: 'default', userId: 'u2' })).rejects.toMatchObject({ status: 404 })
  })

  it('关闭发布 closed；重复关闭幂等', async () => {
    const h = host()
    await h.create({ context_id: 'ctx-1', spec: spec() }, owner)
    events.length = 0
    expect(await h.close({ surface_id: 'srf:s1:estimator' }, owner)).toEqual({ surface_id: 'srf:s1:estimator', status: 'closed' })
    expect(events.map(e => e.event)).toEqual(['ui.surface.closed'])
    expect(events[0].payload).toMatchObject({ surface_id: 'srf:s1:estimator', status: 'closed' })
    expect(await h.close({ surface_id: 'srf:s1:estimator' }, owner)).toEqual({ surface_id: 'srf:s1:estimator', status: 'closed' })
    expect(events).toHaveLength(1)
  })
})

describe('用户状态与提交（客户端路径）', () => {
  it('保存状态校验大小与路径，记录提交保留最近一次', async () => {
    const h = host()
    await h.create({ context_id: 'ctx-1', spec: spec() }, owner)
    await h.saveState('srf:s1:estimator', { seats: 40, 'form.name': 'Ada' }, 1, owner)
    await expect(h.saveState('srf:s1:estimator', { seats: 1, '__proto__.x': 1 }, 1, owner)).rejects.toMatchObject({ status: 400 })
    // 单个超长字符串先被传输级的字符串上限拦下（400）
    await expect(h.saveState('srf:s1:estimator', { blob: 'x'.repeat(40_000) }, 1, owner)).rejects.toMatchObject({ status: 400 })
    // 每个字符串都在上限内、合计超过状态字节上限（413）
    const wide: Record<string, string> = {}
    for (let i = 0; i < 12; i++) wide[`k${i}`] = 'x'.repeat(3000)
    await expect(h.saveState('srf:s1:estimator', wide, 1, owner)).rejects.toMatchObject({ status: 413 })
    const row = new SurfaceStore().get('srf:s1:estimator') as StoredSurface
    expect(row.state_json).toEqual({ seats: 40, 'form.name': 'Ada' })

    await h.recordSubmission('srf:s1:estimator', 'submit', { seats: 40 }, 1, owner)
    await h.recordSubmission('srf:s1:estimator', 'submit', { seats: 41 }, 1, owner)
    const after = await h.inspect({ surface_id: 'srf:s1:estimator' }, owner)
    expect(after.last_submission).toMatchObject({ action_id: 'submit', payload: { seats: 41 }, revision: 1 })
    expect(after.status).toBe('active')

    const widePayload: Record<string, string> = {}
    for (let i = 0; i < 12; i++) widePayload[`k${i}`] = 'x'.repeat(3000)
    await expect(h.recordSubmission('srf:s1:estimator', 'submit', widePayload, 1, owner)).rejects.toMatchObject({ status: 413 })
    await expect(h.recordSubmission('srf:s1:estimator', '../x', {}, 1, owner)).rejects.toMatchObject({ status: 400 })
  })

  it('给客户端的读取视图含最新规格、用户状态与状态版本', async () => {
    const h = host()
    await h.create({ context_id: 'ctx-1', spec: spec() }, owner)
    await h.saveState('srf:s1:estimator', { seats: 15 }, 1, owner)
    const view = await h.view('srf:s1:estimator', owner)
    expect(view.available).toBe(true)
    expect(view.surface).toMatchObject({
      surface_id: 'srf:s1:estimator', revision: 1, status: 'active', title: '估算器', state: { seats: 15 }, state_revision: 1,
      last_submission: null,
    })
    expect(view.surface?.spec).toEqual(spec())
    expect(await h.view('srf:s1:estimator', { profile: 'default', userId: 'u2' })).toEqual({ available: false })
    expect(await h.view('srf:nope:x', owner)).toEqual({ available: false })
  })
})

describe('目录', () => {
  it('目录投影来自协议模块，可过滤', async () => {
    const catalog = await host().catalog({})
    expect(catalog.components.length).toBeGreaterThanOrEqual(38)
    expect(catalog.features.persistent).toBe(true)
    expect((await host().catalog({ q: 'chart' })).components.map(item => item.type)).toEqual(['chart'])
  })
})
