// overlay/custom/client/loop/graph/__tests__/graph-runtime.test.ts
import { describe, it, expect, vi } from 'vitest'
import { GraphRuntime } from '../../../../server/loop/graph/graph-runtime'
import { GraphBuilder, fnNode, humanNode, when } from '../../../../server/loop/graph/graph-definition'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import { reducers } from '../../../../server/loop/graph/types'
import type { GraphEvent, StateValues } from '../../../../server/loop/graph/types'

function makeEvents(): GraphEvent[] { return [] }

function makeBuilder(): GraphBuilder {
  return new GraphBuilder('test-graph', 'Test Graph', 'A test graph')
    .addChannel('count', { reducer: reducers.overwrite(), default: 0 })
    .addChannel('results', { reducer: reducers.append(), default: [] })
}

describe('GraphRuntime', () => {
  it('executes a simple linear graph', async () => {
    const events: GraphEvent[] = []
    const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })

    const graph = makeBuilder()
      .addNode(fnNode('start', async () => ({ update: { count: 1, results: ['start'] } })))
      .addNode(fnNode('middle', async (state: StateValues) => ({ update: { count: (state.count as number) + 1, results: ['middle'] } })))
      .addNode(fnNode('end', async () => ({ update: { results: ['end'] } })))
      .setEntry('start')
      .addEdge('start', 'middle')
      .addEdge('middle', 'end')
      .build()

    const instance = await runtime.start(graph, 'thread-1')
    expect(instance.status).toBe('completed')
    expect(instance.state.count).toBe(2)
    expect(instance.state.results).toEqual(['start', 'middle', 'end'])
    expect(events.some(e => e.type === 'graph.started')).toBe(true)
    expect(events.some(e => e.type === 'graph.completed')).toBe(true)
  })

  it('parallel nodes in same super-step', async () => {
    const events: GraphEvent[] = []
    const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })

    const graph = makeBuilder()
      .addNode(fnNode('start', async () => ({ update: { count: 1 } })))
      .addNode(fnNode('branch-a', async () => ({ update: { results: ['a'] } })))
      .addNode(fnNode('branch-b', async () => ({ update: { results: ['b'] } })))
      .addNode(fnNode('join', async () => ({ update: { results: ['join'] } })))
      .setEntry('start')
      .addEdge('start', 'branch-a')
      .addEdge('start', 'branch-b')
      .addEdge('branch-a', 'join')
      .addEdge('branch-b', 'join')
      .build()

    const instance = await runtime.start(graph, 'thread-2')
    expect(instance.status).toBe('completed')
    expect(instance.state.results).toContain('a')
    expect(instance.state.results).toContain('b')
    expect(instance.state.results).toContain('join')
  })

  it('conditional routing', async () => {
    const events: GraphEvent[] = []
    const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })

    const graph = makeBuilder()
      .addNode(fnNode('check', async (state: StateValues) => ({
        update: { count: (state.count as number) + 1 },
      })))
      .addNode(fnNode('done', async () => ({ update: { results: ['done'] } })))
      .addNode(fnNode('continue', async () => ({ update: { results: ['continue'] } })))
      .setEntry('check')
      .addConditionalEdge('check', when((s) => (s.count as number) >= 3, 'done'))
      .addConditionalEdge('check', when((s) => (s.count as number) < 3, 'continue'))
      .addEdge('continue', 'check', 'loop', { maxIterations: 10 }) // loop back (guarded)
      .setMaxSteps(10)
      .build()

    const instance = await runtime.start(graph, 'thread-3')
    expect(instance.status).toBe('completed')
    expect(instance.state.count).toBe(3)
    expect(instance.state.results).toContain('done')
  })

  it('interrupt pauses and returns awaiting-input', async () => {
    const events: GraphEvent[] = []
    const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })

    const graph = makeBuilder()
      .addNode(fnNode('start', async () => ({ update: { count: 1 } })))
      .addNode(humanNode('approval', 'Please approve'))
      .addNode(fnNode('after', async () => ({ update: { results: ['after'] } })))
      .setEntry('start')
      .addEdge('start', 'approval')
      .addEdge('approval', 'after')
      .build()

    const instance = await runtime.start(graph, 'thread-4')
    expect(instance.status).toBe('awaiting-input')
    expect(events.some(e => e.type === 'graph.interrupt')).toBe(true)
    expect(instance.state.count).toBe(1)
  })

  it('node failure sets status to failed', async () => {
    const events: GraphEvent[] = []
    const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })

    const graph = makeBuilder()
      .addNode(fnNode('fail', async () => { throw new Error('boom') }))
      .setEntry('fail')
      .build()

    const instance = await runtime.start(graph, 'thread-5')
    expect(instance.status).toBe('failed')
    expect(events.some(e => e.type === 'graph.node-error')).toBe(true)
    expect(events.some(e => e.type === 'graph.failed')).toBe(true)
  })

  it('respects maxSteps limit', async () => {
    const events: GraphEvent[] = []
    const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })

    const graph = makeBuilder()
      .addNode(fnNode('loop', async () => ({ update: { count: 1 } })))
      .setEntry('loop')
      .addEdge('loop', 'loop', 'loop', { maxIterations: 1000 })
      .setMaxSteps(5)
      .build()

    const instance = await runtime.start(graph, 'thread-6')
    expect(instance.status).toBe('failed')
    expect(events.some(e => e.type === 'graph.failed')).toBe(true)
    expect(events.some(e => (e as any).error?.includes('maxSteps'))).toBe(true)
  })

  it('end condition terminates graph', async () => {
    const events: GraphEvent[] = []
    const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })

    const graph = makeBuilder()
      .addNode(fnNode('counter', async (state: StateValues) => ({
        update: { count: (state.count as number) + 1 },
      })))
      .setEntry('counter')
      .addEdge('counter', 'counter', 'loop', { maxIterations: 1000 })
      .setEndCondition((state) => (state.count as number) >= 5)
      .build()

    const instance = await runtime.start(graph, 'thread-7')
    expect(instance.status).toBe('completed')
    expect(instance.state.count).toBe(5)
  })

  it('retry on transient failure', async () => {
    const events: GraphEvent[] = []
    const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })

    let attempts = 0
    const graph = makeBuilder()
      .addNode({
        id: 'flaky',
        type: 'function',
        label: 'flaky',
        execute: async () => {
          attempts++
          if (attempts < 3) throw new Error('transient')
          return { update: { count: attempts } }
        },
        retry: { maxAttempts: 3, backoffMs: 1 },
      })
      .setEntry('flaky')
      .build()

    const instance = await runtime.start(graph, 'thread-8')
    expect(instance.status).toBe('completed')
    expect(attempts).toBe(3)
  })

  it('send API for map-reduce fan-out', async () => {
    const events: GraphEvent[] = []
    const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })

    const graph = makeBuilder()
      .addNode(fnNode('dispatch', async () => ({
        send: [
          { node: 'worker', state: { workerId: 1 } },
          { node: 'worker', state: { workerId: 2 } },
        ],
      })))
      .addNode(fnNode('worker', async (state: StateValues) => ({
        update: { results: [`worker-${state.workerId}`] },
      })))
      .addNode(fnNode('collect', async () => ({ update: { results: ['collect'] } })))
      .setEntry('dispatch')
      .addEdge('dispatch', 'collect')
      .build()

    const instance = await runtime.start(graph, 'thread-9')
    expect(instance.status).toBe('completed')
    expect(instance.state.results).toContain('worker-1')
    expect(instance.state.results).toContain('worker-2')
    expect(instance.state.results).toContain('collect')
  })

  it('resume continues after interrupt', async () => {
    const events: GraphEvent[] = []
    const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })

    const graph = makeBuilder()
      .addNode(fnNode('start', async () => ({ update: { count: 1 } })))
      .addNode(humanNode('approval', 'Please approve'))
      .addNode(fnNode('after', async () => ({ update: { results: ['after'] } })))
      .setEntry('start')
      .addEdge('start', 'approval')
      .addEdge('approval', 'after')
      .build()

    // First run: hits interrupt
    const instance1 = await runtime.start(graph, 'thread-10')
    expect(instance1.status).toBe('awaiting-input')

    // Resume
    const instance2 = await runtime.resume(graph, instance1, 'approval-thread-10-1', 'approved')
    expect(instance2.status).toBe('running')
    expect(events.some(e => e.type === 'graph.resume')).toBe(true)
  })

  it('loop.* 桥接事件 payload 透传进事件日志（P3 Task 7：run 反查产物任务的数据根）', async () => {
    // 未装配 deps.emitEvent 时 loop.* 只进日志不桥接——此处断言日志行携带完整
    // LoopEvent 形状（旧实现 payload 落 {}，replay 端反查不到 artifact/taskId）
    const store = new InMemoryEventLogStore()
    const runtime = new GraphRuntime(
      { emitEvent: () => {} },
      { eventLog: store, runId: 'run-loop-l1-1' },
    )
    const graph = makeBuilder()
      .addNode(fnNode('persistence', async (_state: StateValues, ctx) => {
        ctx.deps.emitEvent({
          type: 'loop.persisted', loopId: 'l1',
          contractId: 'task/a', artifact: 'kanban:t_9', taskId: 't_9', runId: 'run-loop-l1-1',
          ts: new Date().toISOString(),
        } as never)
        return { update: { count: 1 } }
      }))
      .setEntry('persistence')
      .build()

    await runtime.start(graph, 'run-loop-l1-1')
    const logged = await store.query('run-loop-l1-1')
    const persisted = logged.find(e => e.kind === 'loop.persisted')
    expect(persisted).toBeDefined()
    expect(persisted?.payload).toMatchObject({ contractId: 'task/a', artifact: 'kanban:t_9', taskId: 't_9' })
  })
})
