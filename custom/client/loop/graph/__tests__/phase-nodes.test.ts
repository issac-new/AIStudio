// P1 Task 3 — 五阶段节点工厂：真实阶段函数绑定 + gate/stopCondition/审批三元组节点
// 断言：channel update 键值 / loop.* 兼容事件 / dryRun 无副作用 / interrupt 桥接 /
// resume 消费与审批三元组（spec §7B.7）/ gate validator-post 三分法
// 全部引擎 deps 走 mock，gate 命令经注入的 exec 执行，不跑真实 git / 子进程。
import { describe, it, expect, vi } from 'vitest'
import {
  CH, createPhaseNode, createGateNode, createStopConditionNode, createHumanApprovalNode,
  defaultEvaluateStop, evaluateApprovalPolicy, resolveApprovers, appendContractsById,
  approvalInterruptId, resumeChannel,
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
  approvals?: PhaseNodeDeps['approvals']
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
    approvals: over.approvals,
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
      repairNeeded: 'repairNeeded', approvalResult: 'approvalResult',
      phaseProgress: 'phaseProgress',
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
    const contracts = [makeContract('task/a', { status: 'in-progress' }), makeContract('task/b', { status: 'in-progress' })]
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
    const contracts = [makeContract('task/a', { status: 'in-progress' })]
    const { deps, ctx } = makeDeps({
      contracts,
      verifyResult: makeVerification('task/a', 'pending'),
    })
    const node = createPhaseNode('validation', loop, deps)
    const res = await node.execute({ [CH.contracts]: contracts }, ctx)

    expect(res.interrupt).toBeDefined()
    expect(res.interrupt!.id).toBe('approval:task/a@0') // attempts 后缀防 repair 轮次串扰
  })

  it('records verified contracts before interrupting on a later pending one', async () => {
    const loop = makeLoop()
    const a = makeContract('task/a', { status: 'in-progress' }), b = makeContract('task/b', { status: 'in-progress' })
    const { deps, ctx } = makeDeps({ contracts: [a, b] })
    ;(deps.verifier.verify as unknown as { mockImplementation: (f: (c: TaskContract) => Promise<VerificationRecord>) => void })
      .mockImplementation(async (c: TaskContract) =>
        c.id === 'task/a' ? makeVerification('task/a', 'passed') : makeVerification('task/b', 'pending'))
    const node = createPhaseNode('validation', loop, deps)
    const res = await node.execute({ [CH.contracts]: [a, b] }, ctx)

    expect(res.interrupt?.id).toBe('approval:task/b@0')
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
      { name: 'lint', kind: 'validator', cmd: 'true' },
      { name: 'test', kind: 'validator', cmd: 'true', timeoutMs: 5000 },
    ]
    const node = createGateNode(loop, { commands })
    const res = await node.execute({}, {
      graphId: 'g', threadId: 't', nodeId: 'gate', superStep: 1, deps: { emitEvent: () => {} },
    } as unknown as NodeContext)

    const results = res.update?.[CH.gateResults] as Array<{ name: string; passed: boolean; exitCode: number; durationMs: number }>
    expect(results.map(r => r.name)).toEqual(['lint', 'test'])
    expect(results.every(r => r.passed && r.exitCode === 0 && r.durationMs >= 0)).toBe(true)
    expect(res.update?.[CH.repairNeeded]).toBe(false)
  })

  it('failing validator lands in repairQueue (repair back-edge trigger), stderr summarized', async () => {
    const loop = makeLoop()
    const node = createGateNode(loop, {
      commands: [{ name: 'typecheck', kind: 'validator', cmd: 'false' }],
    })
    const res = await node.execute({}, {
      graphId: 'g', threadId: 't', nodeId: 'gate', superStep: 1, deps: { emitEvent: () => {} },
    } as unknown as NodeContext)

    expect(res.update?.[CH.repairNeeded]).toBe(true)
    const queue = res.update?.[CH.repairQueue] as Array<{ source: string; name: string; message: string }>
    expect(queue[0]?.name).toBe('typecheck')
    expect(queue[0]?.message).toContain('gate')
    const result = (res.update?.[CH.gateResults] as Array<{ name: string; passed: boolean; exitCode: number }>)[0]
    expect(result.passed).toBe(false)
    expect(result.exitCode).not.toBe(0)
  })

  it('post-kind failure warns but never blocks (no repairQueue entry)', async () => {
    const loop = makeLoop()
    const logs: string[] = []
    const node = createGateNode(loop, {
      commands: [{ name: 'notify', kind: 'post', cmd: 'false' }],
      log: (m) => { logs.push(m) },
    })
    const res = await node.execute({}, {
      graphId: 'g', threadId: 't', nodeId: 'gate', superStep: 1, deps: { emitEvent: () => {} },
    } as unknown as NodeContext)

    expect(res.update?.[CH.repairNeeded]).toBe(false)
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

// ---------------------------------------------------------------------------
// §7B.7：interrupt 自路由 + resume 消费（validation 人工门禁）
// ---------------------------------------------------------------------------

describe('validation resume consumption (approval triple)', () => {
  const humanGate = {
    verificationIntent: { programmatic: [], judge: null, human: { gate: 'always' as const, approvers: ['alice'] } },
  }

  it('interrupt self-routes back to validation and carries prompt/contract summary/policy triple', async () => {
    const loop = makeLoop()
    const c = makeContract('task/a', { status: 'in-progress', ...humanGate })
    const { deps, ctx } = makeDeps({ contracts: [c], verifyResult: makeVerification('task/a', 'pending') })
    const node = createPhaseNode('validation', loop, deps)
    const res = await node.execute({ [CH.contracts]: [c] }, ctx)

    expect(res.goto).toEqual(['validation']) // resume 从 nextNodes 续跑时本节点重入消费裁决
    const value = res.interrupt!.value as Record<string, any>
    expect(value.kind).toBe('approval')
    expect(value.contractId).toBe('task/a')
    expect(value.prompt).toContain('task/a')
    expect(value.contractSummary).toMatchObject({ id: 'task/a', summary: 'task/a' })
    expect(value.policy).toEqual({ approvers: ['alice'], policy: 'all', onReject: { goto: 'handoff' } })
  })

  it('resume approve finalizes record per policy and appends approvalResult; no duplicate verify of verified contracts', async () => {
    const loop = makeLoop()
    const c = makeContract('task/a', { status: 'in-progress', ...humanGate })
    const { deps, ctx, graphEvents, appendedVerifications } = makeDeps({
      contracts: [c], verifyResult: makeVerification('task/a', 'passed'),
    })
    const node = createPhaseNode('validation', loop, deps)
    const state = {
      [CH.contracts]: [c],
      [CH.phaseProgress]: [{ kind: 'verified', contractId: 'task/a', attempts: 0, ts: '' }],
      [resumeChannel(approvalInterruptId('task/a', 0))]: { decision: 'approved', approver: 'alice' },
    }
    const res = await node.execute(state, ctx)

    expect(deps.verifier.verify).toHaveBeenCalledTimes(1)
    expect((deps.verifier.verify as any).mock.calls[0][0].verificationIntent.human).toBeNull() // 剥离 human gate 重验
    const records = res.update?.[CH.verifications] as VerificationRecord[]
    expect(records[0].overall).toBe('passed')
    expect(records[0].results.human).toMatchObject({ approver: 'alice', decision: 'approved' })
    expect(appendedVerifications).toHaveLength(1)
    expect(res.update?.[CH.approvalResult]).toContainEqual(expect.objectContaining({
      nodeId: 'validation', contractId: 'task/a', approved: true, policy: 'all',
    }))
    const evt = graphEvents.find(e => (e as { type: string }).type === 'loop.verification-complete') as any
    expect(evt.passed).toBe(true)
  })

  it('resume rejected (default onReject=handoff) fails the record and queues repair without explicit goto', async () => {
    const loop = makeLoop()
    const c = makeContract('task/a', { status: 'in-progress', ...humanGate })
    const { deps, ctx, updatedContracts } = makeDeps({
      contracts: [c], verifyResult: makeVerification('task/a', 'passed'),
    })
    const node = createPhaseNode('validation', loop, deps)
    const state = {
      [CH.contracts]: [c],
      [resumeChannel(approvalInterruptId('task/a', 0))]: { decision: 'rejected', approver: 'alice' },
    }
    const res = await node.execute(state, ctx)

    const records = res.update?.[CH.verifications] as VerificationRecord[]
    expect(records[0].overall).toBe('failed')
    expect(records[0].results.human?.decision).toBe('rejected')
    expect(res.update?.[CH.repairNeeded]).toBe(true)
    expect(res.update?.[CH.repairQueue]).toContainEqual(expect.objectContaining({
      source: 'validation', contractId: 'task/a', message: 'human',
    }))
    expect(updatedContracts[0]?.patch).toMatchObject({ status: 'queued', attempts: 1 })
    expect(res.goto).toBeUndefined() // 默认去向交给 repairNeeded 守卫回边
  })

  it('resume rejected with onReject=fail fails the run after persisting the ledger', async () => {
    const loop = makeLoop()
    const c = makeContract('task/a', { status: 'in-progress' })
    const { deps, ctx, appendedVerifications, updatedContracts } = makeDeps({
      contracts: [c], verifyResult: makeVerification('task/a', 'passed'),
      approvals: { policy: 'all', onReject: 'fail' },
    })
    const node = createPhaseNode('validation', loop, deps)
    const state = {
      [CH.contracts]: [c],
      [resumeChannel(approvalInterruptId('task/a', 0))]: 'rejected',
    }
    await expect(node.execute(state, ctx)).rejects.toThrow(/Approval rejected for contract task\/a/)
    expect(appendedVerifications).toHaveLength(1) // 台账先落库再失败
    expect(updatedContracts).toHaveLength(1)
  })

  it('resume rejected with a custom onReject.goto routes explicitly', async () => {
    const loop = makeLoop()
    const c = makeContract('task/a', { status: 'in-progress' })
    const { deps, ctx } = makeDeps({
      contracts: [c], verifyResult: makeVerification('task/a', 'passed'),
      approvals: { policy: 'any', onReject: { goto: 'review-board' } },
    })
    const node = createPhaseNode('validation', loop, deps)
    const state = {
      [CH.contracts]: [c],
      [resumeChannel(approvalInterruptId('task/a', 0))]: 'rejected',
    }
    const res = await node.execute(state, ctx)
    expect(res.goto).toEqual(['review-board'])
  })

  it('ignores a stale __resume channel from a previous repair round (attempts-suffixed interrupt id)', async () => {
    const loop = makeLoop()
    const c = makeContract('task/a', { status: 'in-progress', attempts: 1, ...humanGate })
    const { deps, ctx } = makeDeps({ contracts: [c], verifyResult: makeVerification('task/a', 'pending') })
    const node = createPhaseNode('validation', loop, deps)
    const state = {
      [CH.contracts]: [c],
      [resumeChannel(approvalInterruptId('task/a', 0))]: 'approved', // 上一轮残留裁决
    }
    const res = await node.execute(state, ctx)

    // 旧轮裁决不消费：verify 携带完整 human gate 正常执行 → 重新 interrupt（id 带 attempts=1）
    expect((deps.verifier.verify as any).mock.calls[0][0].verificationIntent.human).not.toBeNull()
    expect(res.interrupt?.id).toBe(approvalInterruptId('task/a', 1))
  })

  it('skips contracts already verified in the current round (resume re-entry idempotence)', async () => {
    const loop = makeLoop()
    const c = makeContract('task/a', { status: 'in-progress' })
    const { deps, ctx } = makeDeps({ contracts: [c] })
    const node = createPhaseNode('validation', loop, deps)
    const state = {
      [CH.contracts]: [c],
      [CH.phaseProgress]: [{ kind: 'verified', contractId: 'task/a', attempts: 0, ts: '' }],
    }
    const res = await node.execute(state, ctx)

    expect(deps.verifier.verify).not.toHaveBeenCalled()
    expect(res.update?.[CH.verifications]).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// §7B.7：审批策略三元组（approvers 来源 / 通过策略 / 拒绝去向）
// ---------------------------------------------------------------------------

describe('approval policy triple', () => {
  const dec = (approver: string, decision: 'approved' | 'rejected') => ({ approver, decision })

  it('policy all requires every decision approved', () => {
    const cfg = { approvers: ['a', 'b'], policy: 'all' as const }
    expect(evaluateApprovalPolicy(cfg, { decisions: [dec('a', 'approved'), dec('b', 'approved')] }).approved).toBe(true)
    expect(evaluateApprovalPolicy(cfg, { decisions: [dec('a', 'approved'), dec('b', 'rejected')] }).approved).toBe(false)
  })

  it('policy majority needs more than half approvals', () => {
    const cfg = { approvers: ['a', 'b', 'c'], policy: 'majority' as const }
    expect(evaluateApprovalPolicy(cfg, { decisions: [dec('a', 'approved'), dec('b', 'approved'), dec('c', 'rejected')] }).approved).toBe(true)
    expect(evaluateApprovalPolicy(cfg, { decisions: [dec('a', 'approved'), dec('b', 'rejected'), dec('c', 'rejected')] }).approved).toBe(false)
  })

  it('policy any passes on first approval', () => {
    const cfg = { approvers: ['a', 'b'], policy: 'any' as const }
    expect(evaluateApprovalPolicy(cfg, { decisions: [dec('a', 'rejected'), dec('b', 'approved')] }).approved).toBe(true)
    expect(evaluateApprovalPolicy(cfg, { decisions: [dec('a', 'rejected')] }).approved).toBe(false)
  })

  it('policy specified requires the named approvers to approve (dynamic source falls back to all)', () => {
    expect(evaluateApprovalPolicy({ approvers: ['alice'], policy: 'specified' }, { decisions: [dec('alice', 'approved')] }).approved).toBe(true)
    expect(evaluateApprovalPolicy({ approvers: ['alice'], policy: 'specified' }, { decisions: [dec('bob', 'approved')] }).approved).toBe(false)
    expect(evaluateApprovalPolicy({ approvers: { from: 'assignee' }, policy: 'specified' }, { decisions: [dec('x', 'approved')] }).approved).toBe(true)
  })

  it('normalizes resume value shapes (boolean / string / approved flag / decision object / changes-requested)', () => {
    expect(evaluateApprovalPolicy({ approvers: ['a'], policy: 'any' }, true).approved).toBe(true)
    expect(evaluateApprovalPolicy({ approvers: ['a'], policy: 'any' }, false).approved).toBe(false)
    expect(evaluateApprovalPolicy({ approvers: ['a'], policy: 'any' }, 'approved').approved).toBe(true)
    expect(evaluateApprovalPolicy({ approvers: ['a'], policy: 'any' }, { approved: true }).approved).toBe(true)
    expect(evaluateApprovalPolicy({ approvers: ['a'], policy: 'any' }, { decision: 'rejected', approver: 'zoe' }).decisions[0].approver).toBe('zoe')
    expect(evaluateApprovalPolicy({ approvers: ['a'], policy: 'any' }, 'changes-requested').approved).toBe(false)
    expect(evaluateApprovalPolicy({ approvers: ['a'], policy: 'any' }, undefined).approved).toBe(false)
  })

  it('resolveApprovers supports list / channel / assignee sources', () => {
    expect(resolveApprovers(['a'], {})).toEqual(['a'])
    expect(resolveApprovers({ from: 'channel', name: 'reviewers' }, { reviewers: ['carol'] })).toEqual(['carol'])
    expect(resolveApprovers({ from: 'channel' }, {})).toEqual([])
    expect(resolveApprovers({ from: 'assignee' }, { assignee: 'dave' })).toEqual(['dave'])
    expect(resolveApprovers({ from: 'assignee' }, {})).toEqual(['assignee'])
  })

  it('appendContractsById keeps only the latest entry per contract id', () => {
    const a1 = makeContract('task/a', { status: 'queued' })
    const a2 = makeContract('task/a', { status: 'in-progress' })
    const b = makeContract('task/b')
    const merged = appendContractsById([a1], [a2, b])
    expect(merged).toHaveLength(2)
    expect(merged.find(c => c.id === 'task/a')?.status).toBe('in-progress')
  })
})

// ---------------------------------------------------------------------------
// §7B.7：human 审批节点（config 三元组）
// ---------------------------------------------------------------------------

describe('human approval node', () => {
  const approvals = { approvers: ['alice', 'bob'], policy: 'all' as const, onReject: { goto: 'handoff' } as const }
  const ctxFor = (nodeId: string) => ({
    graphId: 'g', threadId: 't', nodeId, superStep: 0, deps: { emitEvent: () => {} },
  } as unknown as NodeContext)

  it('raises interrupt with resolved approvers + triple and routes back to itself for resume', async () => {
    const node = createHumanApprovalNode({ id: 'signoff', prompt: 'Please approve the release', approvals })
    const res = await node.execute({}, ctxFor('signoff'))

    expect(res.interrupt).toBeDefined()
    expect(res.goto).toEqual(['signoff'])
    const value = res.interrupt!.value as Record<string, any>
    expect(value.kind).toBe('approval')
    expect(value.approvers).toEqual(['alice', 'bob'])
    expect(value.policy).toBe('all')
    expect(value.onReject).toEqual({ goto: 'handoff' })
    expect(value.prompt).toContain('release')
    expect(res.update?.[CH.approvalResult]).toBeUndefined()
  })

  it('resume approved produces approvalResult channel entry', async () => {
    const node = createHumanApprovalNode({ id: 'signoff', approvals })
    const state = { [resumeChannel('approval:signoff@0')]: { decision: 'approved', approver: 'alice' } }
    const res = await node.execute(state, ctxFor('signoff'))

    expect(res.interrupt).toBeUndefined()
    const entries = res.update?.[CH.approvalResult] as Array<Record<string, unknown>>
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ nodeId: 'signoff', approved: true, decidedBy: ['alice'], policy: 'all' })
  })

  it('resume rejected routes per onReject.goto; onReject=fail fails the run', async () => {
    const node = createHumanApprovalNode({ id: 'signoff', approvals })
    const state = { [resumeChannel('approval:signoff@0')]: { decision: 'rejected', approver: 'alice' } }
    const res = await node.execute(state, ctxFor('signoff'))

    expect(res.goto).toEqual(['handoff'])
    expect((res.update?.[CH.approvalResult] as Array<Record<string, unknown>>)[0].approved).toBe(false)

    const failNode = createHumanApprovalNode({ id: 'gate-keep', approvals: { ...approvals, onReject: 'fail' } })
    const failState = { [resumeChannel('approval:gate-keep@0')]: 'rejected' }
    await expect(failNode.execute(failState, ctxFor('gate-keep'))).rejects.toThrow(/Approval rejected at node 'gate-keep'/)
  })

  it('second round uses a fresh interrupt id (approvalResult history => round), no stale resume reuse', async () => {
    const node = createHumanApprovalNode({ id: 'signoff', approvals })
    const history = { [CH.approvalResult]: [{ nodeId: 'signoff', approved: true }] }
    const res = await node.execute(history, ctxFor('signoff'))

    expect(res.interrupt?.id).toBe('approval:signoff@1')
  })

  it('approvers can be resolved from a channel', async () => {
    const node = createHumanApprovalNode({
      id: 'signoff',
      approvals: { approvers: { from: 'channel', name: 'reviewers' }, policy: 'any', onReject: 'fail' },
    })
    const res = await node.execute({ reviewers: ['carol'] }, ctxFor('signoff'))
    const value = res.interrupt!.value as Record<string, any>
    expect(value.approvers).toEqual(['carol'])
    expect(value.policy).toBe('any')
    expect(value.onReject).toBe('fail')
  })
})

// ---------------------------------------------------------------------------
// §7B.7：gate validator fail-fast（注入 exec，不跑真实进程）
// ---------------------------------------------------------------------------

describe('gate validator/post ordering (injectable exec)', () => {
  const ok = { stdout: '', stderr: '', exitCode: 0 }
  const gateCtx = {
    graphId: 'g', threadId: 't', nodeId: 'gate', superStep: 1, deps: { emitEvent: () => {} },
  } as unknown as NodeContext

  it('runs validators first (declared order) then posts', async () => {
    const loop = makeLoop()
    const exec = vi.fn(async () => ok)
    const commands: GateCommand[] = [
      { name: 'notify', kind: 'post', cmd: 'echo notify' },
      { name: 'lint', kind: 'validator', cmd: 'npm run lint' },
      { name: 'typecheck', kind: 'validator', cmd: 'npm run typecheck' },
      { name: 'label', kind: 'post', cmd: 'echo label' },
    ]
    const node = createGateNode(loop, { commands, exec })
    const res = await node.execute({}, gateCtx)

    expect(exec.mock.calls.map(c => c[0]))
      .toEqual(['npm run lint', 'npm run typecheck', 'echo notify', 'echo label'])
    const results = res.update?.[CH.gateResults] as Array<{ name: string; kind: string; passed: boolean }>
    expect(results.map(r => r.name)).toEqual(['lint', 'typecheck', 'notify', 'label'])
    expect(results.every(r => r.passed)).toBe(true)
  })

  it('validator failure stops the gate: posts never run; message says which command, exitCode and stderr', async () => {
    const loop = makeLoop()
    const exec = vi.fn(async (cmd: string) =>
      cmd === 'npm run typecheck' ? { stdout: '', stderr: 'ERR: TS2307', exitCode: 1 } : ok)
    const commands: GateCommand[] = [
      { name: 'lint', kind: 'validator', cmd: 'npm run lint' },
      { name: 'typecheck', kind: 'validator', cmd: 'npm run typecheck' },
      { name: 'notify', kind: 'post', cmd: 'echo notify' },
    ]
    const node = createGateNode(loop, { commands, exec })
    const res = await node.execute({}, gateCtx)

    expect(exec).toHaveBeenCalledTimes(2) // 第 2 条 validator 失败后 post 副作用链未执行
    const results = res.update?.[CH.gateResults] as Array<{ name: string; passed: boolean; message?: string }>
    expect(results[1]).toMatchObject({ name: 'typecheck', passed: false })
    expect(results[1].message).toContain('2/2')
    expect(results[1].message).toContain('exit code 1')
    expect(results[1].message).toContain('ERR: TS2307')
    const repair = res.update?.[CH.repairQueue] as Array<{ source: string; name: string; message: string }>
    expect(repair[0]).toMatchObject({ source: 'gate', name: 'typecheck' })
    expect(repair[0].message).toContain('ERR: TS2307')
    expect(res.update?.[CH.repairNeeded]).toBe(true)
  })
})
