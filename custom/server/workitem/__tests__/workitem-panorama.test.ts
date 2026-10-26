// P4（JoyAI 闭环吸收轮）守门：工作项全景串联——八面汇聚 fail-soft。
// 语义：taskId 命中各域产物（卡片/事件/证据/评测/评审/计划/图运行/trace 桥接）；
// 源缺席 available:false 不猜数；ghost 任务如实「不在任何看板库中」；
// coverage 边界声明（trace 无 taskId 索引）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPanorama } from '../panorama'
import { saveCase } from '../../reviewgov/store'
import { InMemoryEventLogStore } from '../../loop/graph/event-log-store'
import { registerEventLogStore, resetEventLogStore } from '../../loop/graph/event-log-registry'

let home: string
let evidenceDir: string
let evalDir: string
let reviewDir: string
let planDir: string

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'panorama-home-'))
  evidenceDir = mkdtempSync(join(tmpdir(), 'panorama-evidence-'))
  evalDir = mkdtempSync(join(tmpdir(), 'panorama-eval-'))
  reviewDir = mkdtempSync(join(tmpdir(), 'panorama-review-'))
  planDir = mkdtempSync(join(tmpdir(), 'panorama-plan-'))
  process.env.HERMES_HOME = join(home, '.hermes')
  process.env.HERMES_EVIDENCE_DIR = evidenceDir
  process.env.EVAL_STORE = evalDir
  process.env.HERMES_REVIEW_GOV_DIR = reviewDir
  process.env.HERMES_PLAN_DIR = planDir

  // 看板 fixture：主库一任务 + 事件
  const dbDir = join(home, '.hermes')
  mkdirSync(dbDir, { recursive: true })
  const db = new DatabaseSync(join(dbDir, 'kanban.db'))
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, assignee TEXT, status TEXT, created_at INTEGER, completed_at INTEGER)')
  db.exec('CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, run_id TEXT, kind TEXT, payload TEXT, created_at INTEGER)')
  db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?)').run('T-1', '全景串联样例任务', 'hu', 'done', 100, 200)
  db.prepare('INSERT INTO task_events VALUES (?, ?, ?, ?, ?, ?)').run(1, 'T-1', null, 'column_transition', JSON.stringify({ status: 'done' }), 150)
  db.close()

  // 证据 fixture（EvidenceRecord 整条写入；evidenceId 幂等键）
  const { appendEvidence } = await import('../../evidence/evidence-store')
  appendEvidence({
    evidenceId: 'ev-1', taskId: 'T-1', kind: 'verification', at: 120, ref: 'runs/x/verify.txt',
    verdict: 'pass', basis: 'echo ok',
  })

  // 评测 fixture：一集一题（origin.taskId 回指 T-1）
  writeFileSync(join(evalDir, 'eval-store.json'), JSON.stringify({
    sets: [{
      id: 'set-1', name: '回归样本库', track: 'process', sealed: false, contentHash: 'h1', revision: 1, createdAt: 1,
      tasks: [{ id: 'bd-9', problem: '样例坏例', expectedBehavior: '正确做法', rubric: [], origin: { source: 'eval_run', runId: 'run-old', taskId: 'T-1', sampleIdx: 0, at: 1 } }],
    }],
    revisions: [], runs: [], remediations: [], rubricIterations: [], oracleCases: [], oracleRuns: [], nextSeq: 2,
  }), 'utf8')

  // 评审 fixture
  saveCase({
    caseId: 'case-1', title: 'T-1 的评审', taskId: 'T-1', authorKind: 'agent', changedPaths: [], diffLines: 10,
    behindFlag: false, risk: { tier: 'low', requiredHumanApprovals: 1, reasons: [], protectedHits: [], sensitiveHits: [], trustedAuthor: false, breakerTightened: false },
    rounds: [], findings: [], approvals: [], checks: { status: 'pending', items: [] }, state: 'open', createdAt: 1, updatedAt: 2,
  } as never)

  // 图运行 fixture：共享注册簿挂 InMemory 事件日志 + loop.persisted 事件
  const store = new InMemoryEventLogStore()
  await store.append({ runId: 'gr-1', graphId: 'spec-x', ts: 300, kind: 'loop.persisted', payload: { taskId: 'T-1', artifact: 'docs/x.md', loopId: 'l1', contractId: 'c1', ts: '' } })
  registerEventLogStore(store)
})

afterEach(() => {
  delete process.env.HERMES_HOME
  delete process.env.HERMES_EVIDENCE_DIR
  delete process.env.EVAL_STORE
  delete process.env.HERMES_REVIEW_GOV_DIR
  delete process.env.HERMES_PLAN_DIR
  resetEventLogStore()
  for (const d of [home, evidenceDir, evalDir, reviewDir, planDir]) rmSync(d, { recursive: true, force: true })
})

describe('buildPanorama（八面汇聚）', () => {
  it('T-1 全链路产物汇聚：卡片/事件/证据/评测/评审/图运行 各面命中', async () => {
    const p = await buildPanorama('T-1')
    expect(p.task.available).toBe(true)
    expect(p.task.data!.title).toBe('全景串联样例任务')
    expect(p.task.data!.status).toBe('done')
    expect(p.kanbanEvents.data!.length).toBe(1)
    expect(p.kanbanEvents.data![0].kind).toBe('column_transition')
    expect(p.evidence.available).toBe(true)
    expect(p.evidence.data!.count).toBeGreaterThanOrEqual(1)
    expect(p.evidence.data!.latestVerdict?.verdict).toBe('pass')
    expect(p.evals.data![0].taskId).toBe('bd-9')
    expect(p.evals.data![0].problem).toContain('样例坏例')
    expect(p.reviews.data!.length).toBe(1)
    expect(p.reviews.data![0].caseId).toBe('case-1')
    expect(p.graphRuns.data![0].runId).toBe('gr-1')
    expect(p.coverage.tracesIndexedByTask).toBe(false)
  })

  it('ghost 任务：卡片面如实缺席（不猜数），其余可用面空清单', async () => {
    const p = await buildPanorama('ghost-1')
    expect(p.task.available).toBe(false)
    expect(p.task.error).toContain('不在任何看板库')
    expect(p.evidence.available).toBe(true)
    expect(p.evidence.data!.count).toBe(0)
    expect(p.reviews.available).toBe(true)
    expect(p.reviews.data).toEqual([])
  })

  it('图事件日志未装配：该面 available:false 带原因（fail-soft 不阻断其他面）', async () => {
    resetEventLogStore()
    const p = await buildPanorama('T-1')
    expect(p.graphRuns.available).toBe(false)
    expect(p.graphRuns.error).toContain('未装配')
    expect(p.task.available).toBe(true)
  })
})
