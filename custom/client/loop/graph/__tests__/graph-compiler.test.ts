// P1 Task 4 — 编译器：LoopInstance → GraphSpec（六节点 + 守卫 repair 回边）
// 断言：产物结构 / validateGraphSpec 通过 / hydrate 后全流程可跑 / repair 回边有 guard /
//       审批 interrupt→resume 闭环 / 空发现短路 / loop.* 兼容事件在编译产物 run 上保持
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  compileLoopToSpec, makeLoopNodeRegistry, resetGuardFallbackWarnForTest, type CompileDeps,
} from '../../../../server/loop/graph/graph-compiler'
import { CH, appendContractsById, type PhaseNodeDeps, type Connector, type PersistenceAdapter } from '../../../../server/loop/graph/phase-nodes'
import { validateGraphSpec, hydrateGraphSpec } from '../../../../server/loop/graph/graph-spec'
import { GraphService } from '../../../../server/loop/graph/graph-service'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import type { GraphEvent } from '../../../../server/loop/graph/types'
import type { LoopInstance, TaskContract, VerificationRecord, LoopEvent } from '../../../../server/loop/types'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function makeLoop(over: Partial<LoopInstance> = {}): LoopInstance {
  return {
    id: 'loop-1', name: 'L', goal: 'g', stopCondition: '', pattern: 'daily-triage',
    schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'scheduling', status: 'idle',
    autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 1, maxCostTotal: 10, killMode: 'notify', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
    ...over,
  }
}

function makeContract(id: string, over: Partial<TaskContract> = {}): TaskContract {
  return {
    id, loopId: 'loop-1',
    source: { type: 'git-commit', ref: 'sha', summary: id, rawPayload: null },
    readPlan: { requiredReads: [] }, writeBoundary: [],
    verificationIntent: { programmatic: [], judge: null, human: null },
    resultTemplate: { artifactType: 'report', requiredFiles: [] },
    worktreeId: null, assignee: 'maker', status: 'queued', attempts: 0, maxAttempts: 3,
    ...over,
  }
}

function makeVerification(contractId: string, overall: 'passed' | 'failed' | 'pending'): VerificationRecord {
  return {
    contractId,
    results: { programmatic: [], judge: null, human: null },
    overall, finalResponseGuard: overall === 'passed',
  }
}

interface MockOpts {
  discoverResult?: TaskContract[]
  verify?: (c: TaskContract) => Promise<VerificationRecord>
  gateCommands?: CompileDeps['gateCommands']
  repairMaxAttempts?: number
}

function makeCompileDeps(opts: MockOpts = {}): PhaseNodeDeps & Record<string, unknown> {
  const updatedContracts: Array<{ id: string; patch: Partial<TaskContract> }> = []
  const persisted: Array<{ contractId: string }> = []
  const connector: Connector = { discover: vi.fn(async () => opts.discoverResult ?? []) }
  return {
    dryRun: false,
    connectors: [connector],
    store: {
      createLoop: async () => {}, getLoop: async () => null, listLoops: async () => [],
      updateLoop: async () => {}, deleteLoop: async () => {},
      appendContract: async () => {},
      getContract: async () => null, queryContracts: async () => [],
      updateContract: async (id, patch) => { updatedContracts.push({ id, patch }) },
      appendVerification: async () => {},
      appendEvent: async () => {}, queryEvents: async () => [],
      detectDrift: async () => ({ hasDrift: false, details: '' }),
    } as PhaseNodeDeps['store'],
    worktreeManager: {
      create: vi.fn(async (c: TaskContract) => `wt-${c.id}`),
      remove: async () => {}, cleanupStale: async () => {},
    } as unknown as PhaseNodeDeps['worktreeManager'],
    dispatcher: { dispatch: vi.fn(async () => {}) } as PhaseNodeDeps['dispatcher'],
    verifier: {
      verify: vi.fn(opts.verify ?? (async (c: TaskContract) => makeVerification(c.id, 'passed'))),
    } as unknown as PhaseNodeDeps['verifier'],
    persistence: {
      persist: vi.fn(async (c: TaskContract) => {
        persisted.push({ contractId: c.id })
        return `artifact:${c.id}`
      }),
    } as unknown as PersistenceAdapter,
    log: () => {},
    ...(opts.gateCommands ? { gateCommands: opts.gateCommands } : {}),
    ...(opts.repairMaxAttempts !== undefined ? { repairMaxAttempts: opts.repairMaxAttempts } : {}),
    // 非 PhaseNodeDeps 的编译参数（测试内读取）
    __updatedContracts: updatedContracts,
    __persisted: persisted,
    __connector: connector,
  }
}

function compileAndRun(loop: LoopInstance, deps: CompileDeps) {
  const spec = compileLoopToSpec(loop, deps)
  const registry = makeLoopNodeRegistry(loop, deps)
  const def = hydrateGraphSpec(spec, registry, { appendById: appendContractsById })
  const eventLog = new InMemoryEventLogStore()
  const events: GraphEvent[] = []
  const service = new GraphService({ eventLog })
  service.onEvent(e => { events.push(e) })
  service.registerGraph(def)
  return { spec, service, events, eventLog }
}

// ---------------------------------------------------------------------------
// 结构
// ---------------------------------------------------------------------------

describe('compileLoopToSpec — structure', () => {
  it('emits six fixed nodes, guarded repair back-edges, and passes validateGraphSpec', () => {
    const loop = makeLoop()
    const deps = makeCompileDeps() as unknown as CompileDeps
    const spec = compileLoopToSpec(loop, deps)

    expect(spec.id).toBe('loop-loop-1')
    expect(spec.version).toBe(1)
    expect(spec.limits.maxSteps).toBe(100)
    expect(spec.entryNode).toBe('discovery')
    expect(spec.nodes.map(n => n.id)).toEqual(
      ['discovery', 'handoff', 'validation', 'persistence', 'gate', 'stop-check'])

    const repairEdges = spec.edges.filter(e => e.label?.startsWith('repair') || e.to === 'handoff' && e.from !== 'discovery')
    expect(repairEdges.length).toBeGreaterThanOrEqual(2)
    for (const e of repairEdges) {
      expect(e.guard?.maxIterations).toBe(3)
    }
    expect(() => validateGraphSpec(spec, { appendById: appendContractsById })).not.toThrow()
  })

  it('honors repairMaxAttempts for guard.maxIterations and maxCost from loop budget', () => {
    const loop = makeLoop({ budget: { maxCostPerTick: 1, maxCostTotal: 42, killMode: 'notify', warningThreshold: 0.8 } })
    const deps = { ...makeCompileDeps({ repairMaxAttempts: 5 }), repairMaxAttempts: 5 } as unknown as CompileDeps
    const spec = compileLoopToSpec(loop, deps)
    const gateRepair = spec.edges.find(e => e.from === 'gate' && e.to === 'handoff')
    expect(gateRepair?.guard?.maxIterations).toBe(5)
    expect(spec.limits.maxCost).toBe(42)
  })

  it('routes on stage/repairNeeded predicates (no-contracts short-circuit + repair back-edges)', () => {
    const spec = compileLoopToSpec(makeLoop(), makeCompileDeps() as unknown as CompileDeps)
    const noContracts = spec.edges.find(e => e.from === 'discovery' && e.to === 'stop-check')
    expect(noContracts?.condition).toEqual({ op: 'cmp', path: 'stage', cmp: 'eq', value: 'scheduling' })
    const gateRepair = spec.edges.find(e => e.from === 'gate' && e.to === 'handoff')
    expect(gateRepair?.condition).toEqual({ op: 'truthy', path: 'repairNeeded' })
  })
})

// ---------------------------------------------------------------------------
// 端到端（hydrate + GraphService）
// ---------------------------------------------------------------------------

describe('compiled graph end-to-end', () => {
  it('happy path: discover → handoff → validate → persist → gate pass → stop, loop.* events preserved', async () => {
    const loop = makeLoop()
    const mock = makeCompileDeps({
      discoverResult: [makeContract('task/a')],
      gateCommands: [{ name: 'lint', kind: 'validator', cmd: 'true' }],
    })
    const { service, events } = compileAndRun(loop, mock as unknown as CompileDeps)
    const { instance } = await service.startRun('loop-loop-1')

    expect(instance.status).toBe('completed')
    expect((instance.state[CH.contracts] as TaskContract[]).map(c => c.id)).toEqual(['task/a'])
    expect((instance.state[CH.verifications] as VerificationRecord[]).every(v => v.overall === 'passed')).toBe(true)
    expect(instance.state[CH.stopMet]).toBe(true)
    expect((mock.__persisted as Array<{ contractId: string }>).map(p => p.contractId)).toEqual(['task/a'])
    const types = events.map(e => e.type)
    for (const expected of [
      'loop.task-discovered', 'loop.task-handed-off', 'loop.verification-complete', 'loop.persisted',
    ]) {
      expect(types).toContain(expected)
    }
  })

  it('empty discovery short-circuits to stop-check and completes (heuristic stop)', async () => {
    const { service } = compileAndRun(makeLoop(), makeCompileDeps({ discoverResult: [] }) as unknown as CompileDeps)
    const { instance } = await service.startRun('loop-loop-1')

    expect(instance.status).toBe('completed')
    expect(instance.state[CH.stopMet]).toBe(true)
    expect(instance.state[CH.stage]).toBe('scheduling')
  })

  it('approval interrupt pauses run; resume decision is consumed (no re-interrupt)', async () => {
    const contract = makeContract('task/a')
    let call = 0
    const mock = makeCompileDeps({
      discoverResult: [contract],
      verify: async (c: TaskContract) => {
        call++
        return call === 1 ? makeVerification(c.id, 'pending') : makeVerification(c.id, 'passed')
      },
    })
    const { service } = compileAndRun(makeLoop(), mock as unknown as CompileDeps)
    const { runId, instance } = await service.startRun('loop-loop-1')
    expect(instance.status).toBe('awaiting-input')

    const cp = await (service as unknown as { eventLog: { getLatestCheckpoint(r: string): Promise<{ pendingInterrupts: Array<{ id: string }> }> } })
      .eventLog.getLatestCheckpoint(runId)
    const interruptId = cp!.pendingInterrupts[0].id
    const done = await service.resumeRun(runId, interruptId, 'approved')

    expect(done.status).toBe('completed')
    const finalRecord = (done.state[CH.verifications] as VerificationRecord[])[0]
    expect(finalRecord.overall).toBe('passed')
    expect(finalRecord.results.human?.decision).toBe('approved')
  })

  it('validation failure routes repair back-edge (bounded by guard); run terminates', async () => {
    const contract = makeContract('task/a', { maxAttempts: 5 })
    const mock = makeCompileDeps({
      discoverResult: [contract],
      verify: async (c: TaskContract) => makeVerification(c.id, 'failed'),
    })
    const deps = { ...mock, repairMaxAttempts: 2 } as unknown as CompileDeps
    const { service, events, eventLog } = compileAndRun(makeLoop(), deps)
    const { runId, instance } = await service.startRun('loop-loop-1')

    // 守卫封顶后 run 必须终止，不允许无限 repair
    expect(['completed', 'failed']).toContain(instance.status)
    const allEvents = await eventLog.query(runId, { limit: 1000 })
    const guardHits = events.filter(e => e.type === 'edge.guard-exceeded')
    expect(guardHits.length).toBeGreaterThanOrEqual(1)
    expect(allEvents.length).toBeGreaterThan(0)
  }, 20_000)

  it('gate validator failure enters repairQueue and terminates via guard (no hang)', async () => {
    const mock = makeCompileDeps({
      discoverResult: [makeContract('task/a')],
      gateCommands: [{ name: 'typecheck', kind: 'validator', cmd: 'false' }],
    })
    const deps = { ...mock, repairMaxAttempts: 1 } as unknown as CompileDeps
    const { service } = compileAndRun(makeLoop(), deps)
    const { instance } = await service.startRun('loop-loop-1')

    expect(['completed', 'failed']).toContain(instance.status)
    const queue = instance.state[CH.repairQueue] as Array<{ name: string }>
    expect(queue.map(q => q.name)).toContain('typecheck')
  }, 20_000)

  it('contract at maxAttempts escalates instead of looping forever', async () => {
    const contract = makeContract('task/a', { attempts: 2, maxAttempts: 3 })
    const mock = makeCompileDeps({
      discoverResult: [contract],
      verify: async (c: TaskContract) => makeVerification(c.id, 'failed'),
    })
    const { service } = compileAndRun(makeLoop(), mock as unknown as CompileDeps)
    const { instance } = await service.startRun('loop-loop-1')

    // attempts+1 >= maxAttempts → escalated，repairNeeded=false，正常走 persistence(gate)→stop
    expect(instance.status).toBe('completed')
    const escalated = (mock.__updatedContracts as Array<{ id: string; patch: Partial<TaskContract> }>)
      .find(u => u.id === 'task/a' && u.patch.status === 'escalated')
    expect(escalated).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 事件兼容性投影
// ---------------------------------------------------------------------------

describe('loop.* event compatibility on compiled runs', () => {
  it('bridged loop events flow through GraphService.onEvent alongside graph.* events', async () => {
    const mock = makeCompileDeps({ discoverResult: [makeContract('task/a')] })
    const { service, events } = compileAndRun(makeLoop(), mock as unknown as CompileDeps)
    await service.startRun('loop-loop-1')

    const loopEvents = events.filter(e => (e as unknown as { type: string }).type.startsWith('loop.')) as unknown as LoopEvent[]
    expect(loopEvents.length).toBeGreaterThanOrEqual(4)
  })
})

// ---------------------------------------------------------------------------
// guard/maxAttempts 对齐（P3 台账）：repair 回边 guard.maxIterations 取
// max(loop 契约模板 maxAttempts, 3)——契约配 ≥5 时回边不再先耗尽
// ---------------------------------------------------------------------------

describe('repair back-edge guard vs contract maxAttempts (P3 台账)', () => {
  const repairGuards = (spec: ReturnType<typeof compileLoopToSpec>): number[] =>
    spec.edges
      .filter(e => e.guard !== undefined)
      .map(e => (e.guard as { maxIterations: number }).maxIterations)

  beforeEach(() => {
    resetGuardFallbackWarnForTest()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loop.maxAttempts=5 → guard.maxIterations=5（契约配 ≥5 时回边不先耗尽）', () => {
    const spec = compileLoopToSpec(makeLoop({ maxAttempts: 5 }), {})
    const guards = repairGuards(spec)
    expect(guards.length).toBeGreaterThanOrEqual(3) // validation/persistence/gate 三条 repair 回边
    expect(guards.every(g => g === 5)).toBe(true)
  })

  it('loop.maxAttempts=2 仍取下限 3', () => {
    const spec = compileLoopToSpec(makeLoop({ maxAttempts: 2 }), {})
    expect(repairGuards(spec).every(g => g === 3)).toBe(true)
  })

  it('未配置模板 → 回退 3，同 loop 只 warn 一次（不逐 tick 刷屏）', () => {
    const spec = compileLoopToSpec(makeLoop(), {})
    expect(repairGuards(spec).every(g => g === 3)).toBe(true)
    expect(console.warn).toHaveBeenCalledTimes(1)
    // 同 loop 再编译（spawner 每 tick 编译一次）不再告警
    compileLoopToSpec(makeLoop(), {})
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('显式 repairMaxAttempts 覆盖优先，且不触发回退告警', () => {
    const spec = compileLoopToSpec(makeLoop({ maxAttempts: 5 }), { repairMaxAttempts: 7 })
    expect(repairGuards(spec).every(g => g === 7)).toBe(true)
    expect(console.warn).not.toHaveBeenCalled()
  })
})
