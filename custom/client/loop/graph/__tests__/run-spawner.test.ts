// P1 Task 6 — RunSpawner：图引擎调度 + 结果回写 + 熔断 + stuck 检测
import { describe, it, expect, vi } from 'vitest'
import { RunSpawner } from '../../../../server/loop/graph/run-spawner'
import { GraphService } from '../../../../server/loop/graph/graph-service'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import { GraphBuilder, fnNode } from '../../../../server/loop/graph/graph-definition'
import { reducers } from '../../../../server/loop/graph/types'
import type { GraphDef } from '../../../../server/loop/graph/types'
import type { LoopInstance, LoopEvent } from '../../../../server/loop/types'
import type { LoopStateStore } from '../../../../server/loop/store/state-store'

function makeLoop(over: Partial<LoopInstance> = {}): LoopInstance {
  return {
    id: 'loop-1', name: 'L', goal: 'g', stopCondition: '', pattern: 'daily-triage',
    schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'scheduling', status: 'idle',
    autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '',
    lastTickAt: null, nextTickAt: new Date(Date.now() - 60_000).toISOString(),
    budget: { maxCostPerTick: 1, maxCostTotal: 10, killMode: 'notify', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
    ...over,
  }
}

function makeGraph(id: string, opts: { stopMet?: boolean; fail?: boolean } = {}): GraphDef {
  return new GraphBuilder(id, id)
    .addChannel('stopMet', { reducer: reducers.overwrite<boolean>(), default: false })
    .addNode(fnNode('a', async () => {
      if (opts.fail) throw new Error('boom')
      return { update: { stopMet: opts.stopMet ?? false }, end: true }
    }))
    .setEntry('a')
    .build()
}

function makeStore(loops: LoopInstance[]) {
  const byId = new Map(loops.map(l => [l.id, { ...l }]))
  const updates: Array<{ id: string; patch: Partial<LoopInstance> }> = []
  const events: LoopEvent[] = []
  const store: LoopStateStore = {
    createLoop: async () => {}, getLoop: async id => byId.get(id) ?? null,
    listLoops: async () => [...byId.values()],
    updateLoop: async (id, patch) => {
      updates.push({ id, patch })
      const cur = byId.get(id)
      if (cur) byId.set(id, { ...cur, ...patch, stats: patch.stats ?? cur.stats } as LoopInstance)
    },
    deleteLoop: async () => {},
    appendContract: async () => {}, getContract: async () => null,
    queryContracts: async () => [], updateContract: async () => {},
    appendVerification: async () => {},
    appendEvent: async e => { events.push(e) },
    queryEvents: async () => [], detectDrift: async () => ({ hasDrift: false, details: '' }),
  }
  return { store, updates, events, byId }
}

function makeSpawner(loops: LoopInstance[], graph: GraphDef, over: Partial<ConstructorParameters<typeof RunSpawner>[0]> = {}) {
  const { store, updates, events, byId } = makeStore(loops)
  const eventLog = new InMemoryEventLogStore()
  const graphService = new GraphService({ eventLog })
  const compile = vi.fn(() => graph)
  const spawner = new RunSpawner({
    graphService, store, eventLog, compile, log: () => {}, ...over,
  })
  return { spawner, store, updates, events, byId, compile, graphService, eventLog }
}

const flush = () => new Promise(r => setImmediate(r))

describe('RunSpawner', () => {
  it('poll spawns a run for a due idle loop and writes back nextTickAt when stopMet=false', async () => {
    const { spawner, updates, byId, compile } = makeSpawner([makeLoop()], makeGraph('loop-loop-1', { stopMet: false }))
    await spawner.poll()
    await vi.waitFor(() => expect(updates.some(u => u.patch.status === 'idle')).toBe(true))

    expect(compile).toHaveBeenCalledTimes(1)
    const loop = byId.get('loop-1')!
    expect(loop.status).toBe('idle')
    expect(loop.nextTickAt).not.toBeNull()
    expect(new Date(loop.nextTickAt!).getTime()).toBeGreaterThan(Date.now())
  })

  it('marks loop completed when stopMet=true (no reschedule)', async () => {
    const { spawner, byId, events } = makeSpawner([makeLoop()], makeGraph('loop-loop-1', { stopMet: true }))
    await spawner.poll()
    await vi.waitFor(() => expect(byId.get('loop-1')?.status).toBe('completed'))

    expect(byId.get('loop-1')?.nextTickAt).toBeNull()
    expect(events.some(e => e.type === 'loop.completed')).toBe(true)
  })

  it('cron loops reschedule at the cron time (shared computeNextTick)', async () => {
    const loop = makeLoop({ schedule: { mode: 'cron', cron: '30 9 * * *', timezone: 'UTC' } })
    const { spawner, byId } = makeSpawner([loop], makeGraph('loop-loop-1'))
    await spawner.poll()
    await vi.waitFor(() => expect(byId.get('loop-1')?.nextTickAt).not.toBeNull())

    const next = new Date(byId.get('loop-1')!.nextTickAt!)
    expect(next.getUTCHours()).toBe(9)
    expect(next.getUTCMinutes()).toBe(30)
  })

  it('skips loops that are not idle or not due', async () => {
    const busy = makeLoop({ id: 'busy', status: 'running' })
    const future = makeLoop({ id: 'future', nextTickAt: new Date(Date.now() + 3600_000).toISOString() })
    const { spawner, compile } = makeSpawner([busy, future], makeGraph('loop-loop-1'))
    await spawner.poll()
    await flush()
    expect(compile).not.toHaveBeenCalled()
  })

  it('circuit breaker pauses the loop after N consecutive failed runs (§7B.7)', async () => {
    const { spawner, byId, events } = makeSpawner(
      [makeLoop()], makeGraph('loop-loop-1', { fail: true }), { maxConsecutiveFailures: 2 })

    await spawner.tickNow('loop-1')
    await vi.waitFor(() => expect(byId.get('loop-1')?.status).toBe('idle')) // 未达阈值 → 重排
    await spawner.tickNow('loop-1')
    await vi.waitFor(() => expect(byId.get('loop-1')?.status).toBe('paused'))

    expect(events.some(e => e.type === 'loop.stuck' && e.reason?.includes('circuit breaker'))).toBe(true)
  })

  it('webhook trigger debounces to a single tick within 5s', async () => {
    vi.useFakeTimers()
    try {
      const { spawner, compile } = makeSpawner([makeLoop()], makeGraph('loop-loop-1'))
      spawner.handleWebhook('loop-1', 'github', 'push')
      spawner.handleWebhook('loop-1', 'github', 'push')
      await vi.advanceTimersByTimeAsync(6_000)
      expect(compile).toHaveBeenCalledTimes(1)
      spawner.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('isStuck reads the event log: ≥3 node.failed in the latest 20 run events', async () => {
    const { spawner, eventLog } = makeSpawner([makeLoop()], makeGraph('loop-loop-1'))
    for (let i = 0; i < 3; i++) {
      await eventLog.append({ runId: 'r1', graphId: 'loop-loop-1', ts: i, kind: 'node.failed', nodeId: 'n', payload: {} })
    }
    await eventLog.append({ runId: 'r1', graphId: 'loop-loop-1', ts: 9, kind: 'run.started', payload: {} })
    expect(await spawner.isStuck('loop-1')).toBe(true)

    const healthy = makeSpawner([makeLoop()], makeGraph('loop-loop-1'))
    await healthy.eventLog.append({ runId: 'r2', graphId: 'loop-loop-1', ts: 1, kind: 'node.completed', nodeId: 'n', payload: {} })
    expect(await healthy.spawner.isStuck('loop-1')).toBe(false)
  })
})
