// overlay[optadvice] 聚合纯函数测试（leadtime 瀑布 + 三张 Top-N）。
import { describe, it, expect } from 'vitest'
import { waterfallFromEvents, topStages, type TransitionLite } from '../leadtime'
import { gateErrorRowsFromEvents, topGateErrors, topSessions, type SessionUsageRow } from '../advice'

describe('周期瀑布 waterfallFromEvents', () => {
  const ev = (taskId: string, to: string, at: number, seq: number): TransitionLite => ({ taskId, to, at, seq })

  it('相邻迁移对间隔记入前阶段；末迁移不计时只计 entered', () => {
    const w = waterfallFromEvents([
      ev('t1', 'dispatch', 100, 1),
      ev('t1', 'devimpl', 200, 2),
      ev('t1', 'review', 500, 3),
    ])
    expect(w.stages.map((s) => s.stage)).toEqual(['dispatch', 'devimpl'])
    expect(w.stages[0].totalSec).toBe(100)      // dispatch→devimpl
    expect(w.stages[1].totalSec).toBe(300)      // devimpl→review；review 末迁移无下游
    expect(w.cards).toEqual([{ taskId: 't1', spanSec: 400, transitions: 3 }])
    expect(w.medianSpanSec).toBe(400)
  })

  it('多卡聚合：median/p90/sharePct + 阶段序=首次流入顺序', () => {
    const w = waterfallFromEvents([
      ev('a', 'x', 0, 1), ev('a', 'y', 100, 2), ev('a', 'z', 300, 3),
      ev('b', 'x', 10, 4), ev('b', 'y', 30, 5), ev('b', 'z', 60, 6),
    ])
    // x: a 停 100、b 停 20 → total 120；y: a 停 200、b 停 30 → total 230
    const x = w.stages.find((s) => s.stage === 'x')
    const y = w.stages.find((s) => s.stage === 'y')
    expect(x?.totalSec).toBe(120)
    expect(y?.totalSec).toBe(230)
    expect(x?.sharePct).toBeCloseTo(34.3, 1)
    expect(y?.sharePct).toBeCloseTo(65.7, 1)
    expect(x?.medianSec).toBe(60)   // [20,100] 偶数取均值 60
    expect(w.stages.map((s) => s.stage)).toEqual(['x', 'y'])
    expect(w.medianSpanSec).toBe(175) // 卡 a 跨 300s、卡 b 跨 50s → 偶数取均值 175
  })

  it('同秒迁移 seq 稳定排序；空事件空瀑布', () => {
    const w = waterfallFromEvents([ev('a', 'x', 5, 9), ev('a', 'y', 5, 8)])
    expect(w.stages[0].stage).toBe('y') // seq 8 先于 9
    const empty = waterfallFromEvents([])
    expect(empty.stages).toEqual([])
    expect(empty.medianSpanSec).toBeNull()
  })

  it('瓶颈 Top-N 按累计停留降序', () => {
    const w = waterfallFromEvents([
      ev('a', 'fast', 0, 1), ev('a', 'slow', 10, 2), ev('a', 'done', 1000, 3),
    ])
    expect(topStages(w, 2)[0].stage).toBe('slow')
  })
})

describe('烧钱会话 Top-N', () => {
  it('token 合计降序 + 并列按 id 稳定', () => {
    const rows: SessionUsageRow[] = [
      { id: 's2', title: null, model: 'm', lastActive: 1, inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: null },
      { id: 's1', title: 'A', model: 'm', lastActive: 2, inputTokens: 90, outputTokens: 10, totalTokens: 100, estimatedCostUsd: 0.5 },
      { id: 's0', title: 'B', model: 'm', lastActive: 3, inputTokens: 60, outputTokens: 40, totalTokens: 100, estimatedCostUsd: 0.4 },
    ]
    const top = topSessions(rows, 2)
    expect(top.map((r) => r.id)).toEqual(['s0', 's1'])
  })
})

describe('关卡拦截 Top-N', () => {
  const events = [
    { taskId: 't1', kind: 'gate_blocked', failures: [{ gate: 'archgate', reason: 'evidence_missing', detail: '缺锚点' }], at: 100 },
    { taskId: 't2', kind: 'gate_blocked', failures: [{ gate: 'archgate', reason: 'evidence_missing', detail: '缺拍摄位' }], at: 200 },
    { taskId: 't3', kind: 'gate_warning', failures: [{ gate: 'qgate', reason: 'jargon', detail: 'x' }], at: 150 },
    { taskId: 't3b', kind: 'timed_out', failures: [{ gate: 'iteration_budget', reason: 'budget_exhausted', detail: 'Iteration budget exhausted (60/60)' }], at: 310 },
    { taskId: 't4', kind: 'column_transition', to: 'x', at: 300 },
  ]

  it('归一行 failures 展开；无 failures 的迁移行不进', () => {
    const rows = gateErrorRowsFromEvents(events)
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.kind !== 'column_transition')).toBe(true)
  })

  it('gate:reason 分组计数降序 + lastAt/sample 取最新', () => {
    const top = topGateErrors(gateErrorRowsFromEvents(events), 3)
    expect(top[0]).toMatchObject({ gate: 'archgate', reason: 'evidence_missing', count: 2, lastAt: 200 })
    expect(top[0].sample).toContain('缺拍摄位')
    expect(top.find((g) => g.gate === 'iteration_budget')).toMatchObject({ count: 1 })
  })
})
