// overlay/custom/client/loop/graph/__tests__/graph-runtime-guards.test.ts
import { describe, it, expect } from 'vitest'
import { GraphRuntime } from '../../../../server/loop/graph/graph-runtime'
import { GraphBuilder, fnNode, when } from '../../../../server/loop/graph/graph-definition'
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
    // F1 回归：同代不重复激活——join 恰好执行 1 次
    expect(order.filter(x => x === 'join')).toHaveLength(1)
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

  // F2 回归：join 前驱 fast 在 interrupt checkpoint 前完成，resume 后簿记恢复，join 正常激活
  it('resume restores join ledger so cross-checkpoint join still fires', async () => {
    const log = new InMemoryEventLogStore()
    const rt = new GraphRuntime({ emitEvent: () => {} }, { eventLog: log, runId: 'run-join' })
    const order: string[] = []
    const g = builder()
      .addNode(fnNode('start', async () => { order.push('start'); return {} }))
      .addNode(fnNode('fast', async () => { order.push('fast'); return {} }))
      .addNode(fnNode('gate', async (_s, ctx) => {
        order.push('gate')
        return { interrupt: { value: 'ok?', id: `gate-${ctx.threadId}-${ctx.superStep}` } }
      }))
      .addNode(fnNode('slow', async () => { order.push('slow'); return {} }))
      .addNode(fnNode('join', async () => { order.push('join'); return {} }))
      .setEntry('start')
      .addEdge('start', 'fast')
      .addEdge('start', 'gate')
      .addEdge('gate', 'slow')
      .addEdge('fast', 'join')
      .addEdge('slow', 'join')
      .build()
    const inst = await rt.start(g, 'tj')
    expect(inst.status).toBe('awaiting-input')
    expect(order).toEqual(['start', 'fast', 'gate'])

    const cp = await log.getLatestCheckpoint('run-join')
    expect(cp).not.toBeNull()
    // join 簿记随 checkpoint 持久化：fast 的完成事实不丢
    expect(cp!.joinLedger?.completed).toContain('fast')

    const rt2 = new GraphRuntime({ emitEvent: () => {} }, { eventLog: log, runId: 'run-join' })
    const inst2 = await rt2.resumeFromCheckpoint(g, cp!, 'go', cp!.pendingInterrupts[0].id)
    expect(inst2.status).toBe('completed')
    expect(order).toEqual(['start', 'fast', 'gate', 'slow', 'join'])
    expect(order.filter(x => x === 'join')).toHaveLength(1)
  })
})

// F4 回归：条件边的 source 也纳入 join 屏障簿记
describe('join barrier with conditional edges', () => {
  it('conditional edge source counts as join predecessor', async () => {
    const order: string[] = []
    const rt = new GraphRuntime({ emitEvent: () => {} })
    const g = builder()
      .addNode(fnNode('start', async () => { order.push('start'); return {} }))
      .addNode(fnNode('check', async () => { order.push('check'); return {} }))
      .addNode(fnNode('a', async () => { order.push('a'); return {} }))
      .addNode(fnNode('fast', async () => { order.push('fast'); return {} }))
      .addNode(fnNode('join', async () => { order.push('join'); return {} }))
      .setEntry('start')
      .addEdge('start', 'check')
      .addEdge('start', 'a')
      .addEdge('a', 'fast')
      .addConditionalEdge('check', when(() => true, 'join'))
      .addEdge('fast', 'join')
      .build()
    const inst = await rt.start(g, 'tf4')
    expect(inst.status).toBe('completed')
    // join 必须等条件边前驱 check 与静态前驱 fast 都完成，且只执行一次
    expect(order.filter(x => x === 'join')).toHaveLength(1)
    expect(order.indexOf('join')).toBeGreaterThan(order.indexOf('check'))
    expect(order.indexOf('join')).toBeGreaterThan(order.indexOf('fast'))
  })
})

// F3 回归：同 super-step 并行节点写同一 channel 的合并序 = launch 序（BSP 语义），与完成先后无关
describe('deterministic merge order', () => {
  it('parallel nodes merge channel updates in launch order', async () => {
    const rt = new GraphRuntime({ emitEvent: () => {} })
    const g = builder()
      .addNode(fnNode('start', async () => ({})))
      .addNode(fnNode('a', async () => {
        await new Promise(r => setTimeout(r, 20))
        return { update: { log: ['A'], count: 1 } }
      }))
      .addNode(fnNode('b', async () => ({ update: { log: ['B'], count: 2 } })))
      .setEntry('start')
      .addEdge('start', 'a')
      .addEdge('start', 'b')
      .build()
    const inst = await rt.start(g, 'tf3')
    expect(inst.status).toBe('completed')
    expect(inst.state.log).toEqual(['A', 'B'])  // append：launch 序（b 先完成但排在后）
    expect(inst.state.count).toBe(2)            // overwrite：launch 序后者胜
  })
})

describe('L4 checks precede completion paths', () => {
  // F5 回归：最后一步 endCondition 满足但预算超支，仍判 failed 而非 completed
  it('budget check fires even when endCondition would complete on the same step', async () => {
    const rt = new GraphRuntime({ emitEvent: () => {}, recordCost: () => {} })
    const g = builder()
      .addNode(fnNode('spend', async (_s, ctx) => {
        ctx.deps.recordCost?.(10)
        return { update: { count: 1 } }
      }))
      .setEntry('spend')
      .addEdge('spend', 'spend', 'loop', { maxIterations: 100 })
      .setEndCondition(s => (s.count as number) >= 1)
      .build()
    g.budget = { maxCost: 5, maxTokens: 0 }
    const inst = await rt.start(g, 'tf5a')
    expect(inst.status).toBe('failed')
  })
})

describe('send subtask events', () => {
  // F5 回归：Send 子任务补发 node.completed（executeNode 已发 node.started）
  it('send subtasks emit node.started and node.completed', async () => {
    const events: GraphEvent[] = []
    const rt = new GraphRuntime({ emitEvent: e => events.push(e) })
    const g = builder()
      .addNode(fnNode('dispatch', async () => ({
        send: [
          { node: 'worker', state: { count: 1 } },
          { node: 'worker', state: { count: 2 } },
        ],
      })))
      .addNode(fnNode('worker', async () => ({ update: {} })))
      .setEntry('dispatch')
      .build()
    const inst = await rt.start(g, 'tf5b')
    expect(inst.status).toBe('completed')
    const started = events.filter(e => e.type === 'graph.node-start' && (e as any).nodeId === 'worker')
    const completed = events.filter(e => e.type === 'graph.node-complete' && (e as any).nodeId === 'worker')
    expect(started).toHaveLength(2)
    expect(completed).toHaveLength(2)
  })
})

describe('starved join signal', () => {
  // F5 回归：fail-branch 与 join 组合——slow 失败被路由走，join 永远等不到 slow，run 结束时发 node.starved
  it('emits node.starved when a join is permanently blocked by a failed predecessor', async () => {
    const events: GraphEvent[] = []
    const rt = new GraphRuntime({ emitEvent: e => events.push(e) })
    const g = builder()
      .addNode(fnNode('start', async () => ({})))
      .addNode(fnNode('fast', async () => ({})))
      .addNode({
        id: 'slow', type: 'function', label: 'slow',
        execute: async () => { throw new Error('boom') },
        onError: { type: 'goto', target: 'fallback' },
      })
      .addNode(fnNode('fallback', async () => ({})))
      .addNode(fnNode('join', async () => ({})))
      .setEntry('start')
      .addEdge('start', 'fast')
      .addEdge('start', 'slow')
      .addEdge('fast', 'join')
      .addEdge('slow', 'join')
      .build()
    const inst = await rt.start(g, 'tf5c')
    expect(inst.status).toBe('completed')
    const starved = events.filter(e => (e as any).type === 'node.starved')
    expect(starved).toHaveLength(1)
    expect((starved[0] as any).nodeId).toBe('join')
    expect((starved[0] as any).missing).toEqual(['slow'])
  })
})

// ============================================================================
// 终审探针固化（2026-09-09 whole-branch review，notes §7k）
// ============================================================================

describe('join inside a loop body', () => {
  // 循环体内的 join 每代必须恰好激活 1 次（回边 source 每次完成刷新 completedAtStep）
  it('activates exactly once per iteration', async () => {
    const order: string[] = []
    const rt = new GraphRuntime({ emitEvent: () => {} })
    const g = builder()
      .addNode(fnNode('a', async (s: StateValues) => {
        order.push('a')
        return { update: { count: (s.count as number) + 1 } }
      }))
      .addNode(fnNode('b', async () => { order.push('b'); return {} }))
      .addNode(fnNode('c', async () => { order.push('c'); return {} }))
      .addNode(fnNode('join', async () => { order.push('join'); return {} }))
      .setEntry('a')
      .addEdge('a', 'b')
      .addEdge('a', 'c')
      .addEdge('b', 'join')
      .addEdge('c', 'join')
      .addEdge('join', 'a', 'loop', { maxIterations: 2 })
      .setMaxSteps(20)
      .build()
    const inst = await rt.start(g, 'tjl')
    expect(inst.status).toBe('completed')
    expect(order.filter(x => x === 'join')).toHaveLength(3) // 初始代 + 2 次回边
    expect(order.filter(x => x === 'a')).toHaveLength(3)
    // 每代 join 都在 b、c 之后
    const idx = (x: string, n: number) => order.map((v, i) => v === x ? i : -1).filter(i => i >= 0)[n]
    for (let gen = 0; gen < 3; gen++) {
      expect(idx('join', gen)).toBeGreaterThan(idx('b', gen))
      expect(idx('join', gen)).toBeGreaterThan(idx('c', gen))
    }
  })
})

// ============================================================================
// Task 2 台账收口（k / l / n）
// ============================================================================

describe('L4 duration guard', () => {
  // k 台账：maxDurationMs 熔断——极小时长上限 + 慢节点 → run 判 failed，error 含 duration
  it('fails the run when maxDurationMs is exceeded, error mentions duration', async () => {
    const events: GraphEvent[] = []
    const rt = new GraphRuntime({ emitEvent: e => events.push(e) })
    const g = builder()
      .addNode(fnNode('slow', async () => {
        await new Promise(r => setTimeout(r, 40))
        return { update: {} }
      }))
      .setEntry('slow')
      .addEdge('slow', 'slow', 'loop', { maxIterations: 10 })
      .setMaxDurationMs(5)
      .setMaxSteps(20)
      .build()
    const inst = await rt.start(g, 'tk1')
    expect(inst.status).toBe('failed')
    const failed = events.find(e => e.type === 'graph.failed') as unknown as { error: string }
    expect(failed).toBeDefined()
    expect(failed.error).toMatch(/duration/)
  })
})

describe('retry-goto attempts counting', () => {
  // k 台账：retry-goto 同 target 路由计数——超 maxAttempts 后不再路由，run 判 failed
  it('fails the run once routing to the same target exceeds maxAttempts', async () => {
    const events: GraphEvent[] = []
    const rt = new GraphRuntime({ emitEvent: e => events.push(e) })
    const g = builder()
      .addNode({
        id: 'risky', type: 'function', label: 'risky',
        execute: async () => { throw new Error('boom') },
        onError: { type: 'retry-goto', target: 'fixup', maxAttempts: 2 },
      })
      .addNode(fnNode('fixup', async () => ({ update: {} })))
      .setEntry('risky')
      .addEdge('risky', 'fixup')
      .addEdge('fixup', 'risky', 'loop', { maxIterations: 5 })
      .setMaxSteps(20)
      .build()
    const inst = await rt.start(g, 'tk2')
    expect(inst.status).toBe('failed')
    // 第 1 次失败路由到 fixup；第 2 次失败超 maxAttempts → fatal
    const routed = events.filter(e => (e as any).type === 'node.error-routed' && (e as any).target === 'fixup')
    expect(routed).toHaveLength(1)
    const failed = events.find(e => e.type === 'graph.failed') as unknown as { error: string }
    expect(failed).toBeDefined()
    expect(failed.error).toMatch(/risky/)
  })
})

describe('conditional edge guard at build()', () => {
  // l 台账：条件边 target 求值前未知，无法静态判定是否闭合环。
  // 保守近似：无 guard 条件边的 source 若自身位于静态环上（存在路径回到 source），build() 拒绝
  it('rejects unguarded conditional edge whose source sits on a static cycle', () => {
    expect(() => builder()
      .addNode(fnNode('a', async () => ({})))
      .addNode(fnNode('b', async () => ({})))
      .setEntry('a')
      .addEdge('a', 'b')
      .addEdge('b', 'a', 'loop', { maxIterations: 3 })
      .addConditionalEdge('a', when(() => true, 'b'))
      .build(),
    ).toThrow(/guard/i)
  })

  // l 台账：带 guard 的条件边豁免，guard 字段透传进 EdgeDef
  it('accepts guarded conditional edge on a cyclic source and carries guard into EdgeDef', () => {
    const g = builder()
      .addNode(fnNode('a', async () => ({})))
      .addNode(fnNode('b', async () => ({})))
      .setEntry('a')
      .addEdge('a', 'b')
      .addEdge('b', 'a', 'loop', { maxIterations: 3 })
      .addConditionalEdge('a', when(() => true, 'b'), 'cond', { maxIterations: 2 })
      .build()
    const cond = g.edges.find(e => e.condition)
    expect(cond?.guard?.maxIterations).toBe(2)
  })

  it('still accepts unguarded conditional edge whose source is off any cycle', () => {
    const g = builder()
      .addNode(fnNode('start', async () => ({})))
      .addNode(fnNode('check', async () => ({})))
      .addNode(fnNode('join', async () => ({})))
      .setEntry('start')
      .addEdge('start', 'check')
      .addConditionalEdge('check', when(() => true, 'join'))
      .build()
    expect(g.edges.some(e => e.condition)).toBe(true)
  })
})

describe('starved join on endCondition completion', () => {
  // n 台账：endCondition 满足结束 run 时，被阻塞的 join 同样补发 node.starved
  it('emits node.starved when the run completes via endCondition with a blocked join', async () => {
    const events: GraphEvent[] = []
    const rt = new GraphRuntime({ emitEvent: e => events.push(e) })
    const g = builder()
      .addNode(fnNode('start', async () => ({})))
      .addNode(fnNode('fast', async () => ({})))
      .addNode({
        id: 'slow', type: 'function', label: 'slow',
        execute: async () => { throw new Error('boom') },
        onError: { type: 'goto', target: 'fallback' },
      })
      .addNode(fnNode('fallback', async () => ({ update: { count: 1 } })))
      .addNode(fnNode('join', async () => ({})))
      .setEntry('start')
      .addEdge('start', 'fast')
      .addEdge('start', 'slow')
      .addEdge('fast', 'join')
      .addEdge('slow', 'join')
      .setEndCondition(s => (s.count as number) >= 1)
      .build()
    const inst = await rt.start(g, 'tn1')
    expect(inst.status).toBe('completed')
    const starved = events.filter(e => (e as any).type === 'node.starved')
    expect(starved).toHaveLength(1)
    expect((starved[0] as any).nodeId).toBe('join')
    expect((starved[0] as any).missing).toEqual(['slow'])
  })
})

describe('guard counter across resume', () => {
  // 回边预算跨 interrupt/resume 不重置、不多给：总迭代 = 初始 + maxIterations
  it('does not reset guard iterations after resume', async () => {
    const log = new InMemoryEventLogStore()
    const rt = new GraphRuntime({ emitEvent: () => {} }, { eventLog: log, runId: 'grun' })
    const g = builder()
      .addNode(fnNode('a', async (s: StateValues) => ({ update: { count: (s.count as number) + 1 } })))
      .addNode(fnNode('gate', async (_s, ctx) => {
        // 只在第二代挂起（count===2 时），验证 resume 后守卫继续计数
        if ((ctx as unknown as { deps: unknown } && true) && _s.count === 2 && !Object.keys(_s).some(k => k.startsWith('__resume:'))) {
          return { interrupt: { value: { prompt: 'mid-loop' }, id: `gate-${ctx.threadId}-${ctx.superStep}` } }
        }
        return { update: {} }
      }))
      .setEntry('a')
      .addEdge('a', 'gate')
      .addEdge('gate', 'a', 'loop', { maxIterations: 3 })
      .setMaxSteps(30)
      .build()
    const inst = await rt.start(g, 'grun')
    expect(inst.status).toBe('awaiting-input')
    expect(inst.state.count).toBe(2)

    const cp = await log.getLatestCheckpoint('grun')
    const rt2 = new GraphRuntime({ emitEvent: () => {} }, { eventLog: log, runId: 'grun' })
    const inst2 = await rt2.resumeFromCheckpoint(g, cp!, 'go', cp!.pendingInterrupts[0].id)
    expect(inst2.status).toBe('completed')
    // gate→a 回边共放行 3 次（resume 前 1 次 + resume 后 2 次），a 总执行 1+3=4 次
    expect(inst2.state.count).toBe(4)
  })
})
