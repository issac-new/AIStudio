// overlay/custom/client/loop/graph/__tests__/loop-to-graph.test.ts
import { describe, it, expect } from 'vitest'
import { loopToGraphInstance, loopToGraphDef, loopEventsToGraphEvents } from '../../../../server/loop/graph/loop-to-graph'
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
