// GraphService 每 run GraphSpec 快照：起跑落盘、按快照恢复、fork 与重启重建。
import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  GraphService,
  type GraphDefinitionContext,
} from '../graph-service'
import {
  createEventLogStore,
  InMemoryEventLogStore,
  type EventLogStore,
} from '../event-log-store'
import { GraphBuilder, fnNode, humanNode } from '../graph-definition'
import type { GraphSpec } from '../graph-spec'
import {
  graphSpecContentHash,
  type GraphRuntimeKind,
  type GraphSpecSnapshotMeta,
  type StoredGraphRunSpec,
} from '../run-spec-snapshot'
import {
  reducers,
  type GraphDef,
  type GraphEvent,
  type NodeContext,
} from '../types'

const sqliteAvailable = await (async () => {
  try {
    const { DatabaseSync } = await import('node:sqlite')
    new DatabaseSync(':memory:').close()
    return true
  } catch {
    return false
  }
})()

const tmpDirs: string[] = []
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

async function sqliteFile(): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'graph-service-snapshot-'))
  tmpDirs.push(dir)
  return join(dir, 'graph.sqlite')
}

function makeSpec(id = 'versioned-approval', version = 1, marker = 'v1'): GraphSpec {
  return {
    id,
    version,
    channels: {
      steps: { reducer: 'append', default: [] },
      executedDefinition: { reducer: 'overwrite', default: '' },
    },
    nodes: [
      { id: 'work', type: 'function', config: { marker } },
      { id: 'gate', type: 'human', config: { prompt: 'approve?' } },
      { id: 'finish', type: 'function', config: { marker } },
    ],
    edges: [
      { from: 'work', to: 'gate' },
      { from: 'gate', to: 'finish' },
    ],
    entryNode: 'work',
    limits: { maxSteps: 8 },
  }
}

function makeMeta(
  spec: GraphSpec,
  runtimeKind: GraphRuntimeKind = 'editor',
): GraphSpecSnapshotMeta {
  return {
    specId: spec.id,
    revision: null,
    draftVersion: spec.version,
    runtimeKind,
    executionMode: runtimeKind === 'director' ? 'shadow' : 'production',
    contentHash: graphSpecContentHash(spec),
    createdAt: '2026-11-16T00:00:00.000Z',
    createdBy: 'snapshot-author',
  }
}

function snapshotOf(row: StoredGraphRunSpec): GraphSpecSnapshotMeta {
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

function approvalDef(
  spec: GraphSpec,
  executedDefinition: string,
  observeWork?: (ctx: NodeContext) => void | Promise<void>,
): GraphDef {
  return new GraphBuilder(spec.id, `Approval ${executedDefinition}`)
    .addChannel('steps', { reducer: reducers.append(), default: [] as string[] })
    .addChannel('executedDefinition', { reducer: reducers.overwrite(), default: '' })
    .addNode(fnNode('work', async (_state, ctx) => {
      await observeWork?.(ctx)
      return { update: { steps: [`work:${executedDefinition}`] } }
    }))
    .addNode(humanNode('gate', 'approve?'))
    .addNode(fnNode('finish', async () => ({
      update: {
        steps: [`finish:${executedDefinition}`],
        executedDefinition,
      },
    })))
    .setEntry('work')
    .addEdge('work', 'gate')
    .addEdge('gate', 'finish')
    .build()
}

type Registries = Record<GraphRuntimeKind, Map<string, GraphDef>>

/** 测试装配边界的真实快照读取：按 runtimeKind 和持久化 hash 选择 stub registry。 */
function makeLoader(
  log: EventLogStore,
  registries: Registries,
  beforeLoad?: (runId: string, context: GraphDefinitionContext) => void,
) {
  return async (runId: string, context: GraphDefinitionContext) => {
    beforeLoad?.(runId, context)
    const row = await log.getRunSpec(runId)
    if (!row) return null
    const def = registries[row.runtimeKind].get(row.contentHash)
    return def ? { def, snapshot: snapshotOf(row) } : null
  }
}

async function interruptIdOf(log: EventLogStore, runId: string): Promise<string> {
  const checkpoint = await log.getLatestCheckpoint(runId)
  expect(checkpoint?.pendingInterrupts).toHaveLength(1)
  return checkpoint!.pendingInterrupts[0].id
}

describe('GraphService run snapshot binding', () => {
  it('start 在首个节点执行前保存快照，run.started 只携带快照元数据', async () => {
    const log = new InMemoryEventLogStore()
    const spec = makeSpec('persist-before-work', 1, 'v1')
    const meta = makeMeta(spec)
    let hashSeenByFirstNode = 'not-read'
    let startedEvent: GraphEvent | undefined
    const svc = new GraphService({ eventLog: log })
    svc.onEvent(event => {
      if (event.type === 'graph.started') startedEvent = event
    })
    svc.registerGraph(approvalDef(spec, 'v1', async ctx => {
      hashSeenByFirstNode = (await log.getRunSpec(ctx.threadId))?.contentHash ?? 'missing'
    }))

    const { runId, instance } = await svc.startRun(spec.id, undefined, undefined, {
      snapshot: { spec, meta },
    })

    expect(hashSeenByFirstNode).toBe(meta.contentHash)
    expect(instance.specSource).toBe('run-snapshot')
    expect(instance.specSnapshot?.contentHash).toBe(meta.contentHash)
    expect(startedEvent).toMatchObject({
      type: 'graph.started',
      specSource: 'run-snapshot',
      specSnapshot: { contentHash: meta.contentHash },
    })
    const startedLog = (await log.query(runId)).find(event => event.kind === 'run.started')
    expect(startedLog?.payload).toMatchObject({
      specSource: 'run-snapshot',
      specSnapshot: { contentHash: meta.contentHash },
    })
    expect(JSON.stringify(startedLog?.payload)).not.toContain('"spec"')
  })

  it('v2 注册后恢复 v1 仍执行 v1', async () => {
    const log = new InMemoryEventLogStore()
    const v1 = makeSpec('versioned-approval', 1, 'v1')
    const v2 = makeSpec('versioned-approval', 2, 'v2')
    const metaV1 = makeMeta(v1)
    const defV1 = approvalDef(v1, 'v1')
    const defV2 = approvalDef(v2, 'v2')
    const registries: Registries = {
      editor: new Map([[metaV1.contentHash, defV1], [graphSpecContentHash(v2), defV2]]),
      director: new Map(),
    }
    const svc = new GraphService({
      eventLog: log,
      loadRunDefinition: makeLoader(log, registries),
    })
    svc.registerGraph(defV1)
    const { runId: runV1 } = await svc.startRun(v1.id, undefined, undefined, {
      snapshot: { spec: v1, meta: metaV1 },
    })
    const interruptV1 = await interruptIdOf(log, runV1)

    svc.registerGraph(defV2)
    const resumed = await svc.resumeRun(runV1, interruptV1, { decision: 'approved' })

    expect(resumed.status).toBe('completed')
    expect(resumed.state.executedDefinition).toBe('v1')
    expect(resumed.specSnapshot?.contentHash).toBe(metaV1.contentHash)
    expect(resumed.specSource).toBe('run-snapshot')
  })

  it.skipIf(!sqliteAvailable)('SQLite 重启重建只恢复元数据，resume 才经 loader hydrate v1', async () => {
    const dbPath = await sqliteFile()
    const firstLog = createEventLogStore(dbPath)
    const v1 = makeSpec('sqlite-versioned', 1, 'sqlite-v1')
    const metaV1 = makeMeta(v1)
    const defV1 = approvalDef(v1, 'sqlite-v1')
    const first = new GraphService({ eventLog: firstLog })
    first.registerGraph(defV1)
    const { runId } = await first.startRun(v1.id, undefined, undefined, {
      snapshot: { spec: v1, meta: metaV1 },
    })
    const interruptId = await interruptIdOf(firstLog, runId)

    const secondLog = createEventLogStore(dbPath)
    let loaderCalls = 0
    const registries: Registries = {
      editor: new Map([[metaV1.contentHash, approvalDef(v1, 'sqlite-v1')]]),
      director: new Map(),
    }
    const second = new GraphService({
      eventLog: secondLog,
      loadRunDefinition: makeLoader(secondLog, registries, () => { loaderCalls++ }),
    })

    expect(await second.rebuildRegistryFromLog()).toBe(1)
    expect(loaderCalls).toBe(0)
    expect(second.getRun(runId)?.instance).toMatchObject({
      status: 'awaiting-input',
      specSource: 'run-snapshot',
      specSnapshot: { contentHash: metaV1.contentHash },
    })

    // 不注册任何 GraphDef：pinned resume 必须由快照 loader 提供定义。
    const resumed = await second.resumeRun(runId, interruptId, 'approved')
    expect(loaderCalls).toBe(1)
    expect(resumed.state.executedDefinition).toBe('sqlite-v1')
  })

  it('fork 复制同一内容 hash，fork-start 与 resume 都按原快照执行', async () => {
    const log = new InMemoryEventLogStore()
    const v1 = makeSpec('fork-versioned', 1, 'fork-v1')
    const v2 = makeSpec('fork-versioned', 2, 'fork-v2')
    const metaV1 = makeMeta(v1)
    const defV1 = approvalDef(v1, 'fork-v1')
    const defV2 = approvalDef(v2, 'fork-v2')
    const registries: Registries = {
      editor: new Map([[metaV1.contentHash, defV1], [graphSpecContentHash(v2), defV2]]),
      director: new Map(),
    }
    const svc = new GraphService({
      eventLog: log,
      loadRunDefinition: makeLoader(log, registries),
    })
    svc.registerGraph(defV1)
    const { runId } = await svc.startRun(v1.id, undefined, undefined, {
      snapshot: { spec: v1, meta: metaV1 },
    })

    const { runId: forked } = await svc.forkRun(runId, 1)
    const copied = await log.getRunSpec(forked)
    expect(copied?.runId).toBe(forked)
    expect(copied?.contentHash).toBe(metaV1.contentHash)
    expect(copied?.spec).toEqual(v1)
    expect(svc.getRun(forked)?.instance.specSnapshot?.contentHash).toBe(metaV1.contentHash)

    svc.registerGraph(defV2)
    const started = await svc.startRun(v1.id, undefined, forked)
    expect(started.instance.status).toBe('awaiting-input')
    const resumed = await svc.resumeRun(forked, await interruptIdOf(log, forked), 'approved')
    expect(resumed.state.executedDefinition).toBe('fork-v1')
    expect(resumed.specSnapshot?.contentHash).toBe(metaV1.contentHash)
  })

  it('未消费的 pinned fork 重启后继承来源，start 仍经快照 loader', async () => {
    const log = new InMemoryEventLogStore()
    const spec = makeSpec('paused-fork-restart', 1, 'paused-fork-v1')
    const meta = makeMeta(spec)
    const def = approvalDef(spec, 'paused-fork-v1')
    const registries: Registries = {
      editor: new Map([[meta.contentHash, def]]),
      director: new Map(),
    }
    const first = new GraphService({
      eventLog: log,
      loadRunDefinition: makeLoader(log, registries),
    })
    first.registerGraph(def)
    const { runId } = await first.startRun(spec.id, undefined, undefined, {
      snapshot: { spec, meta },
    })
    const { runId: forked } = await first.forkRun(runId, 1)

    const second = new GraphService({
      eventLog: log,
      loadRunDefinition: makeLoader(log, registries),
    })
    expect(await second.rebuildRegistryFromLog()).toBe(2)
    expect(second.getRun(forked)?.instance.specSource).toBe('run-snapshot')
    expect(second.getRun(forked)?.instance.specSnapshot?.contentHash).toBe(meta.contentHash)

    // 不注册 GraphDef：未消费 fork 的首次 start 也必须从复制快照 hydrate。
    const started = await second.startRun(spec.id, undefined, forked)
    expect(started.instance.status).toBe('awaiting-input')
    const resumed = await second.resumeRun(forked, await interruptIdOf(log, forked), 'approved')
    expect(resumed.state.executedDefinition).toBe('paused-fork-v1')
  })

  it('pinned 事件存在但快照行缺失时，重建后 resume 抛 run_spec_snapshot_missing', async () => {
    class MissingRunSpecLog extends InMemoryEventLogStore {
      override async getRunSpec(_runId: string): Promise<StoredGraphRunSpec | null> {
        return null
      }
    }
    const log = new MissingRunSpecLog()
    const spec = makeSpec('missing-snapshot', 1, 'v1')
    const meta = makeMeta(spec)
    const registries: Registries = {
      editor: new Map([[meta.contentHash, approvalDef(spec, 'v1')]]),
      director: new Map(),
    }
    const first = new GraphService({
      eventLog: log,
      loadRunDefinition: makeLoader(log, registries),
    })
    first.registerGraph(approvalDef(spec, 'v1'))
    const { runId } = await first.startRun(spec.id, undefined, undefined, {
      snapshot: { spec, meta },
    })
    const interruptId = await interruptIdOf(log, runId)

    const second = new GraphService({
      eventLog: log,
      loadRunDefinition: makeLoader(log, registries),
    })
    await second.rebuildRegistryFromLog()
    expect(second.getRun(runId)?.instance.specSource).toBe('run-snapshot')
    await expect(second.resumeRun(runId, interruptId, 'approved'))
      .rejects.toThrow('run_spec_snapshot_missing')
  })

  it('无快照元数据的旧 run 重建后保持 legacy，并回退当前注册图', async () => {
    const seedLog = new InMemoryEventLogStore()
    const seedService = new GraphService({ eventLog: seedLog })
    const spec = makeSpec('legacy-unpinned', 1, 'legacy-v1')
    seedService.registerGraph(approvalDef(spec, 'legacy-v1'))
    const { runId: seedRun } = await seedService.startRun(spec.id)
    const seedCheckpoint = await seedLog.getLatestCheckpoint(seedRun)

    const log = new InMemoryEventLogStore()
    const legacyRun = 'run-legacy-unpinned-1'
    await log.append({
      runId: legacyRun,
      graphId: spec.id,
      ts: Date.now() - 2_000,
      kind: 'run.started',
      payload: {},
    })
    await log.append({
      runId: legacyRun,
      graphId: spec.id,
      ts: Date.now() - 1_000,
      kind: 'interrupt.raised',
      nodeId: 'gate',
      payload: {
        interruptId: seedCheckpoint!.pendingInterrupts[0].id,
        value: seedCheckpoint!.pendingInterrupts[0].value,
      },
    })
    await log.saveCheckpoint({
      ...seedCheckpoint!,
      id: `cp-${legacyRun}`,
      runId: legacyRun,
    })

    const svc = new GraphService({
      eventLog: log,
      loadRunDefinition: async () => { throw new Error('legacy_must_not_use_snapshot_loader') },
    })
    svc.registerGraph(approvalDef(makeSpec(spec.id, 2, 'legacy-v2'), 'legacy-v2'))
    await svc.rebuildRegistryFromLog()
    expect(svc.getRun(legacyRun)?.instance.specSource).toBe('legacy-unpinned')
    expect(svc.getRun(legacyRun)?.instance.specSnapshot).toBeUndefined()

    const resumed = await svc.resumeRun(
      legacyRun,
      seedCheckpoint!.pendingInterrupts[0].id,
      'approved',
    )
    expect(resumed.state.executedDefinition).toBe('legacy-v2')
    expect(resumed.specSource).toBe('legacy-unpinned')
  })

  it('runtime-defined run 没有 options.snapshot 时不冒充 pinned', async () => {
    const log = new InMemoryEventLogStore()
    const spec = makeSpec('runtime-defined', 1, 'runtime-v1')
    const svc = new GraphService({
      eventLog: log,
      loadRunDefinition: async () => { throw new Error('runtime_defined_must_stay_legacy') },
    })
    svc.registerGraph(approvalDef(spec, 'runtime-v1'))

    const { runId, instance } = await svc.startRun(spec.id)

    expect(instance.specSource).toBe('legacy-unpinned')
    expect(instance.specSnapshot).toBeUndefined()
    expect(await log.getRunSpec(runId)).toBeNull()
    const started = (await log.query(runId)).find(event => event.kind === 'run.started')
    expect(started?.payload.specSource).toBe('legacy-unpinned')
    expect(started?.payload.specSnapshot).toBeUndefined()
    const resumed = await svc.resumeRun(runId, await interruptIdOf(log, runId), 'approved')
    expect(resumed.state.executedDefinition).toBe('runtime-v1')
  })
})

describe('GraphService Director definition context', () => {
  it('JWT 仅在 resume/fork-start 惰性传入，editor/director 各用自己的 registry，凭据不落持久层', async () => {
    const log = new InMemoryEventLogStore()
    const spec = makeSpec('director-context', 4, 'spec-v4')
    const meta = makeMeta(spec, 'director')
    const editorDef = approvalDef(spec, 'editor-registry')
    const directorDef = approvalDef(spec, 'director-registry')
    const registries: Registries = {
      editor: new Map([[meta.contentHash, editorDef]]),
      director: new Map([[meta.contentHash, directorDef]]),
    }
    const contexts: Array<{ runId: string; context: GraphDefinitionContext }> = []
    const loader = makeLoader(log, registries, (runId, context) => {
      contexts.push({ runId, context: { ...context } })
      if (!context.authToken) throw new Error('actor_credentials_required')
    })
    const first = new GraphService({ eventLog: log, loadRunDefinition: loader })
    first.registerGraph(directorDef)
    const { runId } = await first.startRun(spec.id, undefined, undefined, {
      snapshot: { spec, meta },
    })
    const parentInterrupt = await interruptIdOf(log, runId)

    const rebuilt = new GraphService({ eventLog: log, loadRunDefinition: loader })
    await rebuilt.rebuildRegistryFromLog()
    expect(contexts).toHaveLength(0)
    await expect(rebuilt.resumeRun(runId, parentInterrupt, 'approved', { actor: 'director-user' }))
      .rejects.toThrow('actor_credentials_required')
    expect(rebuilt.getRun(runId)?.status).toBe('awaiting-input')

    const { runId: forked } = await rebuilt.forkRun(runId, 1)
    await rebuilt.startRun(spec.id, undefined, forked, {
      definitionContext: { actor: 'fork-actor', authToken: 'fork-jwt-secret' },
    })
    const resumed = await rebuilt.resumeRun(
      forked,
      await interruptIdOf(log, forked),
      'approved',
      { actor: 'resume-actor', authToken: 'resume-jwt-secret' },
    )

    expect(resumed.state.executedDefinition).toBe('director-registry')
    expect(contexts.slice(1)).toEqual([
      { runId: forked, context: { actor: 'fork-actor', authToken: 'fork-jwt-secret' } },
      { runId: forked, context: { actor: 'resume-actor', authToken: 'resume-jwt-secret' } },
    ])

    const persisted = JSON.stringify({
      parentEvents: await log.query(runId),
      forkEvents: await log.query(forked),
      parentCheckpoints: await log.listCheckpoints(runId),
      forkCheckpoints: await log.listCheckpoints(forked),
      parentSnapshot: await log.getRunSpec(runId),
      forkSnapshot: await log.getRunSpec(forked),
      parentRun: rebuilt.getRun(runId),
      forkRun: rebuilt.getRun(forked),
    })
    expect(persisted).not.toContain('fork-jwt-secret')
    expect(persisted).not.toContain('resume-jwt-secret')
    expect(persisted).not.toContain('authToken')
  })
})
