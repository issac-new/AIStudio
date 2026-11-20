// Task 8 消费面：required_capabilities（declared 口径）优先、demandSource 自动切换、旧库回退。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { collectDemands, collectCapabilityPoolReport } from '../collect'

let root = ''
let home = ''

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 't8-consumer-'))
  home = join(root, 'hermes')
  mkdirSync(home, { recursive: true })

  // 新库：带 required_capabilities 列；t1 有 declared 声明（覆盖 skills），t2 只有 skills
  const db = new DatabaseSync(join(home, 'kanban.db'))
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, status TEXT, created_at INTEGER, skills TEXT, required_capabilities TEXT)')
  db.exec('CREATE TABLE task_runs (task_id TEXT NOT NULL, started_at INTEGER NOT NULL)')
  db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?)').run('t1', 'ready', 1, '["unit-test"]', '["coding","review"]')
  db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?)').run('t2', 'todo', 2, '["unit-test"]', null)
  db.prepare('INSERT INTO task_runs VALUES (?,?)').run('t1', 3)
  db.close()
  process.env.HERMES_HOME = home
})

afterAll(() => {
  delete process.env.HERMES_HOME
  if (root) rmSync(root, { recursive: true, force: true })
})

describe('Task 8 declared 口径', () => {
  it('declared 声明优先于 skills；仅 skills 的任务仍进需求（fallback）', async () => {
    const demands = await collectDemands()
    const t1 = demands.find((d) => d.taskId === 't1')
    const t2 = demands.find((d) => d.taskId === 't2')
    // t1：declared 覆盖 skills——unit-test 不出现
    expect(t1?.tags).toEqual(['coding', 'review'])
    // t2：无 declared → skills fallback
    expect(t2?.tags).toEqual(['unit-test'])
  })

  it('demandSource 自动切 declared（库带 required_capabilities 列）', async () => {
    const report = await collectCapabilityPoolReport()
    expect(report.demandSource).toBe('declared')
  })

  it('旧库（无 required_capabilities 列）回退 skills 且 demandSource=skills-fallback', async () => {
    const legacyHome = join(root, 'legacy')
    mkdirSync(legacyHome, { recursive: true })
    const db = new DatabaseSync(join(legacyHome, 'kanban.db'))
    db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, status TEXT, created_at INTEGER, skills TEXT)')
    db.exec('CREATE TABLE task_runs (task_id TEXT NOT NULL, started_at INTEGER NOT NULL)')
    db.prepare('INSERT INTO tasks VALUES (?,?,?,?)').run('old1', 'ready', 1, '["coding"]')
    db.close()
    const prev = process.env.HERMES_HOME
    process.env.HERMES_HOME = legacyHome
    try {
      const demands = await collectDemands()
      expect(demands.map((d) => d.taskId)).toEqual(['old1'])
      expect(demands[0].tags).toEqual(['coding'])
      const report = await collectCapabilityPoolReport()
      expect(report.demandSource).toBe('skills-fallback')
    } finally {
      if (prev === undefined) delete process.env.HERMES_HOME
      else process.env.HERMES_HOME = prev
    }
  })
})
