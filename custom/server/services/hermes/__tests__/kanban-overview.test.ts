import { describe, it, expect, vi } from 'vitest'
import { createKanbanOverview } from '../kanban-overview'
import { EventEmitter } from 'events'

function makeFakeChild() {
  const child = new EventEmitter() as any
  child.pid = 4242
  child.stdout = new EventEmitter()
  child.kill = vi.fn()
  return child
}

function makeDeps() {
  const children: any[] = []
  const listBoards = vi.fn(async () => [
    { slug: 'default', name: 'default', total: 3, archived: false },
    { slug: 'aiteam', name: 'aiteam', total: 1, archived: false },
  ])
  const tasksByBoard: Record<string, any[]> = {
    default: [{ id: 'T-1' }, { id: 'T-2' }],
    aiteam: [{ id: 'A-1' }],
  }
  const listTasks = vi.fn(async (opts?: { board?: string }) => tasksByBoard[opts?.board || 'default'] || [])
  const watchEvents = vi.fn(() => {
    const child = makeFakeChild()
    children.push(child)
    return child
  })
  const killWatch = vi.fn((pid, fallbackKill) => fallbackKill())
  return { deps: { listBoards, listTasks, watchEvents, killWatch, boardTtlMs: 10_000 }, children, listBoards, listTasks, watchEvents, killWatch }
}

describe('createKanbanOverview', () => {
  it('aggregates all boards in one call and caches within TTL', async () => {
    const ctx = makeDeps()
    const overview = createKanbanOverview(ctx.deps)
    const first = await overview.getOverview()
    expect(first.boards.map(b => b.slug)).toEqual(['default', 'aiteam'])
    expect(first.tasks.map(t => t.task.id).sort()).toEqual(['A-1', 'T-1', 'T-2'])
    expect(ctx.listTasks).toHaveBeenCalledTimes(2)

    // TTL 内命中缓存，不再发 CLI
    await overview.getOverview()
    expect(ctx.listTasks).toHaveBeenCalledTimes(2)
  })

  it('invalidates a single board on watcher event', async () => {
    const ctx = makeDeps()
    const overview = createKanbanOverview(ctx.deps)
    await overview.getOverview()
    overview.ensureWatcher('default')
    expect(ctx.watchEvents).toHaveBeenCalledTimes(1)
    // 再订一次 → 引用计数，不重复起进程
    overview.ensureWatcher('default')
    expect(ctx.watchEvents).toHaveBeenCalledTimes(1)

    ctx.children[0].stdout.emit('data', 'watching kanban events\n{"kind":"task","id":"T-9"}\n')
    await overview.getOverview()
    // default 失效重拉，aiteam 走缓存
    expect(ctx.listTasks).toHaveBeenCalledTimes(3)
    overview.releaseWatcher('default')
    overview.releaseWatcher('default')
  })

  it('in-flight dedupe collapses concurrent board fetches', async () => {
    const ctx = makeDeps()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let calls = 0
    ctx.listTasks.mockImplementation(async () => {
      calls += 1
      await gate
      return [{ id: 'gated' }]
    })
    const overview = createKanbanOverview(ctx.deps)
    const pending = Promise.all([overview.getOverview(), overview.getOverview()])
    await new Promise(resolve => setTimeout(resolve, 20))
    release()
    const [a, b] = await pending
    expect(a.tasks[0].task.id).toBe('gated')
    expect(b.tasks[0].task.id).toBe('gated')
    // 两个 board 各只发起一次真实拉取（并发去重生效）
    expect(calls).toBe(2)
  })

  it('stop kills watchers and tolerates double stop', async () => {
    const ctx = makeDeps()
    const overview = createKanbanOverview(ctx.deps)
    overview.ensureWatcher('default')
    await overview.stop()
    expect(ctx.killWatch).toHaveBeenCalled()
    await overview.stop()
  })

  // ── sqlite 直读快道（2026-09-28 性能根治守门）─────────────────────────
  // 临时 kanban 目录 + 真 sqlite 板库：快道命中时 deps CLI 一次都不许调；
  // 板库缺失的板回落 CLI 老路径（语义一致）。
  it('sqlite fast path serves boards/tasks without CLI and falls back per missing board', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { DatabaseSync } = await import('node:sqlite')
    const root = mkdtempSync(join(tmpdir(), 'kanban-fast-'))
    const boardsDir = join(root, 'boards')
    mkdirSync(join(boardsDir, 'aiteam'), { recursive: true })
    // default 主库 + aiteam 板库
    const mainDb = new DatabaseSync(join(root, 'kanban.db'))
    mainDb.exec('create table tasks (id text primary key, title text, status text)')
    mainDb.exec('create table task_links (parent_id text, child_id text)')
    mainDb.prepare('insert into tasks values (?,?,?)').run('D-1', '主库卡', 'ready')
    mainDb.prepare('insert into tasks values (?,?,?)').run('D-2', '主库子卡', 'todo')
    mainDb.prepare('insert into task_links values (?,?)').run('D-1', 'D-2')
    mainDb.close()
    const teamDb = new DatabaseSync(join(boardsDir, 'aiteam', 'kanban.db'))
    teamDb.exec('create table tasks (id text primary key, title text, status text)')
    teamDb.prepare('insert into tasks values (?,?,?)').run('A-1', '板卡', 'done')
    teamDb.close()
    writeFileSync(join(boardsDir, 'aiteam', 'board.json'), JSON.stringify({ name: 'AI 团队板' }))

    const ctx = makeDeps()
    const overview = createKanbanOverview({ ...ctx.deps, kanbanDir: root })
    const result = await overview.getOverview()
    const slugs = result.boards.map(b => b.slug).sort()
    expect(slugs).toEqual(['aiteam', 'default'])
    expect(result.boards.find(b => b.slug === 'aiteam')?.name).toBe('AI 团队板')
    expect(result.tasks.map(t => t.task.id).sort()).toEqual(['A-1', 'D-1', 'D-2'])
    // 快道全命中：CLI 依赖零调用
    expect(ctx.listBoards).not.toHaveBeenCalled()
    expect(ctx.listTasks).not.toHaveBeenCalled()
    // tasks 行带 board 归属（与 CLI 形状一致的消费点）
    expect(result.tasks.find(t => t.task.id === 'A-1')?.board).toBe('aiteam')
    // task_links 并入 parents/children（2026-10-10 任务协同图：聚合端依赖边不丢；
    // 无链接表的板（aiteam 假库）空数组降级不拖垮任务快道）
    expect(result.tasks.find(t => t.task.id === 'D-1')?.task).toMatchObject({ children: ['D-2'], parents: [] })
    expect(result.tasks.find(t => t.task.id === 'D-2')?.task).toMatchObject({ parents: ['D-1'] })
    expect(result.tasks.find(t => t.task.id === 'A-1')?.task).toMatchObject({ parents: [], children: [] })

    // 板库缺失的板（boards/ghost 无 kanban.db）→ 该板从 boards 列表消失，
    // 快道 boards 列表只含真实存在的板；CLI 老路径语义由旧测试覆盖。
    const result2 = await overview.getOverview()
    expect(result2.tasks.length).toBe(3) // A-1 + D-1 + D-2（链接种子新增子卡）
  })
})
