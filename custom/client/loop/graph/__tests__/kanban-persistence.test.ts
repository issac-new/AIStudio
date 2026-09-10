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

  it('真实写入：createTask 带 title `[loop.name] contract.id` + board/body/tenant，产物为 kanban:<id>', async () => {
    const kanban = makeKanbanCli()
    const adapter = makeAdapter(kanban, 'team-board')
    const l = { ...loop(), tenant: 'Team Alpha:topic:@u:!room:$sess:matrix' } as unknown as LoopInstance
    const result = await adapter.persist(contract(), verification(), l, false)
    expect(result).toBe('kanban:kb-new')
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

  it('幂等：同契约重复 persist 命中同名 title → 跳过 createTask + warn，返回既有任务', async () => {
    const kanban = makeKanbanCli({ existing: [{ id: 'kb-9', title: '[L] task/a' }] })
    const logs: string[] = []
    const adapter = makeAdapter(kanban, 'team-board', logs)
    const result = await adapter.persist(contract(), verification(), loop(), false)
    expect(result).toBe('kanban:kb-9')
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
  const deps: PhaseNodeDeps = {
    dryRun: false,
    connectors: [],
    store: {
      createLoop: async () => {}, getLoop: async () => null, listLoops: async () => [],
      updateLoop: async (id, patch) => { updatedLoops.push({ id, patch }) }, deleteLoop: async () => {},
      appendContract: async () => {}, getContract: async () => null, queryContracts: async () => [],
      updateContract: async () => {}, appendVerification: async () => {}, appendEvent: async () => {},
      queryEvents: async () => [], detectDrift: async () => ({ hasDrift: false, details: '' }),
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
  return { deps, ctx, graphEvents, updatedLoops, logs }
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
    // 未标 persisted：repair 回边后 persistence 节点可重试
    expect(update[CH.phaseProgress]).toBeUndefined()

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
    expect(progress).toEqual([expect.objectContaining({ kind: 'persisted', contractId: 'task/b' })])
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
})
