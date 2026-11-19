// kanban-bind 测试（Task 9；spec 2026-11-19-ai-native-operating-model-design.md）。
// 三态绑定契约：空→值 成功；已值且相同 幂等成功（unchanged）；已值且不同 →
// {ok:false, code:'outcome_rebind_forbidden'} 且库面零改动。附：任务不存在
// fail-closed、guardrail 武装板（sanctioned-writer 触发器）下写入仍过（UDF 同名注册，
// 与 Python register_write_sanction_udf 同语义）、审计事件 outcome_bound 落账。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { bindOutcomeToTask } from '../kanban-bind'

const nodeRequire: NodeRequire = (() => {
  try { return createRequire('/index.js') } catch { return null as unknown as NodeRequire }
})()

type Db = {
  exec: (sql: string) => void
  prepare: (sql: string) => { get: (...p: unknown[]) => any; all: (...p: unknown[]) => any[] }
  close: () => void
}
const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (p: string) => Db }

let home = ''
let db: Db | null = null

function openBoard(guardrail = false, dbPath = join(home, 'kanban.db')): Db {
  const d = new DatabaseSync(dbPath)
  d.exec(`CREATE TABLE tasks (
    id TEXT PRIMARY KEY, title TEXT, status TEXT,
    outcome_id TEXT, version INTEGER NOT NULL DEFAULT 0)`)
  d.exec(`CREATE TABLE task_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, kind TEXT, payload TEXT, created_at INTEGER)`)
  if (guardrail) {
    // 宿主武装态缩影：sanctioned-writer 触发器（kanban_db.py install_guardrail_triggers 同款 WHEN）
    d.exec(`CREATE TRIGGER kanban_guard_tasks_update
      BEFORE UPDATE ON tasks FOR EACH ROW
      WHEN kanban_write_sanctioned() <> 1
      BEGIN SELECT RAISE(ABORT, 'unsanctioned kanban write'); END`)
  }
  return d
}

function addTask(id: string, outcomeId: string | null): void {
  db!.prepare('INSERT INTO tasks (id, title, status, outcome_id) VALUES (?, ?, ?, ?)').run(id, 't', 'todo', outcomeId)
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'kanban-bind-'))
  mkdirSync(home, { recursive: true })
  db = openBoard()
})

afterEach(() => {
  try { db?.close() } catch { /* noop */ }
  db = null
  rmSync(home, { recursive: true, force: true })
})

describe('bindOutcomeToTask 三态契约', () => {
  it('空→值：成功落库并落 outcome_bound 审计事件', () => {
    addTask('tk-1', null)
    const r = bindOutcomeToTask('tk-1', 'oc-1', { home })
    expect(r.ok).toBe(true)
    expect(r.code).toBeUndefined()
    const row = db!.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get('tk-1')
    expect(row.outcome_id).toBe('oc-1')
    const ev = db!.prepare("SELECT payload FROM task_events WHERE task_id = ? AND kind = 'outcome_bound'").all('tk-1')
    expect(ev).toHaveLength(1)
    expect(JSON.parse(String(ev[0].payload))).toMatchObject({ outcomeId: 'oc-1', from: null })
  })

  it('同值重放：幂等成功（unchanged=true），不重复落审计事件', () => {
    addTask('tk-2', 'oc-1')
    const r = bindOutcomeToTask('tk-2', 'oc-1', { home })
    expect(r.ok).toBe(true)
    expect(r.unchanged).toBe(true)
    const ev = db!.prepare("SELECT COUNT(*) AS n FROM task_events WHERE task_id = ? AND kind = 'outcome_bound'").get('tk-2')
    expect(Number(ev.n)).toBe(0)
  })

  it('已值且不同：拒绝 outcome_rebind_forbidden，库面零改动', () => {
    addTask('tk-3', 'oc-1')
    const r = bindOutcomeToTask('tk-3', 'oc-2', { home })
    expect(r).toMatchObject({ ok: false, code: 'outcome_rebind_forbidden' })
    const row = db!.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get('tk-3')
    expect(row.outcome_id).toBe('oc-1')
    const ev = db!.prepare('SELECT COUNT(*) AS n FROM task_events WHERE task_id = ?').get('tk-3')
    expect(Number(ev.n)).toBe(0)
  })

  it('任务不存在：fail-closed task_not_found', () => {
    const r = bindOutcomeToTask('tk-none', 'oc-1', { home })
    expect(r).toMatchObject({ ok: false, code: 'task_not_found' })
  })

  it('空 outcomeId：拒绝 invalid_outcome_id（不把「空」当可写值）', () => {
    addTask('tk-4', null)
    const r = bindOutcomeToTask('tk-4', '', { home })
    expect(r).toMatchObject({ ok: false, code: 'invalid_outcome_id' })
    const row = db!.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get('tk-4')
    expect(row.outcome_id).toBeNull()
  })

  it('guardrail 武装板：同名 sanction UDF 注册后写入仍过（Python register_write_sanction_udf 同语义）', () => {
    db!.close()
    // 命名板（guard）建武装库；主库无该卡——顺带覆盖跨板定位
    const guardDir = join(home, 'kanban', 'boards', 'guard')
    mkdirSync(guardDir, { recursive: true })
    db = openBoard(true, join(guardDir, 'kanban.db'))
    addTask('tk-5', null)
    const r = bindOutcomeToTask('tk-5', 'oc-1', { home })
    expect(r.ok).toBe(true)
    expect(r.board).toBe('guard')
    const row = db!.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get('tk-5')
    expect(row.outcome_id).toBe('oc-1')
  })
})
