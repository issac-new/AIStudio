// @vitest-environment jsdom
// overlay/custom/client/chat/ekko-ui/__tests__/surface-sync.test.ts
// 批二客户端登记表守门：读取与事件分发、规格续改后保留已填的值、状态回存的合并写入、续接消息。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.fn()
vi.mock('@/api/client', () => ({ request: (...args: unknown[]) => requestMock(...args) }))
const socketMock = { on: vi.fn(), off: vi.fn() }
vi.mock('@/api/studio/chat', () => ({ getChatRunSocket: () => socketMock }))

import {
  _resetSurfaceSyncForTests,
  buildSurfaceTurnMessage,
  createStateFlush,
  mergeUserState,
  usePersistentSurface,
} from '../surface-sync'
import type { EkkoUISpec, EkkoUIState } from '../protocol'
import { EKKO_UI_PROTOCOL_V2 } from '../protocol'

function spec(children: EkkoUISpec['root']['children'], state: EkkoUIState = {}): EkkoUISpec {
  return { protocol: EKKO_UI_PROTOCOL_V2, surfaceId: 'estimator', title: '估算器', fallbackText: '估算卡片', state, root: { id: 'root', type: 'stack', children } }
}

const range = (bind: string, max = 50) => ({ id: bind.replace(/\./g, '_'), type: 'range', bind, props: { min: 1, max } })
const input = (id: string, bind: string) => ({ id, type: 'input', bind, props: { placeholder: '填写' } })

function view(surfaceId: string, s: EkkoUISpec, extra: Record<string, unknown> = {}) {
  return {
    available: true,
    surface: {
      surface_id: surfaceId, session_id: 's1', revision: 1, status: 'active', title: String(s.title ?? ''), digest: 'abcd1234',
      spec: s, state: {}, state_revision: 1, last_submission: null, created_at: 1, updated_at: 1, submitted_at: null, ...extra,
    },
  }
}

beforeEach(() => {
  _resetSurfaceSyncForTests()
  requestMock.mockReset()
  socketMock.on.mockClear()
})
afterEach(() => { vi.useRealTimers() })

describe('mergeUserState：规格续改后保留已填的值', () => {
  it('以新规格初值为底，覆盖用户已有的值；新规格不再绑定的键不再保留', () => {
    const next = spec([range('seats', 100), input('name', 'form.name')], { seats: 8, price: 29 })
    const previous: EkkoUIState = { seats: 12, 'form.name': 'Ada', legacy: '旧字段' }
    expect(mergeUserState(next, previous)).toEqual({ seats: 12, price: 29, 'form.name': 'Ada' })
  })

  it('嵌套绑定按根键保留：form.name 与 form.email 保留，form.old 不保留', () => {
    const next = spec([input('name', 'form.name'), input('email', 'form.email')])
    const previous: EkkoUIState = { 'form.name': 'Ada', 'form.email': 'a@b.c', 'form.old': 'x' }
    const merged = mergeUserState(next, previous)
    expect(merged['form.name']).toBe('Ada')
    expect(merged['form.email']).toBe('a@b.c')
    expect(merged).not.toHaveProperty('form.old')
  })

  it('没有旧值时就是新规格的初值；用户清空的值（null）也算已填', () => {
    expect(mergeUserState(spec([range('seats')], { seats: 8 }), {})).toEqual({ seats: 8 })
    expect(mergeUserState(spec([range('seats')], { seats: 8 }), { seats: null }).seats).toBeNull()
  })
})

describe('usePersistentSurface：读取与事件分发', () => {
  it('挂载时拉取一次，重复登记复用同一条记录且不重复请求', async () => {
    const s = spec([range('seats')])
    requestMock.mockResolvedValue(view('srf:s1:estimator', s))
    const a = usePersistentSurface('srf:s1:estimator', 's1', 'default')
    const b = usePersistentSurface('srf:s1:estimator', 's1', 'default')
    expect(a.entry).toBe(b.entry)
    await Promise.all([a.refresh(), b.refresh()])
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(requestMock.mock.calls[0][0]).toBe('/api/studio/surfaces/srf:s1:estimator?profile=default')
    expect(a.entry.phase).toBe('ready')
    expect(a.entry.revision).toBe(1)
    expect(a.entry.title).toBe('估算器')
  })

  it('服务端说没有：phase=missing，规格为空，不抛错', async () => {
    requestMock.mockResolvedValue({ available: false })
    const { entry, refresh } = usePersistentSurface('srf:s1:nope', 's1', 'default')
    await refresh()
    expect(entry.phase).toBe('missing')
    expect(entry.spec).toBeNull()
  })

  it('请求失败：phase=error 并带原因', async () => {
    requestMock.mockRejectedValue(new Error('网络断了'))
    const { entry, refresh } = usePersistentSurface('srf:s1:x', 's1', 'default')
    await refresh()
    expect(entry.phase).toBe('error')
    expect(entry.error).toBe('网络断了')
  })

  it('收到 ui.surface.updated：换规格、涨版本，并保留用户已填的值；通知订阅者', async () => {
    requestMock.mockResolvedValue(view('srf:s1:estimator', spec([range('seats')], { seats: 8 })))
    const { entry, refresh, onEvent } = usePersistentSurface('srf:s1:estimator', 's1', 'default')
    await refresh()
    const seen: number[] = []
    const off = onEvent(e => seen.push(e.revision))

    entry.state = { seats: 33 }
    const updated = spec([range('seats', 100)], { seats: 8 })
    const handler = socketMock.on.mock.calls.find(call => call[0] === 'ui.surface.updated')![1] as (payload: unknown) => void
    handler({ event: 'ui.surface.updated', surface_id: 'srf:s1:estimator', revision: 2, spec: updated })
    expect(entry.revision).toBe(2)
    expect(entry.spec?.root.children?.[0].props?.max).toBe(100)
    expect(entry.state).toEqual({ seats: 33 })
    expect(seen).toEqual([2])

    // 别的界面的事件不串台
    handler({ surface_id: 'srf:s1:other', revision: 5, spec: updated })
    expect(entry.revision).toBe(2)
    off()
  })

  it('收到 ui.surface.closed：状态变为 closed 并通知；之后仍可读到最后版本', async () => {
    const s = spec([range('seats')])
    requestMock.mockResolvedValue(view('srf:s1:estimator', s))
    const { entry, refresh } = usePersistentSurface('srf:s1:estimator', 's1', 'default')
    await refresh()
    const handler = socketMock.on.mock.calls.find(call => call[0] === 'ui.surface.closed')![1] as (payload: unknown) => void
    handler({ event: 'ui.surface.closed', surface_id: 'srf:s1:estimator', status: 'closed' })
    expect(entry.status).toBe('closed')
    expect(entry.spec).toEqual(s)
  })

  it('只订阅一次套接字事件（多块界面共用一组监听）', () => {
    usePersistentSurface('srf:s1:a', 's1', 'default')
    usePersistentSurface('srf:s1:b', 's1', 'default')
    usePersistentSurface('srf:s2:a', 's2', 'other')
    expect(socketMock.on.mock.calls.filter(call => call[0] === 'ui.surface.updated')).toHaveLength(1)
    expect(socketMock.on.mock.calls.filter(call => call[0] === 'ui.surface.closed')).toHaveLength(1)
  })
})

describe('createStateFlush：状态回存的合并写入', () => {
  it('窗口内的多次变化合并成一次写，写出的是最新状态与对应版本', async () => {
    vi.useFakeTimers()
    const writes: Array<[number, EkkoUIState]> = []
    const flusher = createStateFlush(async (revision, state) => { writes.push([revision, state]) }, { delayMs: 500 })
    flusher.schedule(1, { seats: 2 })
    flusher.schedule(1, { seats: 3 })
    flusher.schedule(2, { seats: 4 })
    expect(writes).toEqual([])
    await vi.advanceTimersByTimeAsync(500)
    expect(writes).toEqual([[2, { seats: 4 }]])
  })

  it('flush 立即写出未落盘的状态；没有待写时不调 write', async () => {
    const write = vi.fn(async () => {})
    const flusher = createStateFlush(write, { delayMs: 500 })
    await flusher.flush()
    expect(write).not.toHaveBeenCalled()
    flusher.schedule(3, { a: 1 })
    await flusher.flush()
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0][0]).toBe(3)
  })

  it('写失败不丢状态：下一次写入会把最新状态带出去', async () => {
    const write = vi.fn()
      .mockRejectedValueOnce(new Error('502'))
      .mockResolvedValueOnce(undefined)
    const flusher = createStateFlush(write, { delayMs: 0, setTimer: (fn) => { fn(); return () => {} } })
    flusher.schedule(1, { seats: 5 })
    await flusher.flush()
    flusher.schedule(1, { seats: 6 })
    await flusher.flush()
    expect(write).toHaveBeenCalledTimes(2)
    expect(write.mock.calls[1][1]).toEqual({ seats: 6 })
  })
})

describe('buildSurfaceTurnMessage', () => {
  it('含标题、编号、版本、动作与提交内容', () => {
    const text = buildSurfaceTurnMessage(
      { surfaceId: 'srf:s1:estimator', sessionId: 's1', profile: 'default', phase: 'ready', spec: null, revision: 4, status: 'active', title: '估算器', state: {}, stateRevision: 4, lastSubmission: null, error: '' },
      'submit', { seats: 12 },
    )
    expect(text).toContain('「估算器」')
    expect(text).toContain('surface_id=srf:s1:estimator')
    expect(text).toContain('revision=4')
    expect(text).toContain('action=submit')
    expect(text).toContain('"seats": 12')
  })
})
