// overlay/custom/server/__tests__/kanban-read-cache.test.ts
// 看板读缓存中间件守门（2026-09-30 性能批）：
//   · 白名单 GET：首请求回源并缓存，TTL 内二次命中（X-Kanban-Cache: hit），next 只调一次；
//   · 并发同键 single-flight：共享一次回源；
//   · 键含用户（stats/assignees 有按用户可见性过滤——跨用户不得串数据）；
//   · 非 GET 看板请求落定即全量失效；
//   · 白名单外 GET 与非看板路径直接放行。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { __resetKanbanReadCacheForTest, kanbanReadCache } from '../middleware/kanban-read-cache'

function mkCtx(path: string, method = 'GET', userId = 7) {
  const ctx: Record<string, unknown> = {
    path,
    url: path + (path.includes('?') ? '' : ''),
    method,
    state: userId === null ? {} : { user: { id: userId } },
    status: 404,
    body: undefined,
    headers: {} as Record<string, string>,
    set: vi.fn((k: string, v: string) => { (ctx.headers as Record<string, string>)[k] = v }),
  }
  if (path.includes('?')) {
    ctx.url = path
    ctx.path = path.split('?')[0]
  }
  return ctx as never
}

async function run(ctx: never, nextImpl?: () => Promise<void> | void) {
  const next = vi.fn(nextImpl ?? (async () => { /* 上游处理器占位 */ }))
  await kanbanReadCache(ctx, next)
  return next
}

describe('kanbanReadCache — 看板读端点 TTL 缓存（性能批守门）', () => {
  beforeEach(() => { __resetKanbanReadCacheForTest() })

  it('白名单 GET：首请求回源；TTL 内二次命中免回源', async () => {
    const upstream = vi.fn(async () => { /* 模拟上游慢处理器 */ })
    const c1 = mkCtx('/api/hermes/kanban/boards')
    ;(c1 as unknown as { status: number }).status = 200
    const n1 = await run(c1, async () => { (c1 as unknown as { status: number }).status = 200; (c1 as unknown as { body: unknown }).body = { boards: [1] }; await upstream() })
    expect(n1).toHaveBeenCalledTimes(1)

    const c2 = mkCtx('/api/hermes/kanban/boards')
    const n2 = await run(c2)
    expect(n2).not.toHaveBeenCalled()
    expect((c2 as unknown as { body: { boards: number[] } }).body).toEqual({ boards: [1] })
    expect((c2 as unknown as { headers: Record<string, string> }).headers['X-Read-Cache']).toBe('hit')
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('键含用户：不同用户不串缓存', async () => {
    const c1 = mkCtx('/api/hermes/kanban/stats?board=default', 'GET', 7)
    await run(c1, async () => { (c1 as unknown as { status: number }).status = 200; (c1 as unknown as { body: unknown }).body = { for: 7 } })
    const c2 = mkCtx('/api/hermes/kanban/stats?board=default', 'GET', 9)
    const n2 = await run(c2, async () => { (c2 as unknown as { status: number }).status = 200; (c2 as unknown as { body: unknown }).body = { for: 9 } })
    expect(n2).toHaveBeenCalledTimes(1)
    expect((c2 as unknown as { body: { for: number } }).body).toEqual({ for: 9 })
  })

  it('非 GET 看板请求：放行后全量失效（同进程 UI 变更即时生效）', async () => {
    const c1 = mkCtx('/api/hermes/kanban/boards')
    await run(c1, async () => { (c1 as unknown as { status: number }).status = 200; (c1 as unknown as { body: unknown }).body = { v: 1 } })
    const mut = mkCtx('/api/hermes/kanban/tasks/t1/assign', 'POST')
    const nMut = await run(mut, async () => { (mut as unknown as { status: number }).status = 200 })
    expect(nMut).toHaveBeenCalledTimes(1)
    const c2 = mkCtx('/api/hermes/kanban/boards')
    const n2 = await run(c2, async () => { (c2 as unknown as { status: number }).status = 200; (c2 as unknown as { body: unknown }).body = { v: 2 } })
    expect(n2).toHaveBeenCalledTimes(1)
    expect((c2 as unknown as { body: { v: number } }).body).toEqual({ v: 2 })
  })

  it('白名单外 GET 与非看板路径：直接放行不缓存', async () => {
    const cOut1 = mkCtx('/api/hermes/kanban/t-1')
    const n1 = await run(cOut1)
    expect(n1).toHaveBeenCalledTimes(1)
    const cOut2 = mkCtx('/api/hermes/fleet/sessions')
    const n2 = await run(cOut2)
    expect(n2).toHaveBeenCalledTimes(1)
  })

  it('并发同键 single-flight：共享一次回源', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const c1 = mkCtx('/api/hermes/kanban/assignees?board=default')
    const c2 = mkCtx('/api/hermes/kanban/assignees?board=default')
    const p1 = run(c1, async () => { await gate; (c1 as unknown as { status: number }).status = 200; (c1 as unknown as { body: unknown }).body = { a: 1 } })
    const p2 = run(c2)
    // 给 p2 一个进入中间件的机会（同为微任务排队）
    await Promise.resolve()
    release()
    await Promise.all([p1, p2])
    const secondNext = await (async () => {
      const c3 = mkCtx('/api/hermes/kanban/assignees?board=default')
      const n3 = await run(c3)
      return n3
    })()
    expect(secondNext).not.toHaveBeenCalled()
    expect((c2 as unknown as { body: { a: number } }).body).toEqual({ a: 1 })
  })
})
