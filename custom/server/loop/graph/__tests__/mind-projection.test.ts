// overlay/custom/server/loop/graph/__tests__/mind-projection.test.ts
// 思维大脑服务端投影守门（2026-09-15）：kanban tasks/task_runs → 思想核/突触末梢。
// 纯查询投影——不动 kanban 本体、不写图引擎库；库缺失/读失败 → available:false。
// 用 node:sqlite 内存库构造 fixture（与 event-log-store 同一驱动先例，零新依赖）。
//
// @ts-nocheck —— 本文件是 vitest fixture（overlay vitest 跑，非上游运行时路径）；
// 上游 vue-tsc -b 把 src/**/*.ts 全量收进严格 typecheck，而测试 fixture 的
// DatabaseSync 构造在 Node 类型版本间签名漂移（生产端 event-log-store 单参能过、
// fixture 被拒的实测现象），不值得为 fixture 追类型版本。生产端 mind-projection.ts
// 仍受完整 tsc 门禁。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectMindFromKanban } from '../mind-projection'

let dir: string
let dbPath: string

function seed(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT, created_at INTEGER, project_id TEXT);
    CREATE TABLE task_runs (id INTEGER PRIMARY KEY, task_id TEXT, status TEXT, outcome TEXT, started_at INTEGER, ended_at INTEGER, summary TEXT);
  `)
}

function openDb(path: string, readOnly = false): DatabaseSync {
  // 上游 tsc 的 DatabaseSync 构造签名要求 (path, options, ...?) 完整——options 必传
  return new DatabaseSync(path, { open: true, readOnly } as never)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mind-proj-'))
  dbPath = join(dir, 'kanban.db')
  const db = openDb(dbPath)
  seed(db)
  db.close()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function insertTask(db: DatabaseSync, id: string, status: string, title = id): void {
  // node:sqlite 绑参不收 null——fixture 统一 SQL 字面量（值受控）
  db.exec(`INSERT INTO tasks (id, title, status, created_at, project_id) VALUES ('${id}', '${title.replace(/'/g, "''")}', '${status}', 1788250113, NULL)`)
}

function insertRun(db: DatabaseSync, id: number, taskId: string, status: string, outcome: string | null, started: number, ended: number | null): void {
  // node:sqlite 绑参不收 null——用 SQL 字面量构造（测试 fixture，值受控）
  const o = outcome === null ? 'NULL' : `'${outcome}'`
  const e = ended === null ? 'NULL' : String(ended)
  db.exec(`INSERT INTO task_runs (id, task_id, status, outcome, started_at, ended_at, summary) VALUES (${id}, '${taskId}', '${status}', ${o}, ${started}, ${e}, NULL)`)
}

describe('projectMindFromKanban — 数据源可用性', () => {
  it('库缺失 → available:false（前端落空态，不抛错）', () => {
    const p = projectMindFromKanban(join(dir, 'nonexistent.db'))
    expect(p.available).toBe(false)
    expect(p.thoughts).toEqual([])
    expect(p.runs).toEqual([])
  })

  it('库在但表缺失 → available:false（容错降级）', () => {
    const empty = join(dir, 'empty.db')
    const db = openDb(empty)
    db.exec('CREATE TABLE other (id INTEGER)')
    db.close()
    const p = projectMindFromKanban(empty)
    expect(p.available).toBe(false)
  })
})

describe('projectMindFromKanban — 投影映射', () => {
  it('tasks → 思想核（状态归一到大脑词表）；task_runs → 末梢（thoughtId 关联）', () => {
    const db = openDb(dbPath)
    insertTask(db, 't-run', 'running', '进行中任务')
    insertTask(db, 't-blk', 'blocked')
    insertTask(db, 't-done', 'done')
    insertTask(db, 't-rev', 'review')
    insertTask(db, 't-arch', 'archived')
    insertTask(db, 't-idle', 'todo')
    insertRun(db, 1, 't-run', 'running', null, 1789310000, null)
    insertRun(db, 2, 't-done', 'done', 'completed', 1789310000, 1789310600)
    insertRun(db, 3, 't-blk', 'crashed', 'crashed', 1789310000, 1789310060)
    insertRun(db, 4, 't-rev', 'review', 'review_requested', 1789310000, null)
    db.close()

    const p = projectMindFromKanban(dbPath)
    expect(p.available).toBe(true)
    expect(p.thoughts).toHaveLength(6)
    expect(p.runs).toHaveLength(4)

    const byId = Object.fromEntries(p.thoughts.map(t => [t.id, t.status]))
    expect(byId['t-run']).toBe('running')
    expect(byId['t-blk']).toBe('blocked')
    expect(byId['t-done']).toBe('completed')
    expect(byId['t-rev']).toBe('awaiting-review')
    expect(byId['t-arch']).toBe('archived')
    expect(byId['t-idle']).toBe('idle')

    const runById = Object.fromEntries(p.runs.map(r => [r.runId, r]))
    expect(runById['1'].status).toBe('running')          // 无 ended + running → 进行中
    expect(runById['1'].thoughtId).toBe('t-run')
    expect(runById['2'].status).toBe('completed')
    expect(runById['2'].durationSec).toBe(600)           // ended-started
    expect(runById['3'].status).toBe('failed')           // crashed → 失败家族
    expect(runById['4'].status).toBe('awaiting-input')   // review_requested → 待介入
  })

  it('失败家族全映射为 failed（大脑记住失败痕迹）', () => {
    const db = openDb(dbPath)
    insertTask(db, 't1')
    for (const [i, st] of ['crashed', 'gave_up', 'spawn_failed', 'timed_out', 'reclaimed'].entries()) {
      insertRun(db, i + 1, 't1', st, st, 1789310000 + i, 1789310000 + i + 10)
    }
    db.close()
    const p = projectMindFromKanban(dbPath)
    expect(p.runs.every(r => r.status === 'failed')).toBe(true)
  })

  it('进行时长：未结束运行用 now-started（开放时长生长）', () => {
    const db = openDb(dbPath)
    insertTask(db, 't1')
    const startedSec = Math.floor(Date.now() / 1000) - 120
    insertRun(db, 1, 't1', 'running', null, startedSec, null)
    db.close()
    const p = projectMindFromKanban(dbPath)
    expect(p.runs[0].status).toBe('running')
    expect(p.runs[0].durationSec).toBeGreaterThanOrEqual(120)
    expect(p.runs[0].endedAt).toBeNull()
    expect(p.runs[0].startedAt).toBe(new Date(startedSec * 1000).toISOString())
  })

  it('只读语义：投影不改库（再次打开行数不变）', () => {
    const db = openDb(dbPath)
    insertTask(db, 't1')
    insertRun(db, 1, 't1', 'done', 'completed', 1789310000, 1789310600)
    db.close()
    projectMindFromKanban(dbPath)
    const db2 = openDb(dbPath, true)
    const t = db2.prepare('SELECT COUNT(*) c FROM tasks').get() as { c: number }
    const r = db2.prepare('SELECT COUNT(*) c FROM task_runs').get() as { c: number }
    db2.close()
    expect(t.c).toBe(1)
    expect(r.c).toBe(1)
  })
})

describe('projectMindFromKanban — 任务关系边（A2）', () => {
  it('task_links → relations 投影（父子委派）；无表 → 空数组容错', () => {
    const db = openDb(dbPath)
    db.exec(`CREATE TABLE task_links (parent_id TEXT, child_id TEXT)`)
    insertTask(db, 't-parent')
    insertTask(db, 't-child')
    db.exec(`INSERT INTO task_links (parent_id, child_id) VALUES ('t-parent', 't-child')`)
    db.close()
    const p = projectMindFromKanban(dbPath)
    expect(p.available).toBe(true)
    expect(p.relations).toEqual([{ parentId: 't-parent', childId: 't-child' }])
  })

  it('task_links 表缺失（旧库）→ relations 空数组不报错', () => {
    const db = openDb(dbPath)
    insertTask(db, 't1')
    db.close()
    const p = projectMindFromKanban(dbPath)
    expect(p.available).toBe(true)
    expect(p.relations).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// projectMindAggregated — 分板聚合守门（2026-09-28 RFD-002 缺口①修复）
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { projectMindAggregated } from '../mind-projection'

describe('projectMindAggregated — root + 分板聚合', () => {
  it('root 库 + 多分板合并：任务/运行/关系统计；分板 runId 板名限定防撞键；thoughts 带来源板', () => {
    // home 布局：<dir>/kanban.db（root）+ <dir>/kanban/boards/{a,b}/kanban.db
    const root = openDb(dbPath)
    insertTask(root, 't-root', 'done')
    insertRun(root, 1, 't-root', 'completed', 'completed', 100, 160)
    root.close()
    for (const slug of ['board-a', 'board-b']) {
      const bdir = join(dir, 'kanban', 'boards', slug)
      mkdirSync(bdir, { recursive: true })
      const bdb = openDb(join(bdir, 'kanban.db'))
      seed(bdb)
      insertTask(bdb, `t-${slug}`, 'done', slug)
      // 两板 run id 故意相同（板内自增跨板必撞的真实形态）
      insertRun(bdb, 7, `t-${slug}`, 'completed', 'completed', 200, 260)
      bdb.close()
    }
    const p = projectMindAggregated(dir)
    expect(p.available).toBe(true)
    expect(p.thoughts).toHaveLength(3)
    expect(p.runs.map(r => r.runId).sort()).toEqual(['1', 'board-a:7', 'board-b:7'])
    // thoughts.board = 来源板 slug；root 库回落 project_id（NULL）
    const byId = new Map(p.thoughts.map(t => [t.id, t]))
    expect(byId.get('t-board-a')?.board).toBe('board-a')
    expect(byId.get('t-root')?.board).toBeNull()
    // 运行按开始时间倒序（board 的 200 > root 的 100）
    expect(p.runs[0].startedAt && Date.parse(p.runs[0].startedAt) >= Date.parse(p.runs[2].startedAt!)).toBe(true)
  })

  it('HERMES_HOME 环境变量优先解析根（部署一致性）；显式 homeDir 参数覆盖一切', () => {
    mkdirSync(join(dir, 'kanban', 'boards', 'envboard'), { recursive: true })
    const bdb = openDb(join(dir, 'kanban', 'boards', 'envboard', 'kanban.db'))
    seed(bdb); insertTask(bdb, 't-env', 'done'); bdb.close()
    const prev = process.env.HERMES_HOME
    process.env.HERMES_HOME = dir
    try {
      const viaEnv = projectMindAggregated()
      expect(viaEnv.thoughts.some(t => t.id === 't-env')).toBe(true)
      const viaArg = projectMindAggregated(join(dir, 'nonexistent-home'))
      expect(viaArg.available).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.HERMES_HOME
      else process.env.HERMES_HOME = prev
    }
  })

  it('root 库缺失但分板在 → available:true（分板是唯一真实源的分板拓扑）', () => {
    rmSync(dbPath)
    const bdir = join(dir, 'kanban', 'boards', 'only-board')
    mkdirSync(bdir, { recursive: true })
    const bdb = openDb(join(bdir, 'kanban.db'))
    seed(bdb); insertTask(bdb, 't-only', 'running')
    insertRun(bdb, 1, 't-only', 'running', null, 300, null)
    bdb.close()
    const p = projectMindAggregated(dir)
    expect(p.available).toBe(true)
    expect(p.thoughts).toHaveLength(1)
    expect(p.runs[0].status).toBe('running')
    expect(p.runs[0].runId).toBe('only-board:1')
  })
})
