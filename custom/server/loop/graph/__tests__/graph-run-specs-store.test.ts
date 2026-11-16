import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createEventLogStore,
  InMemoryEventLogStore,
  type EventLogStore,
} from '../event-log-store'
import {
  graphSpecContentHash,
  type StoredGraphRunSpec,
} from '../run-spec-snapshot'
import type { GraphSpec } from '../graph-spec'

const EXPECTED_SPEC_SHA256 = '0ff689e1acdec1b20be155006245f6faf2bfc20b0bcb603fc77fafd6bcdc21f6'
const TEST_CONTENT_HASH = 'a'.repeat(64)

const sqliteAvailable = await (async () => {
  try {
    const { DatabaseSync } = await import('node:sqlite')
    new DatabaseSync(':memory:').close()
    return true
  } catch {
    return false
  }
})()

function makeSpec(): GraphSpec {
  return {
    id: 'spec-1',
    version: 3,
    channels: {},
    nodes: [{
      id: 'node-1',
      type: 'function',
      config: { label: 'original', nested: { enabled: true } },
    }],
    edges: [],
    entryNode: 'node-1',
    limits: { maxSteps: 10 },
  }
}

/** 根、节点与 config 三层均改变键序，数组顺序保持不变。 */
function makeSpecWithKeysReordered(): GraphSpec {
  return {
    limits: { maxSteps: 10 },
    entryNode: 'node-1',
    edges: [],
    nodes: [{
      config: { nested: { enabled: true }, label: 'original' },
      id: 'node-1',
      type: 'function',
    }],
    channels: {},
    version: 3,
    id: 'spec-1',
  }
}

function makeRow(spec = makeSpec()): StoredGraphRunSpec {
  return {
    runId: 'run-1',
    specId: spec.id,
    revision: null,
    draftVersion: spec.version,
    runtimeKind: 'director',
    executionMode: 'shadow',
    contentHash: TEST_CONTENT_HASH,
    createdAt: '2026-11-16T00:00:00.000Z',
    createdBy: 'actor-1',
    spec,
  }
}

const tmpDirs: string[] = []
async function tmpFile(name: string): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'graph-run-specs-'))
  tmpDirs.push(dir)
  return join(dir, name)
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

describe('graphSpecContentHash', () => {
  it('同内容生成既定的 SHA-256', () => {
    expect(graphSpecContentHash(makeSpec())).toBe(EXPECTED_SPEC_SHA256)
    expect(graphSpecContentHash(makeSpec())).toBe(EXPECTED_SPEC_SHA256)
  })

  it('内容变化会改变 hash', () => {
    const spec = makeSpec()
    const changed: GraphSpec = {
      ...spec,
      nodes: [{
        ...spec.nodes[0],
        config: { ...spec.nodes[0].config, label: 'changed' },
      }],
    }
    expect(graphSpecContentHash(changed)).not.toBe(EXPECTED_SPEC_SHA256)
  })
})

describe.each([
  { name: 'InMemory', sqlite: false },
  { name: 'SQLite', sqlite: true },
])('$name run snapshot store', ({ sqlite }) => {
  let store: EventLogStore
  let dbPath: string

  beforeEach(async () => {
    dbPath = sqlite ? await tmpFile('run-specs.sqlite') : ''
    store = sqlite ? createEventLogStore(dbPath) : new InMemoryEventLogStore()
  })

  it.skipIf(sqlite && !sqliteAvailable)('保存后可按 runId 读回完整快照，未知 runId 返回 null', async () => {
    const row = makeRow()
    await store.saveRunSpec(row)

    // SQLite 必须经新连接读回，而不是命中进程内缓存。
    const reader = sqlite ? createEventLogStore(dbPath) : store
    expect(await reader.getRunSpec('run-1')).toEqual(row)
    expect(await reader.getRunSpec('missing')).toBeNull()
  })

  it.skipIf(sqlite && !sqliteAvailable)('键序变化不改 hash，run snapshot 返回深副本', async () => {
    const spec = makeSpec()
    const specWithKeysReordered = makeSpecWithKeysReordered()
    expect(graphSpecContentHash(specWithKeysReordered)).toBe(graphSpecContentHash(spec))

    await store.saveRunSpec(makeRow(spec))
    const restored = await store.getRunSpec('run-1')
    restored!.spec.nodes[0].config.label = 'polluted'
    expect((await store.getRunSpec('run-1'))!.spec.nodes[0].config.label).toBe('original')
  })

  it.skipIf(sqlite && !sqliteAvailable)('保存时深拷贝，调用方后续改写输入不会污染快照', async () => {
    const row = makeRow()
    await store.saveRunSpec(row)
    row.spec.nodes[0].config.label = 'polluted-after-save'

    expect((await store.getRunSpec('run-1'))!.spec.nodes[0].config.label).toBe('original')
  })

  it.skipIf(sqlite && !sqliteAvailable)('重复 runId 拒绝写入且不覆盖原快照', async () => {
    const original = makeRow()
    await store.saveRunSpec(original)
    const duplicate = makeRow()
    duplicate.createdBy = 'actor-2'
    duplicate.spec.nodes[0].config.label = 'replacement'

    await expect(store.saveRunSpec(duplicate)).rejects.toThrow()
    expect(await store.getRunSpec('run-1')).toEqual(original)
  })

  it.skipIf(sqlite && !sqliteAvailable)('copy 保留定义与来源元数据，替换 runId 和 stamp', async () => {
    const source = makeRow()
    await store.saveRunSpec(source)
    const stamp = { createdAt: '2026-11-16T01:00:00.000Z', createdBy: 'actor-2' }

    const copied = await store.copyRunSpec('run-1', 'run-2', stamp)
    const expected: StoredGraphRunSpec = { ...source, runId: 'run-2', ...stamp }
    expect(copied).toEqual(expected)
    expect(await store.getRunSpec('run-2')).toEqual(expected)
    expect(await store.getRunSpec('run-1')).toEqual(source)

    copied.spec.nodes[0].config.label = 'copy-polluted'
    expect((await store.getRunSpec('run-1'))!.spec.nodes[0].config.label).toBe('original')
    expect((await store.getRunSpec('run-2'))!.spec.nodes[0].config.label).toBe('original')
  })

  it.skipIf(sqlite && !sqliteAvailable)('copy 的来源 run 不存在时拒绝且不创建目标', async () => {
    await expect(store.copyRunSpec('missing', 'run-2', {
      createdAt: '2026-11-16T01:00:00.000Z',
      createdBy: 'actor-2',
    })).rejects.toThrow()
    expect(await store.getRunSpec('run-2')).toBeNull()
  })

  it.skipIf(sqlite && !sqliteAvailable)('删除 draft 不删除该 draft 的 run snapshot', async () => {
    const spec = makeSpec()
    const row = makeRow(spec)
    await store.saveSpec({ id: spec.id, version: spec.version, spec })
    await store.saveRunSpec(row)

    await store.deleteSpec(spec.id)
    expect(await store.getSpec(spec.id)).toBeNull()
    expect(await store.getRunSpec(row.runId)).toEqual(row)
  })
})

it.skipIf(!sqliteAvailable)('只含旧三表的 SQLite 库可打开并新增 run snapshot', async () => {
  const dbPath = await tmpFile('old-three-tables.sqlite')
  const spec = makeSpec()
  const { DatabaseSync } = await import('node:sqlite')
  const raw = new DatabaseSync(dbPath)
  raw.exec(`
    CREATE TABLE graph_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL, graph_id TEXT NOT NULL, ts INTEGER NOT NULL,
      kind TEXT NOT NULL, node_id TEXT, iteration INTEGER, super_step INTEGER,
      payload TEXT NOT NULL
    );
    CREATE TABLE graph_checkpoints (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, graph_id TEXT NOT NULL,
      super_step INTEGER NOT NULL, state TEXT NOT NULL, next_nodes TEXT NOT NULL,
      pending_interrupts TEXT NOT NULL, iter_counters TEXT NOT NULL,
      total_cost REAL NOT NULL, started_at_ms INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE graph_specs (
      id TEXT PRIMARY KEY, version INTEGER NOT NULL,
      spec_json TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `)
  raw.prepare('INSERT INTO graph_specs (id, version, spec_json, updated_at) VALUES (?, ?, ?, ?)')
    .run(spec.id, spec.version, JSON.stringify(spec), '2026-11-15T00:00:00.000Z')
  raw.close()

  const store = createEventLogStore(dbPath)
  const row = makeRow(spec)
  await store.saveRunSpec(row)

  expect(await store.getRunSpec(row.runId)).toEqual(row)
  expect(await store.getSpec(spec.id)).toEqual({ id: spec.id, version: spec.version, spec })
})
