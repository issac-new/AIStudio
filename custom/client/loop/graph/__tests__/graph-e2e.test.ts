// P1 Task 8 — 端到端验收：GRAPH_ENGINE=on 全链路 + HITL resume + 回放 + shadow 双跑一致率
// P2 Task 9（收口）— 追加装配级冒烟：R1 每日 Brief 手动触发、interrupt 超时 fail 全链
import { describe, it, expect, vi } from 'vitest'
import { createGraphAssembly } from '../../../../server/loop/graph/graph-assembly'
import { compareEventSequences } from '../../../../server/loop/graph/shadow-runner'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import { BRIEF_GRAPH_ID, renderBrief } from '../../../../server/loop/graph/daily-brief'
import { CH, type Connector, type PersistenceAdapter } from '../../../../server/loop/graph/phase-nodes'
import { LoopEngine } from '../../../../server/loop/engine/loop-engine'
import { Verifier } from '../../../../server/loop/engine/verifier'
import { SubagentDispatcher } from '../../../../server/loop/engine/subagent-dispatcher'
/** e2e 的验收面是装配链路（调度/节点编排/gate/审批/回放/双跑），git worktree 管道不在其中——
 *  真 WorktreeManager 会在 overlay 仓库里建真实 git worktree（污染 + 注册残留），统一 stub */
const stubWorktreeManager = () => ({
  create: async (c: TaskContract) => `wt-${c.id}`,
  remove: async () => {},
  cleanupStale: async () => {},
})
import { BudgetGuard } from '../../../../server/loop/engine/budget-guard'
import { StuckDetector } from '../../../../server/loop/engine/stuck-detector'
import { HookManager } from '../../../../server/loop/engine/hooks'
import { GraphSpecStore } from '../../../../server/loop/graph/graph-rest'
import { migrateLoops } from '../../../../server/loop/graph/graph-migrate'
import type { LoopStateStore } from '../../../../server/loop/store/state-store'
import type { LoopInstance, TaskContract, VerificationRecord, LoopEvent } from '../../../../server/loop/types'

// ---------------------------------------------------------------------------
// 共用 fixtures
// ---------------------------------------------------------------------------

function makeLoop(id = 'loop-1', over: Partial<LoopInstance> = {}): LoopInstance {
  return {
    id, name: 'L', goal: 'g', stopCondition: '', pattern: 'daily-triage',
    schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'scheduling', status: 'idle',
    autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '',
    lastTickAt: null, nextTickAt: new Date(Date.now() - 60_000).toISOString(),
    budget: { maxCostPerTick: 1, maxCostTotal: 10, killMode: 'notify', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
    ...over,
  }
}

function makeContract(id: string): TaskContract {
  return {
    id, loopId: 'loop-1',
    source: { type: 'git-commit', ref: 'sha', summary: id, rawPayload: null },
    readPlan: { requiredReads: [] }, writeBoundary: [],
    verificationIntent: { programmatic: [], judge: null, human: null },
    resultTemplate: { artifactType: 'report', requiredFiles: [] },
    worktreeId: null, assignee: 'maker', status: 'queued', attempts: 0, maxAttempts: 3,
  }
}

/** local-git connector fixture：每 loop 恒定返回一个契约（e2e 用结构 mock，git 管道不在验收面） */
function fixtureConnector(): Connector {
  return { discover: async (loop: LoopInstance) => loop.id === 'loop-1' ? [makeContract('task/e2e')] : [] }
}

function makeRecordingStore(loops: LoopInstance[]): LoopStateStore & { contracts: Map<string, TaskContract>; loopEvents: LoopEvent[] } {
  const byId = new Map(loops.map(l => [l.id, { ...l }]))
  const contracts = new Map<string, TaskContract>()
  const loopEvents: LoopEvent[] = []
  const store: LoopStateStore = {
    createLoop: async l => { byId.set(l.id, l) },
    getLoop: async id => byId.get(id) ?? null,
    listLoops: async () => [...byId.values()],
    updateLoop: async (id, patch) => {
      const cur = byId.get(id)
      if (cur) byId.set(id, { ...cur, ...patch, stats: patch.stats ?? cur.stats } as LoopInstance)
    },
    deleteLoop: async () => {},
    appendContract: async c => { contracts.set(c.id, c) },
    getContract: async id => contracts.get(id) ?? null,
    queryContracts: async loopId => [...contracts.values()].filter(c => c.loopId === loopId),
    updateContract: async (id, patch) => {
      const cur = contracts.get(id)
      if (cur) contracts.set(id, { ...cur, ...patch })
    },
    appendVerification: async () => {},
    appendEvent: async e => { loopEvents.push(e) },
    queryEvents: async () => [],
    detectDrift: async () => ({ hasDrift: false, details: '' }),
  }
  return Object.assign(store, { contracts, loopEvents })
}

function passedVerifier() {
  return new Verifier()
}

function recordingPersistence(): PersistenceAdapter & { calls: Array<{ contractId: string; dryRun: boolean }> } {
  const calls: Array<{ contractId: string; dryRun: boolean }> = []
  return Object.assign({
    persist: async (c: TaskContract, _v: VerificationRecord, _l: LoopInstance, dryRun: boolean) => {
      calls.push({ contractId: c.id, dryRun })
      return `pr/${c.id}`
    },
  }, { calls })
}

// ---------------------------------------------------------------------------
// 1. GRAPH_ENGINE=on 全链路
// ---------------------------------------------------------------------------

describe('E2E: GRAPH_ENGINE=on full loop', () => {
  it('spawner triggers run → five phases + gate → stopCondition → persistence writes → complete event log', async () => {
    const store = makeRecordingStore([makeLoop()])
    const persistence = recordingPersistence()
    const verifier = new Verifier()
    vi.spyOn(verifier, 'verify').mockImplementation(async (c: TaskContract) => ({
      contractId: c.id, results: { programmatic: [], judge: null, human: null },
      overall: 'passed' as const, finalResponseGuard: true,
    }))

    const assembly = createGraphAssembly({
      io: null, mode: 'on', store,
      eventLog: new InMemoryEventLogStore(),
      shadowEventLog: new InMemoryEventLogStore(),
      engineDeps: {
        store, dryRun: false,
        connectors: [fixtureConnector()],
        worktreeManager: stubWorktreeManager() as never,
        dispatcher: new SubagentDispatcher({ invokeAgent: async () => 'ok' }),
        verifier,
        persistence,
        gateCommands: [
          { name: 'sanity', kind: 'validator', cmd: 'true' },
          { name: 'notify', kind: 'post', cmd: 'true' },
        ],
        evaluateStop: async () => true,
        log: () => {},
      } as never,
    })
    await assembly.start()

    const { runId } = await assembly.spawner!.tickNow('loop-1')
    await vi.waitFor(() => expect(store.getLoop('loop-1')).resolves.toMatchObject({ status: 'completed' }))

    const loop = await store.getLoop('loop-1')
    expect(loop!.status).toBe('completed')
    expect(loop!.nextTickAt).toBeNull()
    expect(persistence.calls).toEqual([{ contractId: 'task/e2e', dryRun: false }])

    // run 详情：gate 两命令全过 + stopMet
    const run = assembly.graphService.getRun(runId!)
    expect(run!.instance.status).toBe('completed')
    expect((run!.instance.state[CH.gateResults] as Array<{ name: string; passed: boolean }>).map(g => g.name))
      .toEqual(['sanity', 'notify'])
    expect(run!.instance.state[CH.stopMet]).toBe(true)

    // 回放 API 返回完整序列（run.started → … → run.completed）
    const replay = await assembly.graphService.replayRun(runId!)
    const kinds = replay.map(e => e.kind)
    expect(kinds[0]).toBe('run.started')
    expect(kinds).toContain('node.completed')
    expect(kinds[kinds.length - 1]).toBe('run.completed')
    assembly.stop()
  })
})

// ---------------------------------------------------------------------------
// 2. HITL：审批 interrupt → resumeApproval 桥接 → run completed
// ---------------------------------------------------------------------------

describe('E2E: HITL approval via assembly bridge', () => {
  it('pending verification interrupts the run; approve bridge resumes to completion', async () => {
    const store = makeRecordingStore([makeLoop('loop-2')])
    let verifyCalls = 0
    const verifier = new Verifier()
    vi.spyOn(verifier, 'verify').mockImplementation(async (c: TaskContract) => {
      verifyCalls++
      return verifyCalls === 1
        ? { contractId: c.id, results: { programmatic: [], judge: null, human: null }, overall: 'pending' as const, finalResponseGuard: true }
        : { contractId: c.id, results: { programmatic: [], judge: null, human: null }, overall: 'passed' as const, finalResponseGuard: true }
    })

    const assembly = createGraphAssembly({
      io: null, mode: 'on', store,
      eventLog: new InMemoryEventLogStore(),
      shadowEventLog: new InMemoryEventLogStore(),
      engineDeps: {
        store, dryRun: false,
        connectors: [{ discover: async () => [makeContract('task/e2e')] }],
        worktreeManager: stubWorktreeManager() as never,
        dispatcher: new SubagentDispatcher({ invokeAgent: async () => 'ok' }),
        verifier,
        persistence: recordingPersistence(),
        evaluateStop: async () => true,
        log: () => {},
      } as never,
    })

    const { runId } = await assembly.spawner!.tickNow('loop-2')
    expect(runId).toBeDefined()
    // run 停在 awaiting-input 等真人审批
    await vi.waitFor(() => expect(assembly.graphService.getRun(runId!)?.instance.status).toBe('awaiting-input'))

    // 审批桥接：契约 id → interrupt resume
    const bridgeResult = await assembly.resumeApproval('task/e2e', 'approved')
    expect(bridgeResult.ok).toBe(true)

    const loop = await store.getLoop('loop-2')
    expect(['completed', 'idle']).toContain(loop!.status)
  })
})

// ---------------------------------------------------------------------------
// 3. shadow 双跑一致率（验收门禁：五阶段序列 100%）
// ---------------------------------------------------------------------------

describe('E2E: shadow parity legacy vs graph engine', () => {
  it('same loop+inputs produce identical phase event sequences (dry-run, ts-insensitive)', async () => {
    const legacyStore = makeRecordingStore([makeLoop()])
    const legacyEvents: LoopEvent[] = []
    const legacyEngine = new LoopEngine({
      store: legacyStore,
      localGitConnector: fixtureConnector() as never,
      verifier: (() => {
        const v = new Verifier()
        vi.spyOn(v, 'verify').mockImplementation(async (c: TaskContract) => ({
          contractId: c.id, results: { programmatic: [], judge: null, human: null },
          overall: 'passed' as const, finalResponseGuard: true,
        }))
        return v
      })(),
      dispatcher: new SubagentDispatcher({ invokeAgent: async () => 'ok' }),
      worktreeManager: stubWorktreeManager() as never,
      budgetGuard: new BudgetGuard(() => {}),
      stuckDetector: new StuckDetector(legacyStore),
      hookManager: new HookManager(),
      emitEvent: async e => { legacyEvents.push(e) },
    })
    await legacyStore.updateLoop('loop-1', { status: 'idle' })
    await legacyEngine.tick('loop-1')

    // 同一 loop、同输入，shadow 双跑（dryRun 强制）
    const shadowLog = new InMemoryEventLogStore()
    const shadowStore = makeRecordingStore([makeLoop()])
    const assembly = createGraphAssembly({
      io: null, mode: 'shadow', store: shadowStore,
      eventLog: new InMemoryEventLogStore(),
      shadowEventLog: shadowLog,
      engineDeps: {
        store: shadowStore, dryRun: false,
        connectors: [fixtureConnector()],
        worktreeManager: stubWorktreeManager() as never,
        dispatcher: new SubagentDispatcher({ invokeAgent: async () => 'ok' }),
        verifier: (() => {
          const v = new Verifier()
          vi.spyOn(v, 'verify').mockImplementation(async (c: TaskContract) => ({
            contractId: c.id, results: { programmatic: [], judge: null, human: null },
            overall: 'passed' as const, finalResponseGuard: true,
          }))
          return v
        })(),
        persistence: recordingPersistence(),
        log: () => {},
      } as never,
    })
    const loop = await shadowStore.getLoop('loop-1')
    await assembly.shadowRunner!.runShadow(loop!)
    const runs = await shadowLog.listRuns()
    const shadowEvents = await shadowLog.query(runs[runs.length - 1].runId, { limit: 1000 })

    const comparison = compareEventSequences(legacyEvents, shadowEvents, 'loop-1')
    expect(comparison.legacy.join(' → ')).toBe('node.completed:discovery → node.completed:handoff → node.completed:validation → node.completed:persistence')
    expect(comparison.matchRate).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 4. 数据迁移（幂等 + dry-run 默认）
// ---------------------------------------------------------------------------

describe('E2E: graph-migrate', () => {
  it('dry-run lists without persisting; --apply writes specs and is idempotent', async () => {
    const store = makeRecordingStore([makeLoop(), makeLoop('loop-2')])
    const specStore = new GraphSpecStore()
    const deps = {
      store, dryRun: true, connectors: [], worktreeManager: {}, dispatcher: {}, verifier: {}, persistence: {},
    } as never

    const dry = await migrateLoops({ store, specStore, compileDeps: deps })
    expect(dry.total).toBe(2)
    expect(dry.migrated).toBe(2)
    expect(specStore.list()).toEqual([]) // dry-run 不落库

    const applied = await migrateLoops({ store, specStore, compileDeps: deps, apply: true })
    expect(applied.migrated).toBe(2)
    expect(specStore.list().map(s => s.id)).toEqual(['loop-loop-1', 'loop-loop-2'])

    const again = await migrateLoops({ store, specStore, compileDeps: deps, apply: true })
    expect(again.skipped).toBe(2)
    expect(again.migrated).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 5. R1 每日 Brief（Task 9 收口冒烟）：真实 run 完成后手动触发 → 审计 run 落事件日志
//    （persist 失败回边全链路已有等价覆盖，不在此重复造：
//    kanban-persistence.test.ts「全图 persist-failure 路由」——装配级恒失败适配器 →
//    守卫回边恰 maxAttempts 次重试 → 契约 escalated + loop.escalated → stopMet=false，
//    loop 不被假判 completed）
// ---------------------------------------------------------------------------

describe('E2E: R1 daily brief manual runOnce', () => {
  it('completed real run feeds aggregate; brief audit run lands in event log; renderBrief has sections', async () => {
    const store = makeRecordingStore([makeLoop('loop-5')])
    const verifier = new Verifier()
    vi.spyOn(verifier, 'verify').mockImplementation(async (c: TaskContract) => ({
      contractId: c.id, results: { programmatic: [], judge: null, human: null },
      overall: 'passed' as const, finalResponseGuard: true,
    }))

    const assembly = createGraphAssembly({
      io: null, mode: 'on', store,
      eventLog: new InMemoryEventLogStore(),
      shadowEventLog: new InMemoryEventLogStore(),
      engineDeps: {
        store, dryRun: false,
        connectors: [fixtureConnector()],
        worktreeManager: stubWorktreeManager() as never,
        dispatcher: new SubagentDispatcher({ invokeAgent: async () => 'ok' }),
        verifier,
        persistence: recordingPersistence(),
        evaluateStop: async () => true,
        log: () => {},
      } as never,
    })

    // 造真实数据：一个 run 跑完（graphId='loop-loop-5'）——brief 聚合的事实源
    const { runId } = await assembly.spawner!.tickNow('loop-5')
    await vi.waitFor(() => expect(store.getLoop('loop-5')).resolves.toMatchObject({ status: 'completed' }))
    expect(runId).toBeDefined()

    // 手动触发（跳过 cron 到期判定）：runOnce 返回聚合，渲染至少含一段
    const agg = await assembly.briefJob!.runOnce()
    const text = renderBrief(agg)
    expect(text).toContain('【进展】')
    expect(text).toContain('L') // loop 名进正文

    // 审计 run：graphId='daily-brief'，run.started + run.completed 落主事件日志，
    // 未注入投递通道 → delivered 不得失真记 true（Task 8 修复的回归面）
    const briefRuns = (await assembly.eventLogs.main.listRuns()).filter(r => r.graphId === BRIEF_GRAPH_ID)
    expect(briefRuns).toHaveLength(1)
    const auditEvents = await assembly.eventLogs.main.query(briefRuns[0]!.runId)
    expect(auditEvents.map(e => e.kind)).toEqual(['run.started', 'run.completed'])
    expect(auditEvents[1]!.payload.delivered).toBe(false)
    // 聚合只认真实执行的 run（含 run.started），且不含 brief 自身审计 run
    expect(agg.completed.map(c => c.loopId)).toEqual(['loop-5'])
  })
})

// ---------------------------------------------------------------------------
// 6. interrupt 超时 fail 全链（Task 9 收口冒烟）：装配自带的 InterruptTimeoutScanner
//    （无 clock 注入、真实时钟）→ run 内审批 interrupt 携带的 ms/onTimeout 策略生效。
//    scanner 级三分策略单测见 interrupt-timeout.test.ts（seeded checkpoint + fake clock），
//    此处验的是「超时配置经 engineDeps.approvals → interrupt value → checkpoint → 扫描」
//    的真实装配链路——仅 80ms 就触发 fail 即证明节点级 ms 覆盖了 72h 默认。
// ---------------------------------------------------------------------------

describe('E2E: interrupt timeout fail policy via assembly scanner', () => {
  it('pending approval run is failed by the scanner once the interrupt-level timeout elapses', async () => {
    const store = makeRecordingStore([makeLoop('loop-6')])
    const verifier = new Verifier()
    vi.spyOn(verifier, 'verify').mockImplementation(async (c: TaskContract) => ({
      contractId: c.id, results: { programmatic: [], judge: null, human: null },
      overall: 'pending' as const, finalResponseGuard: true,
    }))

    const assembly = createGraphAssembly({
      io: null, mode: 'on', store,
      eventLog: new InMemoryEventLogStore(),
      shadowEventLog: new InMemoryEventLogStore(),
      engineDeps: {
        store, dryRun: false,
        connectors: [{ discover: async () => [makeContract('task/e2e')] }],
        worktreeManager: stubWorktreeManager() as never,
        dispatcher: new SubagentDispatcher({ invokeAgent: async () => 'ok' }),
        verifier,
        persistence: recordingPersistence(),
        // 审批三元组缺省：30ms 无应答 → fail（节点级覆盖 72h/escalate 缺省）
        approvals: { timeout: { ms: 30, onTimeout: 'fail' } },
        log: () => {},
      } as never,
    })

    const { runId } = await assembly.spawner!.tickNow('loop-6')
    await vi.waitFor(() => expect(assembly.graphService.getRun(runId!)?.instance.status).toBe('awaiting-input'))

    // 真实时钟走过 30ms 配置超时，再跑装配自带扫描器的一轮
    await new Promise(resolve => setTimeout(resolve, 80))
    await assembly.interruptScanner!.scan()

    // run failed + 事件日志 run.failed（error 含 interrupt timeout）+ 未发生任何 resume
    expect(assembly.graphService.getRun(runId!)?.instance.status).toBe('failed')
    const failed = await assembly.eventLogs.main.query(runId!, { kind: 'run.failed' })
    expect(failed).toHaveLength(1)
    expect(String(failed[0]!.payload.error)).toContain('interrupt timeout')
    expect(await assembly.eventLogs.main.query(runId!, { kind: 'interrupt.resumed' })).toHaveLength(0)

    // spawner 消费 graph.failed：loop 回 idle 重排（首败未达 10 次熔断阈值）
    await vi.waitFor(() => expect(store.getLoop('loop-6')).resolves.toMatchObject({ status: 'idle' }))
  })
})
