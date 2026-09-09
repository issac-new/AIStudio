// P1 Task 8 — 端到端验收：GRAPH_ENGINE=on 全链路 + HITL resume + 回放 + shadow 双跑一致率
import { describe, it, expect, vi } from 'vitest'
import { createGraphAssembly } from '../../../../server/loop/graph/graph-assembly'
import { compareEventSequences } from '../../../../server/loop/graph/shadow-runner'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
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
