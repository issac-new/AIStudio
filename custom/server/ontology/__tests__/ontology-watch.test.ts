// 结卡校验面守门（四阶段）：单任务增量摄取+校验（单条替换/邻居不连坐/缺席不伪造）
// + column_transition 轮询环（断点续跑/只推 error/聚合幂等）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ingestSingleTask, pushViolationsToInbox, ensureOntologyWatcher } from '../ontology-watch'
import { loadInstances } from '../ontology-store'
import { listConflictInbox } from '../../knowledge/board-graph'

let home: string
let ontoDir: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ontowatch-home-'))
  ontoDir = mkdtempSync(join(tmpdir(), 'ontowatch-store-'))
  process.env.HERMES_HOME = join(home, '.hermes')
  process.env.ONTOLOGY_DIR = ontoDir
  process.env.GOVERNANCE_CONFLICT_INBOX = join(ontoDir, 'inbox.jsonl')
  process.env.ONTOLOGY_WATCH_STATE = join(ontoDir, 'watch-state.json')
  const dbDir = join(home, '.hermes', 'kanban', 'boards', 'b1')
  mkdirSync(dbDir, { recursive: true })
  const db = new DatabaseSync(join(dbDir, 'kanban.db'))
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, assignee TEXT, status TEXT, estimate_days REAL)')
  db.exec('CREATE TABLE task_links (parent_id TEXT, child_id TEXT)')
  db.exec('CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, run_id TEXT, kind TEXT, payload TEXT, created_at INTEGER)')
  db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?)').run('t1', '任务一', 'orchestrator', 'running', 2)
  db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?)').run('t9', '坏任务', 'orchestrator', 'banana', null)
  db.prepare('INSERT INTO task_events VALUES (?, ?, ?, ?, ?, ?)').run(1, 't1', null, 'column_transition', JSON.stringify({ status: 'done' }), 100)
  db.prepare('INSERT INTO task_events VALUES (?, ?, ?, ?, ?, ?)').run(2, 't9', null, 'column_transition', JSON.stringify({ status: 'done' }), 101)
  db.close()
})

afterEach(() => {
  delete process.env.HERMES_HOME
  delete process.env.ONTOLOGY_DIR
  delete process.env.GOVERNANCE_CONFLICT_INBOX
  delete process.env.ONTOLOGY_WATCH_STATE
  rmSync(home, { recursive: true, force: true })
  rmSync(ontoDir, { recursive: true, force: true })
})

describe('ingestSingleTask（单任务增量摄取+校验）', () => {
  it('单条替换：该任务实例更新，其余 kb: 实例不动；合法任务写入', async () => {
    // 先放一个旧的 t1 摄取实例（旧状态）+ 一个无关 kb: 实例
    const { replaceIngested } = await import('../ontology-store')
    replaceIngested('kb:', [
      { id: 'kb:b1:task:t1', type: 'Task', label: '旧态', data: { title: '任务一', status: 'todo', taskRef: 'b1#t1' }, relations: [], updatedAt: 1 },
      { id: 'kb:other:x', type: 'Board', label: '别板', data: { slug: 'other' }, relations: [], updatedAt: 1 },
    ])
    const r = await ingestSingleTask('b1', 't1')
    expect(r.found).toBe(true)
    expect(r.ok).toBe(true)  // running 是九态合法值
    const inst = loadInstances()
    const t1 = inst.find((x) => x.id === 'kb:b1:task:t1')!
    expect(t1.data.status).toBe('running')  // 新态覆盖
    expect(inst.some((x) => x.id === 'kb:other:x')).toBe(true)  // 邻居不动
  })

  it('违规拒写（坏 status）且返回该任务违规；任务缺席不伪造（found=false）', async () => {
    const bad = await ingestSingleTask('b1', 't9')
    expect(bad.ok).toBe(false)
    expect(bad.violations.some((v) => v.code === 'field:enum' && v.subject === 'kb:b1:task:t9')).toBe(true)
    expect(loadInstances().some((x) => x.id === 'kb:b1:task:t9')).toBe(false)
    const ghost = await ingestSingleTask('b1', 't-ghost')
    expect(ghost.found).toBe(false)
    expect(ghost.written).toBe(false)
  })
})

describe('OntologyWatcher（column_transition 轮询环）', () => {
  it('一轮扫完两事件：done 摄取、坏任务违规聚合进收件箱、断点推进', async () => {
    const w = ensureOntologyWatcher()
    const r = await w.runOnce()
    expect(r.checked).toBeGreaterThanOrEqual(2)
    expect(r.ingested).toBeGreaterThanOrEqual(1)   // t1 摄取成功
    expect(r.violations).toBeGreaterThanOrEqual(1) // t9 违规
    expect(r.inboxPushed).toBeGreaterThanOrEqual(1)
    // 收件箱聚合条目（kind=ontology，未决）
    const box = listConflictInbox().filter((e) => e.kind === 'ontology' && !e.resolved)
    expect(box.some((e) => e.field === 'field:enum')).toBe(true)
    // 断点状态文件推进（两事件 id 已过）
    const st = JSON.parse(readFileSync(join(ontoDir, 'watch-state.json'), 'utf8'))
    expect(st.lastEventId).toBeGreaterThanOrEqual(2)
    // 第二轮：无新事件零动作（幂等）
    const r2 = await w.runOnce()
    expect(r2.checked).toBe(0)
    expect(r2.inboxPushed).toBe(0)
  })

  it('pushViolationsToInbox 只推 error 且同 code 幂等', () => {
    const v = [
      { severity: 'error', code: 'field:enum', subject: 'a', detail: 'x' },
      { severity: 'error', code: 'field:enum', subject: 'b', detail: 'x' },
      { severity: 'warning', code: 'field:required', subject: 'c', detail: 'y' },
    ]
    expect(pushViolationsToInbox(v)).toBe(1)  // 两同码 error 聚 1；warning 不进
    expect(pushViolationsToInbox(v)).toBe(0)  // 未决同码幂等
  })
})
