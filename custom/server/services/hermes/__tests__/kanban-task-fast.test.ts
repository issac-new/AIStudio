// 任务详情 sqlite 直读快道守门（overlay 709）：
// 1) 命中形状=CLI `kanban show --json` 的七键投影（skills 恒数组/raci dict|null/
//    epoch int|null/payload 与 metadata JSON 解析/runs show 字段子集与排序）；
// 2) fail-soft：板库缺失/任务不存在/板号缺省 → null（回落 CLI 由补丁 709 兜）。
// fixture 用 node:sqlite 就地建库（同一存储引擎、同一 rows 语义）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'kanban-fast-test-'))
const boardDir = join(home, 'kanban', 'boards', 'demo')
mkdirSync(boardDir, { recursive: true })
const dbPath = join(boardDir, 'kanban.db')

beforeAll(async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, body TEXT, assignee TEXT, status TEXT,
      priority INTEGER, created_by TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER,
      workspace_kind TEXT, workspace_path TEXT, branch_name TEXT, tenant TEXT, result TEXT,
      skills TEXT, raci TEXT, session_id TEXT, model_override TEXT, provider_override TEXT,
      reasoning_effort TEXT, max_runtime_seconds INTEGER, max_retries INTEGER, project_id TEXT,
      workflow_template_id TEXT, current_step_key TEXT, completion_contract TEXT, last_failure_error TEXT);
    CREATE TABLE task_events (id INTEGER PRIMARY KEY, task_id TEXT, run_id INTEGER, kind TEXT, payload TEXT, created_at INTEGER);
    CREATE TABLE task_comments (id INTEGER PRIMARY KEY, task_id TEXT, author TEXT, body TEXT, created_at INTEGER);
    CREATE TABLE task_links (parent_id TEXT, child_id TEXT);
    CREATE TABLE task_runs (id INTEGER PRIMARY KEY, task_id TEXT, profile TEXT, step_key TEXT,
      status TEXT, outcome TEXT, summary TEXT, error TEXT, metadata TEXT, worker_pid INTEGER,
      started_at INTEGER, ended_at INTEGER);
    INSERT INTO tasks (id,title,body,assignee,status,priority,created_by,created_at,started_at,completed_at,
      workspace_kind,workspace_path,branch_name,tenant,result,skills,raci,session_id,model_override,
      provider_override,reasoning_effort,max_runtime_seconds,max_retries,project_id,workflow_template_id,
      current_step_key,completion_contract,last_failure_error)
      VALUES ('t_fast1','快道卡','正文','default','ready',2,'user',1793360000,NULL,NULL,
      'dir','/ws/t_fast1',NULL,NULL,NULL,'["codex","pytest"]','{"R":["default"],"A":[],"C":[],"I":[]}',
      NULL,NULL,NULL,NULL,NULL,3,NULL,NULL,NULL,NULL,NULL);
    INSERT INTO tasks (id,title,body,assignee,status,priority,created_by,created_at,started_at,completed_at,
      workspace_kind,workspace_path,branch_name,tenant,result,skills,raci,session_id)
      VALUES ('t_noskills','无技能卡',NULL,'default','done',NULL,'user',1793360001,1793360002,1793360003,
      'scratch',NULL,NULL,NULL,'收尾',NULL,'not-a-json{}',NULL);
    INSERT INTO task_events VALUES (2, 't_fast1', NULL, 'created', '{"x":1}', 1793360000);
    INSERT INTO task_events VALUES (1, 't_fast1', 7, 'review_requested', '{"r":true}', 1793360001);
    INSERT INTO task_comments VALUES (1, 't_fast1', 'reviewer', '看 diff 通过', 1793360005);
    INSERT INTO task_links VALUES ('t_parent', 't_fast1');
    INSERT INTO task_links VALUES ('t_fast1', 't_child_a');
    INSERT INTO task_links VALUES ('t_fast1', 't_child_b');
    INSERT INTO task_runs VALUES (1, 't_fast1', 'default', NULL, 'done', 'ok', '第一次', NULL, '{"turns":3}', 4321, 1793360000, 1793360010);
    INSERT INTO task_runs VALUES (2, 't_fast1', 'default', 'fix', 'done', 'ok', '更晚的摘要', NULL, NULL, NULL, 1793360020, 1793360030);
  `)
  db.close()
})
afterAll(() => { rmSync(home, { recursive: true, force: true }) })

import { readTaskDetailFast, boardDbPath } from '../kanban-task-fast'

describe('readTaskDetailFast（overlay 709 sqlite 直读快道）', () => {
  it('命中：七键齐、task 28 字段、skills 数组/raci dict、epoch 语义', () => {
    const d = readTaskDetailFast('t_fast1', 'demo', home)
    expect(d).not.toBeNull()
    expect(Object.keys(d).sort()).toEqual(['children', 'comments', 'events', 'latest_summary', 'parents', 'runs', 'task'])
    const t = d.task
    expect(Object.keys(t).length).toBe(28)
    expect(t.id).toBe('t_fast1')
    expect(t.skills).toEqual(['codex', 'pytest'])
    expect(t.raci).toEqual({ R: ['default'], A: [], C: [], I: [] })
    expect(t.created_at).toBe(1793360000)
    expect(t.started_at).toBeNull()
    expect(t.priority).toBe(2)
    expect(t.max_retries).toBe(3)
    expect(t.body).toBe('正文')
  })

  it('skills 空/raci 非法 JSON → [] 与 null（CLI 同语义）', () => {
    const d = readTaskDetailFast('t_noskills', 'demo', home)
    expect(d.task.skills).toEqual([])
    expect(d.task.raci).toBeNull()
    expect(d.task.status).toBe('done')
    expect(d.task.completed_at).toBe(1793360003)
  })

  it('events 按 created_at,id 排序且 payload 解析；comments 三字段', () => {
    const d = readTaskDetailFast('t_fast1', 'demo', home)
    expect(d.events.map(e => e.kind)).toEqual(['created', 'review_requested'])
    expect(d.events[0].payload).toEqual({ x: 1 })
    expect(d.events[1].run_id).toBe(7)
    expect(Object.keys(d.comments[0]).sort()).toEqual(['author', 'body', 'created_at'])
    expect(d.comments[0].body).toBe('看 diff 通过')
  })

  it('parents/children 按 id 排序；latest_summary 取最新非空（COALESCE(ended,started) DESC）', () => {
    const d = readTaskDetailFast('t_fast1', 'demo', home)
    expect(d.parents).toEqual(['t_parent'])
    expect(d.children).toEqual(['t_child_a', 't_child_b'])
    expect(d.latest_summary).toBe('更晚的摘要')
  })

  it('runs：show 字段子集（11 字段）、worker_pid 保持整数、metadata JSON、started_at 升序', () => {
    const d = readTaskDetailFast('t_fast1', 'demo', home)
    expect(d.runs.length).toBe(2)
    expect(d.runs.map(r => r.id)).toEqual([1, 2])
    expect(Object.keys(d.runs[0]).sort()).toEqual([...['ended_at','error','id','metadata','outcome','profile','started_at','status','step_key','summary','worker_pid']].sort())
    expect(d.runs[0].worker_pid).toBe(4321)
    expect(d.runs[0].metadata).toEqual({ turns: 3 })
    expect(d.runs[1].metadata).toBeNull()
  })

  it('fail-soft：任务不存在/板库缺失/板号缺省 → null 不炸', () => {
    expect(readTaskDetailFast('t_ghost', 'demo', home)).toBeNull()
    expect(readTaskDetailFast('t_fast1', 'nosuchboard', home)).toBeNull()
    expect(readTaskDetailFast('t_fast1', undefined, home)).toBeNull()
    expect(readTaskDetailFast('', 'demo', home)).toBeNull()
  })

  it('boardDbPath：default 板兼容分板库与旧根级布局', () => {
    expect(boardDbPath('demo', home)).toBe(dbPath)
    // 旧根级布局：<home>/kanban/kanban.db
    const oldRoot = join(home, 'kanban')
    mkdirSync(join(oldRoot), { recursive: true })
    // demo 板库仍在——default 板先查分板；临时造 default 分板
    const defDir = join(home, 'kanban', 'boards', 'default')
    mkdirSync(defDir, { recursive: true })
    const defDb = join(defDir, 'kanban.db')
    writeFileSync(defDb, '')
    expect(boardDbPath('default', home)).toBe(defDb)
  })
})
