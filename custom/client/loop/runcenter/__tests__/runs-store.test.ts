// overlay/custom/client/loop/runcenter/__tests__/runs-store.test.ts
// 运行中心 Pinia store 单测：REST 列表合并、socket 订阅去重、事件增量投影、
// 断线重连 resubscribe、回放/分叉/恢复动作。
// socket 经 vi.mock('@/custom/loop/runcenter/api') 注入 FakeGraphSocket（结构化形状，
// 与 socket.io-client 无耦合）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// ── FakeGraphSocket：服务端行为模拟（subscribe 房间 + graph:event/graph:history 推送）──
// vi.hoisted 内定义，供下方 vi.mock 工厂闭包引用（vi.mock 会被提升到 import 之前）。
/** FakeGraphSocket 的结构类型（类本体定义在 vi.hoisted 内，外层只引用结构） */
interface FakeGraphSocket {
  connected: boolean
  handlers: Map<string, Array<(...args: unknown[]) => void>>
  emitted: Array<{ event: string; payload: unknown }>
  on(event: string, cb: (...args: unknown[]) => void): void
  emit(event: string, ...args: unknown[]): void
  disconnect(): void
  /** 测试辅助：模拟服务端推送 */
  serverEmit(event: string, payload?: unknown): void
  /** 测试辅助：统计某事件的客户端监听器数（断言不重复注册） */
  listenerCount(event: string): number
  /** 测试辅助：subscribe 房间名列表 */
  subscribedRooms(): string[]
}

const { FakeGraphSocket, fakeSocket, rest } = vi.hoisted(() => {
  class FakeGraphSocketImpl implements FakeGraphSocket {
    connected = true
    handlers = new Map<string, Array<(...args: unknown[]) => void>>()
    emitted: Array<{ event: string; payload: unknown }> = []

    on(event: string, cb: (...args: unknown[]) => void): void {
      const list = this.handlers.get(event) ?? []
      list.push(cb)
      this.handlers.set(event, list)
    }
    emit(event: string, ...args: unknown[]): void {
      this.emitted.push({ event, payload: args[0] })
    }
    disconnect(): void {
      this.connected = false
    }
    serverEmit(event: string, payload?: unknown): void {
      for (const cb of this.handlers.get(event) ?? []) cb(payload)
    }
    listenerCount(event: string): number {
      return (this.handlers.get(event) ?? []).length
    }
    subscribedRooms(): string[] {
      return this.emitted.filter(e => e.event === 'subscribe').map(e => String(e.payload))
    }
  }

  const state: { current: FakeGraphSocket | null } = { current: null }
  return {
    FakeGraphSocket: FakeGraphSocketImpl as new () => FakeGraphSocket,
    fakeSocket: state,
    rest: {
      listRuns: vi.fn(async () => [] as Array<{ runId: string; graphId: string; status: string; updatedAt: string | null }>),
      getRun: vi.fn(async () => { throw new Error('not implemented in test') }),
      resumeRun: vi.fn(async () => ({ runId: 'run-1', instance: {} })),
      forkRun: vi.fn(async () => ({ runId: 'run-1-fork-1', forkedFrom: 'run-1', superStep: 0 })),
      startRun: vi.fn(async () => ({ runId: 'run-1-fork-1', instance: {} })),
      replay: vi.fn(async () => [] as Array<{ type: string; ts: string }>),
    },
  }
})

vi.mock('@/custom/loop/runcenter/api', () => ({
  runRest: rest,
  connectGraph: () => {
    if (!fakeSocket.current) fakeSocket.current = new FakeGraphSocket()
    return fakeSocket.current
  },
  disconnectGraph: () => {
    fakeSocket.current?.disconnect()
    fakeSocket.current = null
  },
}))

import { useRunCenterStore } from '../store/runs'
import type { RunListItem } from '../types'

/** 取当前 FakeGraphSocket（connectGraph 惰性创建后的实例） */
function sock(): FakeGraphSocket {
  return fakeSocket.current as FakeGraphSocket
}

const item = (over: Partial<RunListItem> & { runId: string }): RunListItem => ({
  graphId: 'loop-loop1',
  status: 'running',
  updatedAt: '2026-09-10T00:00:00Z',
  ...over,
})

const ge = (type: string, threadId: string, over: Record<string, unknown> = {}) => ({
  type, graphId: 'loop-loop1', threadId, ts: '2026-09-10T00:01:00Z', ...over,
})

describe('useRunCenterStore — 列表获取与订阅', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeSocket.current = null
    vi.clearAllMocks()
  })

  // P3 台账 #2（批量订阅）：fetchRuns 不再全量订阅——订阅域收敛为"可见页"，
  // 由视图经 syncVisibleRunIds 驱动（翻页 unsubscribe 旧页）
  it('fetchRuns 拉取 REST 列表但不自动订阅（订阅域 = 可见页）', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' }), item({ runId: 'run-2', status: 'completed' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    expect(store.runs.map(r => r.runId)).toEqual(['run-1', 'run-2'])
    expect(sock().subscribedRooms()).toEqual([])
  })

  it('syncVisibleRunIds 只订阅可见页；翻页 unsubscribe 旧页', async () => {
    rest.listRuns.mockResolvedValue([
      item({ runId: 'run-1' }), item({ runId: 'run-2' }), item({ runId: 'run-3' }),
    ])
    const store = useRunCenterStore()
    await store.fetchRuns()

    store.syncVisibleRunIds(['run-1', 'run-2'])
    expect(sock().subscribedRooms()).toEqual(['run-1', 'run-2'])

    // 翻页：页 2 只剩 run-3 → 旧页 unsubscribe，新页 subscribe
    store.syncVisibleRunIds(['run-3'])
    expect(sock().emitted.filter(e => e.event === 'unsubscribe').map(e => e.payload)).toEqual(['run-1', 'run-2'])
    expect(sock().subscribedRooms()).toEqual(['run-1', 'run-2', 'run-3'])
    // 重入：同页重复 sync 不重发 subscribe
    store.syncVisibleRunIds(['run-3'])
    expect(sock().subscribedRooms()).toEqual(['run-1', 'run-2', 'run-3'])
  })

  it('订阅去重：重复 fetchRuns（连接未断）不重复发 subscribe', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    store.syncVisibleRunIds(['run-1'])
    await store.fetchRuns()
    store.syncVisibleRunIds(['run-1'])
    expect(sock().subscribedRooms()).toEqual(['run-1'])
  })

  it('REST unknown 状态不覆盖事件驱动的已知状态', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1', status: 'unknown' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    sock().serverEmit('graph:event', ge('graph.interrupt', 'run-1', { interruptId: 'approval:c1', ts: '2026-09-10T00:02:00Z' }))
    expect(store.runs[0].status).toBe('awaiting-input')

    rest.listRuns.mockResolvedValue([item({ runId: 'run-1', status: 'unknown', updatedAt: '2026-09-10T00:05:00Z' })])
    await store.fetchRuns()
    expect(store.runs[0].status).toBe('awaiting-input')
  })

  it('REST 权威状态覆盖（同 run 状态变化正常同步，且保留事件缓冲投影）', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1', status: 'running' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    sock().serverEmit('graph:history', [
      ge('graph.node-complete', 'run-1', { nodeId: 'handoff', step: 2, ts: '2026-09-10T00:01:00Z' }),
    ])
    expect(store.runs[0].stage).toBe('handoff')

    rest.listRuns.mockResolvedValue([item({ runId: 'run-1', status: 'completed', updatedAt: '2026-09-10T00:09:00Z' })])
    await store.fetchRuns()
    expect(store.runs[0].status).toBe('completed')
    expect(store.runs[0].stage).toBe('handoff') // 事件缓冲保留，投影不丢
  })
})

describe('useRunCenterStore — socket 事件增量投影', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeSocket.current = null
    vi.clearAllMocks()
  })

  it('graph:event 按 threadId 增量更新 status/stage/迭代/成本/最后活动', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' })])
    const store = useRunCenterStore()
    await store.fetchRuns()

    sock().serverEmit('graph:event', ge('graph.node-start', 'run-1', { nodeId: 'validation', step: 3, ts: '2026-09-10T00:05:00Z' }))
    sock().serverEmit('graph:event', ge('cost.recorded', 'run-1', { totalCost: 1.5, ts: '2026-09-10T00:06:00Z' }))

    const run = store.runs[0]
    expect(run.status).toBe('running')
    expect(run.stage).toBe('validation')
    expect(run.iteration).toBe(3)
    expect(run.cost).toBe(1.5)
    expect(run.lastActivityAt).toBe('2026-09-10T00:06:00Z')
  })

  it('graph.interrupt → awaiting-input + pendingInterruptId；graph.resume → running + 关闭', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' })])
    const store = useRunCenterStore()
    await store.fetchRuns()

    sock().serverEmit('graph:event', ge('graph.interrupt', 'run-1', { interruptId: 'approval:c1@0', nodeId: 'validation', ts: '2026-09-10T00:02:00Z' }))
    expect(store.runs[0].status).toBe('awaiting-input')
    expect(store.runs[0].pendingInterruptId).toBe('approval:c1@0')
    expect(store.awaitingCount).toBe(1)

    sock().serverEmit('graph:event', ge('graph.resume', 'run-1', { interruptId: 'approval:c1@0', ts: '2026-09-10T00:03:00Z' }))
    expect(store.runs[0].status).toBe('running')
    expect(store.runs[0].pendingInterruptId).toBeNull()
  })

  it('graph.completed/failed → 终态', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' }), item({ runId: 'run-2' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    sock().serverEmit('graph:event', ge('graph.completed', 'run-1', { ts: '2026-09-10T00:09:00Z', totalCost: 2 }))
    sock().serverEmit('graph:event', ge('graph.failed', 'run-2', { ts: '2026-09-10T00:09:00Z', error: 'boom' }))
    expect(store.runs.find(r => r.runId === 'run-1')?.status).toBe('completed')
    expect(store.runs.find(r => r.runId === 'run-2')?.status).toBe('failed')
  })

  it('未知 threadId 的 graph.started 现场新增 run 并即订阅', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' })])
    const store = useRunCenterStore()
    await store.fetchRuns()

    sock().serverEmit('graph:event', ge('graph.started', 'run-new', { graphId: 'loop-loop9', ts: '2026-09-10T00:00:00Z' }))
    expect(store.runs.map(r => r.runId)).toEqual(['run-1', 'run-new'])
    expect(store.runs.find(r => r.runId === 'run-new')?.status).toBe('running')
    expect(store.runs.find(r => r.runId === 'run-new')?.graphId).toBe('loop-loop9')
    expect(sock().subscribedRooms().slice(-1)).toEqual(['run-new'])
  })

  it('事件缓冲有界（100 条），投影仍基于缓冲内容', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    for (let i = 0; i < 130; i++) {
      sock().serverEmit('graph:event', ge('cost.recorded', 'run-1', { totalCost: i, ts: `2026-09-10T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z` }))
    }
    expect(store.runs[0].events).toHaveLength(100)
    expect(store.runs[0].cost).toBe(129) // 保留的是最新 100 条
  })

  it('畸形事件（无 threadId）被安全忽略', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    sock().serverEmit('graph:event', { type: 'graph.started', ts: '2026-09-10T00:00:00Z' })
    expect(store.runs).toHaveLength(1)
    expect(store.runs[0].events).toHaveLength(0)
  })

  it('graph:history 按 threadId 归位到对应 run', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' }), item({ runId: 'run-2' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    sock().serverEmit('graph:history', [
      ge('graph.node-complete', 'run-2', { nodeId: 'gate', step: 1, ts: '2026-09-10T00:01:00Z' }),
      ge('graph.started', 'run-1', { ts: '2026-09-10T00:00:00Z' }),
    ])
    expect(store.runs.find(r => r.runId === 'run-1')?.stage).toBe('discovery')
    expect(store.runs.find(r => r.runId === 'run-2')?.stage).toBe('gate')
  })
})

describe('useRunCenterStore — 断线重连 + resubscribe 去重', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeSocket.current = null
    vi.clearAllMocks()
  })

  // P3 台账 #1 回归（首连双发）：socket 未连接时订阅 emit 由 socket.io 缓冲，
  // 'connect' 后自动送达一次——connect 回调若再重发，服务端会对同一房间重放
  // graph:history（首连双发）。修复后：首连跳过重发，仅断线重连才重发。
  it('首连不重发 subscribe（回归：首连双发已修）；断线重连才重发', async () => {
    // 预置未连接 socket（模拟真实连接时序：订阅 emit 先于连接建立）
    fakeSocket.current = new FakeGraphSocket()
    fakeSocket.current.connected = false

    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' }), item({ runId: 'run-2' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    store.syncVisibleRunIds(['run-1', 'run-2'])
    expect(sock().subscribedRooms()).toEqual(['run-1', 'run-2'])

    // 首连：缓冲的 subscribe 自动送达，回调不再重发（修复前此处双发）
    sock().serverEmit('connect')
    expect(store.connection).toBe('connected')
    expect(sock().subscribedRooms()).toEqual(['run-1', 'run-2'])

    // 断线 → 重连：服务端房间可能已丢，connect 回调重发 subscribe
    sock().serverEmit('disconnect')
    expect(store.connection).toBe('disconnected')
    sock().serverEmit('connect')
    expect(sock().subscribedRooms().slice(-2)).toEqual(['run-1', 'run-2'])

    // 关键去重断言：graph:event 监听器全程只注册一次（对照 loop store 叠加缺陷）
    expect(sock().listenerCount('graph:event')).toBe(1)
    expect(sock().listenerCount('graph:history')).toBe(1)

    // 重连后事件仍只投递一次（无重复监听导致的重复投影）
    sock().serverEmit('graph:event', ge('graph.interrupt', 'run-1', { interruptId: 'x', ts: '2026-09-10T00:02:00Z' }))
    expect(store.runs[0].events).toHaveLength(1)
  })

  it('重连后再次 fetchRuns 不产生额外 subscribe（connect 已重发）', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    store.syncVisibleRunIds(['run-1'])
    sock().serverEmit('disconnect')
    sock().serverEmit('connect') // 重连回调已重发 subscribe
    const before = sock().subscribedRooms().length
    await store.fetchRuns()
    store.syncVisibleRunIds(['run-1'])
    expect(sock().subscribedRooms().length).toBe(before) // 集合内已存在，不重发
  })

  it('disconnect() 关闭 socket、清空订阅集合与连接状态', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    store.syncVisibleRunIds(['run-1'])
    const s = sock()
    store.disconnect()
    expect(s.connected).toBe(false)
    expect(store.connection).toBe('disconnected')
    // 重新 fetchRuns 建立全新 socket（旧实例不再复用）
    await store.fetchRuns()
    expect(sock()).not.toBe(s)
    expect(sock().connected).toBe(true)
  })
})

describe('useRunCenterStore — eid 去重（P3 台账 #1）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeSocket.current = null
    vi.clearAllMocks()
  })

  it('history 与实时双发同一 eid 只投影一次（首连双发主场景）', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' })])
    const store = useRunCenterStore()
    await store.fetchRuns()

    const eid = 'run-1-7'
    sock().serverEmit('graph:history', [
      { runId: 'run-1', graphId: 'loop-loop1', kind: 'interrupt.raised', ts: 1700000000000, eid, payload: { interruptId: 'approval:c1@1' } },
    ])
    // 实时流同事件（socket 词汇 + 同 eid）：历史与实时重叠窗口的双发拷贝
    sock().serverEmit('graph:event', ge('graph.interrupt', 'run-1', { interruptId: 'approval:c1@1', eid, ts: '2026-09-10T00:02:00Z' }))

    const run = store.runs.find(r => r.runId === 'run-1')!
    expect(run.events).toHaveLength(1)
    expect(run.status).toBe('awaiting-input')
    expect(run.pendingInterruptId).toBe('approval:c1@1')
  })

  it('缺 eid 的重复事件回退 type+ts+nodeId 复合键去重；不同 ts 不误伤', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' })])
    const store = useRunCenterStore()
    await store.fetchRuns()

    const dup = { type: 'graph.node-complete', threadId: 'run-1', nodeId: 'gate', ts: '2026-09-10T00:01:00Z' }
    sock().serverEmit('graph:event', dup)
    sock().serverEmit('graph:event', { ...dup }) // 同复合键 → 丢弃
    sock().serverEmit('graph:event', { ...dup, ts: '2026-09-10T00:01:01Z' }) // 不同 ts → 保留

    expect(store.runs[0].events).toHaveLength(2)
  })

  it('去重键按 run 隔离；大量事件后重放末条仍被复合键去重', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' }), item({ runId: 'run-2' })])
    const store = useRunCenterStore()
    await store.fetchRuns()

    sock().serverEmit('graph:event', ge('graph.completed', 'run-1', { eid: 'run-1-9', ts: '2026-09-10T00:09:00Z' }))
    sock().serverEmit('graph:event', ge('graph.completed', 'run-2', { eid: 'run-1-9', ts: '2026-09-10T00:09:00Z' }))
    expect(store.runs.find(r => r.runId === 'run-1')!.events).toHaveLength(1)
    expect(store.runs.find(r => r.runId === 'run-2')!.events).toHaveLength(1) // 同 eid 不同 run 不串

    // 大量事件后（超出 seen 上限）重放最新事件仍被 eid 去重
    for (let i = 0; i < 150; i++) {
      sock().serverEmit('graph:event', ge('cost.recorded', 'run-1', { totalCost: i, ts: `2026-09-10T01:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z` }))
    }
    const before = store.runs.find(r => r.runId === 'run-1')!.events.length
    sock().serverEmit('graph:event', ge('cost.recorded', 'run-1', { totalCost: 149, ts: '2026-09-10T01:02:29Z' }))
    expect(store.runs.find(r => r.runId === 'run-1')!.events.length).toBe(before)
  })
})

describe('useRunCenterStore — 排序 getter 与动作', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeSocket.current = null
    vi.clearAllMocks()
  })

  it('sortedRuns：awaiting-input 置顶 → 最后活动倒序', async () => {
    rest.listRuns.mockResolvedValue([
      item({ runId: 'r-slow', updatedAt: '2026-09-10T00:01:00Z' }),
      item({ runId: 'r-await', status: 'awaiting-input', updatedAt: '2026-09-10T00:00:30Z' }),
      item({ runId: 'r-fast', updatedAt: '2026-09-10T00:03:00Z' }),
    ])
    const store = useRunCenterStore()
    await store.fetchRuns()
    expect(store.sortedRuns.map(r => r.runId)).toEqual(['r-await', 'r-fast', 'r-slow'])
  })

  it('selectRun 维护选中态与 selectedRun getter', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' }), item({ runId: 'run-2' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    expect(store.selectedRun).toBeNull()
    store.selectRun('run-2')
    expect(store.selectedRun?.runId).toBe('run-2')
  })

  it('resumeRun 用投影出的未决 interruptId 调 REST', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1', status: 'awaiting-input' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    sock().serverEmit('graph:event', ge('graph.interrupt', 'run-1', { interruptId: 'approval:c3@1', ts: '2026-09-10T00:02:00Z' }))
    await store.resumeRun('run-1', 'approved')
    expect(rest.resumeRun).toHaveBeenCalledWith('run-1', 'approval:c3@1', 'approved')
  })

  it('resumeRun 无未决中断时不发请求并置 error', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1', status: 'awaiting-input' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    await expect(store.resumeRun('run-1', 'approved')).rejects.toThrow(/No pending interrupt/)
    expect(rest.resumeRun).not.toHaveBeenCalled()
  })

  it('forkRun 调 REST 分叉并刷新列表纳入 fork 产物', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' }), item({ runId: 'run-1-fork-1', status: 'paused' })])
    const newId = await store.forkRun('run-1')
    expect(newId).toBe('run-1-fork-1')
    expect(rest.forkRun).toHaveBeenCalledWith('run-1', undefined)
    expect(store.runs.map(r => r.runId)).toEqual(['run-1', 'run-1-fork-1'])
  })

  it('fetchReplay 拉取回放事件序列', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    rest.replay.mockResolvedValue([
      ge('graph.started', 'run-1', { ts: '2026-09-10T00:00:00Z' }),
      ge('graph.completed', 'run-1', { ts: '2026-09-10T00:05:00Z' }),
    ])
    await store.fetchReplay('run-1')
    expect(rest.replay).toHaveBeenCalledWith('run-1')
    expect(store.replayEvents).toHaveLength(2)
    expect(store.replayRunId).toBe('run-1')
  })

  it('REST 失败置 error 不炸列表', async () => {
    rest.listRuns.mockRejectedValue(new Error('server down'))
    const store = useRunCenterStore()
    await store.fetchRuns()
    expect(store.error).toBe('server down')
    expect(store.runs).toHaveLength(0)
  })
})

describe('useRunCenterStore — graph:history 日志词汇摄取（审查修复回归）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeSocket.current = null
    vi.clearAllMocks()
    try { localStorage.clear() } catch { /* ignore */ }
  })

  /** GraphLogEvent（event-log-store 形状）：runId/kind/epoch ts/payload */
  const logEvent = (over: { seq: number } & Partial<Record<string, unknown>>) => ({
    runId: 'run-1',
    graphId: 'loop-loop1',
    ...over,
  })

  it('订阅回放（runId/kind 词汇）全量摄取：状态→awaiting-input、未决中断可投影（验收主路径）', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1', status: 'unknown' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    sock().serverEmit('graph:history', [
      logEvent({ seq: 1, ts: 1700000000000, kind: 'run.started', payload: {} }),
      logEvent({ seq: 2, ts: 1700000000001, kind: 'node.started', nodeId: 'validation', superStep: 1, payload: {} }),
      logEvent({
        seq: 3, ts: 1700000000002, kind: 'interrupt.raised', nodeId: 'validation',
        payload: { interruptId: 'approval:c1@1', value: { kind: 'approval', prompt: 'approve me' } },
      }),
    ])

    const run = store.runs.find(r => r.runId === 'run-1')
    expect(run).toBeTruthy()
    expect(run!.events).toHaveLength(3) // 历史事件不再被 threadId 门卫丢弃
    expect(run!.status).toBe('awaiting-input') // interrupt.raised → awaiting-input
    expect(run!.pendingInterruptId).toBe('approval:c1@1') // 审批面板 v-if 的数据源
  })

  it('日志词汇终态：run.completed/run.failed 驱动状态并关闭未决中断', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1', status: 'unknown' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    sock().serverEmit('graph:history', [
      logEvent({ seq: 1, ts: 1, kind: 'interrupt.raised', payload: { interruptId: 'approval:c1@1' } }),
      logEvent({ seq: 2, ts: 2, kind: 'run.failed', payload: { error: 'boom' } }),
    ])
    const run = store.runs.find(r => r.runId === 'run-1')
    expect(run!.status).toBe('failed')
    expect(run!.pendingInterruptId).toBeNull()
  })

  it('resumeRun 乐观投影在日志词汇缓冲上同样生效（runId 门卫不回退）', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1', status: 'awaiting-input' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    sock().serverEmit('graph:history', [
      logEvent({
        seq: 1, ts: 1, kind: 'interrupt.raised', nodeId: 'validation',
        payload: { interruptId: 'approval:c1@1', value: { kind: 'approval', prompt: 'approve me' } },
      }),
    ])
    await store.resumeRun('run-1', { decision: 'approved' })
    const run = store.runs.find(r => r.runId === 'run-1')
    expect(run!.status).toBe('running')
    expect(run!.pendingInterruptId).toBeNull()
  })
})

describe('useRunCenterStore — 乐观 resume 投影（task-7）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeSocket.current = null
    vi.clearAllMocks()
  })

  const awaitRun = async (): Promise<ReturnType<typeof useRunCenterStore>> => {
    rest.listRuns.mockResolvedValue([item({ runId: 'run-1', status: 'awaiting-input' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    sock().serverEmit('graph:event', ge('graph.interrupt', 'run-1', {
      interruptId: 'approval:c3@1',
      value: { kind: 'approval', contractId: 'c3', prompt: 'approve me' },
      ts: '2026-09-10T00:02:00Z',
    }))
    return store
  }

  it('REST 成功后立即落一条本地 resume 事件：状态→running、未决中断关闭、resumeValue 可投影', async () => {
    const store = await awaitRun()
    expect(store.runs[0].status).toBe('awaiting-input')
    expect(store.runs[0].pendingInterruptId).toBe('approval:c3@1')

    await store.resumeRun('run-1', { decision: 'approved' })

    expect(rest.resumeRun).toHaveBeenCalledWith('run-1', 'approval:c3@1', { decision: 'approved' })
    const run = store.runs[0]
    expect(run.status).toBe('running') // 乐观投影：不等 socket 回声
    expect(run.pendingInterruptId).toBeNull() // resume 关闭未决中断
    const last = run.events[run.events.length - 1]
    expect(last.type).toBe('graph.resume')
    expect(last.interruptId).toBe('approval:c3@1')
    expect(last.resumeValue).toEqual({ decision: 'approved' })
  })

  it('REST 失败不落本地投影：状态与未决中断保持 awaiting', async () => {
    const store = await awaitRun()
    rest.resumeRun.mockRejectedValueOnce(new Error('resume rejected by server'))
    await expect(store.resumeRun('run-1', { decision: 'approved' })).rejects.toThrow('resume rejected by server')
    expect(store.runs[0].status).toBe('awaiting-input')
    expect(store.runs[0].pendingInterruptId).toBe('approval:c3@1')
  })
})

describe('useRunCenterStore — 介入收件箱两态（task-7）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeSocket.current = null
    vi.clearAllMocks()
    // 归档标记落 localStorage，测试间隔离
    try { localStorage.clear() } catch { /* ignore */ }
  })

  it('awaitingRuns = 全部 awaiting-input（待我处理排序）；非 awaiting 不进收件箱', async () => {
    rest.listRuns.mockResolvedValue([
      item({ runId: 'r-a', status: 'awaiting-input', updatedAt: '2026-09-10T00:00:30Z' }),
      item({ runId: 'r-b', status: 'awaiting-input', updatedAt: '2026-09-10T00:01:00Z' }),
      item({ runId: 'r-c', status: 'running' }),
    ])
    const store = useRunCenterStore()
    await store.fetchRuns()
    expect(store.awaitingRuns.map(r => r.runId)).toEqual(['r-b', 'r-a']) // 最后活动倒序
    expect(store.pendingInboxRuns).toHaveLength(2)
    expect(store.archivedInboxRuns).toHaveLength(0)
  })

  it('archiveRun 只打本地标记（不改 run 状态），run 移入已归档；unarchiveRun 移回', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'r-a', status: 'awaiting-input' })])
    const store = useRunCenterStore()
    await store.fetchRuns()

    store.archiveRun('r-a')
    expect(store.runs[0].status).toBe('awaiting-input') // run 状态不变
    expect(store.pendingInboxRuns).toHaveLength(0)
    expect(store.archivedInboxRuns.map(r => r.runId)).toEqual(['r-a'])
    // 持久化：localStorage 有标记
    expect(JSON.parse(localStorage.getItem('runcenter:inbox:archived')!)).toHaveProperty('r-a')

    store.unarchiveRun('r-a')
    expect(store.pendingInboxRuns.map(r => r.runId)).toEqual(['r-a'])
    expect(store.archivedInboxRuns).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('runcenter:inbox:archived')!)).not.toHaveProperty('r-a')
  })

  it('已归档 run 若不再是 awaiting-input，自动退出已归档列表（两态都以 awaiting 为域）', async () => {
    rest.listRuns.mockResolvedValue([item({ runId: 'r-a', status: 'awaiting-input' })])
    const store = useRunCenterStore()
    await store.fetchRuns()
    store.archiveRun('r-a')
    // 服务端侧 run 恢复（resume 事件）
    sock().serverEmit('graph:event', ge('graph.resume', 'r-a', { ts: '2026-09-10T00:03:00Z' }))
    expect(store.awaitingRuns).toHaveLength(0)
    expect(store.pendingInboxRuns).toHaveLength(0)
    expect(store.archivedInboxRuns).toHaveLength(0)
  })
})
