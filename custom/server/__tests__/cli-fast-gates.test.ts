// overlay/custom/server/__tests__/cli-fast-gates.test.ts
// 快 404 闸守门（2026-10-14 回归轮 D4/D5）：
//   · kanbanTaskFast404：GET /:id 家族（含 /log、/attachments 子路径）对「库可读
//     且查无」秒回 404 且不再进 CLI；存在/保留字/库不可读/非 GET 一律放行——
//     闸语义只快不慢（fail-open 红线）。
//   · profileFast404：GET /:name（含 /runtime-status）对磁盘清单外的名字秒回
//     404；清单函数不可用（null）时放行。
//   · D4 四域读缓存：白名单 GET 命中；同前缀非 GET 落定即失效；非白名单
//     （如 mcp jobs 类动态面）不缓存。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import {
  createKanbanTaskFast404,
  createProfileFast404,
} from '../middleware/cli-fast-gates'
import {
  __resetKanbanReadCacheForTest,
  skillsReadCache,
  pluginsReadCache,
  mcpReadCache,
  runtimeVersionsReadCache,
} from '../middleware/kanban-read-cache'

function mkCtx(path: string, method = 'GET', query: Record<string, string> = {}) {
  const ctx: Record<string, unknown> = {
    path: path.split('?')[0],
    url: path,
    method,
    query,
    state: { user: { id: 7 } },
    status: 404,
    body: undefined,
    headers: {} as Record<string, string>,
    set: vi.fn((k: string, v: string) => { (ctx.headers as Record<string, string>)[k] = v }),
    get: (k: string) => (ctx.headers as Record<string, string>)[k.toLowerCase()] ?? '',
  }
  return ctx as never
}

async function run(mw: (ctx: never, next: () => Promise<void>) => Promise<void>, ctx: never, nextImpl?: () => Promise<void> | void) {
  const next = vi.fn(nextImpl ?? (async () => { /* 放行占位 */ }))
  await mw(ctx, next)
  return next
}

/** 临时 kanban 根：<root>/kanban.db 含单任务 t_exists1。 */
function makeKanbanRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'fastgate-kanban-'))
  const db = new DatabaseSync(join(root, 'kanban.db'))
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT)')
  db.prepare('INSERT INTO tasks (id, title) VALUES (?, ?)').run('t_exists1', 'probe')
  db.close()
  return root
}

describe('kanbanTaskFast404 — 看板任务快 404 闸（D4）', () => {
  it('库可读且查无此任务：/:id、/:id/log、/:id/attachments/:att 秒回 404，不再进 CLI', async () => {
    const root = makeKanbanRoot()
    const mw = createKanbanTaskFast404({ cliRoot: () => root })
    try {
      for (const p of ['/api/hermes/kanban/t_bogus', '/api/hermes/kanban/t_bogus/log', '/api/hermes/kanban/t_bogus/attachments/a1']) {
        const c = mkCtx(p)
        const next = await run(mw, c)
        expect(next).not.toHaveBeenCalled()
        expect((c as unknown as { status: number }).status).toBe(404)
      }
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('任务存在：放行（/:id 与 /:id/log 都不得被闸吞）', async () => {
    const root = makeKanbanRoot()
    const mw = createKanbanTaskFast404({ cliRoot: () => root })
    try {
      for (const p of ['/api/hermes/kanban/t_exists1', '/api/hermes/kanban/t_exists1/log']) {
        const next = await run(mw, mkCtx(p))
        expect(next).toHaveBeenCalledTimes(1)
      }
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('保留字子路由不经闸（有真实 handler，不得抢答 404）', async () => {
    const root = makeKanbanRoot()
    const mw = createKanbanTaskFast404({ cliRoot: () => root })
    try {
      for (const p of ['/api/hermes/kanban/boards', '/api/hermes/kanban/stats', '/api/hermes/kanban/overview', '/api/hermes/kanban/timeline']) {
        const next = await run(mw, mkCtx(p))
        expect(next).toHaveBeenCalledTimes(1)
      }
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('库缺失/读不到：fail-open 放行（闸不得比修复前更坏）', async () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), 'fastgate-empty-'))
    const mw = createKanbanTaskFast404({ cliRoot: () => emptyRoot })
    try {
      const next = await run(mw, mkCtx('/api/hermes/kanban/t_bogus'))
      expect(next).toHaveBeenCalledTimes(1)
    } finally { rmSync(emptyRoot, { recursive: true, force: true }) }
  })

  it('board 参数路由到对应分板库；越界/畸形 board 回退 default 语义不放行误判', async () => {
    const root = makeKanbanRoot()
    // 造分板库 swarm（含 t_sw1）
    const boardsDir = join(root, 'kanban', 'boards', 'swarm')
    mkdirSync(boardsDir, { recursive: true })
    const db = new DatabaseSync(join(boardsDir, 'kanban.db'))
    db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY)')
    db.prepare('INSERT INTO tasks (id) VALUES (?)').run('t_sw1')
    db.close()
    const mw = createKanbanTaskFast404({ cliRoot: () => root })
    try {
      // 主库查 t_sw1（在分板 swarm）→ 本板查无但全板存在 → 放行交控制器跨板解析
      // （2026-10-17 回归：曾在此秒回 404，抽屉「看得见卡点开 404」）
      const next1 = await run(mw, mkCtx('/api/hermes/kanban/t_sw1'))
      expect(next1).toHaveBeenCalledTimes(1)
      // 指定 board=swarm → 存在 → 放行
      const next2 = await run(mw, mkCtx('/api/hermes/kanban/t_sw1', 'GET', { board: 'swarm' }))
      expect(next2).toHaveBeenCalledTimes(1)
      // 全板都不存在 → 仍快 404
      const c3 = mkCtx('/api/hermes/kanban/t_bogus_all')
      expect((await run(mw, c3))).not.toHaveBeenCalled()
      expect((c3 as unknown as { status: number }).status).toBe(404)
      // 穿越形态 board 不作为路径参与（安全：不落入文件系统）
      const next3 = await run(mw, mkCtx('/api/hermes/kanban/t_exists1', 'GET', { board: '../../etc' }))
      expect(next3).toHaveBeenCalledTimes(1)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('非 GET 一律放行（写路径不进闸）', async () => {
    const root = makeKanbanRoot()
    const mw = createKanbanTaskFast404({ cliRoot: () => root })
    try {
      const next = await run(mw, mkCtx('/api/hermes/kanban/t_bogus', 'POST'))
      expect(next).toHaveBeenCalledTimes(1)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})

describe('profileFast404 — profiles 快 404 闸（D5）', () => {
  const lister = () => ['default', 'swarm', 'pay'] as string[]

  it('清单外的 profile 名：/:name 与 /:name/runtime-status 秒回 404', async () => {
    const mw = createProfileFast404({ listProfileNames: lister })
    for (const p of ['/api/hermes/profiles/nope', '/api/hermes/profiles/nope/runtime-status']) {
      const c = mkCtx(p)
      const next = await run(mw, c)
      expect(next).not.toHaveBeenCalled()
      expect((c as unknown as { status: number }).status).toBe(404)
    }
  })

  it('清单内的 profile：放行交 CLI（既有语义不变）', async () => {
    const mw = createProfileFast404({ listProfileNames: lister })
    const next = await run(mw, mkCtx('/api/hermes/profiles/swarm/runtime-status'))
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('保留字（runtime-statuses 列表）与列表本体不经闸；清单不可用 fail-open', async () => {
    const mw = createProfileFast404({ listProfileNames: lister })
    const n1 = await run(mw, mkCtx('/api/hermes/profiles/runtime-statuses'))
    expect(n1).toHaveBeenCalledTimes(1)
    const n2 = await run(mw, mkCtx('/api/hermes/profiles'))
    expect(n2).toHaveBeenCalledTimes(1)
    const failOpen = createProfileFast404({ listProfileNames: () => null })
    const n3 = await run(failOpen, mkCtx('/api/hermes/profiles/nope/runtime-status'))
    expect(n3).toHaveBeenCalledTimes(1)
  })
})

describe('D4 读缓存扩面 — skills/plugins/mcp/runtime-versions', () => {
  beforeEach(() => { __resetKanbanReadCacheForTest() })

  async function expectCacheRoundtrip(mw: (ctx: never, next: () => Promise<void>) => Promise<void>, path: string, writeMethod: string, writePath: string) {
    const c1 = mkCtx(path)
    await run(mw, c1, async () => { (c1 as unknown as { status: number }).status = 200; (c1 as unknown as { body: unknown }).body = { v: 1 } })
    const c2 = mkCtx(path)
    const next2 = await run(mw, c2)
    expect(next2).not.toHaveBeenCalled()
    expect((c2 as unknown as { headers: Record<string, string> }).headers['X-Read-Cache']).toBe('hit')
    // 同前缀写路径落定 → 失效
    const c3 = mkCtx(writePath, writeMethod)
    await run(mw, c3, async () => { (c3 as unknown as { status: number }).status = 200 })
    const c4 = mkCtx(path)
    const next4 = await run(mw, c4, async () => { (c4 as unknown as { status: number }).status = 200; (c4 as unknown as { body: unknown }).body = { v: 2 } })
    expect(next4).toHaveBeenCalledTimes(1)
  }

  it('skills：列表缓存 + toggle 写失效', async () => {
    await expectCacheRoundtrip(skillsReadCache, '/api/hermes/skills', 'PUT', '/api/hermes/skills/toggle')
  })
  it('plugins：列表缓存 + enable 写失效', async () => {
    await expectCacheRoundtrip(pluginsReadCache, '/api/hermes/plugins', 'POST', '/api/hermes/plugins/k/enable')
  })
  it('mcp：servers 缓存 + reload 写失效；非白名单（jobs 类动态面）不缓存', async () => {
    await expectCacheRoundtrip(mcpReadCache, '/api/hermes/mcp/servers', 'POST', '/api/hermes/mcp/reload')
    const c = mkCtx('/api/hermes/mcp/other')
    const next = await run(mcpReadCache, c, async () => { (c as unknown as { status: number }).status = 200 })
    expect(next).toHaveBeenCalledTimes(1)
  })
  it('runtime-versions：status 缓存 + 写失效；jobs 轮询面不缓存', async () => {
    await expectCacheRoundtrip(runtimeVersionsReadCache, '/api/hermes/runtime-versions', 'POST', '/api/hermes/runtime-versions/restart-webui')
    const c = mkCtx('/api/hermes/runtime-versions/jobs')
    const next = await run(runtimeVersionsReadCache, c, async () => { (c as unknown as { status: number }).status = 200 })
    expect(next).toHaveBeenCalledTimes(1)
  })
})
