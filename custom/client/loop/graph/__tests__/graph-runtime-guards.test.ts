// overlay/custom/client/loop/graph/__tests__/graph-runtime-guards.test.ts
import { describe, it, expect } from 'vitest'
import { GraphRuntime } from '../../../../server/loop/graph/graph-runtime'
import { GraphBuilder, fnNode } from '../../../../server/loop/graph/graph-definition'
import { reducers, type GraphEvent, type StateValues } from '../../../../server/loop/graph/types'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'

function builder() {
  return new GraphBuilder('g', 'G')
    .addChannel('count', { reducer: reducers.overwrite(), default: 0 })
    .addChannel('log', { reducer: reducers.append(), default: [] as string[] })
}

describe('guarded back edge', () => {
  it('terminates via guard.maxIterations and emits edge.guard-exceeded', async () => {
    const events: GraphEvent[] = []
    const rt = new GraphRuntime({ emitEvent: e => events.push(e) })
    const g = builder()
      .addNode(fnNode('a', async (s: StateValues) => ({ update: { count: (s.count as number) + 1 } })))
      .addNode(fnNode('b', async () => ({ update: {} })))
      .setEntry('a')
      .addEdge('a', 'b')
      .addEdge('b', 'a', 'retry', { maxIterations: 3 })
      .setMaxSteps(50)
      .build()
    const inst = await rt.start(g, 't1')
    // a 执行 4 次（初始 + 3 次回边），第 4 次回边被 guard 拦截
    expect(inst.state.count).toBe(4)
    expect(inst.status).toBe('completed')
    expect(events.some(e => (e as any).type === 'edge.guard-exceeded')).toBe(true)
  })

  it('breakCondition exits loop early', async () => {
    const events: GraphEvent[] = []
    const rt = new GraphRuntime({ emitEvent: e => events.push(e) })
    const g = builder()
      .addNode(fnNode('a', async (s: StateValues) => ({ update: { count: (s.count as number) + 1 } })))
      .addNode(fnNode('b', async () => ({ update: {} })))
      .setEntry('a')
      .addEdge('a', 'b')
      .addEdge('b', 'a', 'retry', {
        maxIterations: 100,
        breakCondition: { op: 'cmp', path: 'count', cmp: 'gte', value: 2 },
      })
      .build()
    const inst = await rt.start(g, 't2')
    expect(inst.state.count).toBe(2)
    expect(inst.status).toBe('completed')
    expect(events.some(e => (e as any).type === 'edge.break')).toBe(true)
  })

  it('builder rejects unguarded cycle at build()', () => {
    expect(() => builder()
      .addNode(fnNode('a', async () => ({})))
      .addNode(fnNode('b', async () => ({})))
      .setEntry('a')
      .addEdge('a', 'b')
      .addEdge('b', 'a')
      .build(),
    ).toThrow(/guard/i)
  })
})

describe('remaining steps + budget', () => {
  it('injects __remainingSteps into node-visible state', async () => {
    const seen: number[] = []
    const rt = new GraphRuntime({ emitEvent: () => {} })
    const g = builder()
      .addNode(fnNode('a', async (s: StateValues) => {
        seen.push(s.__remainingSteps as number)
        return { update: { count: (s.count as number) + 1 } }
      }))
      .addNode(fnNode('b', async (s: StateValues) => {
        seen.push(s.__remainingSteps as number)
        return { update: {} }
      }))
      .setEntry('a').addEdge('a', 'b')
      .addEdge('b', 'a', 'loop', { maxIterations: 2 })
      .setMaxSteps(10)
      .build()
    await rt.start(g, 't3')
    expect(seen[0]).toBe(9)     // step0: 10-0-1
    expect(seen[1]).toBe(8)     // step1
    expect(seen[2]).toBe(7)     // step2 (a again)
  })

  it('fails when cost budget exceeded', async () => {
    const rt = new GraphRuntime({
      emitEvent: () => {},
      recordCost: () => {},
    })
    const g = builder()
      .addNode(fnNode('spend', async (_s, ctx) => {
        ctx.deps.recordCost?.(10)
        return { update: {} }
      }))
      .setEntry('spend')
      .addEdge('spend', 'spend', 'loop', { maxIterations: 10 })
      .setMaxSteps(20)
      .build()
    g.budget = { maxCost: 15, maxTokens: 0 }
    const inst = await rt.start(g, 't4')
    expect(inst.status).toBe('failed')
    expect(inst.totalCost).toBeGreaterThan(15)
  })
})

describe('join barrier', () => {
  it('waits for all predecessors by default', async () => {
    const order: string[] = []
    const rt = new GraphRuntime({ emitEvent: () => {} })
    const g = builder()
      .addNode(fnNode('start', async () => { order.push('start'); return {} }))
      .addNode(fnNode('fast', async () => { order.push('fast'); return {} }))
      .addNode(fnNode('slow', async () => { await new Promise(r => setTimeout(r, 20)); order.push('slow'); return {} }))
      .addNode(fnNode('join', async () => { order.push('join'); return {} }))
      .setEntry('start')
      .addEdge('start', 'fast')
      .addEdge('start', 'slow')
      .addEdge('fast', 'join')
      .addEdge('slow', 'join')
      .build()
    const inst = await rt.start(g, 't5')
    expect(inst.status).toBe('completed')
    // join 必须在 fast 与 slow 都完成后执行，且只执行一次
    expect(order.filter(x => x === 'join')).toHaveLength(1)
    expect(order.indexOf('join')).toBeGreaterThan(order.indexOf('fast'))
    expect(order.indexOf('join')).toBeGreaterThan(order.indexOf('slow'))
  })

  it('joinMode any fires on first predecessor', async () => {
    const order: string[] = []
    const rt = new GraphRuntime({ emitEvent: () => {} })
    const g = builder()
      .addNode(fnNode('start', async () => { order.push('start'); return {} }))
      .addNode(fnNode('fast', async () => { order.push('fast'); return {} }))
      .addNode(fnNode('slow', async () => { await new Promise(r => setTimeout(r, 20)); order.push('slow'); return {} }))
      .addNode({ id: 'join', type: 'function', label: 'join', joinMode: 'any',
        execute: async () => { order.push('join'); return {} } })
      .setEntry('start')
      .addEdge('start', 'fast')
      .addEdge('start', 'slow')
      .addEdge('fast', 'join')
      .addEdge('slow', 'join')
      .build()
    const inst = await rt.start(g, 't6')
    expect(inst.status).toBe('completed')
    expect(order.indexOf('join')).toBeLessThan(order.indexOf('slow'))
  })
})

describe('fail-branch', () => {
  it('routes to onError target instead of failing the run', async () => {
    const rt = new GraphRuntime({ emitEvent: () => {} })
    const g = builder()
      .addNode({
        id: 'risky', type: 'function', label: 'risky',
        execute: async () => { throw new Error('boom') },
        onError: { type: 'goto', target: 'fallback' },
      })
      .addNode(fnNode('fallback', async () => ({ update: { log: ['rescued'] } })))
      .setEntry('risky')
      .addEdge('risky', 'fallback')
      .build()
    const inst = await rt.start(g, 't7')
    expect(inst.status).toBe('completed')
    expect(inst.state.log).toEqual(['rescued'])
  })
})

describe('event log wiring', () => {
  it('appends lifecycle events to EventLogStore', async () => {
    const log = new InMemoryEventLogStore()
    const rt = new GraphRuntime({ emitEvent: () => {} }, { eventLog: log, runId: 'run-1' })
    const g = builder()
      .addNode(fnNode('a', async () => ({ update: { count: 1 } })))
      .setEntry('a')
      .build()
    await rt.start(g, 't8')
    const kinds = (await log.query('run-1')).map(e => e.kind)
    expect(kinds).toContain('run.started')
    expect(kinds).toContain('node.completed')
    expect(kinds).toContain('checkpoint.saved')
    expect(kinds).toContain('run.completed')
  })
})

describe('true resume', () => {
  it('resumes from checkpoint and continues remaining nodes', async () => {
    const log = new InMemoryEventLogStore()
    const events: GraphEvent[] = []
    const rt = new GraphRuntime({ emitEvent: e => events.push(e) }, { eventLog: log, runId: 'run-9' })
    const order: string[] = []
    const g = builder()
      .addNode(fnNode('a', async () => { order.push('a'); return { update: { count: 1 } } }))
      .addNode(fnNode('gate', async (_s, ctx) => ({
        interrupt: { value: { prompt: 'ok?' }, id: `gate-${ctx.threadId}-${ctx.superStep}` },
      })))
      .addNode(fnNode('c', async (s: StateValues) => {
        order.push('c')
        return { update: { log: [`resumed:${String(s['__resume:gate-t9-1'])}`] } }
      }))
      .setEntry('a').addEdge('a', 'gate').addEdge('gate', 'c')
      .build()
    const inst = await rt.start(g, 't9')
    expect(inst.status).toBe('awaiting-input')
    expect(order).toEqual(['a'])

    const cp = await log.getLatestCheckpoint('run-9')
    expect(cp).not.toBeNull()
    expect(cp!.pendingInterrupts).toHaveLength(1)
    const interruptId = cp!.pendingInterrupts[0].id

    const rt2 = new GraphRuntime({ emitEvent: e => events.push(e) }, { eventLog: log, runId: 'run-9' })
    const inst2 = await rt2.resumeFromCheckpoint(g, cp!, 'yes', interruptId)
    expect(inst2.status).toBe('completed')
    expect(order).toEqual(['a', 'c'])           // a 没有重跑
    expect(inst2.state.count).toBe(1)           // 状态从 checkpoint 恢复
    expect(inst2.state.log).toEqual(['resumed:yes'])
    const kinds = (await log.query('run-9')).map(e => e.kind)
    expect(kinds).toContain('interrupt.raised')
    expect(kinds).toContain('interrupt.resumed')
  })
})
