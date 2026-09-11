// P2 台账⑥ — GraphSpec 持久化从 .loop/graph-specs.json 文件切 event-log 同库 specs 表
// 覆盖：表 CRUD 委托 / 文件迁移兜底（表空时读一次灌入）/ 表优先 / REST GET /api/graph/specs 不变
import { describe, it, expect, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { GraphSpecStore, createGraphRunRouter } from '../../../../server/loop/graph/graph-rest'
import { GraphService } from '../../../../server/loop/graph/graph-service'
import { createEventLogStore, InMemoryEventLogStore, type EventLogStore } from '../../../../server/loop/graph/event-log-store'
import type { GraphSpec } from '../../../../server/loop/graph/graph-spec'
import type { Router } from '@koa/router'

const sqliteAvailable = await (async () => {
  try {
    const { DatabaseSync } = await import('node:sqlite')
    new DatabaseSync(':memory:').close()
    return true
  } catch {
    return false
  }
})()

function makeSpec(id: string, version = 1): GraphSpec {
  return {
    id, version,
    channels: {},
    nodes: [{ id: 'a', type: 'function', config: {} }],
    edges: [], entryNode: 'a',
    limits: { maxSteps: 10 },
  }
}

/** 与 assembly.test.ts 相同的路由直调（不起 HTTP 服务） */
async function invoke(router: Router, method: 'get' | 'post', actualPath: string, body?: unknown) {
  const layer = router.stack.find(l =>
    (l.methods as unknown as string[]).includes(method.toUpperCase()) &&
    new RegExp(`^${l.path.split('/').map(s => s.startsWith(':') ? '([^/]+)' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/')}/?$`).test(actualPath))
  if (!layer) throw new Error(`route not found: ${method} ${actualPath}`)
  const handler = layer.stack[layer.stack.length - 1] as (ctx: unknown) => Promise<void>
  const ctx = { params: {}, query: {}, request: { body }, body: undefined as unknown, status: 200 }
  await handler(ctx)
  return ctx
}

const tmpDirs: string[] = []
async function tmpFile(name: string): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'graph-specs-'))
  tmpDirs.push(dir)
  return join(dir, name)
}
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map(d => fs.rm(d, { recursive: true, force: true })))
})

describe('GraphSpecStore via event-log specs table (P2 台账⑥)', () => {
  it('save delegates to the table; load reads it back (InMemory deps)', async () => {
    const table: EventLogStore = new InMemoryEventLogStore()
    const store = new GraphSpecStore(table)
    await store.save(makeSpec('spec-1'))
    await store.save(makeSpec('spec-2', 2))
    expect((await table.listSpecs()).map(r => r.id)).toEqual(['spec-1', 'spec-2'])

    // 新实例从表恢复（重启语义）
    const fresh = new GraphSpecStore(table)
    expect(fresh.list()).toEqual([])
    await fresh.load()
    expect(fresh.list().map(s => s.id)).toEqual(['spec-1', 'spec-2'])
    expect(fresh.get('spec-2')?.version).toBe(2)
  })

  it.skipIf(!sqliteAvailable)('save delegates to the sqlite table; load reads it back', async () => {
    const dbPath = await tmpFile('specs.sqlite')
    const table = createEventLogStore(dbPath)
    const store = new GraphSpecStore(table)
    await store.save(makeSpec('loop-a'))

    // 重启：新 store 新开同一 db 文件，从表恢复
    const reopened = new GraphSpecStore(createEventLogStore(dbPath))
    expect(reopened.list()).toEqual([])
    await reopened.load()
    expect(reopened.list().map(s => s.id)).toEqual(['loop-a'])
  })

  it.skipIf(!sqliteAvailable)('seeds the table once from the JSON file when the table is empty (migration fallback)', async () => {
    const dbPath = await tmpFile('specs.sqlite')
    const filePath = await tmpFile('graph-specs.json')
    await fs.writeFile(filePath, JSON.stringify([makeSpec('legacy-1'), makeSpec('legacy-2', 4)]), 'utf-8')

    const table = createEventLogStore(dbPath)
    const store = new GraphSpecStore(table, filePath)
    await store.load()
    expect(store.list().map(s => s.id)).toEqual(['legacy-1', 'legacy-2'])
    // 灌入必须落表，而不只是内存。台账 #11：表内额外多一行灌入完成标记
    //（__file-seed-complete__，不进 GraphSpecStore 内存表/REST 列表）
    const tableIds = (await table.listSpecs()).map(r => r.id)
    expect(tableIds).toEqual(expect.arrayContaining(['legacy-1', 'legacy-2', '__file-seed-complete__']))
    expect(tableIds).toHaveLength(3)
    expect(await table.getSpec('legacy-2')).toMatchObject({ id: 'legacy-2', version: 4 })

    // 二次加载：表已有数据 → 以表为准，文件不再回读（此时文件里多出的 spec 不得出现）
    await fs.writeFile(filePath, JSON.stringify([makeSpec('legacy-1'), makeSpec('legacy-2', 4), makeSpec('legacy-3')]), 'utf-8')
    const again = new GraphSpecStore(createEventLogStore(dbPath), filePath)
    await again.load()
    expect(again.list().map(s => s.id)).toEqual(['legacy-1', 'legacy-2'])
  })

  // 台账 #11（顺延 P4 清偿）：specs 灌入中途崩溃窗口——部分落表（无完成标记）后重启，
  // load 必须续跑完成剩余文件 spec（已落表的跳过），而非因表非空按"表为准"丢弃剩余
  it.skipIf(!sqliteAvailable)('resumes seeding the remaining file specs after a partial seed crash (台账 #11)', async () => {
    const dbPath = await tmpFile('specs-partial.sqlite')
    const filePath = await tmpFile('graph-specs.json')
    await fs.writeFile(filePath, JSON.stringify([makeSpec('legacy-1'), makeSpec('legacy-2', 4), makeSpec('legacy-3')]), 'utf-8')

    // 模拟灌入中途崩溃：表内只落了第一个 spec（无完成标记行）
    const crashed = createEventLogStore(dbPath)
    await crashed.saveSpec({ id: 'legacy-1', version: 1, spec: makeSpec('legacy-1') })

    // 重启续跑：load 补落剩余两个，legacy-1 保留表内既有版本（不重写）
    const store = new GraphSpecStore(createEventLogStore(dbPath), filePath)
    await store.load()
    expect(store.list().map(s => s.id)).toEqual(['legacy-1', 'legacy-2', 'legacy-3'])
    const table = createEventLogStore(dbPath)
    expect((await table.listSpecs()).map(r => r.id)).toEqual(
      expect.arrayContaining(['legacy-1', 'legacy-2', 'legacy-3', '__file-seed-complete__']))
    expect(await table.getSpec('legacy-2')).toMatchObject({ version: 4 })

    // 续跑完成后写标记：此后表为准——文件新增 spec 不再回灌（已删除 spec 不从过期文件复活）
    await fs.writeFile(filePath, JSON.stringify([makeSpec('legacy-1'), makeSpec('legacy-2', 4), makeSpec('legacy-3'), makeSpec('legacy-4')]), 'utf-8')
    const again = new GraphSpecStore(createEventLogStore(dbPath), filePath)
    await again.load()
    expect(again.list().map(s => s.id)).toEqual(['legacy-1', 'legacy-2', 'legacy-3'])
  })

  it('ignores the file path when no table dep is given (legacy in-memory posture)', async () => {
    const filePath = await tmpFile('graph-specs.json')
    await fs.writeFile(filePath, JSON.stringify([makeSpec('file-only')]), 'utf-8')
    const store = new GraphSpecStore(undefined, filePath)
    await store.load()
    expect(store.list().map(s => s.id)).toEqual(['file-only'])
    await store.save(makeSpec('file-only-2'))
    // 无表依赖时维持旧文件语义（既有测试 new GraphSpecStore() 依赖此路径）
    const reread = new GraphSpecStore(undefined, filePath)
    await reread.load()
    expect(reread.list().map(s => s.id)).toEqual(['file-only', 'file-only-2'])
  })
})

describe('REST GET /api/graph/specs unchanged on table-backed store', () => {
  it('POST persists via table; GET lists; a reopened store over the same table serves the same list', async () => {
    const dbPath = await tmpFile('rest-specs.sqlite')
    const spec = makeSpec('spec-rest', 7)
    const store1 = new GraphSpecStore(createEventLogStore(dbPath))
    await store1.load() // 装配层启动语义
    const router = createGraphRunRouter({
      graphService: new GraphService({ eventLog: new InMemoryEventLogStore() }),
      eventLog: new InMemoryEventLogStore(),
      specStore: store1,
    })
    const post = await invoke(router, 'post', '/api/graph/specs', spec)
    expect(post.status).toBe(200)
    const get1 = await invoke(router, 'get', '/api/graph/specs')
    // P4：POST 落库时缺省 origin 标 'editor'
    expect((get1.body as { specs: Array<{ id: string; version: number }> }).specs).toEqual([{ ...spec, origin: 'editor' }])

    // 重启（同一表重新装配 + load）后 GET 行为不变
    const store2 = new GraphSpecStore(createEventLogStore(dbPath))
    await store2.load()
    const router2 = createGraphRunRouter({
      graphService: new GraphService({ eventLog: new InMemoryEventLogStore() }),
      eventLog: new InMemoryEventLogStore(),
      specStore: store2,
    })
    const get2 = await invoke(router2, 'get', '/api/graph/specs')
    expect((get2.body as { specs: Array<{ id: string; version: number }> }).specs).toEqual([{ ...spec, origin: 'editor' }])
  })
})
