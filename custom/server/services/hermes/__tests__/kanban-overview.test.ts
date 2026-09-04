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
})
