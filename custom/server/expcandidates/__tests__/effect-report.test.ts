// 批一 b 变更 2 测试：record 维度效果归因（effect-report）——纯投影核心（join/去重/
// 样本不足 unknown/基线同口径对照）＋板库 IO 采集＋REST 只读端点。
// 验收锚：GIVEN injectionLog 含 taskId 条目 WHEN 请求 effects THEN successRate=
// 成功注入数/总注入数 且 baseline 同口径对照输出。
import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import Koa from 'koa'
import type { AddressInfo } from 'node:net'
import {
  classifyTaskOutcome, buildEffectReport, collectEffectReport,
  MIN_EFFECT_SAMPLES, type EffectJoinInput,
} from '../effect-report'
import { _useStoreDirForTests, writeExpStore } from '../exp-store'
import type { ExpInjectionRecord } from '../exp-types'

const nodeRequire: NodeRequire = (() => {
  try { return createRequire('/index.js') } catch { return null as unknown as NodeRequire }
})()
type Db = {
  exec: (sql: string) => void
  prepare: (sql: string) => { all: (...p: unknown[]) => unknown[]; run: (...p: unknown[]) => unknown }
  close: () => void
}
const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (p: string) => Db }

// ---------- 纯投影核心 ----------

function rec(partial: Partial<ExpInjectionRecord> & { ids: string[]; taskId?: string }): ExpInjectionRecord {
  return { runLabel: 'run-x', at: 1, ...partial } as ExpInjectionRecord
}

function inputOf(records: ExpInjectionRecord[], statusOf: Record<string, string>, baseline: Array<{ taskId: string; status: string; columns?: string[] }> = []): EffectJoinInput {
  return {
    records,
    taskStatusOf: (id) => statusOf[id] ?? null,
    baselineTasks: baseline.map((b) => ({ taskId: b.taskId, status: b.status, columns: b.columns ?? ['devimpl'] })),
  }
}

describe('classifyTaskOutcome（终态判读：TERMINAL_TASK_STATUSES 同口径）', () => {
  it('done/archived=success；cancelled=failure；非终态/缺席=unknown（不猜）', () => {
    expect(classifyTaskOutcome('done')).toBe('success')
    expect(classifyTaskOutcome('archived')).toBe('success')
    expect(classifyTaskOutcome('cancelled')).toBe('failure')
    expect(classifyTaskOutcome('running')).toBe('unknown')
    expect(classifyTaskOutcome(null)).toBe('unknown')
    expect(classifyTaskOutcome(undefined)).toBe('unknown')
  })
})

describe('buildEffectReport（纯投影）', () => {
  it('验收 1：含 taskId 回执→successRate=成功注入数/总注入数，baseline 同口径对照输出', () => {
    // 处置组 6 次注入：4 done + 1 cancelled + 1 running（终态缺→unknown）
    const records = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((t) =>
      rec({ ids: ['exp-001'], taskId: t, kind: 'exp', column: 'devimpl' }))
    const baseline = [
      ...Array.from({ length: 3 }, (_, i) => ({ taskId: `B-done-${i}`, status: 'done' })),
      ...Array.from({ length: 3 }, (_, i) => ({ taskId: `B-cancel-${i}`, status: 'cancelled' })),
    ]
    const rows = buildEffectReport(inputOf(records, {
      T1: 'done', T2: 'done', T3: 'done', T4: 'done', T5: 'cancelled', T6: 'running',
    }, baseline))
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.recordId).toBe('exp-001')
    expect(r.kind).toBe('exp')
    expect(r.injections).toBe(6)
    expect(r.success).toBe(4)
    expect(r.failure).toBe(1)
    expect(r.unknown).toBe(1)
    expect(r.successRate).toBeCloseTo(4 / 6)
    expect(r.coverage).toBeCloseTo(5 / 6)
    expect(r.baseline).toMatchObject({ tasks: 6, success: 3, failure: 3 })
    expect(r.baselineSuccessRate).toBeCloseTo(0.5)
    expect(r.effect).toBe('improved') // 4/5 vs 3/6
  })

  it('(recordId, taskId) 去重：同一任务对同一记录只计一次曝光；跨路重跑不刷量', () => {
    const records = [
      rec({ ids: ['exp-001'], taskId: 'T1', kind: 'exp', column: 'devimpl', at: 100 }),
      rec({ ids: ['exp-001'], taskId: 'T1', kind: 'exp', column: 'devimpl', at: 200 }),
    ]
    const rows = buildEffectReport(inputOf(records, { T1: 'done' }))
    expect(rows[0].injections).toBe(1)
  })

  it('kind 归一：旧数据无 kind 按 exp；dual/fewshot 各自成行不混账', () => {
    const records = [
      rec({ ids: ['exp-001'], taskId: 'T1', column: 'devimpl' }), // 旧数据（无 kind）
      rec({ ids: ['f-1'], taskId: 'T2', kind: 'dual', column: 'devimpl' }),
      rec({ ids: ['dl-9'], taskId: 'T3', kind: 'fewshot', column: 'devimpl' }),
    ]
    const rows = buildEffectReport(inputOf(records, { T1: 'done', T2: 'done', T3: 'done' }))
    expect(rows.map((r) => `${r.kind}:${r.recordId}`).sort()).toEqual(['dual:f-1', 'exp:exp-001', 'fewshot:dl-9'])
  })

  it('样本 <5（处置组或基线任一侧）→ effect=unknown 不猜数', () => {
    const four = Array.from({ length: 4 }, (_, i) => rec({ ids: ['exp-001'], taskId: `T${i}`, column: 'devimpl' }))
    // 处置组 4 决断样本（<5）：基线充足也 unknown
    const rowsA = buildEffectReport(inputOf(four, {
      T0: 'done', T1: 'done', T2: 'done', T3: 'cancelled',
    }, Array.from({ length: 6 }, (_, i) => ({ taskId: `B${i}`, status: 'done' }))))
    expect(rowsA[0].effect).toBe('unknown')
    expect(rowsA[0].note).toContain('样本不足')
    // 基线 4 决断样本（<5）：处置组充足也 unknown
    const six = Array.from({ length: 6 }, (_, i) => rec({ ids: ['exp-001'], taskId: `T${i}`, column: 'devimpl' }))
    const rowsB = buildEffectReport(inputOf(six, {
      T0: 'done', T1: 'done', T2: 'done', T3: 'done', T4: 'done', T5: 'done',
    }, Array.from({ length: 4 }, (_, i) => ({ taskId: `B${i}`, status: 'done' }))))
    expect(rowsB[0].effect).toBe('unknown')
    expect(rowsB[0].note).toContain('基线')
    expect(MIN_EFFECT_SAMPLES).toBe(5)
  })

  it('回执无列信息→基线不可限定→effect=unknown（不拿全局冒充同口径）', () => {
    const records = Array.from({ length: 6 }, (_, i) => rec({ ids: ['exp-001'], taskId: `T${i}` }))
    const rows = buildEffectReport(inputOf(records, {
      T0: 'done', T1: 'done', T2: 'done', T3: 'done', T4: 'done', T5: 'done',
    }, Array.from({ length: 6 }, (_, i) => ({ taskId: `B${i}`, status: 'done' }))))
    expect(rows[0].baseline).toBeNull()
    expect(rows[0].baselineSuccessRate).toBeNull()
    expect(rows[0].effect).toBe('unknown')
  })

  it('基线只收同列未注入任务：他列/被注入任务不进基线；degraded/neutral 分支', () => {
    // 处置组 1/6 成功 vs 基线 5/6 → degraded
    const treat = Array.from({ length: 6 }, (_, i) => rec({ ids: ['exp-001'], taskId: `T${i}`, column: 'devimpl' }))
    const degraded = buildEffectReport(inputOf(treat, {
      T0: 'done', T1: 'cancelled', T2: 'cancelled', T3: 'cancelled', T4: 'cancelled', T5: 'cancelled',
    }, [
      ...Array.from({ length: 5 }, (_, i) => ({ taskId: `B-ok-${i}`, status: 'done' })),
      { taskId: 'B-bad', status: 'cancelled' },
      { taskId: 'B-other-column', status: 'done', columns: ['review'] }, // 他列——不进基线
    ]))
    expect(degraded[0].effect).toBe('degraded')
    expect(degraded[0].baseline!.tasks).toBe(6) // 他列被排除
    // 处置组 3/6 vs 基线 3/6（同 0.5）→ neutral
    const neutral = buildEffectReport(inputOf(treat, {
      T0: 'done', T1: 'done', T2: 'done', T3: 'cancelled', T4: 'cancelled', T5: 'cancelled',
    }, [
      { taskId: 'B0', status: 'done' }, { taskId: 'B1', status: 'done' }, { taskId: 'B2', status: 'done' },
      { taskId: 'B3', status: 'cancelled' }, { taskId: 'B4', status: 'cancelled' }, { taskId: 'B5', status: 'cancelled' },
    ]))
    expect(neutral[0].effect).toBe('neutral')
  })

  it('无 taskId 回执不入归因（老回执只有 runLabel——不猜任务对应）', () => {
    const rows = buildEffectReport(inputOf([rec({ ids: ['exp-001'], snapshotId: 'snap-1' })], {}))
    expect(rows).toEqual([])
  })
})

// ---------- 板库 IO 采集 ＋ REST 端点 ----------

const expDir = mkdtempSync(join(tmpdir(), 'exp-effect-'))
_useStoreDirForTests(expDir)

const home = mkdtempSync(join(tmpdir(), 'exp-effect-home-'))
let db: Db
let server: ReturnType<Koa['listen']>
let base = ''

beforeAll(async () => {
  db = new DatabaseSync(join(home, 'kanban.db'))
  db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT)`)
  db.exec(`CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, kind TEXT, payload TEXT, created_at INTEGER)`)
  process.env.HERMES_HOME = home
  const app = new Koa()
  const { expCandidatesRoutes } = await import('../exp-controller')
  app.use(expCandidatesRoutes.routes()).use(expCandidatesRoutes.allowedMethods())
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(expDir, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
  delete process.env.HERMES_HOME
})

beforeEach(() => {
  rmSync(join(expDir, 'exp-candidates.json'), { force: true })
  db.exec('DELETE FROM tasks')
  db.exec('DELETE FROM task_events')
})

function addTask(id: string, status: string, columns: string[] = ['devimpl']): void {
  db.prepare('INSERT INTO tasks (id, title, status) VALUES (?, ?, ?)').run(id, `标题-${id}`, status)
  columns.forEach((c, i) => {
    db.prepare('INSERT INTO task_events (task_id, kind, payload, created_at) VALUES (?, ?, ?, ?)')
      .run(id, 'column_transition', JSON.stringify({ to: c }), 1000 + i)
  })
}

describe('collectEffectReport（板库 IO 采集）', () => {
  it('注入回执 join 板库终态；基线=同列未注入终态任务；非终态计 unknown', async () => {
    // 处置组：6 注入（5 done + 1 running）；基线：同列 6 未注入（4 done + 2 cancelled）＋他列 1
    ;['T1', 'T2', 'T3', 'T4', 'T5'].forEach((t) => addTask(t, 'done'))
    addTask('T6', 'running')
    ;['B1', 'B2', 'B3', 'B4'].forEach((t) => addTask(t, 'done'))
    ;['B5', 'B6'].forEach((t) => addTask(t, 'cancelled'))
    addTask('X1', 'done', ['review'])
    writeExpStore({
      candidates: [], nextSeq: 1,
      injectionLog: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((t) => ({
        runLabel: 'run-io', ids: ['exp-001'], at: Date.now(), taskId: t, kind: 'exp' as const, column: 'devimpl',
      })),
    })
    const report = await collectEffectReport()
    expect(report.rows).toHaveLength(1)
    const r = report.rows[0]
    expect(r).toMatchObject({ recordId: 'exp-001', injections: 6, success: 5, failure: 0, unknown: 1 })
    expect(r.baseline).toMatchObject({ tasks: 6, success: 4, failure: 2 })
    expect(r.effect).toBe('improved')
    // X1（他列）不在基线；T6（running 非终态）不在基线
    expect(r.baseline!.tasks).toBe(6)
  })

  it('板库缺席 fail-soft：任务全部 join 不到 → unknown 计数；基线空 → effect unknown', async () => {
    writeExpStore({
      candidates: [], nextSeq: 1,
      injectionLog: [{ runLabel: 'r', ids: ['exp-001'], at: 1, taskId: 'GONE', kind: 'exp', column: 'devimpl' }],
    })
    const report = await collectEffectReport()
    expect(report.rows[0]).toMatchObject({ injections: 1, success: 0, failure: 0, unknown: 1, effect: 'unknown' })
  })
})

describe('GET /api/expcandidates/effects（只读端点）', () => {
  it('返回 ok＋rows（验收 1 的 WHEN 请求 effects 面）；无回执时空表不报错', async () => {
    const res = await fetch(`${base}/api/expcandidates/effects`)
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; rows: unknown[] }
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.rows)).toBe(true)
  })
})
