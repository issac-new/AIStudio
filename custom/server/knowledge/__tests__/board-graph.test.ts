// 板级共享知识图谱守门（丙7/丙8，2026-09-30 调研落地）：同步幂等（marker）、
// 冲突进收件箱不覆盖、裁决两动作、fail-soft；末组真实 venv 集成（缺席 skip 如实标注）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

let dir: string
let fakePy: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kg-'))
  fakePy = join(dir, 'pyfake')
  writeFileSync(fakePy, '#!/bin/sh\n')
  process.env.SEMANTICA_PYTHON = fakePy
  process.env.SEMANTICA_BOARD_KG_DIR = join(dir, 'kgdir')
  process.env.GOVERNANCE_CONFLICT_INBOX = join(dir, 'inbox.jsonl')
  process.env.GOVERNANCE_BOARD_SYNC_MARKER_DIR = join(dir, 'markers')
  process.env.HERMES_HOME = join(dir, 'home', '.hermes')
})
afterEach(() => {
  for (const k of ['SEMANTICA_PYTHON', 'SEMANTICA_BOARD_KG_DIR', 'GOVERNANCE_CONFLICT_INBOX', 'GOVERNANCE_BOARD_SYNC_MARKER_DIR', 'HERMES_HOME']) {
    delete process.env[k]
  }
  rmSync(dir, { recursive: true, force: true })
})

function makeBoardDb(slug: string, tasks: Array<{ id: string; title: string; assignee: string | null; status: string }>): string {
  // 建在 HERMES_HOME 结构下：路由/直调两种入口同源可寻
  const dbDir = join(dir, 'home', '.hermes', 'kanban', 'boards', slug)
  mkdirSync(dbDir, { recursive: true })
  const db = new DatabaseSync(join(dbDir, 'kanban.db'))
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, assignee TEXT, status TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER)')
  for (const t of tasks) {
    db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, 1, 1, 2)').run(t.id, t.title, t.assignee, t.status)
  }
  db.close()
  return join(dbDir, 'kanban.db')
}

describe('板同步（丙7）：marker 幂等 + fail-soft', () => {
  it('同步两次：第二次零新摄取（marker 生效）；python 缺席如实 kgAvailable=false', async () => {
    makeBoardDb('b1', [
      { id: 't1', title: '实现登录', assignee: 'zcode', status: 'done' },
      { id: 't2', title: '修复崩溃', assignee: null, status: 'done' },
      { id: 't3', title: '在途', assignee: 'zcode', status: 'doing' },  // 非结案不摄取
    ])
    const bg = await import('../board-graph')
    const r1 = await bg.syncBoardGraph('b1')
    expect(r1.scanned).toBe(2)  // 只扫结案（done/archived）
    // fake python（空 sh 脚本 exit 0 无输出）→ bridge 解析不到 JSON → 如实降级：
    // kgAvailable=false，零摄取零关系，不谎报成功。
    expect(r1.kgAvailable).toBe(false)
    expect(r1.ingested).toBe(0)
    expect(r1.relations).toBe(0)
    // marker 未写（kgAvailable=false 不写 marker）→ 重同步仍尝试摄取（不丢数据）
    const r2 = await bg.syncBoardGraph('b1')
    expect(r2.scanned).toBe(2)
  })
})

describe('冲突收件箱（丙8）：append + 裁决', () => {
  it('冲突进收件箱；keep-existing/take-incoming 裁决幂等', async () => {
    const bg = await import('../board-graph')
    const e1 = bg.appendConflictInbox({ board: 'b1', entityId: 'task:t1', field: 'status', existing: 'done', incoming: 'blocked' })
    const e2 = bg.appendConflictInbox({ board: 'b1', entityId: 'task:t2', field: 'title', existing: 'A', incoming: 'B' })
    const inbox = bg.listConflictInbox()
    expect(inbox.map((e) => e.inboxId)).toEqual([e2.inboxId, e1.inboxId])  // 新→旧
    expect(inbox.every((e) => e.resolved === false)).toBe(true)

    const kept = bg.resolveConflictInbox(e1.inboxId, 'keep-existing')
    expect(kept?.resolved).toEqual({ action: 'keep-existing', at: expect.any(Number) })
    const again = bg.resolveConflictInbox(e1.inboxId, 'take-incoming')  // 已裁决：返回原条目不变
    expect((again?.resolved as { action: string }).action).toBe('keep-existing')

    const missing = bg.resolveConflictInbox('ci-none', 'keep-existing')
    expect(missing).toBeNull()
  })
})

describe('HTTP 投影（governance prefix）', () => {
  it('summary/conflicts/resolve 三路 200 + sync 报告结构', async () => {
    makeBoardDb('b1', [{ id: 't1', title: 'x', assignee: 'zcode', status: 'done' }])
    const { createServer } = await import('node:http')
    const Koa = (await import('koa')).default
    const { governanceRoutes } = await import('../../governance/governance-controller')
    const app = new Koa()
    app.use(governanceRoutes.routes())
    const server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }
    try {
      const sum = await fetch(`http://127.0.0.1:${port}/api/governance/knowledge-graph/summary?board=b1`)
      expect(sum.status).toBe(200)
      const sumBody = await sum.json() as { board: string }
      expect(sumBody.board).toBe('b1')
      const cf = await fetch(`http://127.0.0.1:${port}/api/governance/knowledge-graph/conflicts`)
      expect(((await cf.json()) as { inbox: unknown[] }).inbox).toEqual([])
      const bad = await fetch(`http://127.0.0.1:${port}/api/governance/knowledge-graph/conflicts/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inboxId: 'x', action: 'wrong' }),
      })
      expect(bad.status).toBe(400)
      const sync = await fetch(`http://127.0.0.1:${port}/api/governance/knowledge-graph/sync?board=b1`, { method: 'POST' })
      const syncBody = await sync.json() as { results: Array<{ board: string; scanned: number }> }
      expect(syncBody.results[0].board).toBe('b1')
      expect(syncBody.results[0].scanned).toBe(1)
    } finally {
      server.close()
    }
  })
})

describe('真实 python 集成（venv 缺席则跳过如实标注）', () => {
  it('结案摄取→冲突写保护→裁决取新值→marker 幂等', { timeout: 60000 }, async () => {
    const { existsSync } = await import('node:fs')
    const py = join(homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'python')
    if (!existsSync(py)) {
      console.warn('[kg-integration] venv python 缺席，集成跳过')
      return
    }
    process.env.SEMANTICA_PYTHON = py
    const db = makeBoardDb('integ', [
      { id: 't1', title: '任务一', assignee: 'zcode', status: 'done' },
    ])
    const bg = await import('../board-graph')
    const r1 = await bg.syncBoardGraph('integ', db)
    expect(r1.kgAvailable).toBe(true)
    expect(r1.ingested).toBe(1)
    expect(r1.relations).toBe(1)
    const kgFile = join(process.env.SEMANTICA_BOARD_KG_DIR!, 'board-integ.json')
    expect(existsSync(kgFile)).toBe(true)

    // 幂等：第二次同步 marker 命中零新摄取
    const r2 = await bg.syncBoardGraph('integ', db)
    expect(r2.ingested).toBe(0)
    expect(r2.relations).toBe(0)

    // 冲突写保护：同任务改 status 重摄取（清 marker 模拟重复上报）→ 冲突进收件箱且不覆盖
    const markerFile = join(process.env.GOVERNANCE_BOARD_SYNC_MARKER_DIR!, 'board-sync-integ.json')
    rmSync(markerFile, { force: true })
    const db2 = new DatabaseSync(db)
    db2.prepare("UPDATE tasks SET status='archived' WHERE id='t1'").run()
    db2.close()
    const r3 = await bg.syncBoardGraph('integ', db)
    expect(r3.conflicts.length).toBeGreaterThanOrEqual(1)
    expect(r3.conflicts[0].field).toBe('status')
    const inbox = bg.listConflictInbox()
    expect(inbox.length).toBeGreaterThanOrEqual(1)
    expect(inbox[0].incoming).toBe('archived')

    // 裁决取新值：force 重写后图谱接受新值
    const resolved = bg.resolveConflictInbox(inbox[0].inboxId, 'take-incoming')
    expect((resolved?.resolved as { action: string }).action).toBe('take-incoming')
    await new Promise((r) => setTimeout(r, 500))  // 等 force 重写子进程
    const summary = await bg.boardGraphSummary('integ')
    expect(summary.nodes).toBeGreaterThanOrEqual(2)
  })
})
