// P1 Task 7 — 生产装配：GRAPH_ENGINE 三态 / graph REST 真实化 / socket 转发 / 审批桥接
import { describe, it, expect, vi } from 'vitest'
import { createGraphAssembly, readEngineMode, type GraphAssemblyOpts } from '../../../../server/loop/graph/graph-assembly'
import { createGraphRunRouter, resumeApprovalForContract, GraphSpecStore } from '../../../../server/loop/graph/graph-rest'
import { setupGraphSocketNamespace, type SocketIOLike, type SocketLike } from '../../../../server/loop/graph/graph-socket'
import { ShadowRunner, compareEventSequences } from '../../../../server/loop/graph/shadow-runner'
import { GraphService } from '../../../../server/loop/graph/graph-service'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import { GraphBuilder, fnNode } from '../../../../server/loop/graph/graph-definition'
import { reducers } from '../../../../server/loop/graph/types'
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

async function invoke(router: Router, method: 'get' | 'post', actualPath: string, body?: unknown) {
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
    expect(a.router.routes).toBeDefined()
    expect(a.router.stack.some(l => l.path === '/api/graph/runs')).toBe(true)
  })

  it('on mode: spawner wired, tick target routes to spawner', () => {
    const a = createGraphAssembly(assemblyOpts({ mode: 'on' }))
    expect(a.spawner).not.toBeNull()
    expect(a.loopTickTarget.manualTick('nope')).resolves.toEqual(null) // loop 不存在 → null 不抛
  })

  it('shadow mode: shadow runner bound to a separate event log with dryRun deps', () => {
    const shadowLog = new InMemoryEventLogStore()
    const a = createGraphAssembly(assemblyOpts({ mode: 'shadow', shadowEventLog: shadowLog }))
    expect(a.shadowRunner).not.toBeNull()
    expect(a.shadowGraphService).not.toBeNull()
    expect(a.spawner).toBeNull()
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
