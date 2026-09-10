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

  it('熔断 loop.stuck 消息带"因持续失败已暂停，需人工处理"口径（P3 台账 ⑦）', async () => {
    const { spawner, events } = makeSpawner(
      [makeLoop()], makeGraph('loop-loop-1', { fail: true }), { maxConsecutiveFailures: 1 })
    await spawner.tickNow('loop-1')
    await vi.waitFor(() => expect(events.some(e => e.type === 'loop.stuck')).toBe(true))

    const stuck = events.find(e => e.type === 'loop.stuck')!
    expect(String(stuck.reason)).toContain('因持续失败已暂停，需人工处理')
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

  it('webhook payload is enqueued before the debounced tick (legacy Scheduler parity)', async () => {
    vi.useFakeTimers()
    try {
      // 2026-09-10 风险审查 #2 回归锚：mode=on 时 handleWebhook 必须把 payload 转交
      // webhookEnqueue（discovery 经 connector discover 排空为契约），不得静默丢弃
      const enqueue = vi.fn()
      const { spawner, compile } = makeSpawner([makeLoop()], makeGraph('loop-loop-1'), { webhookEnqueue: enqueue })
      const payload = { action: 'opened', number: 7 }
      spawner.handleWebhook('loop-1', 'github', 'push', payload)
      expect(enqueue).toHaveBeenCalledTimes(1)
      expect(enqueue).toHaveBeenCalledWith('loop-1', { source: 'github', eventType: 'push', payload })
      // 入队即时发生，tick 仍走 5s 去抖
      expect(compile).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(6_000)
      expect(compile).toHaveBeenCalledTimes(1)
      // 无 enqueue 通道（缺省注入）时不抛错，仅 tick
      const bare = makeSpawner([makeLoop()], makeGraph('loop-loop-1'))
      expect(() => bare.spawner.handleWebhook('loop-1', 'github', 'push', payload)).not.toThrow()
      await vi.advanceTimersByTimeAsync(6_000)
      bare.spawner.stop()
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

  // -------------------------------------------------------------------------
  // 修复波 I10 — 旧引擎 loop.tick-complete 兼容补发（前端/matrix-bot 消费）
  // -------------------------------------------------------------------------

  it('emits legacy-compatible loop.tick-complete via the bridge when a run completes (I10)', async () => {
    const bridged: LoopEvent[] = []
    const { spawner, byId } = makeSpawner([makeLoop()], makeGraph('loop-loop-1', { stopMet: false }), {
      emitLoopEvent: e => bridged.push(e),
    })
    await spawner.poll()
    await vi.waitFor(() => expect(byId.get('loop-1')?.status).toBe('idle'))

    const evt = bridged.find(e => e.type === 'loop.tick-complete') as
      | { loopId: string; iteration: number; stats: { currentIteration: number }; ts: string }
      | undefined
    expect(evt).toBeDefined()
    expect(evt!.loopId).toBe('loop-1')
    expect(evt!.iteration).toBe(1) // = stats.currentIteration（legacy LoopEngine 同口径）
    expect(evt!.stats.currentIteration).toBe(1)
    expect(typeof evt!.ts).toBe('string')
  })

  it('routes loop.completed / loop.stuck through the bridge when provided (socket fanout parity)', async () => {
    const bridged: LoopEvent[] = []
    const { spawner } = makeSpawner([makeLoop()], makeGraph('loop-loop-1', { stopMet: true }), {
      emitLoopEvent: e => bridged.push(e),
    })
    await spawner.poll()
    await vi.waitFor(() => expect(bridged.some(e => e.type === 'loop.completed')).toBe(true))

    // 失败路径（熔断）：loop.stuck 也经桥接出站
    const bridgedFail: LoopEvent[] = []
    const breaker = makeSpawner([makeLoop()], makeGraph('loop-loop-1', { fail: true }), {
      maxConsecutiveFailures: 1,
      emitLoopEvent: e => bridgedFail.push(e),
    })
    await breaker.spawner.tickNow('loop-1')
    await vi.waitFor(() => expect(bridgedFail.some(e => e.type === 'loop.stuck')).toBe(true))
    // 失败 run 同样补发 tick-complete（前端 stats 刷新在失败时不失联）
    expect(bridgedFail.some(e => e.type === 'loop.tick-complete')).toBe(true)
  })

  it('auto-resumes only whitelisted paused loops whose nextTickAt is overdue (I9)', async () => {
    const pausedOrphan = makeLoop({ id: 'orphan', status: 'paused' })
    const pausedUser = makeLoop({ id: 'user-paused', status: 'paused' })
    const whitelist = new Set(['orphan'])
    const { spawner, byId } = makeSpawner([pausedOrphan, pausedUser], makeGraph('loop-orphan'), {
      autoResumeIds: whitelist,
    })

    await spawner.poll()
    await vi.waitFor(() => expect(byId.get('orphan')?.status).toBe('idle'))
    // 触发一次后移除出白名单（不会反复触发）
    expect(whitelist.has('orphan')).toBe(false)
    // 用户主动 paused 的 loop 原样不动
    expect(byId.get('user-paused')?.status).toBe('paused')
    spawner.stop()
  })

  it('does not resume a whitelisted paused loop whose nextTickAt is in the future (I9)', async () => {
    const pausedFuture = makeLoop({
      id: 'future', status: 'paused',
      nextTickAt: new Date(Date.now() + 3600_000).toISOString(),
    })
    const whitelist = new Set(['future'])
    const { spawner, compile, byId } = makeSpawner([pausedFuture], makeGraph('loop-future'), {
      autoResumeIds: whitelist,
    })
    await spawner.poll()
    await new Promise(r => setTimeout(r, 20))
    expect(byId.get('future')?.status).toBe('paused')
    expect(compile).not.toHaveBeenCalled()
    expect(whitelist.has('future')).toBe(true)
    spawner.stop()
  })

  // -------------------------------------------------------------------------
  // P2 Task 1 — 台账④：停滞熔断（run 正常完成但产出通道无新增，连续 N 次）
  // -------------------------------------------------------------------------

  /** 带 contracts/verifications 产出通道的图：节点完成但可选地带产出 */
  function makeChannelGraph(id: string, opts: { contracts?: unknown[]; verifications?: unknown[] } = {}): GraphDef {
    return new GraphBuilder(id, id)
      .addChannel('stopMet', { reducer: reducers.overwrite<boolean>(), default: false })
      .addChannel('contracts', { reducer: reducers.append<unknown>(), default: [] })
      .addChannel('verifications', { reducer: reducers.append<unknown>(), default: [] })
      .addNode(fnNode('a', async () => ({
        update: {
          stopMet: false,
          contracts: opts.contracts ?? [],
          verifications: opts.verifications ?? [],
        },
        end: true,
      })))
      .setEntry('a')
      .build()
  }

  it('stagnation breaker pauses a loop whose runs complete without any output N times in a row (台账④)', async () => {
    const { spawner, byId, events } = makeSpawner(
      [makeLoop()], makeChannelGraph('loop-loop-1'), { stagnationLimit: 2 })
    const waitForTicks = (n: number) => vi.waitFor(() =>
      expect(events.filter(e => e.type === 'loop.tick-complete')).toHaveLength(n))

    await spawner.tickNow('loop-1') // 无产出 → stagnant=1
    await waitForTicks(1)
    expect(byId.get('loop-1')?.status).toBe('idle') // 未达阈值 → 照常重排
    expect(events.some(e => e.type === 'loop.stuck')).toBe(false)

    await spawner.tickNow('loop-1') // 无产出 → stagnant=2 → 与失败熔断同路径
    await waitForTicks(2)
    expect(byId.get('loop-1')?.status).toBe('paused')
    expect(events.some(e =>
      e.type === 'loop.stuck' && String(e.reason).includes('stagnant'))).toBe(true)
    expect(byId.get('loop-1')?.nextTickAt).toBeNull()
  })

  it('resets the stagnation counter as soon as a run produces contracts or verifications', async () => {
    // 产出可变的图：output.contracts 为空数组 = 本轮无产出
    const output: { contracts: unknown[] } = { contracts: [] }
    const mutableGraph = new GraphBuilder('loop-loop-1', 'loop-loop-1')
      .addChannel('stopMet', { reducer: reducers.overwrite<boolean>(), default: false })
      .addChannel('contracts', { reducer: reducers.append<unknown>(), default: [] })
      .addNode(fnNode('a', async () => ({
        update: { stopMet: false, contracts: output.contracts },
        end: true,
      })))
      .setEntry('a')
      .build()
    const { spawner, byId, events } = makeSpawner(
      [makeLoop()], mutableGraph, { stagnationLimit: 2 })

    // 每个 run 恰好补发一条 loop.tick-complete —— 以它判定"该 run 已落终态"，消除竞态
    const waitForTicks = (n: number) => vi.waitFor(() =>
      expect(events.filter(e => e.type === 'loop.tick-complete')).toHaveLength(n))

    await spawner.tickNow('loop-1') // 无产出 → stagnant=1
    await waitForTicks(1)
    expect(byId.get('loop-1')?.status).toBe('idle')

    output.contracts = [{ id: 'c1' }] // 本轮有产出
    await spawner.tickNow('loop-1') // → 清零
    await waitForTicks(2)
    expect(byId.get('loop-1')?.status).toBe('idle')
    expect(events.some(e => e.type === 'loop.stuck')).toBe(false)

    output.contracts = []
    await spawner.tickNow('loop-1') // 又无产出 → stagnant=1（未达 2，证明上面清过零）
    await waitForTicks(3)
    expect(byId.get('loop-1')?.status).toBe('idle')
    expect(events.some(e => e.type === 'loop.stuck')).toBe(false)
    spawner.stop()
  })
})
