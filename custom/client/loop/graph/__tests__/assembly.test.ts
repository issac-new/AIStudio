// P1 Task 7 — 生产装配：GRAPH_ENGINE 三态 / graph REST 真实化 / socket 转发 / 审批桥接
// P1 修复波（2026-09-09 终审）——装配层缺陷修复：
// C2 start() 生命周期 / C3 scheduleLoop 桥接 / C4 /graph socket 惰性绑定 /
// I7 成本断链 / I9 崩溃恢复 + running loop 自动恢复 / I10 兼容事件（spawner 侧见其专属测试）
import { describe, it, expect, vi } from 'vitest'
import { createGraphAssembly, readEngineMode, type GraphAssemblyOpts } from '../../../../server/loop/graph/graph-assembly'
import { createGraphRunRouter, resumeApprovalForContract, stampApproverIdentity, GraphSpecStore } from '../../../../server/loop/graph/graph-rest'
import { setupGraphSocketNamespace, type SocketIOLike, type SocketLike } from '../../../../server/loop/graph/graph-socket'
import { ShadowRunner, compareEventSequences } from '../../../../server/loop/graph/shadow-runner'
import { GraphService } from '../../../../server/loop/graph/graph-service'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import { GraphBuilder, fnNode } from '../../../../server/loop/graph/graph-definition'
import { reducers } from '../../../../server/loop/graph/types'
import { compileLoopToDef } from '../../../../server/loop/graph/graph-compiler'
import { appendContractsById } from '../../../../server/loop/graph/phase-nodes'
import { BudgetGuard } from '../../../../server/loop/engine/budget-guard'
import type { Router } from '@koa/router'
import type { LoopInstance, TaskContract, LoopEvent } from '../../../../server/loop/types'
import type { LoopStateStore } from '../../../../server/loop/store/state-store'
import type { GraphLogEvent } from '../../../../server/loop/graph/event-log-store'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function makeLoop(): LoopInstance {
  return {
    id: 'loop-1', name: 'L', goal: 'g', stopCondition: '', pattern: 'daily-triage',
    schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'scheduling', status: 'idle',
    autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '',
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 1, maxCostTotal: 10, killMode: 'notify', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

/** 可记录的 store mock：loops 可预置，updateLoop/appendEvent 均生效并可断言 */
function makeRecordingStore(loops: LoopInstance[] = []) {
  const byId = new Map(loops.map(l => [l.id, { ...l }]))
  const updates: Array<{ id: string; patch: Partial<LoopInstance> }> = []
  const events: LoopEvent[] = []
  const store: LoopStateStore = {
    createLoop: async (l) => { byId.set(l.id, { ...l }) },
    getLoop: async id => byId.get(id) ?? null,
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
  } as LoopStateStore
  return { store, byId, updates, events }
}

function makeStore(): LoopStateStore {
  return {
    createLoop: async () => {}, getLoop: async () => null, listLoops: async () => [],
    updateLoop: async () => {}, deleteLoop: async () => {},
    appendContract: async () => {}, getContract: async () => null,
    queryContracts: async () => [], updateContract: async () => {},
    appendVerification: async () => {},
    appendEvent: async () => {}, queryEvents: async () => [],
    detectDrift: async () => ({ hasDrift: false, details: '' }),
  } as LoopStateStore
}

function makeEngineDeps() {
  return {
    dryRun: false,
    connectors: [],
    store: makeStore(),
    worktreeManager: { create: async (c: TaskContract) => `wt-${c.id}` },
    dispatcher: { dispatch: async () => {} },
    verifier: { verify: async (c: TaskContract) => ({ contractId: c.id, results: { programmatic: [], judge: null, human: null }, overall: 'passed', finalResponseGuard: true }) },
    persistence: { persist: async (c: TaskContract) => `artifact:${c.id}` },
    log: () => {},
  }
}

function assemblyOpts(over: Partial<GraphAssemblyOpts> = {}): GraphAssemblyOpts {
  return {
    engineDeps: makeEngineDeps() as unknown as GraphAssemblyOpts['engineDeps'],
    eventLog: new InMemoryEventLogStore(),
    shadowEventLog: new InMemoryEventLogStore(),
    specStorePath: undefined,
    ...over,
  }
}

/** 直接调用 @koa/router 路由处理器（不起 HTTP 服务；actualPath 可带真实参数值） */
function patternToRegExp(pattern: string): RegExp {
  const segs = pattern.split('/').map(seg =>
    seg.startsWith(':') ? '([^/]+)' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^${segs.join('/')}/?$`)
}

function extractParams(actual: string, pattern: string): Record<string, string> {
  const params: Record<string, string> = {}
  const a = actual.split('/'), p = pattern.split('/')
  for (let i = 0; i < p.length; i++) {
    if (p[i]?.startsWith(':')) params[p[i]!.slice(1)] = a[i] ?? ''
  }
  return params
}

async function invoke(router: Router, method: 'get' | 'post', actualPath: string, body?: unknown, opts?: { state?: Record<string, unknown> }) {
  const layer = router.stack.find(l =>
    (l.methods as unknown as string[]).includes(method.toUpperCase()) && patternToRegExp(l.path).test(actualPath))
  if (!layer) throw new Error(`route not found: ${method} ${actualPath}`)
  const handler = layer.stack[layer.stack.length - 1] as (ctx: unknown) => Promise<void>
  const ctx = {
    params: extractParams(actualPath, layer.path),
    query: {},
    request: { body },
    body: undefined as unknown,
    status: 200,
    state: opts?.state ?? {},
  }
  await handler(ctx)
  return ctx
}

// ---------------------------------------------------------------------------
// readEngineMode
// ---------------------------------------------------------------------------

describe('readEngineMode', () => {
  it('defaults to legacy; accepts on/shadow; warns on garbage', () => {
    expect(readEngineMode({})).toBe('legacy')
    expect(readEngineMode({ GRAPH_ENGINE: 'legacy' })).toBe('legacy')
    expect(readEngineMode({ GRAPH_ENGINE: 'on' })).toBe('on')
    expect(readEngineMode({ GRAPH_ENGINE: 'shadow' })).toBe('shadow')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(readEngineMode({ GRAPH_ENGINE: 'bogus' })).toBe('legacy')
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })
})

// ---------------------------------------------------------------------------
// 装配三态
// ---------------------------------------------------------------------------

describe('createGraphAssembly', () => {
  it('legacy mode: REST mounted read-only, no spawner/shadow', () => {
    const a = createGraphAssembly(assemblyOpts({ mode: 'legacy' }))
    expect(a.mode).toBe('legacy')
    expect(a.spawner).toBeNull()
    expect(a.shadowRunner).toBeNull()
    expect(a.interruptScanner).toBeNull()
    expect(a.router.routes).toBeDefined()
    expect(a.router.stack.some(l => l.path === '/api/graph/runs')).toBe(true)
  })

  it('on mode: spawner wired, tick target routes to spawner', async () => {
    const a = createGraphAssembly(assemblyOpts({ mode: 'on' }))
    expect(a.spawner).not.toBeNull()
    // P2 台账 h：interrupt 超时扫描器随 on 模式装配，start/stop 可起停
    expect(a.interruptScanner).not.toBeNull()
    await a.start()
    a.stop()
    await expect(a.loopTickTarget.manualTick('nope')).resolves.toEqual(null) // loop 不存在 → null 不抛
  })

  it('shadow mode: shadow runner bound to a separate event log with dryRun deps', () => {
    const shadowLog = new InMemoryEventLogStore()
    const a = createGraphAssembly(assemblyOpts({ mode: 'shadow', shadowEventLog: shadowLog }))
    expect(a.shadowRunner).not.toBeNull()
    expect(a.shadowGraphService).not.toBeNull()
    expect(a.spawner).toBeNull()
    expect(a.interruptScanner).toBeNull() // shadow 只读双跑，不自动处置审批超时
    expect(a.briefJob).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// R1 每日 Brief 装配（Task 8）：deliver 仅在"配置房间 + 注入传输"同时成立时接线——
// 配房间但缺传输时不得把"什么都没发"记成 delivered:true（审计失真）
// ---------------------------------------------------------------------------

describe('daily brief wiring (R1)', () => {
  async function seedCompletedRun(eventLog: InMemoryEventLogStore): Promise<void> {
    const now = Date.now()
    await eventLog.append({ runId: 'run-1', graphId: 'loop-x', ts: now - 1_000, kind: 'run.started', payload: {} })
    await eventLog.append({ runId: 'run-1', graphId: 'loop-x', ts: now, kind: 'run.completed', payload: { totalCost: 0.1 } })
  }

  const briefAudit = async (eventLog: InMemoryEventLogStore) => {
    const runs = (await eventLog.listRuns()).filter(r => r.graphId === 'daily-brief')
    expect(runs).toHaveLength(1)
    const events = await eventLog.query(runs[0]!.runId)
    return events.find(e => e.kind === 'run.completed')!
  }

  it('legacy/shadow do not assemble the brief job; on mode does', () => {
    expect(createGraphAssembly(assemblyOpts({ mode: 'legacy' })).briefJob).toBeNull()
    expect(createGraphAssembly(assemblyOpts({ mode: 'shadow' })).briefJob).toBeNull()
    expect(createGraphAssembly(assemblyOpts({ mode: 'on' })).briefJob).not.toBeNull()
  })

  it('room configured WITHOUT transport: warn once at assembly, audit keeps delivered:false', async () => {
    vi.stubEnv('LOOP_BRIEF_ROOM', '!brief:example.org')
    try {
      const log = vi.fn()
      const eventLog = new InMemoryEventLogStore()
      const a = createGraphAssembly(assemblyOpts({ mode: 'on', eventLog, log }))
      expect(a.briefJob).not.toBeNull()
      expect(log).toHaveBeenCalledWith(expect.stringContaining('LOOP_BRIEF_ROOM is set but no briefDelivery transport injected'))

      await seedCompletedRun(eventLog)
      await a.briefJob!.runOnce() // 有数据日：审计必须落账，但不得记投递成功

      const done = await briefAudit(eventLog)
      expect(done.payload.delivered).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('room configured WITH transport: text goes through briefDelivery, audit delivered:true', async () => {
    vi.stubEnv('LOOP_BRIEF_ROOM', '!brief:example.org')
    try {
      const transport = vi.fn(async () => {})
      const eventLog = new InMemoryEventLogStore()
      const a = createGraphAssembly(assemblyOpts({ mode: 'on', eventLog, briefDelivery: transport }))
      expect(a.briefJob).not.toBeNull()

      await seedCompletedRun(eventLog)
      await a.briefJob!.runOnce()

      expect(transport).toHaveBeenCalledTimes(1)
      expect(transport.mock.calls[0]![0]).toBe('!brief:example.org')
      expect(typeof transport.mock.calls[0]![1]).toBe('string')
      const done = await briefAudit(eventLog)
      expect(done.payload.delivered).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

// ---------------------------------------------------------------------------
// graph REST（handlers 直接调用）
// ---------------------------------------------------------------------------

describe('graph REST run lifecycle', () => {
  it('lists runs, returns detail, replays events', async () => {
    const eventLog = new InMemoryEventLogStore()
    const service = new GraphService({ eventLog })
    service.registerGraph(new GraphBuilder('g1', 'G')
      .addChannel('x', { reducer: reducers.overwrite(), default: 0 })
      .addNode(fnNode('a', async () => ({ end: true }))).setEntry('a').build())
    const { runId } = await service.startRun('g1')

    const router = createGraphRunRouter({ graphService: service, eventLog })

    const list = await invoke(router, 'get', '/api/graph/runs')
    expect((list.body as { runs: Array<{ runId: string }> }).runs.map(r => r.runId)).toEqual([runId])

    const detail = await invoke(router, 'get', `/api/graph/runs/${runId}`, undefined)
    expect(((detail.body as { instance: { status: string } }).instance).status).toBe('completed')

    const replay = await invoke(router, 'get', `/api/graph/runs/${runId}/replay`)
    expect((replay.body as { events: GraphLogEvent[] }).events.length).toBeGreaterThan(0)
  })

  it('resume endpoint answers an interrupt and completes the run (HITL closed loop)', async () => {
    const eventLog = new InMemoryEventLogStore()
    const service = new GraphService({ eventLog })
    service.registerGraph(new GraphBuilder('hitl', 'H')
      .addChannel('steps', { reducer: reducers.append<string>(), default: [] })
      .addNode(fnNode('gate', async (state) => {
        if (state['__resume:approval:task/x'] !== undefined) return { goto: ['finish'] }
        return { interrupt: { id: 'approval:task/x', value: { contractId: 'task/x' } }, goto: ['gate'] }
      }))
      .addNode(fnNode('finish', async (s) => ({ update: { steps: [String(s['__resume:approval:task/x'])] }, end: true })))
      .setEntry('gate').addEdge('gate', 'finish').build())
    const { runId, instance } = await service.startRun('hitl')
    expect(instance.status).toBe('awaiting-input')

    const router = createGraphRunRouter({ graphService: service, eventLog })
    const ctx = await invoke(router, 'post', `/api/graph/runs/${runId}/resume`, { interruptId: 'approval:task/x', value: 'approved' })
    expect(ctx.status).toBe(200)
    expect((ctx.body as { instance: { status: string } }).instance.status).toBe('completed')
    expect(((ctx.body as { instance: { state: { steps: string[] } } }).instance).state.steps).toEqual(['approved'])
  })

  it('fork endpoint derives a new runId from the latest checkpoint', async () => {
    const eventLog = new InMemoryEventLogStore()
    const service = new GraphService({ eventLog })
    service.registerGraph(new GraphBuilder('g', 'G')
      .addChannel('x', { reducer: reducers.overwrite(), default: 0 })
      .addNode(fnNode('gate', async () => ({ interrupt: { id: 'i1', value: {} }, goto: ['gate'] })))
      .addNode(fnNode('done', async () => ({ end: true })))
      .setEntry('gate').addEdge('gate', 'done').build())
    const { runId } = await service.startRun('g')

    const router = createGraphRunRouter({ graphService: service, eventLog })
    const ctx = await invoke(router, 'post', `/api/graph/runs/${runId}/fork`, {})
    expect(ctx.status).toBe(200)
    expect((ctx.body as { forkedFrom: string }).forkedFrom).toBe(runId)
    expect((ctx.body as { runId: string }).runId).not.toBe(runId)
  })

  it('resume endpoint overrides the client-reported approver with the authenticated user (审查 #1)', async () => {
    const eventLog = new InMemoryEventLogStore()
    const service = new GraphService({ eventLog })
    service.registerGraph(new GraphBuilder('hitl-rest', 'H')
      .addChannel('decision', { reducer: reducers.overwrite(), default: '' })
      .addNode(fnNode('gate', async (state) => {
        const v = state['__resume:approval:task/r']
        if (v !== undefined) return { goto: ['finish'], update: { decision: JSON.stringify(v) } }
        return { interrupt: { id: 'approval:task/r', value: {} }, goto: ['gate'] }
      }))
      .addNode(fnNode('finish', async () => ({ end: true })))
      .setEntry('gate').addEdge('gate', 'finish').build())
    const { runId } = await service.startRun('hitl-rest')

    const router = createGraphRunRouter({ graphService: service, eventLog })
    const ctx = await invoke(router, 'post', `/api/graph/runs/${runId}/resume`,
      { interruptId: 'approval:task/r', value: { decision: 'approved', approver: 'mallory' } },
      { state: { user: { username: 'alice', role: 'user' } } })
    expect(ctx.status).toBe(200)
    await vi.waitFor(() => expect(service.getRun(runId)?.instance.status).toBe('completed'))
    const decision = (service.getRun(runId)?.instance.state as { decision?: string }).decision ?? ''
    // 客户端自报的 mallory 被认证主体 alice 覆盖
    expect(JSON.parse(decision)).toEqual({ decision: 'approved', approver: 'alice' })
  })

  it('specs endpoints persist and list GraphSpecs (台账 i)', async () => {
    const specStore = new GraphSpecStore()
    const router = createGraphRunRouter({
      graphService: new GraphService({ eventLog: new InMemoryEventLogStore() }),
      eventLog: new InMemoryEventLogStore(),
      specStore,
    })
    await invoke(router, 'post', '/api/graph/specs', {
      id: 'spec-1', version: 1, channels: {}, nodes: [], edges: [], entryNode: 'a',
      limits: { maxSteps: 10 },
    })
    const list = await invoke(router, 'get', '/api/graph/specs')
    expect((list.body as { specs: Array<{ id: string }> }).specs.map(s => s.id)).toEqual(['spec-1'])
  })
})

// ---------------------------------------------------------------------------
// 审批桥接
// ---------------------------------------------------------------------------

describe('resumeApprovalForContract', () => {
  it('maps contract id → pendingInterrupt approval:<id> → resume (old endpoint bridge)', async () => {
    const eventLog = new InMemoryEventLogStore()
    const service = new GraphService({ eventLog })
    service.registerGraph(new GraphBuilder('hitl', 'H')
      .addChannel('done', { reducer: reducers.overwrite(), default: '' })
      .addNode(fnNode('gate', async (state) => {
        if (state['__resume:approval:task/y'] !== undefined) return { goto: ['finish'] }
        return { interrupt: { id: 'approval:task/y', value: {} }, goto: ['gate'] }
      }))
      .addNode(fnNode('finish', async (s) => ({ update: { done: String(s['__resume:approval:task/y']) }, end: true })))
      .setEntry('gate').addEdge('gate', 'finish').build())
    const { runId } = await service.startRun('hitl')

    const result = await resumeApprovalForContract({ graphService: service, eventLog }, 'task/y', 'approved')
    expect(result).toEqual({ ok: true, runId })
    expect(service.getRun(runId)?.instance.status).toBe('completed')
  })

  it('returns ok:false when no pending approval interrupt exists', async () => {
    const eventLog = new InMemoryEventLogStore()
    const result = await resumeApprovalForContract(
      { graphService: new GraphService({ eventLog }), eventLog }, 'task/none', 'approved')
    expect(result.ok).toBe(false)
  })

  it('forwards the authenticated approver as the resume decision value (审查 #1)', async () => {
    const eventLog = new InMemoryEventLogStore()
    const service = new GraphService({ eventLog })
    service.registerGraph(new GraphBuilder('hitl-approver', 'H')
      .addChannel('decision', { reducer: reducers.overwrite(), default: '' })
      .addNode(fnNode('gate', async (state) => {
        const v = state['__resume:approval:task/z']
        if (v !== undefined) return { goto: ['finish'], update: { decision: JSON.stringify(v) } }
        return { interrupt: { id: 'approval:task/z', value: {} }, goto: ['gate'] }
      }))
      .addNode(fnNode('finish', async () => ({ end: true })))
      .setEntry('gate').addEdge('gate', 'finish').build())
    const { runId } = await service.startRun('hitl-approver')

    const result = await resumeApprovalForContract(
      { graphService: service, eventLog }, 'task/z', 'approved', 'alice')
    expect(result).toEqual({ ok: true, runId })
    await vi.waitFor(() => expect(service.getRun(runId)?.instance.status).toBe('completed'))
    const decision = (service.getRun(runId)?.instance.state as { decision?: string }).decision ?? ''
    expect(JSON.parse(decision)).toEqual({ decision: 'approved', approver: 'alice' })
  })
})

// ---------------------------------------------------------------------------
// 审批身份盖章（2026-09-10 风险审查 #1）
// ---------------------------------------------------------------------------

describe('stampApproverIdentity', () => {
  it('wraps primitive decisions and overwrites self-reported approver', () => {
    expect(stampApproverIdentity(true, 'alice')).toEqual({ decision: 'approved', approver: 'alice' })
    expect(stampApproverIdentity('rejected', 'alice')).toEqual({ decision: 'rejected', approver: 'alice' })
    expect(stampApproverIdentity({ decision: 'approved', approver: 'mallory' }, 'alice'))
      .toEqual({ decision: 'approved', approver: 'alice' })
    expect(stampApproverIdentity({ approved: true }, 'alice'))
      .toEqual({ approved: true, approver: 'alice' })
  })

  it('stamps every entry of a bulk decisions array; leaves non-decision payloads untouched', () => {
    expect(stampApproverIdentity(
      { decisions: [{ decision: 'approved', approver: 'a' }, { decision: 'approved', approver: 'b' }] }, 'alice'))
      .toEqual({ decisions: [{ decision: 'approved', approver: 'alice' }, { decision: 'approved', approver: 'alice' }] })
    const payload = { timeout: { ms: 1000, onTimeout: 'escalate' }, loopId: 'l1' }
    expect(stampApproverIdentity(payload, 'alice')).toBe(payload)
    expect(stampApproverIdentity(null, 'alice')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// socket 转发
// ---------------------------------------------------------------------------

describe('graph socket namespace', () => {
  it('fans service events out to run:<runId> rooms; subscribe replays history', async () => {
    const eventLog = new InMemoryEventLogStore()
    const service = new GraphService({ eventLog })

    const rooms = new Map<string, Array<{ event: string; payload: unknown }>>()
    const sockets: SocketLike[] = []
    const io: SocketIOLike = {
      of: () => ({
        on: (_e, listener) => {
          const socket: SocketLike = {
            on: (event, cb) => {
              if (event === 'subscribe') (cb as (runId: string) => void)('run-1')
            },
            join: () => {}, leave: () => {},
            emit: (event, payload) => {
              const list = rooms.get('socket') ?? []
              list.push({ event, payload })
              rooms.set('socket', list)
            },
          }
          sockets.push(socket)
          listener(socket)
        },
        to: (room: string) => ({
          emit: (event: string, payload: unknown) => {
            const list = rooms.get(room) ?? []
            list.push({ event, payload })
            rooms.set(room, list)
          },
        }),
      }),
    }

    setupGraphSocketNamespace(io, service, eventLog)

    service.registerGraph(new GraphBuilder('g', 'G')
      .addChannel('x', { reducer: reducers.overwrite(), default: 0 })
      .addNode(fnNode('a', async () => ({ end: true }))).setEntry('a').build())
    const { runId } = await service.startRun('g')

    await new Promise(r => setImmediate(r))
    const runRoom = rooms.get(`run:${runId}`) ?? []
    expect(runRoom.length).toBeGreaterThan(0)
    expect(runRoom.every(e => e.event === 'graph:event')).toBe(true)
    // 订阅回放（graph:history）在连接时发出
    expect((rooms.get('socket') ?? []).some(e => e.event === 'graph:history')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// shadow 对比规则
// ---------------------------------------------------------------------------

describe('compareEventSequences', () => {
  it('matches identical legacy/shadow sequences at 100% (ts-insensitive)', () => {
    const legacyEvents: LoopEvent[] = [
      { type: 'loop.created', loop: {} as never, ts: '1' },
      { type: 'loop.task-discovered', loopId: 'l', contract: {} as never, ts: '2' },
      { type: 'loop.task-handed-off', loopId: 'l', contractId: 'task/a', worktreeId: 'wt', ts: '3' },
      { type: 'loop.verification-complete', contractId: 'task/a', passed: true, ts: '4' },
      { type: 'loop.persisted', loopId: 'l', contractId: 'task/a', artifact: 'x', ts: '5' },
      { type: 'loop.completed', loopId: 'l', finalStats: {} as never, ts: '6' },
    ]
    const shadowEvents: GraphLogEvent[] = [
      { seq: 1, runId: 'r', graphId: 'g', ts: 1, kind: 'run.started' },
      { seq: 2, runId: 'r', graphId: 'g', ts: 2, kind: 'node.completed', nodeId: 'discovery' },
      { seq: 3, runId: 'r', graphId: 'g', ts: 3, kind: 'node.completed', nodeId: 'handoff' },
      { seq: 4, runId: 'r', graphId: 'g', ts: 4, kind: 'node.completed', nodeId: 'validation' },
      { seq: 5, runId: 'r', graphId: 'g', ts: 5, kind: 'node.completed', nodeId: 'persistence' },
      { seq: 6, runId: 'r', graphId: 'g', ts: 6, kind: 'run.completed' },
    ]
    const result = compareEventSequences(legacyEvents, shadowEvents, 'l')
    expect(result.matchRate).toBe(1)
  })

  it('penalizes missing shadow nodes', () => {
    const legacyEvents: LoopEvent[] = [
      { type: 'loop.created', loop: {} as never, ts: '1' },
      { type: 'loop.task-discovered', loopId: 'l', contract: {} as never, ts: '2' },
      { type: 'loop.completed', loopId: 'l', finalStats: {} as never, ts: '3' },
    ]
    const shadowEvents: GraphLogEvent[] = [
      { seq: 1, runId: 'r', graphId: 'g', ts: 1, kind: 'run.completed' },
    ]
    const result = compareEventSequences(legacyEvents, shadowEvents, 'l')
    expect(result.matchRate).toBeLessThan(1)
  })
})

// ---------------------------------------------------------------------------
// 修复波 C1 — 路由面契约（patch 202 挂载 graphAssembly.router 所依赖的最小面）
// patch 侧挂载由 git apply --check / inject 门禁验证；此处钉住路由形状
// ---------------------------------------------------------------------------

describe('graph REST surface contract (C1)', () => {
  it('router exposes runs CRUD/resume/fork/replay + specs', () => {
    const a = createGraphAssembly(assemblyOpts({ mode: 'legacy' }))
    const paths = a.router.stack.map(l => l.path)
    expect(paths).toContain('/api/graph/runs')
    expect(paths).toContain('/api/graph/runs/:id')
    expect(paths).toContain('/api/graph/runs/:id/resume')
    expect(paths).toContain('/api/graph/runs/:id/fork')
    expect(paths).toContain('/api/graph/runs/:id/replay')
    expect(paths).toContain('/api/graph/specs')
  })
})

// ---------------------------------------------------------------------------
// 修复波 C4 — /graph namespace 惰性绑定（routes.ts 模块加载时 io 必为 null）
// ---------------------------------------------------------------------------

function makeIOLike() {
  const rooms = new Map<string, Array<{ event: string; payload: unknown }>>()
  const io: SocketIOLike = {
    of: () => ({
      on: (_e, listener) => {
        listener({ on: () => {}, join: () => {}, leave: () => {}, emit: () => {} })
      },
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          const list = rooms.get(room) ?? []
          list.push({ event, payload })
          rooms.set(room, list)
        },
      }),
    }),
  }
  return { io, rooms }
}

describe('graph socket lazy binding (C4)', () => {
  it('binds lazily once the io factory starts returning an instance', async () => {
    let ioInstance: SocketIOLike | null = null
    const a = createGraphAssembly(assemblyOpts({
      mode: 'legacy',
      io: () => ioInstance,
      socketRetryMs: 1,
      socketRetryMax: 50,
    }))
    // 模块加载期 getGroupChatServer() 尚为 null → 首次绑定必然失败，进入重试
    expect(a.socketConnected()).toBe(false)
    ioInstance = makeIOLike().io
    await vi.waitFor(() => expect(a.socketConnected()).toBe(true))
    a.stop()
  })

  it('caps retries and warns exactly once via the assembly log channel', async () => {
    const log = vi.fn()
    const a = createGraphAssembly(assemblyOpts({
      io: () => null,
      socketRetryMs: 1,
      socketRetryMax: 3,
      log,
    }))
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith(expect.stringContaining('not bound after 3 retries')))
    expect(log.mock.calls.filter(c => String(c[0]).includes('not bound'))).toHaveLength(1)
    a.stop()
  })
})

// ---------------------------------------------------------------------------
// 修复波 C3 — scheduleLoop 桥接（on 模式下 controllers/loop.ts 创建/更新 loop 后调用）
// ---------------------------------------------------------------------------

function cronSchedule(): LoopInstance['schedule'] {
  return { mode: 'cron', cron: '*/5 * * * *', timezone: 'UTC' }
}

/** 永不停机谓词：stopMet channel 恒 false → run 结束后 idle + 重排（区别于空串停机条件的启发式兜底） */
const NEVER_STOP = JSON.stringify({ op: 'truthy', path: 'stopMet' })

describe('loopTickTarget.scheduleLoop (C3)', () => {
  function onAssembly(rec: ReturnType<typeof makeRecordingStore>) {
    return createGraphAssembly(assemblyOpts({
      mode: 'on',
      engineDeps: { ...makeEngineDeps(), store: rec.store } as unknown as GraphAssemblyOpts['engineDeps'],
    }))
  }

  it('ticks a due idle loop immediately (scheduleLoop → spawner.tickNow)', async () => {
    const loop = makeLoop()
    loop.stopCondition = NEVER_STOP
    loop.schedule = cronSchedule()
    loop.nextTickAt = new Date(Date.now() - 60_000).toISOString()
    const rec = makeRecordingStore([loop])
    const a = onAssembly(rec)
    a.loopTickTarget.scheduleLoop(loop)
    // run 全链路（discovery 空 → stop-check end）→ 回 idle + 重排 + 迭代数 +1
    await vi.waitFor(() => {
      const cur = rec.byId.get('loop-1')!
      expect(cur.status).toBe('idle')
      expect(cur.stats.currentIteration).toBe(1)
      expect(new Date(cur.nextTickAt!).getTime()).toBeGreaterThan(Date.now())
    })
    expect(rec.updates.some(u => u.patch.status === 'running')).toBe(true)
    a.stop()
  })

  it('ignores manual schedule, future nextTickAt and non-idle loops', async () => {
    const manual = makeLoop()
    const future = makeLoop(); future.id = 'future'
    future.schedule = cronSchedule()
    future.nextTickAt = new Date(Date.now() + 3600_000).toISOString()
    const running = makeLoop(); running.id = 'running'
    running.schedule = cronSchedule()
    running.nextTickAt = new Date(Date.now() - 60_000).toISOString()
    running.status = 'running'
    const rec = makeRecordingStore([manual, future, running])
    const a = onAssembly(rec)
    a.loopTickTarget.scheduleLoop(manual)
    a.loopTickTarget.scheduleLoop(future)
    a.loopTickTarget.scheduleLoop(running)
    await new Promise(r => setTimeout(r, 20))
    expect(rec.updates).toHaveLength(0)
    a.stop()
  })
})

// ---------------------------------------------------------------------------
// P2 Task 1 — 台账①②：cron loop 自启 + socket 事件补试
// ---------------------------------------------------------------------------

describe('P2 调度收尾（台账①②）', () => {
  function onAssembly(rec: ReturnType<typeof makeRecordingStore>, over: Partial<GraphAssemblyOpts> = {}) {
    return createGraphAssembly(assemblyOpts({
      mode: 'on',
      engineDeps: { ...makeEngineDeps(), store: rec.store } as unknown as GraphAssemblyOpts['engineDeps'],
      ...over,
    }))
  }

  it('台账①: scheduleLoop arms a brand-new cron loop — computes first nextTickAt, persists it, poll fires the first run', async () => {
    const loop = makeLoop()
    loop.stopCondition = NEVER_STOP
    loop.schedule = cronSchedule() // */5 * * * * —— computeNextTick 必给未来时间
    loop.nextTickAt = null // 新建 loop 从未 tick 过
    const rec = makeRecordingStore([loop])
    const a = onAssembly(rec)

    a.loopTickTarget.scheduleLoop(loop)

    // 首次时间落库（经 store 写回）
    await vi.waitFor(() => expect(rec.byId.get('loop-1')!.nextTickAt).not.toBeNull())
    const armed = new Date(rec.byId.get('loop-1')!.nextTickAt!).getTime()
    expect(armed).toBeGreaterThan(Date.now())

    // 到期后 poll 周期内触发首 run：跑完回 idle、迭代 +1
    rec.byId.get('loop-1')!.nextTickAt = new Date(Date.now() - 1_000).toISOString()
    await a.spawner!.poll()
    await vi.waitFor(() => {
      const cur = rec.byId.get('loop-1')!
      expect(cur.status).toBe('idle')
      expect(cur.stats.currentIteration).toBe(1)
    })
    a.stop()
  })

  it('台账②: a loop event retries the /graph socket binding after scheduled retries gave up (C4 补试)', async () => {
    let ioInstance: SocketIOLike | null = null
    const loop = makeLoop()
    loop.stopCondition = NEVER_STOP
    loop.schedule = cronSchedule()
    loop.nextTickAt = new Date(Date.now() - 60_000).toISOString() // 已到期 → scheduleLoop 立即起 run
    const rec = makeRecordingStore([loop])
    const a = onAssembly(rec, {
      io: () => ioInstance,
      socketRetryMs: 60_000, // 定时重试窗口拉满——本次绑定只能靠事件补试
      socketRetryMax: 1,
    })
    expect(a.socketConnected()).toBe(false)

    ioInstance = makeIOLike().io
    a.loopTickTarget.scheduleLoop(loop) // run 结束 → loop.tick-complete 经 bridgeLoopEvent 出站 → 补试绑定

    await vi.waitFor(() => expect(a.socketConnected()).toBe(true))
    a.stop()
  })
})

// ---------------------------------------------------------------------------
// 修复波 C2 + I9 — start()：注册表重建 + running loop 孤儿恢复 + 轮询启动
// ---------------------------------------------------------------------------

describe('assembly start(): crash recovery (C2/I9)', () => {
  function onAssembly(rec: ReturnType<typeof makeRecordingStore>, over: Partial<GraphAssemblyOpts> = {}) {
    return createGraphAssembly(assemblyOpts({
      mode: 'on',
      engineDeps: { ...makeEngineDeps(), store: rec.store } as unknown as GraphAssemblyOpts['engineDeps'],
      ...over,
    }))
  }

  it('rebuilds the run registry, rewrites stale running loops to paused and arms auto-resume', async () => {
    const loop = makeLoop()
    loop.status = 'running'
    loop.stopCondition = NEVER_STOP
    loop.schedule = cronSchedule()
    const rec = makeRecordingStore([loop])
    const eventLog = new InMemoryEventLogStore()
    await eventLog.append({ runId: 'run-loop-loop-1-7', graphId: 'loop-loop-1', ts: 1, kind: 'run.started', payload: {} })
    const a = onAssembly(rec, { eventLog })
    await a.start()

    // 注册表重建：重启前的 run 重新可查（awaiting-input 的仍可 resume）
    expect(a.graphService.getRun('run-loop-loop-1-7')).not.toBeNull()
    // 崩溃孤儿：running → paused + 过期 nextTickAt（恢复标记）+ restart-recovery 台账事件
    const recovered = rec.byId.get('loop-1')!
    expect(recovered.status).toBe('paused')
    expect(new Date(recovered.nextTickAt!).getTime()).toBeLessThanOrEqual(Date.now())
    expect(rec.events.some(e =>
      e.type === 'loop.stuck' && String((e as { reason?: string }).reason).includes('restart-recovery'))).toBe(true)

    // spawner 轮询命中白名单 → 自动恢复触发一次，跑完回 idle + 重排
    await a.spawner!.poll()
    await vi.waitFor(() => {
      const cur = rec.byId.get('loop-1')!
      expect(cur.status).toBe('idle')
      expect(new Date(cur.nextTickAt!).getTime()).toBeGreaterThan(Date.now())
    })
    // 白名单一次性：loop 已 idle，重复 poll 不再触发（无新迭代）
    const iterations = rec.byId.get('loop-1')!.stats.currentIteration
    await a.spawner!.poll()
    await new Promise(r => setTimeout(r, 20))
    expect(rec.byId.get('loop-1')!.stats.currentIteration).toBe(iterations)
    a.stop()
  })

  it('never auto-resumes user-paused loops (absent from the recovery whitelist)', async () => {
    const loop = makeLoop()
    loop.status = 'paused'
    loop.schedule = cronSchedule()
    loop.nextTickAt = new Date(Date.now() - 60_000).toISOString()
    const rec = makeRecordingStore([loop])
    const a = onAssembly(rec)
    await a.start()
    await a.spawner!.poll()
    await new Promise(r => setTimeout(r, 20))
    expect(rec.byId.get('loop-1')!.status).toBe('paused')
    expect(rec.updates.filter(u => u.id === 'loop-1')).toHaveLength(0)
    a.stop()
  })

  it('is idempotent: a second start() neither re-rebuilds nor re-arms recovery', async () => {
    const loop = makeLoop()
    loop.status = 'running'
    const rec = makeRecordingStore([loop])
    const a = onAssembly(rec)
    await a.start()
    const stuckCount = rec.events.filter(e => e.type === 'loop.stuck').length
    await a.start()
    expect(rec.events.filter(e => e.type === 'loop.stuck')).toHaveLength(stuckCount)
    a.stop()
  })
})

// ---------------------------------------------------------------------------
// 修复波 I7 — 成本断链闭合：phase 节点 → recordCost → run 累计 + cost.recorded 事件日志
// ---------------------------------------------------------------------------

describe('cost wiring (I7)', () => {
  it('streams phase-node cost into the run: recordCost calls, cost.recorded events, totalCost', async () => {
    const eventLog = new InMemoryEventLogStore()
    const costs: number[] = []
    const service = new GraphService({ eventLog, deps: { recordCost: (n: number) => costs.push(n) } })
    const def = compileLoopToDef(makeLoop(), makeEngineDeps() as never, { appendById: appendContractsById })
    service.registerGraph(def)
    const { runId } = await service.startRun(def.id)

    const tier = new BudgetGuard(() => {}).estimateTickCost(makeLoop())
    expect(costs.length).toBeGreaterThanOrEqual(1) // discovery 至少计费一次
    expect(costs.every(c => c === tier)).toBe(true) // 档位单一事实源 = BudgetGuard.estimateTickCost
    const events = await eventLog.query(runId)
    expect(events.some(e => e.kind === 'cost.recorded')).toBe(true)
    expect(service.getRun(runId)!.instance.totalCost).toBe(tier * costs.length)
  })
})
