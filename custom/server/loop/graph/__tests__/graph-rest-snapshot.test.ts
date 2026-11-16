// Task 6：REST 快照投影、Director 当前请求身份与装配 loader 的注册表边界。
import { describe, expect, it, vi } from 'vitest'
import type { Router } from '@koa/router'
import { createGraphRunRouter, GraphSpecStore } from '../graph-rest'
import { GraphService, type GraphDefinitionContext } from '../graph-service'
import { InMemoryEventLogStore } from '../event-log-store'
import { CustomSpecRuntime } from '../spec-runtime'
import { createSpecRuntimeRegistry } from '../spec-runtime'
import type { GraphSpec } from '../graph-spec'
import { GraphBuilder, fnNode } from '../graph-definition'
import { reducers } from '../types'
import type { StoredGraphRunSpec } from '../run-spec-snapshot'
import { createGraphAssembly, type GraphAssemblyOpts } from '../graph-assembly'
import { registerSimulationNodeTypes } from '../../../graph/node-executors'
import type { LoopStateStore } from '../../store/state-store'
import type { TaskContract } from '../../types'

function functionSpec(id: string, description = 'snapshot-v1'): GraphSpec {
  return {
    id, version: 1, origin: 'editor', description,
    channels: {
      result: { reducer: 'overwrite', default: '' },
      stopMet: { reducer: 'overwrite', default: false },
    },
    nodes: [{ id: 'only', type: 'function', config: { set: { result: description, stopMet: true } } }],
    edges: [], entryNode: 'only',
    endCondition: { op: 'truthy', path: 'stopMet' },
    limits: { maxSteps: 4 },
  }
}

function approvalSpec(id: string): GraphSpec {
  return {
    id, version: 1, origin: 'editor',
    channels: {
      approvalResult: { reducer: 'append', default: [] },
      result: { reducer: 'overwrite', default: '' },
      stopMet: { reducer: 'overwrite', default: false },
    },
    nodes: [
      {
        id: 'approval', type: 'human',
        config: { approvals: { policy: 'any', approvers: ['director-user'], onReject: 'fail' } },
      },
      { id: 'done', type: 'function', config: { set: { result: 'done', stopMet: true } } },
    ],
    edges: [{ from: 'approval', to: 'done' }], entryNode: 'approval',
    endCondition: { op: 'truthy', path: 'stopMet' },
    limits: { maxSteps: 6 },
  }
}

function runtimeFor(
  kind: 'editor' | 'director',
  specStore: GraphSpecStore,
  graphService: GraphService,
): CustomSpecRuntime {
  const registry = createSpecRuntimeRegistry()
  if (kind === 'director') registerSimulationNodeTypes(registry, { allowDryRun: false })
  return new CustomSpecRuntime({
    specStore, graphService, registry, runtimeKind: kind,
    capabilities: { gateCatalog: [], hasRealKanbanBridge: false, executionMode: 'production' },
  })
}

function snapshotMeta(row: StoredGraphRunSpec) {
  return {
    specId: row.specId,
    revision: null,
    draftVersion: row.draftVersion,
    runtimeKind: row.runtimeKind,
    executionMode: row.executionMode,
    contentHash: row.contentHash,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  }
}

function legacyDefinition(id: string) {
  return new GraphBuilder(id, id)
    .addChannel('result', { reducer: reducers.overwrite(), default: '' })
    .addChannel('stopMet', { reducer: reducers.overwrite(), default: false })
    .addNode(fnNode('only', async () => ({ update: { result: 'legacy', stopMet: true }, end: true })))
    .setEntry('only').build()
}

function legacyAwaitingDefinition(id: string) {
  return new GraphBuilder(id, id)
    .addNode(fnNode('gate', async (state) => {
      if (state['__resume:legacy-i'] !== undefined) return { end: true }
      return { interrupt: { id: 'legacy-i', value: {} }, goto: ['gate'] }
    }))
    .setEntry('gate').build()
}

async function invoke(
  router: Router,
  method: 'get' | 'post',
  path: string,
  body?: unknown,
  opts: {
    state?: Record<string, unknown>
    headers?: Record<string, string>
    query?: Record<string, string>
  } = {},
) {
  const layer = router.stack.find(candidate => {
    const methods = candidate.methods as unknown as string[]
    if (!methods.includes(method.toUpperCase())) return false
    const names: string[] = []
    const pattern = candidate.path.replace(/:([^/]+)/g, (_match, name: string) => {
      names.push(name)
      return '([^/]+)'
    })
    const match = new RegExp(`^${pattern}/?$`).exec(path)
    if (!match) return false
    ;(candidate as unknown as { __params?: Record<string, string> }).__params =
      Object.fromEntries(names.map((name, index) => [name, match[index + 1] ?? '']))
    return true
  })
  if (!layer) throw new Error(`route not found: ${method} ${path}`)
  const handler = layer.stack[layer.stack.length - 1] as (ctx: unknown) => Promise<void>
  const responseHeaders: Record<string, string> = {}
  const ctx = {
    params: (layer as unknown as { __params?: Record<string, string> }).__params ?? {},
    query: opts.query ?? {},
    request: { body },
    body: undefined as any,
    status: 200,
    state: opts.state ?? {},
    headers: opts.headers ?? {},
    set: (key: string, value: string) => { responseHeaders[key] = value },
  }
  await handler(ctx)
  return { ctx, responseHeaders }
}

describe('REST run 快照投影', () => {
  it('pinned 详情/导出/沉淀只读起跑快照，草稿改版不混入', async () => {
    const eventLog = new InMemoryEventLogStore()
    const specStore = new GraphSpecStore(eventLog)
    const graphService = new GraphService({ eventLog })
    const runtime = runtimeFor('editor', specStore, graphService)
    const original = functionSpec('pinned-spec', 'snapshot-v1')
    await specStore.save(original)
    const { runId } = await runtime.startRun(original.id)
    await specStore.save({
      ...functionSpec('pinned-spec', 'current-draft-v2'),
      version: 2,
    })
    const router = createGraphRunRouter({ graphService, eventLog, specStore })
    const stored = await eventLog.getRunSpec(runId)
    expect(stored).not.toBeNull()

    const detail = await invoke(router, 'get', `/api/graph/runs/${runId}`)
    expect(detail.ctx.body.specSource).toBe('run-snapshot')
    expect(detail.ctx.body.specSnapshot).toMatchObject({
      specId: original.id,
      runtimeKind: 'editor',
      contentHash: stored!.contentHash,
    })

    const exported = await invoke(router, 'get', `/api/graph/runs/${runId}/export`)
    expect(exported.ctx.status).toBe(200)
    expect(exported.ctx.body.specSource).toBe('run-snapshot')
    expect(exported.ctx.body.specSnapshot).toMatchObject({ contentHash: stored!.contentHash })
    expect(exported.ctx.body.spec).toMatchObject({
      id: original.id,
      version: 1,
      description: 'snapshot-v1',
      nodes: [{ id: 'only', type: 'function', config: { set: { result: 'snapshot-v1', stopMet: true } } }],
    })

    const deposited = await invoke(router, 'post', `/api/graph/runs/${runId}/deposit-template`, {})
    expect(deposited.ctx.status).toBe(200)
    const template = specStore.get(deposited.ctx.body.templateId)
    expect(template).toMatchObject({
      origin: 'factory',
      description: 'snapshot-v1',
      nodes: [{ id: 'only', type: 'function', config: { set: { result: 'snapshot-v1', stopMet: true } } }],
    })
  })

  it('legacy 导出明示当前草稿，草稿删除后 spec=null；deposit 失败关闭', async () => {
    const eventLog = new InMemoryEventLogStore()
    const specStore = new GraphSpecStore(eventLog)
    const graphService = new GraphService({ eventLog })
    const spec = functionSpec('legacy-spec', 'legacy-current')
    graphService.registerGraph(legacyDefinition(spec.id))
    const { runId } = await graphService.startRun(spec.id)
    await specStore.save(spec)
    const router = createGraphRunRouter({ graphService, eventLog, specStore })

    const exported = await invoke(router, 'get', `/api/graph/runs/${runId}/export`)
    expect(exported.ctx.body).toMatchObject({
      specSource: 'legacy-current-draft',
      specSnapshot: null,
      spec: { id: spec.id, description: 'legacy-current' },
    })
    const deposited = await invoke(router, 'post', `/api/graph/runs/${runId}/deposit-template`, {})
    expect(deposited.ctx.status).toBe(409)
    expect(deposited.ctx.body.code).toBe('run_spec_snapshot_missing')

    await specStore.delete(spec.id)
    const deletedDraft = await invoke(router, 'get', `/api/graph/runs/${runId}/export`)
    expect(deletedDraft.ctx.status).toBe(200)
    expect(deletedDraft.ctx.body).toMatchObject({
      specSource: 'legacy-current-draft', specSnapshot: null, spec: null,
    })
  })

  it('legacy fork/start 不复制或伪造快照，导出仍是 legacy-current-draft', async () => {
    const eventLog = new InMemoryEventLogStore()
    const specStore = new GraphSpecStore(eventLog)
    const graphService = new GraphService({ eventLog })
    graphService.registerGraph(legacyAwaitingDefinition('legacy-fork'))
    const { runId } = await graphService.startRun('legacy-fork')
    await specStore.save(functionSpec('legacy-fork', 'legacy-fork-current'))
    const router = createGraphRunRouter({ graphService, eventLog, specStore })

    const forked = await invoke(router, 'post', `/api/graph/runs/${runId}/fork`, {})
    expect(forked.ctx.status).toBe(200)
    const forkedId = forked.ctx.body.runId as string
    const started = await invoke(router, 'post', `/api/graph/runs/${forkedId}/start`, {})
    expect(started.ctx.status).toBe(200)
    expect(started.ctx.body.instance.specSource).toBe('legacy-unpinned')
    expect(started.ctx.body.instance.specSnapshot).toBeUndefined()
    expect(await eventLog.getRunSpec(forkedId)).toBeNull()

    const exported = await invoke(router, 'get', `/api/graph/runs/${forkedId}/export`)
    expect(exported.ctx.body.specSource).toBe('legacy-current-draft')
    expect(exported.ctx.body.specSnapshot).toBeNull()
  })
})

describe('Director 当前请求身份', () => {
  it('无/错 JWT 拒绝；resume/fork-start 每次传当前 actor/JWT，凭据不落响应或持久层', async () => {
    vi.stubEnv('AISTUDIO_LOCAL_OPERATOR', '')
    const eventLog = new InMemoryEventLogStore()
    const specStore = new GraphSpecStore(eventLog)
    const spec = approvalSpec('director-context')
    await specStore.save(spec)
    const contexts: Array<{ runId: string; context: GraphDefinitionContext }> = []
    const runtimeHolder: { current?: CustomSpecRuntime } = {}
    const graphService = new GraphService({
      eventLog,
      loadRunDefinition: async (runId, context) => {
        contexts.push({ runId, context: { ...context } })
        const stored = await eventLog.getRunSpec(runId)
        if (!stored) return null
        return { def: runtimeHolder.current!.hydrate(stored.spec), snapshot: snapshotMeta(stored) }
      },
    })
    runtimeHolder.current = runtimeFor('director', specStore, graphService)
    const { runId } = await runtimeHolder.current.startRun(spec.id)
    const router = createGraphRunRouter({ graphService, eventLog, specStore })
    const interruptId = 'approval:approval@0'

    const noJwt = await invoke(router, 'post', `/api/graph/runs/${runId}/resume`,
      { interruptId, value: 'approved' })
    expect(noJwt.ctx.status).toBe(401)
    const wrongJwt = await invoke(router, 'post', `/api/graph/runs/${runId}/resume`,
      { interruptId, value: 'approved' }, { headers: { authorization: 'Bearer wrong-jwt' } })
    expect(wrongJwt.ctx.status).toBe(401)
    expect(contexts).toEqual([])

    const forked = await invoke(router, 'post', `/api/graph/runs/${runId}/fork`, {})
    const forkedId = forked.ctx.body.runId as string
    const noForkJwt = await invoke(router, 'post', `/api/graph/runs/${forkedId}/start`, {})
    expect(noForkJwt.ctx.status).toBe(401)
    const wrongForkJwt = await invoke(router, 'post', `/api/graph/runs/${forkedId}/start`, {},
      { headers: { authorization: 'Bearer wrong-fork-jwt' } })
    expect(wrongForkJwt.ctx.status).toBe(401)

    const forkStarted = await invoke(router, 'post', `/api/graph/runs/${forkedId}/start`, {}, {
      headers: { authorization: 'Bearer fork-start-jwt' },
      state: { user: { username: 'fork-actor', role: 'user' } },
    })
    expect(forkStarted.ctx.status).toBe(200)
    const parentResumed = await invoke(router, 'post', `/api/graph/runs/${runId}/resume`,
      { interruptId, value: 'approved' }, {
        headers: { authorization: 'Bearer parent-resume-jwt' },
        state: { user: { username: 'parent-actor', role: 'user' } },
      })
    expect(parentResumed.ctx.status).toBe(200)
    const forkResumed = await invoke(router, 'post', `/api/graph/runs/${forkedId}/resume`,
      { interruptId, value: 'approved' }, {
        headers: { authorization: 'Bearer fork-resume-jwt' },
        state: { user: { username: 'resume-actor', role: 'user' } },
    })
    expect(forkResumed.ctx.status).toBe(200)

    expect(contexts).toEqual([
      { runId: forkedId, context: { actor: 'fork-actor', authToken: 'fork-start-jwt' } },
      { runId, context: { actor: 'parent-actor', authToken: 'parent-resume-jwt' } },
      { runId: forkedId, context: { actor: 'resume-actor', authToken: 'fork-resume-jwt' } },
    ])
    const persistedAndResponses = JSON.stringify({
      responses: [forkStarted.ctx.body, parentResumed.ctx.body, forkResumed.ctx.body],
      parentEvents: await eventLog.query(runId),
      forkEvents: await eventLog.query(forkedId),
      parentCheckpoints: await eventLog.listCheckpoints(runId),
      forkCheckpoints: await eventLog.listCheckpoints(forkedId),
      parentSnapshot: await eventLog.getRunSpec(runId),
      forkSnapshot: await eventLog.getRunSpec(forkedId),
    })
    for (const secret of ['fork-start-jwt', 'parent-resume-jwt', 'fork-resume-jwt']) {
      expect(persistedAndResponses).not.toContain(secret)
    }
    expect(persistedAndResponses).not.toContain('authToken')
    expect(persistedAndResponses).not.toContain('Authorization')
    vi.unstubAllEnvs()
  })
})

describe('装配 snapshot loader', () => {
  it('每次按 snapshot.runtimeKind 选择 editor/director runtime 并调用真实 hydrate', async () => {
    vi.stubEnv('GRAPH_KANBAN_BASE', '')
    const eventLog = new InMemoryEventLogStore()
    const opts: GraphAssemblyOpts = {
      mode: 'on', eventLog, shadowEventLog: new InMemoryEventLogStore(),
      engineDeps: {
        dryRun: false, connectors: [], store: {
          createLoop: async () => {}, getLoop: async () => null, listLoops: async () => [],
          updateLoop: async () => {}, deleteLoop: async () => {},
          appendContract: async () => {}, getContract: async () => null,
          queryContracts: async () => [], updateContract: async () => {},
          appendVerification: async () => {}, appendEvent: async () => {},
          queryEvents: async () => [], detectDrift: async () => ({ hasDrift: false, details: '' }),
        } as LoopStateStore,
        worktreeManager: { create: async (contract: TaskContract) => `wt-${contract.id}` },
        dispatcher: { dispatch: async () => {} },
        verifier: { verify: async (contract: TaskContract) => ({ contractId: contract.id, results: { programmatic: [], judge: null, human: null }, overall: 'passed', finalResponseGuard: true }) },
        persistence: { persist: async (contract: TaskContract) => `artifact:${contract.id}` },
        log: () => {},
      } as unknown as GraphAssemblyOpts['engineDeps'],
    }
    const first = createGraphAssembly(opts)
    let second: ReturnType<typeof createGraphAssembly> | null = null
    const originalHydrate = CustomSpecRuntime.prototype.hydrate
    const hydratedKinds: string[] = []
    const hydrateSpy = vi.spyOn(CustomSpecRuntime.prototype, 'hydrate').mockImplementation(function (spec) {
      hydratedKinds.push((this as unknown as { deps: { runtimeKind: string } }).deps.runtimeKind)
      return originalHydrate.call(this, spec)
    })
    try {
      const editorSpec = approvalSpec('assembly-editor')
      const directorSpec = approvalSpec('assembly-director')
      await first.specStore.save(editorSpec)
      await first.specStore.save(directorSpec)
      const editor = runtimeFor('editor', first.specStore, first.graphService)
      const director = runtimeFor('director', first.specStore, first.graphService)
      const editorRun = await editor.startRun(editorSpec.id)
      const directorRun = await director.startRun(directorSpec.id)
      first.stop()

      second = createGraphAssembly(opts)
      await second.start()
      hydratedKinds.length = 0
      const editorResume = await invoke(second.router, 'post', `/api/graph/runs/${editorRun.runId}/resume`,
        { interruptId: 'approval:approval@0', value: 'approved' },
        { state: { user: { username: 'editor-user', role: 'user' } } })
      expect(editorResume.ctx.status).toBe(200)
      const directorResume = await invoke(second.router, 'post', `/api/graph/runs/${directorRun.runId}/resume`,
        { interruptId: 'approval:approval@0', value: 'approved' }, {
          headers: { authorization: 'Bearer director-current-jwt' },
          state: { user: { username: 'director-user', role: 'user' } },
        })
      expect(directorResume.ctx.status).toBe(200)
      expect(hydratedKinds).toEqual(['editor', 'director'])
    } finally {
      first.stop()
      second?.stop()
      hydrateSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
