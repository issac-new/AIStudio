// overlay/custom/client/loop/runcenter/__tests__/adapters.test.ts
// 运行中心投影函数单测（TDD 先行）：deriveStage / deriveIteration / deriveCost /
// deriveLastActivityAt / latestOpenInterrupt / sortRuns / legalActions / relativeTime / filterRuns
import { describe, it, expect } from 'vitest'
import {
  deriveStage,
  deriveIteration,
  deriveCost,
  deriveLastActivityAt,
  latestOpenInterrupt,
  sortRuns,
  legalActions,
  relativeTime,
  filterRuns,
  statusTone,
} from '../adapters'
import type { GraphEventLike } from '../types'

/** 事件构造器（GraphEventLike 最小形状） */
const ev = (over: Partial<GraphEventLike> & { type: string; ts: string }): GraphEventLike => ({
  graphId: 'loop-loop1',
  threadId: 'run-1',
  ...over,
})

describe('deriveStage — 双轴投影：graph 节点/loop 业务阶段 → 门禁六段', () => {
  it('空事件返回 null', () => {
    expect(deriveStage([])).toBeNull()
  })

  it('graph.node-start/node-complete 的 nodeId 直接映射阶段', () => {
    const events = [
      ev({ type: 'graph.started', ts: '2026-09-10T00:00:00Z' }),
      ev({ type: 'graph.node-start', nodeId: 'handoff', ts: '2026-09-10T00:01:00Z' }),
    ]
    expect(deriveStage(events)).toBe('handoff')
  })

  it('stop-check 节点折叠为 stop 阶段', () => {
    const events = [ev({ type: 'graph.node-complete', nodeId: 'stop-check', ts: '2026-09-10T00:01:00Z' })]
    expect(deriveStage(events)).toBe('stop')
  })

  it('gate 节点保持 gate 阶段（图轴原值）', () => {
    const events = [ev({ type: 'graph.node-start', nodeId: 'gate', ts: '2026-09-10T00:01:00Z' })]
    expect(deriveStage(events)).toBe('gate')
  })

  it('loop.stage-transition 的 to 为 legacy 业务阶段；scheduling → stop', () => {
    const events = [
      ev({ type: 'graph.node-complete', nodeId: 'validation', ts: '2026-09-10T00:01:00Z' }),
      ev({ type: 'loop.stage-transition', to: 'persistence', ts: '2026-09-10T00:02:00Z' }),
    ]
    expect(deriveStage(events)).toBe('persistence')

    const events2 = [
      ev({ type: 'loop.stage-transition', to: 'scheduling', ts: '2026-09-10T00:02:00Z' }),
    ]
    expect(deriveStage(events2)).toBe('stop')
  })

  it('取最后一个阶段承载事件（时间序扫描，最后写入者胜出）', () => {
    const events = [
      ev({ type: 'graph.node-start', nodeId: 'discovery', ts: '2026-09-10T00:00:00Z' }),
      ev({ type: 'graph.node-start', nodeId: 'handoff', ts: '2026-09-10T00:01:00Z' }),
      ev({ type: 'graph.node-complete', nodeId: 'handoff', ts: '2026-09-10T00:02:00Z' }),
    ]
    expect(deriveStage(events)).toBe('handoff')
  })

  it('graph.interrupt 保留中断所在节点的阶段', () => {
    const events = [ev({ type: 'graph.interrupt', nodeId: 'validation', interruptId: 'approval:c1', ts: '2026-09-10T00:01:00Z' })]
    expect(deriveStage(events)).toBe('validation')
  })

  it('未知 nodeId（如 loop.stuck 桥接的 reason）不污染阶段', () => {
    const events = [
      ev({ type: 'graph.node-start', nodeId: 'handoff', ts: '2026-09-10T00:01:00Z' }),
      ev({ type: 'graph.node-error', nodeId: 'some-weird-reason', ts: '2026-09-10T00:02:00Z' }),
    ]
    expect(deriveStage(events)).toBe('handoff')
  })

  it('graph.completed 后阶段定格在最后已知阶段', () => {
    const events = [
      ev({ type: 'graph.node-start', nodeId: 'persistence', ts: '2026-09-10T00:01:00Z' }),
      ev({ type: 'graph.completed', ts: '2026-09-10T00:05:00Z' }),
    ]
    expect(deriveStage(events)).toBe('persistence')
  })
})

describe('deriveIteration — 取事件中的最大 step', () => {
  it('无 step 事件返回 0', () => {
    expect(deriveIteration([ev({ type: 'graph.started', ts: '2026-09-10T00:00:00Z' })])).toBe(0)
    expect(deriveIteration([])).toBe(0)
  })

  it('取所有 step 的最大值', () => {
    const events = [
      ev({ type: 'graph.step-start', step: 1, ts: '2026-09-10T00:00:00Z' }),
      ev({ type: 'graph.node-complete', step: 3, ts: '2026-09-10T00:01:00Z' }),
      ev({ type: 'graph.step-complete', step: 2, ts: '2026-09-10T00:02:00Z' }),
    ]
    expect(deriveIteration(events)).toBe(3)
  })

  it('非数值 step 忽略', () => {
    const events = [
      ev({ type: 'graph.node-complete', step: 'x' as unknown as number, ts: '2026-09-10T00:00:00Z' }),
      ev({ type: 'graph.node-complete', step: 2, ts: '2026-09-10T00:01:00Z' }),
    ]
    expect(deriveIteration(events)).toBe(2)
  })
})

describe('deriveCost — 最后一个成本承载事件的 totalCost', () => {
  it('无成本事件返回 0', () => {
    expect(deriveCost([])).toBe(0)
    expect(deriveCost([ev({ type: 'graph.started', ts: '2026-09-10T00:00:00Z' })])).toBe(0)
  })

  it('cost.recorded 取累计 totalCost（最后一个胜出）', () => {
    const events = [
      ev({ type: 'cost.recorded', totalCost: 0.5, ts: '2026-09-10T00:00:00Z' }),
      ev({ type: 'cost.recorded', totalCost: 1.25, ts: '2026-09-10T00:01:00Z' }),
    ]
    expect(deriveCost(events)).toBe(1.25)
  })

  it('graph.completed 的 totalCost 同样生效', () => {
    const events = [ev({ type: 'graph.completed', totalCost: 3.5, ts: '2026-09-10T00:01:00Z' })]
    expect(deriveCost(events)).toBe(3.5)
  })
})

describe('deriveLastActivityAt — 事件最大 ts', () => {
  it('空事件返回 null', () => {
    expect(deriveLastActivityAt([])).toBeNull()
  })

  it('返回时间戳最大的一条', () => {
    const events = [
      ev({ type: 'graph.started', ts: '2026-09-10T00:00:00Z' }),
      ev({ type: 'graph.node-complete', ts: '2026-09-10T00:03:00Z' }),
      ev({ type: 'graph.node-complete', ts: '2026-09-10T00:01:00Z' }),
    ]
    expect(deriveLastActivityAt(events)).toBe('2026-09-10T00:03:00Z')
  })
})

describe('latestOpenInterrupt — 待我处理的 interruptId', () => {
  it('无中断返回 null', () => {
    expect(latestOpenInterrupt([])).toBeNull()
    expect(latestOpenInterrupt([ev({ type: 'graph.started', ts: '2026-09-10T00:00:00Z' })])).toBeNull()
  })

  it('graph.interrupt 后未 resume → 返回 interruptId', () => {
    const events = [ev({ type: 'graph.interrupt', interruptId: 'approval:c1@0', ts: '2026-09-10T00:01:00Z' })]
    expect(latestOpenInterrupt(events)).toBe('approval:c1@0')
  })

  it('resume 同一 interruptId 后关闭', () => {
    const events = [
      ev({ type: 'graph.interrupt', interruptId: 'approval:c1@0', ts: '2026-09-10T00:01:00Z' }),
      ev({ type: 'graph.resume', interruptId: 'approval:c1@0', ts: '2026-09-10T00:02:00Z' }),
    ]
    expect(latestOpenInterrupt(events)).toBeNull()
  })

  it('多个中断取最后一个未决的', () => {
    const events = [
      ev({ type: 'graph.interrupt', interruptId: 'a', ts: '2026-09-10T00:01:00Z' }),
      ev({ type: 'graph.resume', interruptId: 'a', ts: '2026-09-10T00:02:00Z' }),
      ev({ type: 'graph.interrupt', interruptId: 'b', ts: '2026-09-10T00:03:00Z' }),
    ]
    expect(latestOpenInterrupt(events)).toBe('b')
  })

  it('终态（completed/failed）清除未决中断', () => {
    const events = [
      ev({ type: 'graph.interrupt', interruptId: 'a', ts: '2026-09-10T00:01:00Z' }),
      ev({ type: 'graph.failed', ts: '2026-09-10T00:02:00Z' }),
    ]
    expect(latestOpenInterrupt(events)).toBeNull()
  })
})

describe('sortRuns — 待我处理置顶 → 最后活动倒序', () => {
  const run = (runId: string, status: string, lastActivityAt: string | null) => ({
    runId, status, lastActivityAt,
  })

  it('awaiting-input 恒在最前，其余按最后活动倒序', () => {
    const sorted = sortRuns([
      run('r1', 'completed', '2026-09-10T00:09:00Z'),
      run('r2', 'running', '2026-09-10T00:08:00Z'),
      run('r3', 'awaiting-input', '2026-09-10T00:01:00Z'),
      run('r4', 'failed', '2026-09-10T00:10:00Z'),
      run('r5', 'running', '2026-09-10T00:11:00Z'),
    ])
    expect(sorted.map(r => r.runId)).toEqual(['r3', 'r5', 'r4', 'r1', 'r2'])
  })

  it('多个 awaiting-input 之间仍按最后活动倒序', () => {
    const sorted = sortRuns([
      run('a1', 'awaiting-input', '2026-09-10T00:01:00Z'),
      run('a2', 'awaiting-input', '2026-09-10T00:05:00Z'),
    ])
    expect(sorted.map(r => r.runId)).toEqual(['a2', 'a1'])
  })

  it('lastActivityAt 为 null 的排在同组末尾且不抛错', () => {
    const sorted = sortRuns([
      run('r1', 'running', null),
      run('r2', 'running', '2026-09-10T00:01:00Z'),
    ])
    expect(sorted.map(r => r.runId)).toEqual(['r2', 'r1'])
  })
})

describe('legalActions — status 驱动的合法操作集（不存在任意跳转）', () => {
  it('awaiting-input → 查看审批 + 详情', () => {
    expect(legalActions('awaiting-input')).toEqual(['approve', 'detail'])
  })
  it('running → peek + 详情', () => {
    expect(legalActions('running')).toEqual(['peek', 'detail'])
  })
  it('completed / failed → 回放 + 分叉 + 详情', () => {
    expect(legalActions('completed')).toEqual(['replay', 'fork', 'detail'])
    expect(legalActions('failed')).toEqual(['replay', 'fork', 'detail'])
  })
  it('idle/paused/unknown → 仅详情', () => {
    expect(legalActions('idle')).toEqual(['detail'])
    expect(legalActions('paused')).toEqual(['detail'])
    expect(legalActions('unknown')).toEqual(['detail'])
  })
})

describe('relativeTime — 相对时间结构化 token', () => {
  const now = Date.parse('2026-09-10T12:00:00Z')

  it('60 秒内 → justNow', () => {
    expect(relativeTime('2026-09-10T11:59:30Z', now)).toEqual({ key: 'justNow' })
  })

  it('60 分钟内 → minutesAgo', () => {
    expect(relativeTime('2026-09-10T11:37:00Z', now)).toEqual({ key: 'minutesAgo', n: 23 })
  })

  it('24 小时内 → hoursAgo', () => {
    expect(relativeTime('2026-09-10T06:00:00Z', now)).toEqual({ key: 'hoursAgo', n: 6 })
  })

  it('更早 → daysAgo', () => {
    expect(relativeTime('2026-09-08T12:00:00Z', now)).toEqual({ key: 'daysAgo', n: 2 })
  })

  it('非法时间戳返回 null（组件落 — 占位）', () => {
    expect(relativeTime('', now)).toBeNull()
    expect(relativeTime('not-a-date', now)).toBeNull()
  })

  it('未来时间戳（时钟偏斜）→ justNow，不出现负数', () => {
    expect(relativeTime('2026-09-10T12:05:00Z', now)).toEqual({ key: 'justNow' })
  })
})

describe('filterRuns — 工具条过滤（status + 关键字）', () => {
  const runs = [
    { runId: 'run-alpha', graphId: 'loop-1', status: 'running', lastActivityAt: '2026-09-10T00:01:00Z' },
    { runId: 'run-beta', graphId: 'loop-2', status: 'awaiting-input', lastActivityAt: '2026-09-10T00:02:00Z' },
    { runId: 'run-gamma', graphId: 'loop-1', status: 'completed', lastActivityAt: '2026-09-10T00:03:00Z' },
  ]

  it('无过滤条件返回全部', () => {
    expect(filterRuns(runs, {})).toHaveLength(3)
  })

  it('按 status 过滤', () => {
    expect(filterRuns(runs, { status: 'running' }).map(r => r.runId)).toEqual(['run-alpha'])
  })

  it('按关键字匹配 runId 或 graphId（大小写不敏感）', () => {
    expect(filterRuns(runs, { query: 'BETA' }).map(r => r.runId)).toEqual(['run-beta'])
    expect(filterRuns(runs, { query: 'loop-1' }).map(r => r.runId)).toEqual(['run-alpha', 'run-gamma'])
  })

  it('status + 关键字叠加', () => {
    expect(filterRuns(runs, { status: 'completed', query: 'loop-2' })).toHaveLength(0)
    expect(filterRuns(runs, { status: 'completed', query: 'gamma' })).toHaveLength(1)
  })
})

describe('statusTone — 状态徽标语义色', () => {
  it('running → ok（呼吸绿点）；awaiting-input → warning；failed → error；completed → muted', () => {
    expect(statusTone('running')).toBe('ok')
    expect(statusTone('awaiting-input')).toBe('warning')
    expect(statusTone('failed')).toBe('error')
    expect(statusTone('completed')).toBe('muted')
  })

  it('idle/paused/unknown → muted', () => {
    expect(statusTone('idle')).toBe('muted')
    expect(statusTone('paused')).toBe('muted')
    expect(statusTone('unknown')).toBe('muted')
  })
})
