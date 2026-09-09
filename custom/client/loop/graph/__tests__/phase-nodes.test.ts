// P1 Task 3 — 五阶段节点工厂：真实阶段函数绑定 + gate/stopCondition 节点
// 断言：channel update 键值 / loop.* 兼容事件 / dryRun 无副作用 / interrupt 桥接
import { describe, it, expect, vi } from 'vitest'
import {
  CH, createPhaseNode, createGateNode, createStopConditionNode, defaultEvaluateStop,
  type PhaseNodeDeps, type Connector, type PersistenceAdapter, type GateCommand,
} from '../../../../server/loop/graph/phase-nodes'
import type { NodeContext } from '../../../../server/loop/graph/types'
import type { LoopInstance, TaskContract, VerificationRecord, LoopEvent } from '../../../../server/loop/types'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function makeLoop(): LoopInstance {
  return {
    id: 'loop-1', name: 'L', goal: 'g', stopCondition: '', pattern: 'daily-triage',
    schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'scheduling', status: 'idle',
    autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 1, maxCostTotal: 10, killMode: 'notify', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
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

interface DepsOverrides {
  contracts?: TaskContract[]
  discoverResult?: TaskContract[]
  verifyResult?: VerificationRecord
  dryRun?: boolean
}

function makeDeps(over: DepsOverrides = {}) {
  const loopEvents: LoopEvent[] = []
  const graphEvents: unknown[] = []
  const logs: string[] = []
  const contractsInStore = new Map<string, TaskContract>((over.contracts ?? []).map(c => [c.id, c]))
  const appendedContracts: TaskContract[] = []
  const appendedVerifications: VerificationRecord[] = []
  const updatedContracts: Array<{ id: string; patch: Partial<TaskContract> }> = []
  const persisted: Array<{ contractId: string; dryRun: boolean }> = []

  const connector: Connector = {
    discover: vi.fn(async () => over.discoverResult ?? []),
  }
  const deps: PhaseNodeDeps = {
    dryRun: over.dryRun ?? false,
    connectors: [connector],
    store: {
      createLoop: async () => {}, getLoop: async () => null, listLoops: async () => [],
      updateLoop: async () => {}, deleteLoop: async () => {},
      appendContract: async (c) => { appendedContracts.push(c); contractsInStore.set(c.id, c) },
      getContract: async (id) => contractsInStore.get(id) ?? null,
      queryContracts: async () => [...contractsInStore.values()],
      updateContract: async (id, patch) => { updatedContracts.push({ id, patch }) },
      appendVerification: async (r) => { appendedVerifications.push(r) },
      appendEvent: async (e) => { loopEvents.push(e) },
      queryEvents: async () => [], detectDrift: async () => ({ hasDrift: false, details: '' }),
    } as PhaseNodeDeps['store'],
    worktreeManager: {
      create: vi.fn(async (c: TaskContract) => `wt-${c.id}`),
      remove: async () => {}, cleanupStale: async () => {},
    } as unknown as PhaseNodeDeps['worktreeManager'],
    dispatcher: {
      dispatch: vi.fn(async () => {}),
    } as PhaseNodeDeps['dispatcher'],
    verifier: {
      verify: vi.fn(async (c: TaskContract) => over.verifyResult ?? makeVerification(c.id, 'passed')),
    } as unknown as PhaseNodeDeps['verifier'],
    persistence: {
      persist: vi.fn(async (c: TaskContract, _v: VerificationRecord, _l: LoopInstance, dry: boolean) => {
        persisted.push({ contractId: c.id, dryRun: dry })
        return `artifact:${c.id}`
      }),
    } as unknown as PersistenceAdapter,
    log: (msg: string) => { logs.push(msg) },
  }
  const ctx = {
    graphId: 'loop-loop-1', threadId: 't1', nodeId: 'test-node', superStep: 0,
    deps: { emitEvent: (e: unknown) => { graphEvents.push(e) } },
  } as unknown as NodeContext
  return { deps, ctx, loopEvents, graphEvents, logs, appendedContracts, appendedVerifications, updatedContracts, persisted, connector }
}

const emittedTypes = (evts: unknown[]) => evts.map(e => (e as { type: string }).type)

// ---------------------------------------------------------------------------
// CH 约定
// ---------------------------------------------------------------------------

describe('CH channel keys', () => {
  it('exports the compiler/node shared channel contract', () => {
    expect(CH).toEqual({
      contracts: 'contracts', verifications: 'verifications', stage: 'stage',
      stopMet: 'stopMet', gateResults: 'gateResults', repairQueue: 'repairQueue',
    })
  })
})

// ---------------------------------------------------------------------------
// discovery
// ---------------------------------------------------------------------------

describe('discovery node', () => {
  it('aggregates connector output into contracts channel + emits loop.task-discovered + persists to store', async () => {
    const loop = makeLoop()
    const { deps, ctx, graphEvents, appendedContracts } = makeDeps({
      discoverResult: [makeContract('task/a'), makeContract('task/b')],
    })
    const node = createPhaseNode('discovery', loop, deps)
    const res = await node.execute({}, ctx)

    expect(res.update?.[CH.contracts]).toHaveLength(2)
    expect(appendedContracts).toHaveLength(2)
    expect(emittedTypes(graphEvents)).toContain('loop.task-discovered')
    expect(emittedTypes(graphEvents)).toContain('loop.stage-transition')
    expect(deps.store.updateLoop).toBeDefined()
  })

  it('empty discovery routes to scheduling stage (skip downstream phases)', async () => {
    const loop = makeLoop()
    const { deps, ctx } = makeDeps({ discoverResult: [] })
    const node = createPhaseNode('discovery', loop, deps)
    const res = await node.execute({}, ctx)

    expect(res.update?.[CH.contracts]).toEqual([])
    expect(res.update?.[CH.stage]).toBe('scheduling')
  })

  it('propagates connector failure', async () => {
    const loop = makeLoop()
    const { deps, ctx } = makeDeps()
    ;(deps.connectors[0].discover as unknown as { mockRejectedValueOnce: (e: Error) => void })
      .mockRejectedValueOnce(new Error('gh down'))
    const node = createPhaseNode('discovery', loop, deps)
    await expect(node.execute({}, ctx)).rejects.toThrow('gh down')
  })
})

// ---------------------------------------------------------------------------
// handoff
// ---------------------------------------------------------------------------

describe('handoff node', () => {
  it('creates worktree + dispatches maker per contract and writes back in-progress contracts', async () => {
    const loop = makeLoop()
    const contracts = [makeContract('task/a'), makeContract('task/b')]
    const { deps, ctx, graphEvents, updatedContracts } = makeDeps({ contracts })
    const node = createPhaseNode('handoff', loop, deps)
    const res = await node.execute({ [CH.contracts]: contracts }, ctx)

    expect(deps.worktreeManager.create).toHaveBeenCalledTimes(2)
    expect(deps.dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task/a', worktreeId: 'wt-task/a', status: 'in-progress' }), 'maker')
    expect(updatedContracts.every(u => u.patch.status === 'in-progress' && u.patch.worktreeId)).toBe(true)
    const types = emittedTypes(graphEvents)
    expect(types.filter(t => t === 'loop.task-handed-off')).toHaveLength(2)
    const updated = res.update?.[CH.contracts] as TaskContract[]
    expect(updated.every(c => c.status === 'in-progress' && c.worktreeId)).toBe(true)
  })

  it('dryRun: no worktree / no dispatch / no store write, logs instead (shadow guardrail)', async () => {
    const loop = makeLoop()
    const contracts = [makeContract('task/a')]
    const { deps, ctx, logs, updatedContracts } = makeDeps({ contracts, dryRun: true })
    const node = createPhaseNode('handoff', loop, deps)
    await node.execute({ [CH.contracts]: contracts }, ctx)

    expect(deps.worktreeManager.create).not.toHaveBeenCalled()
    expect(deps.dispatcher.dispatch).not.toHaveBeenCalled()
    expect(updatedContracts).toHaveLength(0)
    expect(logs.some(l => l.includes('task/a'))).toBe(true)
  })

  it('propagates dispatcher failure', async () => {
    const loop = makeLoop()
    const contracts = [makeContract('task/a')]
    const { deps, ctx } = makeDeps({ contracts })
    ;(deps.dispatcher.dispatch as unknown as { mockRejectedValueOnce: (e: Error) => void })
      .mockRejectedValueOnce(new Error('agent gone'))
    const node = createPhaseNode('handoff', loop, deps)
    await expect(node.execute({ [CH.contracts]: contracts }, ctx)).rejects.toThrow('agent gone')
  })
})

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

describe('validation node', () => {
  it('verifies each contract, appends records and emits loop.verification-complete', async () => {
    const loop = makeLoop()
    const contracts = [makeContract('task/a'), makeContract('task/b')]
    const { deps, ctx, graphEvents, appendedVerifications } = makeDeps({ contracts })
    const node = createPhaseNode('validation', loop, deps)
    const res = await node.execute({ [CH.contracts]: contracts }, ctx)

    expect(deps.verifier.verify).toHaveBeenCalledTimes(2)
    expect(appendedVerifications).toHaveLength(2)
    expect((res.update?.[CH.verifications] as VerificationRecord[]).map(v => v.contractId))
      .toEqual(['task/a', 'task/b'])
    expect(emittedTypes(graphEvents).filter(t => t === 'loop.verification-complete')).toHaveLength(2)
  })

  it('bridges pending human approval to a graph interrupt (fixes the approval break)', async () => {
    const loop = makeLoop()
    const contracts = [makeContract('task/a')]
    const { deps, ctx } = makeDeps({
      contracts,
      verifyResult: makeVerification('task/a', 'pending'),
    })
    const node = createPhaseNode('validation', loop, deps)
    const res = await node.execute({ [CH.contracts]: contracts }, ctx)

    expect(res.interrupt).toBeDefined()
    expect(res.interrupt!.id).toBe(`approval:task/a`)
  })

  it('records verified contracts before interrupting on a later pending one', async () => {
    const loop = makeLoop()
    const a = makeContract('task/a'), b = makeContract('task/b')
    const { deps, ctx } = makeDeps({ contracts: [a, b] })
    ;(deps.verifier.verify as unknown as { mockImplementation: (f: (c: TaskContract) => Promise<VerificationRecord>) => void })
      .mockImplementation(async (c: TaskContract) =>
        c.id === 'task/a' ? makeVerification('task/a', 'passed') : makeVerification('task/b', 'pending'))
    const node = createPhaseNode('validation', loop, deps)
    const res = await node.execute({ [CH.contracts]: [a, b] }, ctx)

    expect(res.interrupt?.id).toBe('approval:task/b')
    expect((res.update?.[CH.verifications] as VerificationRecord[]).map(v => v.contractId)).toEqual(['task/a'])
  })
})

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

describe('persistence node', () => {
  it('persists passed contracts only, emits loop.persisted with artifact', async () => {
    const loop = makeLoop()
    const a = makeContract('task/a'), b = makeContract('task/b')
    const va = makeVerification('task/a', 'passed'), vb = makeVerification('task/b', 'failed')
    const { deps, ctx, graphEvents, persisted } = makeDeps({ contracts: [a, b] })
    const node = createPhaseNode('persistence', loop, deps)
    await node.execute({ [CH.contracts]: [a, b], [CH.verifications]: [va, vb] }, ctx)

    expect(persisted).toEqual([{ contractId: 'task/a', dryRun: false }])
    const evt = graphEvents.find(e => (e as { type: string }).type === 'loop.persisted') as Extract<LoopEvent, { type: 'loop.persisted' }> | undefined
    expect(evt?.artifact).toBe('artifact:task/a')
  })

  it('dryRun: persistence side effect logged, not executed', async () => {
    const loop = makeLoop()
    const a = makeContract('task/a')
    const { deps, ctx, logs, persisted } = makeDeps({ contracts: [a], dryRun: true })
    const node = createPhaseNode('persistence', loop, deps)
    await node.execute(
      { [CH.contracts]: [a], [CH.verifications]: [makeVerification('task/a', 'passed')] }, ctx)

    expect(persisted).toHaveLength(0)
    expect(logs.some(l => l.includes('task/a') && l.includes('dry'))).toBe(true)
  })

  it('propagates adapter failure (real side effects must not fail silently)', async () => {
    const loop = makeLoop()
    const a = makeContract('task/a')
    const { deps, ctx } = makeDeps({ contracts: [a] })
    ;(deps.persistence.persist as unknown as { mockRejectedValueOnce: (e: Error) => void })
      .mockRejectedValueOnce(new Error('kanban down'))
    const node = createPhaseNode('persistence', loop, deps)
    await expect(node.execute(
      { [CH.contracts]: [a], [CH.verifications]: [makeVerification('task/a', 'passed')] }, ctx))
      .rejects.toThrow('kanban down')
  })
})

// ---------------------------------------------------------------------------
// gate（R3 质量门禁）
// ---------------------------------------------------------------------------

describe('gate node', () => {
  it('runs commands, reports gateResults with exitCode/duration; passing validator stays quiet', async () => {
    const loop = makeLoop()
    const commands: GateCommand[] = [
      { name: 'lint', cmd: 'true' },
      { name: 'test', cmd: 'true', timeoutMs: 5000 },
    ]
    const node = createGateNode(loop, { commands })
    const res = await node.execute({}, {
      graphId: 'g', threadId: 't', nodeId: 'gate', superStep: 1, deps: { emitEvent: () => {} },
    } as unknown as NodeContext)

    const results = res.update?.[CH.gateResults] as Array<{ name: string; passed: boolean; exitCode: number; durationMs: number }>
    expect(results.map(r => r.name)).toEqual(['lint', 'test'])
    expect(results.every(r => r.passed && r.exitCode === 0 && r.durationMs >= 0)).toBe(true)
    expect((res.update?.[CH.repairQueue] as string[] | undefined) ?? []).toEqual([])
  })

  it('failing validator lands in repairQueue (repair back-edge trigger), stderr summarized', async () => {
    const loop = makeLoop()
    const node = createGateNode(loop, {
      commands: [{ name: 'typecheck', cmd: 'false' }],
    })
    const res = await node.execute({}, {
      graphId: 'g', threadId: 't', nodeId: 'gate', superStep: 1, deps: { emitEvent: () => {} },
    } as unknown as NodeContext)

    expect(res.update?.[CH.repairQueue]).toEqual(['typecheck'])
    const result = (res.update?.[CH.gateResults] as Array<{ name: string; passed: boolean; exitCode: number }>)[0]
    expect(result.passed).toBe(false)
    expect(result.exitCode).not.toBe(0)
  })

  it('post-kind failure warns but never blocks (no repairQueue entry)', async () => {
    const loop = makeLoop()
    const logs: string[] = []
    const node = createGateNode(loop, {
      commands: [{ name: 'notify', cmd: 'false', kind: 'post' }],
      log: (m) => { logs.push(m) },
    })
    const res = await node.execute({}, {
      graphId: 'g', threadId: 't', nodeId: 'gate', superStep: 1, deps: { emitEvent: () => {} },
    } as unknown as NodeContext)

    expect(res.update?.[CH.repairQueue] ?? []).toEqual([])
    expect((res.update?.[CH.gateResults] as Array<{ passed: boolean }>)[0].passed).toBe(false)
    expect(logs.some(l => l.includes('notify'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// stop-condition
// ---------------------------------------------------------------------------

describe('stop-condition node', () => {
  it('evaluates loop.stopCondition via injected judge and writes stopMet', async () => {
    const loop = makeLoop()
    const node = createStopConditionNode(loop, {
      evaluateStop: async () => true,
    })
    const res = await node.execute({}, {
      graphId: 'g', threadId: 't', nodeId: 'stop-check', superStep: 2, deps: { emitEvent: () => {} },
    } as unknown as NodeContext)

    expect(res.update?.[CH.stopMet]).toBe(true)
  })

  it('defaultEvaluateStop: JSON predicate path wins when stopCondition parses', async () => {
    const met = await defaultEvaluateStop(
      JSON.stringify({ op: 'truthy', path: 'stopMet' }),
      { stopMet: true },
    )
    expect(met).toBe(true)
  })

  it('defaultEvaluateStop heuristic: no open contracts → stop; failed verification keeps loop open', async () => {
    const a = makeContract('task/a')
    expect(await defaultEvaluateStop('all done', { [CH.contracts]: [], [CH.verifications]: [] })).toBe(true)
    expect(await defaultEvaluateStop('all done', {
      [CH.contracts]: [a],
      [CH.verifications]: [makeVerification('task/a', 'failed')],
    })).toBe(false)
    expect(await defaultEvaluateStop('all done', {
      [CH.contracts]: [a],
      [CH.verifications]: [makeVerification('task/a', 'passed')],
    })).toBe(true)
  })
})
