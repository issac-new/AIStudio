// Task 6：REST 快照投影、Director 当前请求身份与装配 loader 的注册表边界。
import { describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
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

const VENDOR_STUDIO = '../../../../../vendor/hermes-studio/packages/server/src/modules/studio'
const DATABASE_MODULE = `${VENDOR_STUDIO}/infrastructure/database/index`
const PROFILE_CONFIG_MODULE = `${VENDOR_STUDIO}/public/profile-config`

/** 真实上游认证链使用内存账号库；token 由上游自己的签发函数生成，不在 Graph 层另造校验器。 */
async function initVendorAuthChain() {
  vi.resetModules()
  vi.stubEnv('AUTH_JWT_SECRET', 'graph-rest-chain-secret')
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(':memory:')
  vi.doMock(DATABASE_MODULE, () => ({
    getDb: () => db,
    getStoragePath: () => ':memory:',
    isSqliteAvailable: () => true,
  }))
  vi.doMock(PROFILE_CONFIG_MODULE, () => ({ listProfileNamesFromDisk: () => ['default', 'alice'] }))
  const schemas = await import(`${VENDOR_STUDIO}/infrastructure/database/schemas`)
  schemas.initAllHermesTables()
  const users = await import(`${VENDOR_STUDIO}/repositories/users-store`)
  const auth = await import(`${VENDOR_STUDIO}/middleware/auth`)
  return { db, users, auth }
}

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
  it('缺少认证主体或 Bearer 拒绝；resume/fork-start 每次传当前 actor/JWT，凭据不落响应或持久层', async () => {
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
    const bearerWithoutActor = await invoke(router, 'post', `/api/graph/runs/${runId}/resume`,
      { interruptId, value: 'approved' }, { headers: { authorization: 'Bearer bearer-without-actor' } })
    expect(bearerWithoutActor.ctx.status).toBe(401)
    expect(contexts).toEqual([])

    const forked = await invoke(router, 'post', `/api/graph/runs/${runId}/fork`, {})
    const forkedId = forked.ctx.body.runId as string
    const noForkJwt = await invoke(router, 'post', `/api/graph/runs/${forkedId}/start`, {})
    expect(noForkJwt.ctx.status).toBe(401)
    const forkBearerWithoutActor = await invoke(router, 'post', `/api/graph/runs/${forkedId}/start`, {},
      { headers: { authorization: 'Bearer fork-bearer-without-actor' } })
    expect(forkBearerWithoutActor.ctx.status).toBe(401)

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

  it('无内存 rec 时仍按持久化 Director 快照要求认证主体，非审批 resume 返回 401', async () => {
    const eventLog = new InMemoryEventLogStore()
    const spec = approvalSpec('director-missing-rec')
    await eventLog.saveRunSpec({
      runId: 'missing-director-rec', specId: spec.id, revision: null, draftVersion: spec.version,
      runtimeKind: 'director', executionMode: 'production', contentHash: 'missing-rec-hash',
      createdAt: '2026-11-16T00:00:00Z', spec,
    })
    const loader = vi.fn()
    const graphService = new GraphService({ eventLog, loadRunDefinition: loader })
    expect(graphService.getRun('missing-director-rec')).toBeNull()
    const router = createGraphRunRouter({ graphService, eventLog })

    const resumed = await invoke(router, 'post', '/api/graph/runs/missing-director-rec/resume',
      { interruptId: 'director-resume', value: 'continue' },
      { headers: { authorization: 'Bearer nonempty-without-actor' }, state: {} })

    expect(resumed.ctx.status).toBe(401)
    expect(resumed.ctx.body.code).toBe('current_jwt_required')
    expect(loader).not.toHaveBeenCalled()
  })

  it('真实上游认证链拒绝错误签名/过期 token，即使预置 state.user；有效 token 才进入 resume', async () => {
    const { db, users, auth } = await initVendorAuthChain()
    let server: Server | undefined
    try {
      const user = users.createSuperAdmin('director-root', 'secret')!
      const validToken = auth.signUserJwt(user, 'graph-rest-chain-secret')
      const wrongSignatureToken = auth.signUserJwt(user, 'wrong-signing-secret')
      const expiredToken = auth.signUserJwt(user, 'graph-rest-chain-secret', Date.now() - 60_000, -1)
      const eventLog = new InMemoryEventLogStore()
      const specStore = new GraphSpecStore(eventLog)
      const spec = approvalSpec('director-real-auth-chain')
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
      const app = new Koa()
      app.use(bodyParser())
      // 对抗性预置：即便路由前已有 user，上游也必须自行判 token，而不是被既有 user 欺骗。
      app.use((ctx, next) => {
        ctx.state.user = { id: user.id, username: user.username, role: user.role }
        return next()
      })
      for (const middleware of auth.userAuthMiddleware) app.use(middleware)
      app.use(router.routes())
      server = createServer(app.callback())
      await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      const postResume = (token: string) => fetch(`${base}/api/graph/runs/${runId}/resume`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ interruptId: 'approval:approval@0', value: 'approved' }),
      })

      const wrongSignature = await postResume(wrongSignatureToken)
      expect(wrongSignature.status).toBe(401)
      expect(await wrongSignature.json()).toMatchObject({ error: 'Unauthorized' })
      const expired = await postResume(expiredToken)
      expect(expired.status).toBe(401)
      expect(await expired.json()).toMatchObject({ error: 'Unauthorized' })
      expect(contexts).toEqual([])

      const valid = await postResume(validToken)
      expect(valid.status).toBe(200)
      const validBody = await valid.json() as { instance: { status: string } }
      expect(validBody.instance.status).toBe('completed')
      expect(contexts).toEqual([{
        runId,
        context: { actor: 'director-root', authToken: validToken },
      }])
      expect(JSON.stringify(validBody)).not.toContain(validToken)
    } finally {
      if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
      db.close()
      vi.doUnmock(DATABASE_MODULE)
      vi.doUnmock(PROFILE_CONFIG_MODULE)
      vi.unstubAllEnvs()
      vi.resetModules()
    }
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
      await expect(second.graphService.resumeRun(
        directorRun.runId,
        'approval:approval@0',
        'approved',
        { authToken: 'token-without-actor' },
      )).rejects.toThrow('current_jwt_required')
      expect(hydratedKinds).toEqual(['editor'])
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
