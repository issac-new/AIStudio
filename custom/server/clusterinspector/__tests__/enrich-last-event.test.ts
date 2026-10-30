// enrichCardsWithLastEventAt 守门（run23 挂账②：kanban stuck 假阳性根治件配套）。
// 三场景（违一即 FAIL）：
//   ①真实注入：板库 task_events/task_comments 的最大 created_at 落到对应卡的
//     last_event_at（跨表取 max、跨板取 max）。
//   ②fail-soft：HERMES_HOME 指向空目录（无板库）→ 原卡集原样返回不炸。
//   ③无事件卡不动：板库在但该卡无事件/评论 → 行保持无 last_event_at 字段。
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, closeSync, openSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { enrichCardsWithLastEventAt } from '../collectors'

function makeBoardDb(home: string, board: string): string {
  const dir = join(home, 'kanban', 'boards', board)
  mkdirSync(dir, { recursive: true })
  const dbPath = join(dir, 'kanban.db')
  const fd = openSync(dbPath, 'w')
  closeSync(fd)
  return dbPath
}

function seed(dbPath: string, events: Array<[string, number]>, comments: Array<[string, number]>): void {
  // 与控制器同源读法：node:sqlite 直读（Node 24 内置）
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, run_id INTEGER, kind TEXT NOT NULL, payload TEXT, created_at INTEGER NOT NULL)')
  db.exec('CREATE TABLE task_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)')
  const ev = db.prepare('INSERT INTO task_events (task_id, kind, created_at) VALUES (?, ?, ?)')
  for (const [task_id, ts] of events) ev.run(task_id, 'status', ts)
  const cm = db.prepare('INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?, ?, ?, ?)')
  for (const [task_id, ts] of comments) cm.run(task_id, 'fanfan', 'x', ts)
  db.close()
}

describe('enrichCardsWithLastEventAt（run23 挂账②：卡面活动时钟注入）', () => {
  const prevHome = process.env.HERMES_HOME
  afterEach(() => {
    if (prevHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = prevHome
  })

  it('① 真实注入：task_events 与 task_comments 取 max（跨表跨板）', async () => {
    const home = mkdtempSync(join(tmpdir(), 'enrich-last-event.XXXXXX'))
    try {
      seed(makeBoardDb(home, 'b1'), [['t1', 1_000], ['t2', 2_000]], [['t1', 5_000]])
      seed(makeBoardDb(home, 'b2'), [['t2', 9_000]], [])
      process.env.HERMES_HOME = home
      const out = await enrichCardsWithLastEventAt([
        { id: 't1', status: 'blocked' },
        { id: 't2', status: 'blocked' },
        { id: 't9', status: 'blocked' },
      ])
      const byId = Object.fromEntries(out.map((c) => [String(c.id), c]))
      expect(byId.t1.last_event_at).toBe(5_000)   // comments(5k) > events(1k)
      expect(byId.t2.last_event_at).toBe(9_000)   // 跨板取 max
      expect(byId.t9.last_event_at).toBeUndefined() // 板库中无该卡事件
    } finally { rmSync(home, { recursive: true, force: true }) }
  })

  it('② fail-soft：无板库的 HERMES_HOME → 原卡集原样返回', async () => {
    const home = mkdtempSync(join(tmpdir(), 'enrich-empty.XXXXXX'))
    try {
      process.env.HERMES_HOME = home
      const cards = [{ id: 't1', status: 'blocked' }]
      const out = await enrichCardsWithLastEventAt(cards)
      expect(out).toEqual(cards)
    } finally { rmSync(home, { recursive: true, force: true }) }
  })

  it('③ 空卡集短路：不触任何 IO 直接返回', async () => {
    const home = mkdtempSync(join(tmpdir(), 'enrich-none.XXXXXX'))
    try {
      process.env.HERMES_HOME = home
      // 无 boards 目录也可（上一用例已覆盖），此处验证零卡短路
      writeFileSync(join(home, 'marker'), 'x')
      const out = await enrichCardsWithLastEventAt([])
      expect(out).toEqual([])
    } finally { rmSync(home, { recursive: true, force: true }) }
  })
})
