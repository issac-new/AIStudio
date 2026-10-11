// 长会话治理 B3：停滞熔断外部指纹（13b5739 教训产品化）
// —— 指纹变了不熔断 / 不变才计停滞；通道布尔降级为指纹缺席回退。
import { describe, it, expect, vi } from 'vitest'
import { RunSpawner } from '../run-spawner'
import { GraphService } from '../graph-service'
import { InMemoryEventLogStore } from '../event-log-store'
import { GraphBuilder, fnNode } from '../graph-definition'
import { reducers, type GraphDef } from '../types'
import type { LoopInstance, LoopEvent, TaskContract } from '../../types'
import type { LoopStateStore } from '../../store/state-store'
import { computeLoopFingerprint, makeLoopFingerprint } from '../stagnation-fingerprint'

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

function channelGraph(id: string): GraphDef {
  return new GraphBuilder(id, id)
    .addChannel('stopMet', { reducer: reducers.overwrite<boolean>(), default: false })
    .addNode(fnNode('a', async () => ({ update: { stopMet: false }, end: true })))
    .setEntry('a')
    .build()
}

function makeStore(loops: LoopInstance[]) {
  const byId = new Map(loops.map(l => [l.id, { ...l }]))
  const events: LoopEvent[] = []
  const store: LoopStateStore = {
    createLoop: async () => {}, getLoop: async id => byId.get(id) ?? null,
    listLoops: async () => [...byId.values()],
    updateLoop: async (id, patch) => {
      const cur = byId.get(id)
      if (cur) byId.set(id, { ...cur, ...patch, stats: patch.stats ?? cur.stats } as LoopInstance)
    },
    deleteLoop: async () => {},
    appendContract: async () => {}, getContract: async () => null,
    queryContracts: async () => [], updateContract: async () => {},
    appendVerification: async () => {},
    appendEvent: async e => { events.push(e) },
    queryEvents: async () => events,
    detectDrift: async () => ({ hasDrift: false, details: '' }),
  }
  return { store, updates: [] as Array<{ id: string; patch: Partial<LoopInstance> }>, events, byId }
}

function makeSpawner(loops: LoopInstance[], over: Partial<ConstructorParameters<typeof RunSpawner>[0]> = {}) {
  const made = makeStore(loops)
  const eventLog = new InMemoryEventLogStore()
  const graphService = new GraphService({ eventLog })
  const spawner = new RunSpawner({
    graphService, store: made.store, eventLog, compile: () => channelGraph('loop-loop-1'),
    log: () => {}, ...over,
  })
  return { spawner, ...made }
}

const flush = () => new Promise(r => setImmediate(r))
const settle = () => vi.waitFor(() => new Promise(r => setImmediate(r)))

describe('B3 fingerprint stagnation (RunSpawner)', () => {
  // 与原 run-spawner 停滞用例同款：以 loop.tick-complete 计数判定 run 落终态（消除竞态）
  const waitForTicks = (events: LoopEvent[], n: number) => vi.waitFor(() =>
    expect(events.filter(e => e.type === 'loop.tick-complete')).toHaveLength(n))

  it('fingerprint unchanged across runs → stagnation counts up and trips the breaker', async () => {
    const fp = vi.fn(async () => 'same-fp')
    const { spawner, events } = makeSpawner([makeLoop()], { fingerprint: fp, stagnationLimit: 2 })
    await spawner.tickNow('loop-1') // 首次观测指纹（无 prev）不计停滞
    await waitForTicks(events, 1)
    await spawner.tickNow('loop-1') // 指纹不变 → stagnant=1
    await waitForTicks(events, 2)
    expect(events.some(e => e.type === 'loop.stuck')).toBe(false)
    await spawner.tickNow('loop-1') // 仍不变 → stagnant=2 → 熔断
    await waitForTicks(events, 3)
    expect(events.some(e => e.type === 'loop.stuck' && String(e.reason).includes('fingerprint unchanged'))).toBe(true)
  })

  it('fingerprint changed (external evidence moved) → stagnation resets, no breaker', async () => {
    let n = 0
    const fp = vi.fn(async () => `fp-${n++}`) // 每个 run 外部证据都在动
    const { spawner, events, byId } = makeSpawner([makeLoop()], { fingerprint: fp, stagnationLimit: 2 })
    for (let i = 1; i <= 3; i++) {
      await spawner.tickNow('loop-1')
      await waitForTicks(events, i)
    }
    expect(events.some(e => e.type === 'loop.stuck')).toBe(false)
    expect(byId.get('loop-1')!.status).toBe('idle')
  })

  it('fingerprint null (no contracts) falls back to channel-boolean semantics', async () => {
    const fp = vi.fn(async () => null)
    const { spawner, events } = makeSpawner([makeLoop()], { fingerprint: fp, stagnationLimit: 2 })
    await spawner.tickNow('loop-1') // 无指纹注入面 → 回退布尔：通道空 → stagnant=1
    await waitForTicks(events, 1)
    await spawner.tickNow('loop-1') // stagnant=2 → 熔断（原语义保持）
    await waitForTicks(events, 2)
    expect(events.some(e => e.type === 'loop.stuck' && String(e.reason).includes('no new contracts'))).toBe(true)
  })

  it('breaker trip pauses the loop; further ticks do not re-trip', async () => {
    const fp = vi.fn(async () => 'same-fp')
    const { spawner, events } = makeSpawner([makeLoop()], { fingerprint: fp, stagnationLimit: 2 })
    for (let i = 1; i <= 3; i++) {
      await spawner.tickNow('loop-1')
      await waitForTicks(events, i)
    }
    expect(events.filter(e => e.type === 'loop.stuck').length).toBe(1)
    await spawner.tickNow('loop-1') // loop 已 paused → tickNow 早退
    await new Promise(r => setImmediate(r))
    expect(events.filter(e => e.type === 'loop.stuck').length).toBe(1)
  })
})

describe('B3 computeLoopFingerprint', () => {
  const contract = (id: string, card: string | null): TaskContract => ({
    id, loopId: 'loop-1', source: { type: 'github-issue', ref: '', summary: '', rawPayload: null },
    readPlan: { requiredReads: [] }, writeBoundary: [], verificationIntent: {
      programmatic: [], judge: null, human: null,
    }, resultTemplate: { artifactType: 'patch', requiredFiles: [] },
    worktreeId: null, assignee: 'maker', status: 'todo', attempts: 0, maxAttempts: 3,
    persistedTaskId: card,
  })

  it('null when no contracts (fallback signal)', async () => {
    expect(await computeLoopFingerprint(makeLoop(), [], 0)).toBeNull()
  })

  it('changes when a card is persisted or verification passes', async () => {
    const loop = makeLoop()
    const base = await computeLoopFingerprint(loop, [contract('c1', null)], 0)
    const withCard = await computeLoopFingerprint(loop, [contract('c1', 'TASK-7')], 0)
    const withPass = await computeLoopFingerprint(loop, [contract('c1', 'TASK-7')], 1)
    expect(base).not.toBeNull()
    expect(base).not.toBe(withCard)
    expect(withCard).not.toBe(withPass)
  })

  it('attempts/status churn does NOT change the fingerprint (anti-noise)', async () => {
    const loop = makeLoop()
    const c1 = { ...contract('c1', 'TASK-7'), attempts: 0, status: 'todo' as const }
    const c2 = { ...contract('c1', 'TASK-7'), attempts: 5, status: 'in-progress' as const }
    expect(await computeLoopFingerprint(loop, [c1], 0))
      .toBe(await computeLoopFingerprint(loop, [c2], 0))
  })

  it('git tip participates when a worktreeDir resolver is wired', async () => {
    const loop = makeLoop()
    const deps = {
      worktreeDir: () => '/tmp/wt-1',
      gitTip: async (dir: string) => (dir === '/tmp/wt-1' ? `tip-${dir}` : 'other'),
    }
    const f1 = await computeLoopFingerprint(loop, [contract('c1', 'T')], 0, deps)
    const deps2 = { ...deps, gitTip: async () => 'tip-moved' }
    const f2 = await computeLoopFingerprint(loop, [contract('c1', 'T')], 0, deps2)
    expect(f1).not.toBe(f2)
  })

  it('makeLoopFingerprint composes store contracts + passed verification events', async () => {
    const { store, events } = makeStore([makeLoop()])
    events.push({ type: 'loop.verification-complete', loopId: 'loop-1', passed: true, ts: '' } as unknown as LoopEvent)
    events.push({ type: 'loop.verification-complete', loopId: 'loop-1', passed: false, ts: '' } as unknown as LoopEvent)
    const fn = makeLoopFingerprint(store)
    // store.queryContracts 返回空 → null（与回退语义一致）
    expect(await fn(makeLoop())).toBeNull()
  })
})
