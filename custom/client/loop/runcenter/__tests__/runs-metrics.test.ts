// overlay/custom/client/loop/runcenter/__tests__/runs-metrics.test.ts
// P3 Task 4 — runs store fetchMetrics：总览关键指标的轻量采集动作。
// 职责边界（投影纪律）：store 只采集不计算——listRuns 全量 + 近窗终态 run 回放
// （上限 N）+ 各 loop 近窗事件（loop.stuck 熔断计数输入），聚合在
// ia2/adapters/overview.ts aggregateMetrics 纯函数（另有重点单测）。
// 本文件断言采集行为：TTL 缓存 / 并发去重 / 上限裁剪 / 部分失败跳过 / 整体失败保旧。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { runRest, loopRest } = vi.hoisted(() => ({
  runRest: {
    listRuns: vi.fn(async () => [] as Array<{ runId: string; graphId: string; status: string; updatedAt: string | null }>),
    replay: vi.fn(async () => [] as Array<{ type: string; ts: string }>),
    getRun: vi.fn(async () => { throw new Error('not used') }),
    resumeRun: vi.fn(async () => ({ runId: 'x', instance: {} })),
    forkRun: vi.fn(async () => ({ runId: 'f', forkedFrom: 'x', superStep: 0 })),
    startRun: vi.fn(async () => ({ runId: 'f', instance: {} })),
    exportRun: vi.fn(async () => ({ run: {}, spec: null, events: [] })),
    getSpec: vi.fn(async () => null),
  },
  loopRest: {
    listLoops: vi.fn(async () => [] as Array<{ id: string }>),
    getEvents: vi.fn(async () => [] as Array<{ type: string; ts: string }>),
  },
}))

vi.mock('@/custom/loop/runcenter/api', () => ({
  runRest,
  connectGraph: vi.fn(() => { throw new Error('fetchMetrics 不建连') }),
  disconnectGraph: vi.fn(),
}))
vi.mock('@/custom/loop/api/loop-rest', () => ({ loopRest }))

import { useRunCenterStore } from '../store/runs'
import type { MetricsRaw, RunListItem } from '../types'

const DAY = 86_400_000

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

const row = (runId: string, status: string, updatedAtMs: number | null): RunListItem => ({
  runId,
  graphId: 'loop-x',
  status: status as RunListItem['status'],
  updatedAt: updatedAtMs === null ? null : new Date(updatedAtMs).toISOString(),
})

describe('fetchMetrics — 采集', () => {
  // store 侧窗口按采集时刻 Date.now() 计算，用例锚真实时钟（避免固定日期 7 天后过期）
  const NOW = Date.now()

  it('listRuns 全量 + 仅对近窗终态 run 拉回放；loop 事件带 since 窗口', async () => {
    runRest.listRuns.mockResolvedValue([
      row('run-done-1', 'completed', NOW - 1 * DAY),
      row('run-done-2', 'failed', NOW - 2 * DAY),
      row('run-old', 'completed', NOW - 9 * DAY),   // 窗口外
      row('run-live', 'running', NOW - 1 * DAY),     // 非终态
      row('run-void', 'completed', null),                    // 无时刻不可考
    ])
    runRest.replay.mockImplementation(async (id: string) => [{ type: 'graph.started', ts: new Date(NOW - DAY).toISOString() }, { type: 'graph.completed', ts: new Date(NOW - DAY + 1000).toISOString(), runId: id }])
    loopRest.listLoops.mockResolvedValue([{ id: 'l1' }, { id: 'l2' }])
    loopRest.getEvents.mockResolvedValue([{ type: 'loop.stuck', ts: new Date(NOW - DAY).toISOString() }])

    const store = useRunCenterStore()
    const raw = await store.fetchMetrics()
    expect(raw).not.toBeNull()
    expect(runRest.replay).toHaveBeenCalledTimes(2)
    expect(runRest.replay).toHaveBeenCalledWith('run-done-1')
    expect(runRest.replay).toHaveBeenCalledWith('run-done-2')
    expect(raw!.runs).toHaveLength(5)
    expect(raw!.replays.map(r => r.runId).sort()).toEqual(['run-done-1', 'run-done-2'])
    expect(loopRest.getEvents).toHaveBeenCalledTimes(2)
    expect(loopRest.getEvents).toHaveBeenCalledWith('l1', expect.any(String), expect.any(Number))
    // since = 窗口起点（采集时刻往前 7 天，ISO）
    const sinceArg = loopRest.getEvents.mock.calls[0][1] as string
    expect(Date.now() - Date.parse(sinceArg)).toBeCloseTo(7 * DAY, -3)
    expect(raw!.loopEvents).toHaveLength(2)
  })

  it('回放上限：近窗终态多于上限时只取最近 N 个（updatedAt 倒序）', async () => {
    const rows: RunListItem[] = []
    for (let i = 0; i < 25; i++) rows.push(row(`run-${String(i).padStart(2, '0')}`, 'completed', NOW - (i + 1) * 3_600_000))
    runRest.listRuns.mockResolvedValue(rows)
    runRest.replay.mockResolvedValue([])
    loopRest.listLoops.mockResolvedValue([])

    const store = useRunCenterStore()
    const raw = await store.fetchMetrics()
    expect(runRest.replay).toHaveBeenCalledTimes(20)
    // 最近 20 个 = i 0..19（i=0 最近）
    expect(raw!.replays.every(r => Number(r.runId.slice(4)) < 20)).toBe(true)
  })

  it('部分失败跳过：单 run 回放失败、单 loop 事件失败不阻塞其余采集', async () => {
    runRest.listRuns.mockResolvedValue([row('ok', 'completed', NOW - DAY), row('boom', 'failed', NOW - DAY)])
    runRest.replay.mockImplementation(async (id: string) => {
      if (id === 'boom') throw new Error('replay 500')
      return [{ type: 'a', ts: new Date(NOW - DAY).toISOString() }, { type: 'b', ts: new Date(NOW - DAY + 500).toISOString() }]
    })
    loopRest.listLoops.mockResolvedValue([{ id: 'l1' }, { id: 'l2' }])
    loopRest.getEvents.mockImplementation(async (id: string) => {
      if (id === 'l2') throw new Error('events 500')
      return [{ type: 'loop.stuck', ts: new Date(NOW - DAY).toISOString() }]
    })

    const store = useRunCenterStore()
    const raw = await store.fetchMetrics()
    expect(raw!.replays.map(r => r.runId)).toEqual(['ok'])
    expect(raw!.loopEvents.map(l => l.loopId)).toEqual(['l1'])
    // 单 loop 事件切片失败 = 熔断计数输入不完整 → partial 标志（Task 4 审查 B-2）
    expect(raw!.partial).toBe(true)
  })

  it('loop 列表拉取失败：熔断计数空采集且标 partial（部分数据，非完整零）', async () => {
    runRest.listRuns.mockResolvedValue([row('ok', 'completed', NOW - DAY)])
    runRest.replay.mockResolvedValue([])
    loopRest.listLoops.mockRejectedValue(new Error('loops 500'))

    const store = useRunCenterStore()
    const raw = await store.fetchMetrics()
    expect(raw).not.toBeNull()
    expect(raw!.loopEvents).toHaveLength(0)
    expect(raw!.partial).toBe(true)
  })

  it('完整采集：loop 列表与全部事件切片成功 → partial 缺省 false', async () => {
    runRest.listRuns.mockResolvedValue([])
    loopRest.listLoops.mockResolvedValue([{ id: 'l1' }])
    loopRest.getEvents.mockResolvedValue([])

    const store = useRunCenterStore()
    const raw = await store.fetchMetrics()
    expect(raw!.partial).toBe(false)
  })
})

describe('fetchMetrics — 缓存与并发', () => {
  const NOW = Date.now()

  function freshRaw(collectedAt: number): MetricsRaw {
    return { runs: [], replays: [], loopEvents: [], collectedAt, partial: false }
  }

  it('TTL 内复用快照不再发请求；过期（>5min）后重采', async () => {
    runRest.listRuns.mockResolvedValue([])
    loopRest.listLoops.mockResolvedValue([])
    const store = useRunCenterStore()

    await store.fetchMetrics()
    expect(runRest.listRuns).toHaveBeenCalledTimes(1)

    // 快照新鲜（collectedAt 刚刚）→ TTL 内命中
    store.metricsRaw = freshRaw(Date.now())
    await store.fetchMetrics()
    expect(runRest.listRuns).toHaveBeenCalledTimes(1)

    // 快照过期 → 重采
    store.metricsRaw = freshRaw(Date.now() - 6 * 60_000)
    await store.fetchMetrics()
    expect(runRest.listRuns).toHaveBeenCalledTimes(2)
  })

  it('force=true 绕过 TTL 重采；进行中请求并发去重', async () => {
    let resolveList: (v: RunListItem[]) => void = () => {}
    runRest.listRuns.mockImplementation(() => new Promise(res => { resolveList = res }))
    loopRest.listLoops.mockResolvedValue([])
    const store = useRunCenterStore()

    const p1 = store.fetchMetrics(true)
    const p2 = store.fetchMetrics()      // 无缓存 + inflight → 复用
    const p3 = store.fetchMetrics(true)  // force 也不另起（同一 inflight）
    expect(runRest.listRuns).toHaveBeenCalledTimes(1)
    resolveList([])
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])
    expect(r1).toBe(r2)
    expect(r2).toBe(r3)
    expect(runRest.listRuns).toHaveBeenCalledTimes(1)
  })

  it('listRuns 整体失败：返回 null、保留旧快照、metricsLoading 复位', async () => {
    loopRest.listLoops.mockResolvedValue([])
    const store = useRunCenterStore()

    // 首采成功
    runRest.listRuns.mockResolvedValueOnce([row('a', 'completed', NOW - DAY)])
    runRest.replay.mockResolvedValue([])
    const first = await store.fetchMetrics()
    expect(first).not.toBeNull()

    // 二采失败 → null + 旧快照保留
    runRest.listRuns.mockRejectedValueOnce(new Error('network down'))
    const second = await store.fetchMetrics(true)
    expect(second).toBeNull()
    expect(store.metricsRaw).not.toBeNull()
    expect(store.metricsRaw!.runs[0].runId).toBe('a')
    expect(store.metricsLoading).toBe(false)
  })
})
