// P2 Task 4 — persistence 真实 kanban 写入：KanbanPersistenceAdapter + 默认 boardResolver
// 断言：dryRun 零调用 / createTask 参数（title `[loop.name] contract.id` + board/body/tenant）/
// 幂等查重跳过 / CLI 失败返回 { ok:false } 不抛 / board 解析不出跳过 + warn /
// 默认 boardResolver 六段 tenant 解析（ascii 群聊名 / 纯中文回落 roomId / legacy 与缺失 → null）/
// persistence 节点接入：失败结果 → loop.persist-failed 事件 + repairQueue + repairNeeded
// kanbanCli 全程走注入 fake，不跑真实 hermes CLI。
import { describe, it, expect, vi } from 'vitest'
import {
  KanbanPersistenceAdapter, defaultKanbanBoardResolver, readLoopTenant,
  type KanbanServiceModule,
} from '../../../../server/loop/graph/kanban-persistence'
import {
  CH, createPhaseNode, isPersistFailure,
  type PhaseNodeDeps, type PersistenceAdapter,
} from '../../../../server/loop/graph/phase-nodes'
import { createGraphAssembly } from '../../../../server/loop/graph/graph-assembly'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import type { LoopStateStore } from '../../../../server/loop/store/state-store'
import type { NodeContext } from '../../../../server/loop/graph/types'
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
    worktreeId: 'wt-1', assignee: 'maker', status: 'in-progress', attempts: 0, maxAttempts: 3,
    ...over,
  }
}

function makeVerification(contractId: string): VerificationRecord {
  return {
    contractId,
    results: {
      programmatic: [{ command: 'npm test', exitCode: 0, stdout: '', passed: true }],
      judge: null, human: null,
    },
    overall: 'passed', finalResponseGuard: true,
  }
}

interface FakeKanbanOpts {
  existing?: Array<{ id: string; title: string }>
  createError?: Error
  listError?: Error
}

/** kanban-service 模块 fake：只 fake 适配器用到的 listTasks / createTask */
function makeKanbanCli(opts: FakeKanbanOpts = {}): KanbanServiceModule & {
  listTasks: ReturnType<typeof vi.fn>
  createTask: ReturnType<typeof vi.fn>
} {
  const listTasks = vi.fn(async () => {
    if (opts.listError) throw opts.listError
    return (opts.existing ?? []).map(t => ({ id: t.id, title: t.title, status: 'todo' }))
  })
  const createTask = vi.fn(async (title: string) => {
    if (opts.createError) throw opts.createError
    return { id: 'kb-new', title, status: 'triage' }
  })
  return { listTasks, createTask } as unknown as KanbanServiceModule & {
    listTasks: ReturnType<typeof vi.fn>
    createTask: ReturnType<typeof vi.fn>
  }
}

function makeAdapter(
  kanban: ReturnType<typeof makeKanbanCli>,
  board: string | null = 'team-board',
  logs: string[] = [],
): KanbanPersistenceAdapter {
  return new KanbanPersistenceAdapter({
    kanban,
    boardResolver: vi.fn(() => board),
    log: (m) => { logs.push(m) },
  })
}

const contract = (): TaskContract => makeContract('task/a')
const loop = (): LoopInstance => makeLoop()
const verification = (): VerificationRecord => makeVerification('task/a')

// ---------------------------------------------------------------------------
// 适配器
// ---------------------------------------------------------------------------

describe('KanbanPersistenceAdapter', () => {
  it('dryRun=true 保持现状：零 kanban 调用，返回 dryrun 标记', async () => {
    const kanban = makeKanbanCli()
    const adapter = makeAdapter(kanban)
    const result = await adapter.persist(contract(), verification(), loop(), true)
    expect(result).toBe('dryrun:task/a')
    expect(kanban.listTasks).not.toHaveBeenCalled()
    expect(kanban.createTask).not.toHaveBeenCalled()
  })

  it('真实写入：createTask 带 title `[loop.name] contract.id` + board/body/tenant，产物 = { artifact: kanban:<id>, taskId }', async () => {
    const kanban = makeKanbanCli()
    const adapter = makeAdapter(kanban, 'team-board')
    const l = { ...loop(), tenant: 'Team Alpha:topic:@u:!room:$sess:matrix' } as unknown as LoopInstance
    const result = await adapter.persist(contract(), verification(), l, false)
    // P3 Task 7：createTask 返回 id 显式透传（结构化结果），替代 artifact 字符串反解
    expect(result).toEqual({ artifact: 'kanban:kb-new', taskId: 'kb-new' })
    expect(kanban.createTask).toHaveBeenCalledTimes(1)
    const [title, opts] = kanban.createTask.mock.calls[0] as [string, { board: string; body: string; tenant: string }]
    expect(title).toBe('[L] task/a')
    expect(opts.board).toBe('team-board')
    expect(opts.tenant).toBe('Team Alpha:topic:@u:!room:$sess:matrix')
    // body 产物摘要：verification 结果 + 产物类型 + worktree 可追溯
    expect(opts.body).toContain('verification: passed')
    expect(opts.body).toContain('programmatic 1/1 passed')
    expect(opts.body).toContain('artifact: report')
    expect(opts.body).toContain('wt-1')
    expect(kanban.listTasks).toHaveBeenCalledWith({ board: 'team-board' })
  })

  it('幂等：同契约重复 persist 命中同名 title → 跳过 createTask + warn，返回既有任务（同样带 taskId）', async () => {
    const kanban = makeKanbanCli({ existing: [{ id: 'kb-9', title: '[L] task/a' }] })
    const logs: string[] = []
    const adapter = makeAdapter(kanban, 'team-board', logs)
    const result = await adapter.persist(contract(), verification(), loop(), false)
    expect(result).toEqual({ artifact: 'kanban:kb-9', taskId: 'kb-9' })
    expect(kanban.createTask).not.toHaveBeenCalled()
    expect(logs.some(l => l.includes('task/a') && l.toLowerCase().includes('duplicate'))).toBe(true)
  })

  it('createTask 失败不炸 run：返回 { ok:false, error }，不抛异常', async () => {
    const kanban = makeKanbanCli({ createError: new Error('kanban cli down') })
    const adapter = makeAdapter(kanban)
    const result = await adapter.persist(contract(), verification(), loop(), false)
    expect(isPersistFailure(result)).toBe(true)
    expect((result as { ok: false; error: string }).error).toContain('kanban cli down')
  })

  it('listTasks 查重失败同走失败结果（不静默当无重复）', async () => {
    const kanban = makeKanbanCli({ listError: new Error('board query failed') })
    const adapter = makeAdapter(kanban)
    const result = await adapter.persist(contract(), verification(), loop(), false)
    expect(isPersistFailure(result)).toBe(true)
    expect(kanban.createTask).not.toHaveBeenCalled()
  })

  it('boardResolver 返回 null → 跳过写入 + warn，返回 { ok:false, error 含 board }', async () => {
    const kanban = makeKanbanCli()
    const logs: string[] = []
    const adapter = makeAdapter(kanban, null, logs)
    const result = await adapter.persist(contract(), verification(), loop(), false)
    expect(isPersistFailure(result)).toBe(true)
    expect((result as { ok: false; error: string }).error).toContain('board')
    expect(kanban.listTasks).not.toHaveBeenCalled()
    expect(kanban.createTask).not.toHaveBeenCalled()
    expect(logs.some(l => l.includes('task/a'))).toBe(true)
  })

  it('boardResolver 抛异常按解析失败处理（防御，不炸 run）', async () => {
    const kanban = makeKanbanCli()
    const adapter = new KanbanPersistenceAdapter({
      kanban,
      boardResolver: () => { throw new Error('resolver bug') },
      log: () => {},
    })
    const result = await adapter.persist(contract(), verification(), loop(), false)
    expect(isPersistFailure(result)).toBe(true)
    expect(kanban.createTask).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 默认 boardResolver（服务端等价 tenant-parser：六段格式）
// ---------------------------------------------------------------------------

describe('defaultKanbanBoardResolver', () => {
  it('六段 tenant：ascii 群聊名 slug 化为 board', () => {
    const l = { ...loop(), tenant: 'Team Alpha:topic:@u:!room:$sess:matrix' } as unknown as LoopInstance
    expect(defaultKanbanBoardResolver(l)).toBe('team-alpha')
  })

  it('六段 tenant：纯中文群聊名不可 slug 化 → 回落 roomId（去 ! 前缀）', () => {
    const l = {
      ...loop(),
      tenant: '跨团队协作群01:记忆服务讨论:@testuser3:!jDhqiAernzgtADVwAw:$11wFK9rf3UlDS:matrix',
    } as unknown as LoopInstance
    expect(defaultKanbanBoardResolver(l)).toBe('jdhqiaernzgtadvwaw')
  })

  it('字母残段过短（<3，如 开发群A→a 与 设计群A→a 撞名）→ 回落 roomId 而非共用残段（Minor 碰撞阈值）', () => {
    const a = { ...loop(), tenant: '开发群A:topic:@u:!room-dev:$s:matrix' } as unknown as LoopInstance
    const b = { ...loop(), tenant: '设计群A:topic:@u:!room-design:$s:matrix' } as unknown as LoopInstance
    expect(defaultKanbanBoardResolver(a)).toBe('room-dev')
    expect(defaultKanbanBoardResolver(b)).toBe('room-design')
  })

  it('过短纯字母群聊名（ab）同样回落 roomId', () => {
    const l = { ...loop(), tenant: 'ab:topic:@u:!room-x:$s:matrix' } as unknown as LoopInstance
    expect(defaultKanbanBoardResolver(l)).toBe('room-x')
  })

  it('旧格式（matrix 前缀三段）→ null（与 client tenant-parser isLegacy 语义对齐）', () => {
    const l = { ...loop(), tenant: 'matrix:!room:name' } as unknown as LoopInstance
    expect(defaultKanbanBoardResolver(l)).toBe(null)
  })

  it('loop 无 tenant → null', () => {
    expect(defaultKanbanBoardResolver(loop())).toBe(null)
  })

  it('readLoopTenant：非字符串/空白 tenant 归一为 null', () => {
    expect(readLoopTenant({ ...loop(), tenant: '   ' } as unknown as LoopInstance)).toBe(null)
    expect(readLoopTenant(loop())).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// persistence 节点接入：失败结果 → 事件 + repairQueue（既有守卫回边）
// ---------------------------------------------------------------------------

function makeNodeDeps(persist: PersistenceAdapter['persist'], logs: string[] = []) {
  const loopEvents: LoopEvent[] = []
  const graphEvents: LoopEvent[] = []
  const updatedLoops: Array<{ id: string; patch: Partial<LoopInstance> }> = []
  const updatedContracts: Array<{ id: string; patch: Partial<TaskContract> }> = []
  const deps: PhaseNodeDeps = {
    dryRun: false,
    connectors: [],
    store: {
      createLoop: async () => {}, getLoop: async () => null, listLoops: async () => [],
      updateLoop: async (id, patch) => { updatedLoops.push({ id, patch }) }, deleteLoop: async () => {},
      appendContract: async () => {}, getContract: async () => null, queryContracts: async () => [],
      updateContract: async (id, patch) => { updatedContracts.push({ id, patch }) }, appendVerification: async () => {},
      appendEvent: async () => {}, queryEvents: async () => [], detectDrift: async () => ({ hasDrift: false, details: '' }),
    } as unknown as PhaseNodeDeps['store'],
    worktreeManager: {} as PhaseNodeDeps['worktreeManager'],
    dispatcher: {} as PhaseNodeDeps['dispatcher'],
    verifier: {} as PhaseNodeDeps['verifier'],
    persistence: { persist },
    log: (m) => { logs.push(m) },
  }
  const ctx = {
    graphId: 'loop-loop-1', threadId: 't1', nodeId: 'persistence', superStep: 0,
    deps: { emitEvent: (e: unknown) => { graphEvents.push(e as LoopEvent) } },
  } as unknown as NodeContext
  return { deps, ctx, graphEvents, updatedLoops, updatedContracts, logs }
}

describe('persistence node × KanbanPersistenceAdapter 失败接入', () => {
  it('persist 返回 { ok:false } → loop.persist-failed 事件 + persistence repairQueue + repairNeeded，不标 persisted、不误计 tasksCompleted', async () => {
    const a = contract()
    const { deps, ctx, graphEvents, updatedLoops, logs } = makeNodeDeps(
      async () => ({ ok: false, error: 'kanban cli down' }),
    )
    const node = createPhaseNode('persistence', loop(), deps)
    const result = await node.execute(
      { [CH.contracts]: [a], [CH.verifications]: [verification()] }, ctx,
    ) as { update: Record<string, unknown> }

    const update = result.update
    expect(update[CH.repairNeeded]).toBe(true)
    expect(update[CH.repairQueue]).toEqual([{
      source: 'persistence', contractId: 'task/a', message: 'kanban cli down', ts: expect.any(String),
    }])
    // 未标 persisted：repair 回边后 persistence 节点可重试（progress 记失败轮次供封顶判定）
    expect(update[CH.phaseProgress]).toEqual([
      { kind: 'persist-failed', contractId: 'task/a', attempts: 1, ts: expect.any(String) },
    ])

    const failed = graphEvents.find(e => e.type === 'loop.persist-failed') as
      | Extract<LoopEvent, { type: 'loop.persist-failed' }> | undefined
    expect(failed).toBeDefined()
    expect(failed?.loopId).toBe('loop-1')
    expect(failed?.contractId).toBe('task/a')
    expect(failed?.error).toBe('kanban cli down')
    // 成功事件缺席 + 台账不误计（updatedLoops 仅剩节点入场的 stage 迁移写）
    expect(graphEvents.some(e => e.type === 'loop.persisted')).toBe(false)
    expect(updatedLoops).toEqual([
      expect.objectContaining({ id: 'loop-1', patch: { stage: 'persistence' } }),
    ])
    expect(logs.some(l => l.includes('task/a') && l.includes('kanban cli down'))).toBe(true)
  })

  it('失败与成功混合：成功契约照常落库计数，仅失败契约进 repairQueue', async () => {
    const a = makeContract('task/a')
    const b = makeContract('task/b')
    const { deps, ctx, graphEvents, updatedLoops } = makeNodeDeps(
      async (c) => (c.id === 'task/a' ? { ok: false as const, error: 'boom' } : `kanban:kb-${c.id}`),
    )
    const node = createPhaseNode('persistence', loop(), deps)
    const result = await node.execute(
      { [CH.contracts]: [a, b], [CH.verifications]: [makeVerification('task/a'), makeVerification('task/b')] }, ctx,
    ) as { update: Record<string, unknown> }

    const progress = result.update[CH.phaseProgress] as Array<{ kind: string; contractId: string }>
    expect(progress).toEqual([
      expect.objectContaining({ kind: 'persist-failed', contractId: 'task/a', attempts: 1 }),
      expect.objectContaining({ kind: 'persisted', contractId: 'task/b' }),
    ])
    expect(result.update[CH.repairNeeded]).toBe(true)
    expect(updatedLoops).toEqual([
      expect.objectContaining({ id: 'loop-1', patch: { stage: 'persistence' } }),
      expect.objectContaining({ id: 'loop-1', patch: expect.objectContaining({
        stats: expect.objectContaining({ tasksCompleted: 1 }),
      }) }),
    ])
    expect(graphEvents.filter(e => e.type === 'loop.persist-failed')).toHaveLength(1)
    expect(graphEvents.filter(e => e.type === 'loop.persisted')).toHaveLength(1)
  })

  it('重试封顶 → 契约 escalated 终态：不再置 repairNeeded、台账 tasksBlocked 计数、发 loop.escalated', async () => {
    const a = makeContract('task/a', { maxAttempts: 3 })
    const { deps, ctx, graphEvents, updatedLoops, updatedContracts } = makeNodeDeps(
      async () => ({ ok: false, error: 'kanban down' }),
    )
    const node = createPhaseNode('persistence', loop(), deps)

    // 模拟守卫回边重试：progress 逐轮累积（BSP 每轮把上一轮 update 写回 state）
    let state: Record<string, unknown> = { [CH.contracts]: [a], [CH.verifications]: [verification()] }
    for (let round = 1; round <= 3; round++) {
      const { update } = (await node.execute(state as never, ctx)) as { update: Record<string, unknown> }
      state = { ...state, ...update }
      // contracts 通道 appendById 语义：escalated 轮合并契约状态
      if (Array.isArray(update[CH.contracts])) {
        const prev = (state[CH.contracts] as TaskContract[]).filter(c => c.id !== 'task/a')
        state[CH.contracts] = [...prev, ...(update[CH.contracts] as TaskContract[])]
      }
      // repairQueue 通道 append 语义
      if (Array.isArray(update[CH.repairQueue])) {
        state[CH.repairQueue] = [...((state[CH.repairQueue] as unknown[]) ?? []), ...(update[CH.repairQueue] as unknown[])]
      }
    }

    const progress = state[CH.phaseProgress] as Array<{ kind: string; contractId: string; attempts: number }>
    expect(progress).toEqual([
      { kind: 'persist-failed', contractId: 'task/a', attempts: 1, ts: expect.any(String) },
      { kind: 'persist-failed', contractId: 'task/a', attempts: 2, ts: expect.any(String) },
      { kind: 'persist-escalated', contractId: 'task/a', attempts: 3, ts: expect.any(String) },
    ])
    // 封顶轮：repairNeeded 清零（无谓重试停止）、repairQueue 不再追加、契约标 escalated
    expect(state[CH.repairNeeded]).toBe(false)
    expect(state[CH.repairQueue]).toHaveLength(2) // 仅前两轮失败入队
    expect(updatedContracts).toEqual([{ id: 'task/a', patch: { status: 'escalated' } }])
    // 台账：每轮入场的 stage 迁移写 + 封顶轮的 tasksBlocked 计数（tasksCompleted 不误计）
    const statsUpdate = updatedLoops.find(u => u.patch.stats)
    expect(statsUpdate).toEqual({ id: 'loop-1', patch: expect.objectContaining({
      stats: expect.objectContaining({ tasksCompleted: 0, tasksBlocked: 1 }),
    }) })
    expect(updatedLoops.filter(u => !u.patch.stats)).toHaveLength(3)
    expect(graphEvents.filter(e => e.type === 'loop.persist-failed')).toHaveLength(3)
    expect(graphEvents.filter(e => e.type === 'loop.escalated')).toHaveLength(1)
    // 第四轮：escalated 契约跳过——零 persist/escalation 事件（stage 迁移事件为节点入场固定行为）
    const persistEventCount = () => graphEvents.filter(
      e => e.type === 'loop.persisted' || e.type === 'loop.persist-failed' || e.type === 'loop.escalated',
    ).length
    const before = persistEventCount()
    const { update } = (await node.execute(state as never, ctx)) as { update: Record<string, unknown> }
    expect(update[CH.repairNeeded]).toBe(false)
    expect(persistEventCount()).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// 全图链路（审查 Critical 回归）：assembly → spawner → compile → runtime 全程，
// 断言 persist 失败真实触发守卫回边重试，且失败不把 loop 假判 completed
// ---------------------------------------------------------------------------

function makeRecordingStore(loops: LoopInstance[]): LoopStateStore & {
  contracts: Map<string, TaskContract>; loopEvents: LoopEvent[]
} {
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

/** 全图装配 harness：单契约、verifier 恒 passed、worktree/dispatch stub、默认 stop 判定 */
async function startFailGraphRun(
  contract: TaskContract,
  persist: PersistenceAdapter['persist'],
) {
  const tickedLoop = { ...loop(), nextTickAt: new Date(Date.now() - 60_000).toISOString() }
  const store = makeRecordingStore([tickedLoop])
  const assembly = createGraphAssembly({
    io: null, mode: 'on', store,
    eventLog: new InMemoryEventLogStore(),
    shadowEventLog: new InMemoryEventLogStore(),
    engineDeps: {
      store, dryRun: false,
      connectors: [{ discover: async () => [contract] }],
      worktreeManager: { create: async (c: TaskContract) => `wt-${c.id}`, remove: async () => {}, cleanupStale: async () => {} },
      dispatcher: { dispatch: async () => {} },
      verifier: {
        verify: async (c: TaskContract) => ({
          contractId: c.id, results: { programmatic: [], judge: null, human: null },
          overall: 'passed' as const, finalResponseGuard: true,
        }),
      },
      persistence: { persist },
      // 不注入 evaluateStop：走 defaultEvaluateStop（escalated 契约阻断 stopMet 的守卫一并被验）
      log: () => {},
    } as never,
  })
  await assembly.start()
  const { runId } = await assembly.spawner!.tickNow(tickedLoop.id)
  await vi.waitFor(() => expect(assembly.graphService.getRun(runId!)?.instance.status).toBe('completed'))
  return { assembly, store, runId: runId! }
}

describe('全图 persist-failure 路由（Critical：gate 擦除 repairNeeded 死路修复）', () => {
  it('persist 恒失败：守卫回边真实重试（3 次）→ 封顶 escalated 终态 → stopMet=false，loop 不被假 completed', async () => {
    const calls: string[] = []
    const { assembly, store, runId } = await startFailGraphRun(
      makeContract('task/g1', { maxAttempts: 3 }),
      async (c) => { calls.push(c.id); return { ok: false, error: 'kanban down' } },
    )

    // 修复前：persist 只调 1 次、零重试、repairQueue 孤儿、loop 假 completed
    expect(calls).toEqual(['task/g1', 'task/g1', 'task/g1'])
    const run = assembly.graphService.getRun(runId)!
    expect(run.instance.state[CH.stopMet]).toBe(false)
    expect((await store.getContract('task/g1'))?.status).toBe('escalated')
    const persistedLoop = await store.getLoop('loop-1')
    expect(persistedLoop?.status).toBe('idle') // 非 completed：交付物未落库不得收敛
    expect(persistedLoop?.nextTickAt).not.toBeNull()
    expect(persistedLoop?.stats.tasksBlocked).toBe(1)
    const types = store.loopEvents.map(e => e.type)
    expect(types.filter(t => t === 'loop.persist-failed')).toHaveLength(3)
    expect(types).toContain('loop.escalated')
    expect(types).not.toContain('loop.completed')
    assembly.stop()
  })

  it('persist 首败后成功：每轮覆写 repairNeeded（残留 true 不空转回边），重试成功后 run 正常收敛', async () => {
    const calls: string[] = []
    const { assembly, store, runId } = await startFailGraphRun(
      makeContract('task/g2', { maxAttempts: 3 }),
      async (c) => {
        calls.push(c.id)
        return calls.length === 1 ? { ok: false, error: 'transient' } : `kanban:${c.id}`
      },
    )

    // 修复前（不覆写 repairNeeded）：成功后残留 true 空转回边，stop-check 永不执行 → loop 停 idle
    expect(calls).toEqual(['task/g2', 'task/g2'])
    const run = assembly.graphService.getRun(runId)!
    expect(run.instance.state[CH.stopMet]).toBe(true)
    expect(await store.getLoop('loop-1')).toMatchObject({ status: 'completed' })
    expect(store.loopEvents.map(e => e.type)).toContain('loop.completed')
    expect(store.loopEvents.map(e => e.type)).not.toContain('loop.escalated')
    assembly.stop()
  })
})
