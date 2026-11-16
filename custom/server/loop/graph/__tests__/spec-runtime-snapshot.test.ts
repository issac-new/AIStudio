// CustomSpecRuntime 起跑快照：完整 spec、受信元数据、失败不启动与共享注册表。
import { describe, expect, it, vi } from 'vitest'
import { CustomSpecRuntime } from '../spec-runtime'
import { GraphService } from '../graph-service'
import { InMemoryEventLogStore } from '../event-log-store'
import { NodeRegistry } from '../node-registry'
import type { GraphSpec } from '../graph-spec'
import { graphSpecContentHash } from '../run-spec-snapshot'

function makeSpec(id = 'snapshot-spec', version = 7): GraphSpec {
  return {
    id, version, origin: 'editor',
    description: '完整快照应保留的描述',
    channels: {
      result: { reducer: 'overwrite', default: '' },
      stopMet: { reducer: 'overwrite', default: false },
    },
    nodes: [{
      id: 'only', type: 'function',
      config: { set: { result: 'default-registry', stopMet: true } },
    }],
    edges: [],
    entryNode: 'only',
    endCondition: { op: 'truthy', path: 'stopMet' },
    limits: { maxSteps: 4 },
    meta: { goal: 'snapshot-goal' },
  }
}

function capabilities(executionMode: 'production' | 'shadow') {
  return { gateCatalog: [], hasRealKanbanBridge: false, executionMode }
}

describe('CustomSpecRuntime 快照起跑', () => {
  it('start 保存完整 spec 与受信快照元数据，并透传 definitionContext', async () => {
    const eventLog = new InMemoryEventLogStore()
    const service = new GraphService({ eventLog })
    const spec = makeSpec()
    const expectedSpec = structuredClone(spec)
    const store = new Map<string, GraphSpec>([[spec.id, spec]])
    const runtime = new CustomSpecRuntime({
      specStore: { get: id => store.get(id) },
      graphService: service,
      runtimeKind: 'director',
      capabilities: capabilities('shadow'),
    })
    const startSpy = vi.spyOn(service, 'startRun')
    const initialState = { result: 'initial' }
    const definitionContext = { actor: 'director-user', authToken: 'jwt-secret' }

    const { runId, instance } = await runtime.startRun(spec.id, initialState, definitionContext)

    expect(instance.status).toBe('completed')
    const row = await eventLog.getRunSpec(runId)
    expect(row).toMatchObject({
      runId,
      specId: spec.id,
      revision: null,
      draftVersion: 7,
      runtimeKind: 'director',
      executionMode: 'shadow',
      contentHash: graphSpecContentHash(expectedSpec),
      createdBy: 'director-user',
      spec: expectedSpec,
    })
    expect(Number.isFinite(Date.parse(row!.createdAt))).toBe(true)
    expect(startSpy).toHaveBeenCalledWith(spec.id, initialState, undefined, {
      snapshot: {
        spec: expectedSpec,
        meta: {
          specId: spec.id,
          revision: null,
          draftVersion: 7,
          runtimeKind: 'director',
          executionMode: 'shadow',
          contentHash: graphSpecContentHash(expectedSpec),
          createdAt: row!.createdAt,
          createdBy: 'director-user',
        },
      },
      definitionContext,
    })
    const startSnapshot = startSpy.mock.calls[0][3]!.snapshot!
    expect(startSnapshot.spec).not.toBe(spec)
    expect(startSnapshot.spec.nodes).not.toBe(spec.nodes)

    spec.nodes[0].config.set = { result: 'tampered-after-start' }
    expect((await eventLog.getRunSpec(runId))?.spec).toEqual(expectedSpec)
    expect(JSON.stringify({ row, events: await eventLog.query(runId) })).not.toContain('jwt-secret')
  })

  it('快照保存失败时 GraphRuntime 未启动且没有节点副作用', async () => {
    class FailingSnapshotLog extends InMemoryEventLogStore {
      override async saveRunSpec(): Promise<void> {
        throw new Error('snapshot_write_failed')
      }
    }
    const eventLog = new FailingSnapshotLog()
    const service = new GraphService({ eventLog })
    const spec = makeSpec('snapshot-failure')
    const store = new Map<string, GraphSpec>([[spec.id, spec]])
    const effects: string[] = []
    const registry = new NodeRegistry()
    registry.register('function', config => ({
      id: config.id as string,
      type: 'function' as const,
      label: config.id as string,
      execute: async () => {
        effects.push(config.id as string)
        return { update: { stopMet: true } }
      },
    }))
    const runtime = new CustomSpecRuntime({
      specStore: { get: id => store.get(id) },
      graphService: service,
      registry,
      runtimeKind: 'editor',
      capabilities: capabilities('production'),
    })
    const graphEvents: string[] = []
    service.onEvent(event => { graphEvents.push(event.type) })

    await expect(runtime.startRun(spec.id)).rejects.toThrow('snapshot_write_failed')

    expect(effects).toEqual([])
    expect(graphEvents).toEqual([])
    expect(await eventLog.listRuns()).toEqual([])
  })

  it('hydrate(spec) 与 start 使用同一个注册表', async () => {
    const eventLog = new InMemoryEventLogStore()
    const service = new GraphService({ eventLog })
    const spec = makeSpec('shared-registry')
    const store = new Map<string, GraphSpec>([[spec.id, spec]])
    const registry = new NodeRegistry()
    registry.register('function', config => ({
      id: config.id as string,
      type: 'function' as const,
      label: config.id as string,
      execute: async () => ({ update: { result: 'shared-registry', stopMet: true } }),
    }))
    const runtime = new CustomSpecRuntime({
      specStore: { get: id => store.get(id) },
      graphService: service,
      registry,
      runtimeKind: 'editor',
      capabilities: capabilities('production'),
    })

    const hydrated = runtime.hydrate(spec)
    const direct = await hydrated.nodes.get('only')!.execute({}, {
      graphId: spec.id, threadId: 'direct-hydrate', nodeId: 'only', superStep: 0,
      deps: { emitEvent: () => {} },
    })
    expect(direct.update).toEqual({ result: 'shared-registry', stopMet: true })

    const { runId } = await runtime.startRun(spec.id)
    expect(service.getRun(runId)?.instance.state).toMatchObject({
      result: 'shared-registry', stopMet: true,
    })
  })
})
