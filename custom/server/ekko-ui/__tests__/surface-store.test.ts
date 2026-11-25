// @vitest-environment node
// overlay/custom/server/ekko-ui/__tests__/surface-store.test.ts
// 批二存储守门：建表、创建、读取、版本并发、状态保存、提交记录、关闭、归属过滤、库路径覆写。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  SurfaceStore,
  _resetSurfaceStoreForTests,
  surfaceStoreDbPath,
  type StoredSurface,
} from '../surface-store'

let dir: string

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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ekko-ui-store-'))
  process.env.EKKO_UI_DB = join(dir, 'nested', 'surfaces.db')
  _resetSurfaceStoreForTests()
})

afterEach(() => {
  _resetSurfaceStoreForTests()
  delete process.env.EKKO_UI_DB
  rmSync(dir, { recursive: true, force: true })
})

describe('SurfaceStore', () => {
  it('库文件落在环境变量指定的位置（目录不存在则创建）', () => {
    new SurfaceStore().create({ sessionId: 's1', profile: 'default', userId: 'u1', runId: 'r1', spec: spec(), digest: 'd1', title: '估算器' })
    expect(existsSync(join(dir, 'nested', 'surfaces.db'))).toBe(true)
    expect(surfaceStoreDbPath()).toBe(join(dir, 'nested', 'surfaces.db'))
  })

  it('创建后可读取，回执字段齐全', () => {
    const store = new SurfaceStore()
    const receipt = store.create({ sessionId: 's1', profile: 'default', userId: 'u1', runId: 'r1', spec: spec(), digest: 'd1', title: '估算器' })
    expect(receipt).toMatchObject({ surface_id: 'srf:s1:estimator', revision: 1, status: 'active', digest: 'd1', title: '估算器' })
    const row = store.get('srf:s1:estimator') as StoredSurface
    expect(row.session_id).toBe('s1')
    expect(row.profile).toBe('default')
    expect(row.user_id).toBe('u1')
    expect(row.revision).toBe(1)
    expect(row.status).toBe('active')
    expect(row.spec_json).toEqual(spec())
    expect(row.state_json).toEqual({})
    expect(row.result_json).toBeNull()
  })

  it('同一会话同一界面编号不能重复创建，不同会话可以同名', () => {
    const store = new SurfaceStore()
    const input = { sessionId: 's1', profile: 'default', userId: 'u1', runId: 'r1', spec: spec(), digest: 'd1' }
    store.create(input)
    expect(() => store.create(input)).toThrow(/already exists/i)
    const other = store.create({ ...input, sessionId: 's2' })
    expect(other.surface_id).toBe('srf:s2:estimator')
  })

  it('更新带基准版本：版本一致才接受并递增，旧版本被拒且带当前版本号', () => {
    const store = new SurfaceStore()
    store.create({ sessionId: 's1', profile: 'default', userId: 'u1', runId: 'r1', spec: spec(), digest: 'd1' })
    const updated = store.update('srf:s1:estimator', 1, spec(12), 'd2')
    expect(updated).toEqual({ surface_id: 'srf:s1:estimator', revision: 2, digest: 'd2', updated_at: updated.updated_at })
    expect((store.get('srf:s1:estimator') as StoredSurface).spec_json.state).toEqual({ seats: 12 })
    try {
      store.update('srf:s1:estimator', 1, spec(20), 'd3')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toMatchObject({ status: 409, currentRevision: 2 })
      expect((error as Error).message).toMatch(/base_revision is 1 but current is 2/i)
    }
    expect((store.get('srf:s1:estimator') as StoredSurface).spec_json.state).toEqual({ seats: 12 })
  })

  it('保存状态带版本号，提交内容与时间被记录，关闭后不可更新', () => {
    const store = new SurfaceStore()
    store.create({ sessionId: 's1', profile: 'default', userId: 'u1', runId: 'r1', spec: spec(), digest: 'd1' })
    store.saveState('srf:s1:estimator', { seats: 30 }, 1)
    expect(store.saveState('srf:s1:estimator', { seats: 31 }, 2)).toMatchObject({ state_updated_at: expect.any(Number) })
    let row = store.get('srf:s1:estimator') as StoredSurface
    expect(row.state_json).toEqual({ seats: 31 })
    expect(row.state_revision).toBe(2)

    store.recordSubmission('srf:s1:estimator', 'submit', { seats: 31 }, 2)
    row = store.get('srf:s1:estimator') as StoredSurface
    expect(row.result_json).toEqual({ action_id: 'submit', payload: { seats: 31 }, revision: 2 })
    expect(row.submitted_at).toBeGreaterThan(0)

    store.close('srf:s1:estimator')
    row = store.get('srf:s1:estimator') as StoredSurface
    expect(row.status).toBe('closed')
    expect(() => store.update('srf:s1:estimator', 2, spec(1), 'd9')).toThrow(/closed/i)
    expect(() => store.saveState('srf:s1:estimator', { seats: 1 }, 2)).toThrow(/closed/i)
  })

  it('归属过滤：profile 或用户不一致一律视为不存在，记录了用户的才比对用户', () => {
    const store = new SurfaceStore()
    store.create({ sessionId: 's1', profile: 'default', userId: 'u1', runId: 'r1', spec: spec(), digest: 'd1' })
    store.create({ sessionId: 's2', profile: 'other', runId: 'r2', spec: spec(), digest: 'd1' })
    expect(store.get('srf:s1:estimator', { profile: 'default', userId: 'u1' })?.surface_id).toBe('srf:s1:estimator')
    expect(store.get('srf:s1:estimator', { profile: 'default', userId: 'u2' })).toBeNull()
    expect(store.get('srf:s1:estimator', { profile: 'other', userId: 'u1' })).toBeNull()
    // 未记录用户的界面只按 profile 判定
    expect(store.get('srf:s2:estimator', { profile: 'other', userId: 'anyone' })?.surface_id).toBe('srf:s2:estimator')
    expect(() => store.update('srf:s1:estimator', 1, spec(2), 'd2', { profile: 'default', userId: 'u2' })).toThrow(/not found/i)
  })

  it('按会话列出未关闭的界面', () => {
    const store = new SurfaceStore()
    store.create({ sessionId: 's1', profile: 'default', userId: 'u1', runId: 'r1', spec: { ...spec(), surfaceId: 'a' }, digest: 'd1' })
    store.create({ sessionId: 's1', profile: 'default', userId: 'u1', runId: 'r1', spec: { ...spec(), surfaceId: 'b' }, digest: 'd1' })
    store.create({ sessionId: 's1', profile: 'default', userId: 'u1', runId: 'r1', spec: { ...spec(), surfaceId: 'c' }, digest: 'd1' })
    store.close('srf:s1:c')
    expect(store.listBySession('s1', 'default').map(row => row.surface_id).sort()).toEqual(['srf:s1:a', 'srf:s1:b'])
    expect(store.countActive('s1', 'default')).toBe(2)
  })

  it('重新打开同一库文件数据仍在（惰性打开不丢数据）', () => {
    new SurfaceStore().create({ sessionId: 's1', profile: 'default', userId: 'u1', runId: 'r1', spec: spec(), digest: 'd1' })
    _resetSurfaceStoreForTests()
    expect(new SurfaceStore().get('srf:s1:estimator', { profile: 'default', userId: 'u1' })?.revision).toBe(1)
  })
})
