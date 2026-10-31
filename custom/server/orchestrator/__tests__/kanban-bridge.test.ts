// custom/server/orchestrator/__tests__/kanban-bridge.test.ts
// 看板事件桥：只读游标增量、字段映射、秒→毫秒（2026-10-31 A+B 批 spec §5.1）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bridgeOnce } from '../kanban-bridge'
import { resetOrchestratorForTests } from '../store'
import { setAdmission } from '../admission'
import { defaultCells } from '../admission'

let dir: string
let dbPath: string
let prevDb: string | undefined
let prevAdmissions: string | undefined

function makeKanbanDb(events: Array<{ task_id: string; kind: string; payload?: string; created_at: number }>): void {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (p: string) => { exec(sql: string): void; prepare(sql: string): { run(...a: unknown[]): unknown }; close(): void }
  }
  const db = new DatabaseSync(dbPath)
  db.exec(`CREATE TABLE task_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL, run_id INTEGER, kind TEXT NOT NULL,
    payload TEXT, created_at INTEGER NOT NULL)`)
  for (const e of events) {
    db.prepare('INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)')
      .run(e.task_id, e.kind, e.payload ?? null, e.created_at)
  }
  db.close()
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orch-bridge-'))
  dbPath = join(dir, 'kanban.db')
  prevDb = process.env.ORCHESTRATOR_DB
  prevAdmissions = process.env.ORCHESTRATOR_ADMISSIONS
  process.env.ORCHESTRATOR_DB = join(dir, 'orch.sqlite')
  process.env.ORCHESTRATOR_ADMISSIONS = join(dir, 'admissions.json')
  resetOrchestratorForTests()
})

afterEach(() => {
  resetOrchestratorForTests()
  if (prevDb === undefined) delete process.env.ORCHESTRATOR_DB
  else process.env.ORCHESTRATOR_DB = prevDb
  if (prevAdmissions === undefined) delete process.env.ORCHESTRATOR_ADMISSIONS
  else process.env.ORCHESTRATOR_ADMISSIONS = prevAdmissions
  rmSync(dir, { recursive: true, force: true })
})

describe('kanban-bridge', () => {
  it('库不存在时 fail-soft 返回空', () => {
    expect(bridgeOnce(join(dir, 'missing.db'))).toEqual([])
  })

  it('首次桥接全量，第二次按游标不重复', () => {
    makeKanbanDb([
      { task_id: 't-1', kind: 'column_transition', payload: '{"from":"todo","to":"ready"}', created_at: 1000 },
      { task_id: 't-1', kind: 'claimed', created_at: 1001 },
    ])
    const first = bridgeOnce(dbPath)
    expect(first.length).toBe(2)
    expect(first[0]!.trigger.sourceKind).toBe('kanban')
    expect(first[0]!.trigger.threadKey).toBe('task:default:t-1')
    // 秒 → 毫秒
    expect(first[0]!.trigger.receivedAt).toBe(1_000_000)
    expect(first[0]!.trigger.actor).toBe('kanban:column_transition')
    expect(first[0]!.trigger.addressed).toBe(true)

    expect(bridgeOnce(dbPath).length).toBe(0)
  })

  it('增量：新增事件只桥新行', () => {
    makeKanbanDb([{ task_id: 't-2', kind: 'completed', created_at: 2000 }])
    expect(bridgeOnce(dbPath).length).toBe(1)
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (p: string) => { prepare(sql: string): { run(...a: unknown[]): unknown }; close(): void }
    }
    const db = new DatabaseSync(dbPath)
    db.prepare('INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, NULL, ?)')
      .run('t-2', 'blocked', 2001)
    db.close()
    const second = bridgeOnce(dbPath)
    expect(second.length).toBe(1)
    expect(second[0]!.trigger.payload).toMatchObject({ kind: 'blocked', taskId: 't-2' })
  })

  it('名单内 + auto 时实际接单，threadKey 按任务归组', () => {
    makeKanbanDb([{ task_id: 't-3', kind: 'review_requested', created_at: 3000 }])
    setAdmission({
      sourceId: 'kanban:default', mode: 'auto',
      allowedSenders: ['kanban:review_requested'], cells: defaultCells(),
    }, 'tester')
    const rows = bridgeOnce(dbPath)
    expect(rows.length).toBe(1)
    expect(rows[0]!.accepted).toBe(true)
    expect(rows[0]!.trigger.threadKey).toBe('task:default:t-3')
  })
})
