// overlay/custom/client/loop/graph/__tests__/loop-to-graph.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  loopToGraphInstance, loopToGraphDef, loopEventsToGraphEvents, resetProjectionWarnForTest,
} from '../../../../server/loop/graph/loop-to-graph'
import type { LoopInstance, LoopEvent } from '../../types'

function makeLoop(): LoopInstance {
  return {
    id: 'test-loop', name: 'Test Loop', goal: 'test goal', stopCondition: 'all tests pass',
    pattern: 'daily-triage', schedule: { mode: 'cron', cron: '0 9 * * *', timezone: 'UTC' },
    stage: 'validation', status: 'running', autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: '2026-07-14T00:00:00Z', updatedAt: '2026-07-14T01:00:00Z',
    lastTickAt: '2026-07-14T00:30:00Z', nextTickAt: '2026-07-14T09:00:00Z',
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 3, tasksDiscovered: 5, tasksCompleted: 3, tasksBlocked: 1, totalCost: 12.50, currentIteration: 3 },
  }
}

describe('loopToGraphInstance', () => {
  it('maps loop to graph instance with correct stage as step', () => {
    const instance = loopToGraphInstance(makeLoop(), [])
    expect(instance.graphDefId).toBe('test-loop')
    expect(instance.currentStep).toBe(2) // validation = index 2
    expect(instance.status).toBe('running')
    expect(instance.totalCost).toBe(12.50)
    expect(instance.state.loopName).toBe('Test Loop')
    expect(instance.state.tasksDiscovered).toBe(5)
  })

  it('maps loop status to graph status', () => {
    const loop = makeLoop()
    loop.status = 'awaiting-review'
    const instance = loopToGraphInstance(loop, [])
    expect(instance.status).toBe('awaiting-input')
  })

  it('maps loop stage to correct step index', () => {
    const loop = makeLoop()
    for (const [stage, expectedStep] of [['discovery', 0], ['handoff', 1], ['validation', 2], ['persistence', 3], ['scheduling', 4]] as const) {
      loop.stage = stage as any
      const instance = loopToGraphInstance(loop, [])
      expect(instance.currentStep).toBe(expectedStep)
    }
  })
})

describe('loopToGraphDef', () => {
  it('creates graph def with 5 stage nodes', () => {
    const def = loopToGraphDef(makeLoop())
    expect(def.nodes.size).toBe(5)
    expect(def.nodes.has('discovery')).toBe(true)
    expect(def.nodes.has('handoff')).toBe(true)
    expect(def.nodes.has('validation')).toBe(true)
    expect(def.nodes.has('persistence')).toBe(true)
    expect(def.nodes.has('scheduling')).toBe(true)
  })

  it('creates correct edges including repair and loop', () => {
    const def = loopToGraphDef(makeLoop())
    expect(def.edges.some(e => e.source === 'discovery' && e.target === 'handoff')).toBe(true)
    expect(def.edges.some(e => e.source === 'validation' && e.target === 'persistence')).toBe(true)
    expect(def.edges.some(e => e.source === 'validation' && e.target === 'handoff' && e.label === 'repair')).toBe(true)
    expect(def.edges.some(e => e.source === 'scheduling' && e.target === 'discovery' && e.label === 'next tick')).toBe(true)
  })

  it('sets entry node to current stage', () => {
    const def = loopToGraphDef(makeLoop())
    expect(def.entryNode).toBe('validation')
  })

  it('projects the compiler topology to the legacy 5-stage REST view (P2 Task 3 delegation)', () => {
    const def = loopToGraphDef(makeLoop())
    // 编译产物含 gate/stop-check，投影折叠进 scheduling；5 阶段一个不多不少
    expect([...def.nodes.keys()].sort()).toEqual(['discovery', 'handoff', 'persistence', 'scheduling', 'validation'])
    // 边集合恰为 legacy 8 条（台账 #17）：直连主干 4 条（无 label）+ repair 2 条（validation/
    // persistence 失败回边，P2 Task 4 审查修复新增 persistence 侧）+ scheduling 自环 1 条
    // （gate→stop-check 折叠内部步骤）+ next tick 循环
    const bare = def.edges.filter(e => e.source === 'discovery' && e.target === 'handoff'
      || e.source === 'handoff' && e.target === 'validation'
      || e.source === 'validation' && e.target === 'persistence'
      || e.source === 'persistence' && e.target === 'scheduling')
    expect(bare).toHaveLength(4)
    expect(bare.every(e => e.label === undefined && e.condition === undefined)).toBe(true)
    const validationRepair = def.edges.find(e => e.label === 'repair' && e.source === 'validation')!
    expect(validationRepair.target).toBe('handoff')
    expect(typeof validationRepair.condition).toBe('function')
    // persistence 失败回边（Critical 修复）：与 validation 对称投影进 REST 视图
    const persistenceRepair = def.edges.find(e => e.label === 'repair' && e.source === 'persistence')!
    expect(persistenceRepair.target).toBe('handoff')
    expect(typeof persistenceRepair.condition).toBe('function')
    // 台账 #17：gate→stop-check 同折叠进 scheduling → 投影为自环（label 保留），不再静默丢弃
    const selfLoop = def.edges.find(e => e.source === 'scheduling' && e.target === 'scheduling')!
    expect(selfLoop.label).toBe('gate-passed')
    const loopEdge = def.edges.find(e => e.label === 'next tick')!
    expect(loopEdge.source).toBe('scheduling')
    expect(loopEdge.target).toBe('discovery')
    expect(def.edges).toHaveLength(8)
    // 编译期守卫/分支语义（guard.maxIterations、no-contracts、gate-repair）属可执行面，REST 视图不投影
    expect(def.edges.some(e => e.source === 'discovery' && e.target === 'scheduling')).toBe(false)
    expect(def.edges.some(e => e.source === 'scheduling' && e.target === 'handoff')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 台账 #14（顺延 P4 清偿）：投影丢弃非线性主干边必须 warn（from→to 列明，warn-once）
// ---------------------------------------------------------------------------

describe('loopToGraphDef — dropped-edge warning (台账 #14)', () => {
  beforeEach(() => {
    resetProjectionWarnForTest()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    resetProjectionWarnForTest()
  })

  it('warns once per dropped non-linear edge (no-contracts short-circuit + gate-repair back-edge)', () => {
    loopToGraphDef(makeLoop())
    const warns = (console.warn as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0]))
    const dropped = warns.filter(w => w.includes('drops non-linear edge'))
    expect(dropped.some(w => w.includes('discovery→stop-check') && w.includes('no-contracts'))).toBe(true)
    expect(dropped.some(w => w.includes('gate→handoff') && w.includes('gate-repair'))).toBe(true)

    // warn-once：同 loop 再投影（REST 读路径反复调用）不刷屏
    loopToGraphDef(makeLoop())
    const again = (console.warn as ReturnType<typeof vi.fn>).mock.calls
      .map(c => String(c[0])).filter(w => w.includes('drops non-linear edge'))
    expect(again).toHaveLength(2)
  })

  it('same-fold self-loop is projected, not warned (台账 #17：gate→stop-check 折叠可见)', () => {
    const def = loopToGraphDef(makeLoop())
    expect(def.edges.some(e => e.source === 'scheduling' && e.target === 'scheduling')).toBe(true)
    const warns = (console.warn as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0]))
    // 自环不进丢弃告警（gate-passed 边被投影，而非丢弃）
    expect(warns.some(w => w.includes('gate→stop-check'))).toBe(false)
  })
})

describe('loopEventsToGraphEvents', () => {
  it('maps loop stage-transition to graph node-complete', () => {
    const events: LoopEvent[] = [
      { type: 'loop.stage-transition', loopId: 'test-loop', from: 'discovery', to: 'handoff', reason: 'tasks found', ts: '2026-07-14T01:00:00Z' } as any,
    ]
    const graphEvents = loopEventsToGraphEvents(events, 'test-loop')
    expect(graphEvents.length).toBe(1)
    expect(graphEvents[0].type).toBe('graph.node-complete')
    expect((graphEvents[0] as any).nodeId).toBe('discovery')
  })

  it('maps loop verification-complete with repair flag', () => {
    const events: LoopEvent[] = [
      { type: 'loop.verification-complete', contractId: 'c1', passed: false, ts: '2026-07-14T01:00:00Z' } as any,
    ]
    const graphEvents = loopEventsToGraphEvents(events, 'test-loop')
    expect(graphEvents.length).toBe(1)
    expect(graphEvents[0].type).toBe('graph.node-complete')
    expect((graphEvents[0] as any).result.update.repair).toBe(true)
  })

  it('maps loop completed to graph completed', () => {
    const events: LoopEvent[] = [
      { type: 'loop.completed', loopId: 'test-loop', finalStats: { totalCost: 50 } as any, ts: '2026-07-14T01:00:00Z' } as any,
    ]
    const graphEvents = loopEventsToGraphEvents(events, 'test-loop')
    expect(graphEvents.length).toBe(1)
    expect(graphEvents[0].type).toBe('graph.completed')
  })

  it('filters out unmapped events', () => {
    const events: LoopEvent[] = [
      { type: 'unknown-event', loopId: 'test-loop', ts: '2026-07-14T01:00:00Z' } as any,
    ]
    const graphEvents = loopEventsToGraphEvents(events, 'test-loop')
    expect(graphEvents.length).toBe(0)
  })
})
