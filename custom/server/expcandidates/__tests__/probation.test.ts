// 批一 b 变更 3 测试：试用期生命周期——curate 批准→probation、惰性结算三分支
// （z 检验劣化退役/转正/样本不足延长→effect_unknown）、幂等有界、注入闸
// （probation 可注入带「（试用期）」、retired 不注入、存量 approved 兼容）、
// workbench 回滚联动（HARNESS2_AUTO_ROLLBACK 显式门）。
// 验收锚：spec 验收 2/3/4/5 四条 GIVEN/WHEN/THEN。派单入口挂线断言在
// kanban/__tests__/probation-settle-hook.test.ts（vi.mock 文件级作用域隔离）。
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import {
  settleDueProbation, twoProportionZ, Z_ALPHA_ONE_SIDED_0_05, PROBATION_SETTLE_BATCH_LIMIT,
  type ProbationRollbackFn,
} from '../probation'
import { _useStoreDirForTests, curateCandidate, listCandidates, readExpStore, recordInjection, writeExpStore } from '../exp-store'
import { experienceBriefLine, selectableExperiences } from '../exp-inject'
import type { ExpCandidate, ExpInjectionRecord, ProbationVerdict } from '../exp-types'

// 决策图谱关闸（exp-candidates.test.ts 同款）：curate 用例不在 mock 面上，
// venv 存在的机器禁真起 bridge 写宿主 KG（接线断言在 curate-decision-recorder.test.ts）。
const prevDecisionGraph = process.env.HERMES_DECISION_GRAPH
process.env.HERMES_DECISION_GRAPH = '0'

const nodeRequire: NodeRequire = (() => {
  try { return createRequire('/index.js') } catch { return null as unknown as NodeRequire }
})()
type Db = {
  exec: (sql: string) => void
  prepare: (sql: string) => { all: (...p: unknown[]) => unknown[]; run: (...p: unknown[]) => unknown }
  close: () => void
}
const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (p: string) => Db }

const expDir = mkdtempSync(join(tmpdir(), 'exp-probation-'))
_useStoreDirForTests(expDir)
const home = mkdtempSync(join(tmpdir(), 'exp-probation-home-'))
const db = new DatabaseSync(join(home, 'kanban.db'))
db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT)`)
db.exec(`CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, kind TEXT, payload TEXT, created_at INTEGER)`)

afterAll(() => {
  rmSync(expDir, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
  if (prevDecisionGraph === undefined) delete process.env.HERMES_DECISION_GRAPH
  else process.env.HERMES_DECISION_GRAPH = prevDecisionGraph
})

beforeEach(() => {
  rmSync(join(expDir, 'exp-candidates.json'), { force: true })
  db.exec('DELETE FROM tasks')
  db.exec('DELETE FROM task_events')
  delete process.env.HARNESS2_AUTO_ROLLBACK
})

// ---------- 夹具 ----------

const START_AT = new Date('2026-11-01T00:00:00Z').getTime()

function probationCand(id: string, opts: { windowTasks?: number; extendedAt?: string; settledAt?: string; verdict?: ProbationVerdict; sourceProposalId?: string } = {}): ExpCandidate {
  return {
    id, type: 'sop', statement: '同类任务先备齐改动证据再提交，避免重复返工', fingerprint: `fp-${id}`,
    evidence: [], status: 'probation', createdAt: 't', updatedAt: 't', injectedRuns: [],
    probation: {
      startedAt: new Date(START_AT).toISOString(),
      windowTasks: opts.windowTasks ?? 3,
      minSamples: 5,
      ...(opts.extendedAt ? { extendedAt: opts.extendedAt } : {}),
      ...(opts.settledAt ? { settledAt: opts.settledAt } : {}),
      ...(opts.verdict ? { verdict: opts.verdict } : {}),
    },
    ...(opts.sourceProposalId ? { sourceProposalId: opts.sourceProposalId } : {}),
  }
}

function logRow(taskId: string, id = 'exp-001', at = START_AT + 1000, column = 'devimpl'): ExpInjectionRecord {
  return { runLabel: `run-${taskId}`, ids: [id], at, taskId, kind: 'exp', column }
}

function addTask(id: string, status: string, columns: string[] = ['devimpl']): void {
  db.prepare('INSERT INTO tasks (id, title, status) VALUES (?, ?, ?)').run(id, `标题-${id}`, status)
  columns.forEach((c, i) => {
    db.prepare('INSERT INTO task_events (task_id, kind, payload, created_at) VALUES (?, ?, ?, ?)')
      .run(id, 'column_transition', JSON.stringify({ to: c }), 1000 + i)
  })
}

/** 种一批任务：doneIds/cancelledIds/runningIds＋同列基线 baselineDone/baselineCancel。 */
function seedBoard(t: { done?: string[]; cancelled?: string[]; running?: string[]; baselineDone?: string[]; baselineCancel?: string[] }): void {
  ;(t.done ?? []).forEach((id) => addTask(id, 'done'))
  ;(t.cancelled ?? []).forEach((id) => addTask(id, 'cancelled'))
  ;(t.running ?? []).forEach((id) => addTask(id, 'running'))
  ;(t.baselineDone ?? []).forEach((id) => addTask(id, 'done'))
  ;(t.baselineCancel ?? []).forEach((id) => addTask(id, 'cancelled'))
}

function seedStore(candidates: ExpCandidate[], log: ExpInjectionRecord[]): void {
  writeExpStore({ candidates, nextSeq: candidates.length + 1, injectionLog: log })
}

// ---------- z 检验纯函数 ----------

describe('twoProportionZ（α=0.05 单侧只测劣化，spec 决策 4）', () => {
  it('已知值：1/6 vs 5/6 → z≈-2.31（显著劣化）；不可判形态返回 null 不猜', () => {
    const z = twoProportionZ(1, 6, 5, 6)
    expect(z).not.toBeNull()
    expect(z!).toBeCloseTo(-2.3094, 3)
    expect(Z_ALPHA_ONE_SIDED_0_05).toBeCloseTo(1.6449, 3)
    expect(twoProportionZ(0, 0, 5, 6)).toBeNull() // 处置组零样本
    expect(twoProportionZ(6, 6, 6, 6)).toBeNull() // 合并比例退化（p̂=1，检验无定义）不猜
  })
})

// ---------- curate → probation ----------

describe('curate 批准进试用期（spec 变更 3）', () => {
  it('批准不再直进 approved：落 probation＋窗口参数（20/5）；决策图谱记真实迁移 to=probation', () => {
    seedStore([{ ...probationCand('exp-001'), status: 'candidate', probation: undefined }], [])
    const r = curateCandidate('exp-001', 'approved')
    expect(r.status).toBe('probation')
    expect(r.probation).toMatchObject({ windowTasks: 20, minSamples: 5 })
    expect(r.probation!.startedAt).toBeTruthy()
    expect(r.probation!.settledAt).toBeUndefined()
  })

  it('存量 approved 兼容不迁移：重批保持 approved（仍可注入，不重开试用期）', () => {
    seedStore([{ ...probationCand('exp-001'), status: 'approved', probation: undefined }], [])
    const r = curateCandidate('exp-001', 'approved')
    expect(r.status).toBe('approved')
    expect(r.probation).toBeUndefined()
  })

  it('probation 态重批不重置窗口（startedAt 不变，防人工刷窗洗数据）', () => {
    seedStore([probationCand('exp-001')], [])
    const before = readExpStore().candidates[0].probation!.startedAt
    const r = curateCandidate('exp-001', 'approved')
    expect(r.status).toBe('probation')
    expect(r.probation!.startedAt).toBe(before)
  })

  it('审查 I-2：effect_unknown 挂人工后 approve=显式转正（approved＋verdict=manual_approved、settledAt 保留）；reject 走正常拒绝', () => {
    // effect_unknown：已结算、人工接管态
    seedStore([probationCand('exp-001', { settledAt: '2026-11-10T00:00:00.000Z', verdict: 'effect_unknown' })], [])
    const promoted = curateCandidate('exp-001', 'approved')
    expect(promoted.status).toBe('approved')
    expect(promoted.probation).toMatchObject({ verdict: 'manual_approved', settledAt: '2026-11-10T00:00:00.000Z' })
    // reject 分支不受影响：effect_unknown → rejected 正常落
    seedStore([probationCand('exp-002', { settledAt: '2026-11-10T00:00:00.000Z', verdict: 'effect_unknown' })], [])
    const rejected = curateCandidate('exp-002', 'rejected')
    expect(rejected.status).toBe('rejected')
    expect(rejected.probation?.verdict).toBe('effect_unknown') // 试用期判档历史不动
  })
})

// ---------- 惰性结算三分支 ----------

describe('settleDueProbation（验收 2/3：结算三分支/幂等/有界）', () => {
  it('验收 2：到期且 z 检验显著劣化 → status=retired、verdict=probation_regression、历史保留', async () => {
    process.env.HERMES_HOME = home
    // 处置组 1/6 成功 vs 同列基线 5/6 → z≈-2.31 ≤ -1.645 显著劣化
    seedBoard({
      done: ['T1'], cancelled: ['T2', 'T3', 'T4', 'T5', 'T6'],
      baselineDone: ['B1', 'B2', 'B3', 'B4', 'B5'], baselineCancel: ['B6'],
    })
    seedStore([probationCand('exp-001')], ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((t) => logRow(t)))
    const results = await settleDueProbation()
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ candidateId: 'exp-001', verdict: 'probation_regression' })
    const c = listCandidates()[0]
    expect(c.status).toBe('retired')
    expect(c.probation!.verdict).toBe('probation_regression')
    expect(c.probation!.settledAt).toBeTruthy()
    // 历史保留：stats 落档（z 值在档）、留痕账不动
    expect(c.probation!.stats).toMatchObject({ injections: 6, success: 1, failure: 5 })
    expect(c.probation!.stats!.z).toBeCloseTo(-2.3094, 3)
    expect(readExpStore().injectionLog).toHaveLength(6)
    // 幂等：已结算条目不再动
    const again = await settleDueProbation()
    expect(again).toEqual([])
    expect(listCandidates()[0].probation!.settledAt).toBe(c.probation!.settledAt)
  })

  it('未劣化（含改善）→ approved 转正：verdict=promoted', async () => {
    process.env.HERMES_HOME = home
    seedBoard({
      done: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'],
      baselineDone: ['B1', 'B2', 'B3'], baselineCancel: ['B4', 'B5', 'B6'],
    })
    seedStore([probationCand('exp-001')], ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((t) => logRow(t)))
    const results = await settleDueProbation()
    const c = listCandidates()[0]
    expect(c.status).toBe('approved')
    expect(c.probation!.verdict).toBe('promoted')
    expect(results[0]).toMatchObject({ candidateId: 'exp-001', verdict: 'promoted' })
  })

  it('验收 3：样本 <5 首次 probation_extended（不结算、窗口延长）；二次仍不足 effect_unknown 挂人工', async () => {
    process.env.HERMES_HOME = home
    // 处置组 6 曝光但仅 4 决断（2 个 running）→ n1=4 <5
    seedBoard({
      done: ['T1', 'T2', 'T3', 'T4'], running: ['T5', 'T6'],
      baselineDone: ['B1', 'B2', 'B3', 'B4', 'B5'], baselineCancel: ['B6'],
    })
    const firstRows = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((t) => logRow(t))
    seedStore([probationCand('exp-001')], firstRows)
    const first = await settleDueProbation()
    expect(first[0]).toMatchObject({ candidateId: 'exp-001', verdict: 'probation_extended' })
    let c = listCandidates()[0]
    expect(c.status).toBe('probation')
    expect(c.probation!.extendedAt).toBeTruthy()
    expect(c.probation!.settledAt).toBeUndefined() // 延长≠结算

    // 延长后窗口内再来 6 曝光仍全无新增决断（全 running）→ 判读面决断样本依旧 4<5
    // → effect_unknown（settled，人工接管）。窗口只决定「何时再试」，判读用全部
    // 可归因数据（数据越多检验越稳——见 probation.ts 注释）。
    const extendedAt = c.probation!.extendedAt!
    const secondAt = Date.parse(extendedAt) + 1000
    const secondRows = ['T7', 'T8', 'T9', 'T10', 'T11', 'T12'].map((t, i) => {
      addTask(t, 'running')
      return logRow(t, 'exp-001', secondAt + i)
    })
    writeExpStore({ ...readExpStore(), injectionLog: [...firstRows, ...secondRows] })
    const second = await settleDueProbation()
    expect(second[0]).toMatchObject({ candidateId: 'exp-001', verdict: 'effect_unknown' })
    c = listCandidates()[0]
    expect(c.status).toBe('probation') // 不猜数——维持试用期交人工，不转正不退役
    expect(c.probation!.settledAt).toBeTruthy()
    // 幂等：effect_unknown 已 settled，不再自动结算
    expect(await settleDueProbation()).toEqual([])
  })

  it('未到期（窗口内曝光 < windowTasks）不结算；到期判定只认本窗口（extendedAt 后）的曝光', async () => {
    process.env.HERMES_HOME = home
    seedStore([probationCand('exp-001', { windowTasks: 5 })], ['T1', 'T2', 'T3'].map((t) => logRow(t)))
    expect(await settleDueProbation()).toEqual([])
    expect(listCandidates()[0].status).toBe('probation')
  })

  it('有界：到期条目超批上限只处理前 PROBATION_SETTLE_BATCH_LIMIT 条（派发路径防长尾阻塞）', async () => {
    process.env.HERMES_HOME = home
    const cands: ExpCandidate[] = []
    const log: ExpInjectionRecord[] = []
    for (let i = 1; i <= PROBATION_SETTLE_BATCH_LIMIT + 2; i += 1) {
      const id = `exp-${String(i).padStart(3, '0')}`
      cands.push(probationCand(id, { windowTasks: 1 }))
      addTask(`T-${id}`, 'done')
      log.push(logRow(`T-${id}`, id))
    }
    seedStore(cands, log)
    const results = await settleDueProbation()
    expect(results).toHaveLength(PROBATION_SETTLE_BATCH_LIMIT)
    expect(listCandidates().filter((c) => c.probation?.extendedAt).length).toBe(PROBATION_SETTLE_BATCH_LIMIT)
  })

  it('板库缺席 fail-soft：任务终态全 unknown → 样本不足路径（不崩、不猜）', async () => {
    const emptyHome = mkdtempSync(join(tmpdir(), 'exp-probation-empty-'))
    process.env.HERMES_HOME = emptyHome
    try {
      seedStore([probationCand('exp-001')], ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((t) => logRow(t)))
      const results = await settleDueProbation()
      expect(results[0].verdict).toBe('probation_extended') // 全 unknown → n1=0<5 首延
    } finally {
      rmSync(emptyHome, { recursive: true, force: true })
    }
  })

  it('审查 I-1：结算窗口内并发 recordInjection 的写入在结算写回后仍存在（重读合并不整库覆盖）', async () => {
    process.env.HERMES_HOME = home
    process.env.HARNESS2_AUTO_ROLLBACK = '1'
    seedBoard({
      done: ['T1'], cancelled: ['T2', 'T3', 'T4', 'T5', 'T6'],
      baselineDone: ['B1', 'B2', 'B3', 'B4', 'B5'], baselineCancel: ['B6'],
    })
    // 另一个候选在结算期间被并发注入（模拟另一路派单的 recordInjection 落账）
    seedStore(
      [probationCand('exp-001', { sourceProposalId: 'wb-i1' }), probationCand('exp-009')],
      ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((t) => logRow(t)),
    )
    const midFlight: ProbationRollbackFn = async () => {
      // 结算的板库读/回滚 await 窗口内：并发写注入留痕行＋injectedRuns
      recordInjection(['exp-009'], 'run-concurrent', undefined, 'T-cc', { kind: 'exp', column: 'devimpl' })
    }
    const results = await settleDueProbation({ rollback: midFlight })
    expect(results[0]).toMatchObject({ candidateId: 'exp-001', verdict: 'probation_regression' })
    const store = readExpStore()
    // 并发写入未被结算写回覆盖：留痕行（6 种子＋1 并发）与 injectedRuns 都在
    expect(store.injectionLog).toHaveLength(7)
    expect(store.injectionLog.map((r) => r.taskId)).toContain('T-cc')
    expect(store.candidates.find((c) => c.id === 'exp-009')?.injectedRuns).toEqual(['run-concurrent'])
    // 结算效果本身也落档（重读合并后单候选补丁仍在）
    const settled = store.candidates.find((c) => c.id === 'exp-001')
    expect(settled?.status).toBe('retired')
    expect(settled?.probation?.verdict).toBe('probation_regression')
    delete process.env.HARNESS2_AUTO_ROLLBACK
  })
})

// ---------- 注入闸 ----------

describe('注入闸（验收 4：retired 不注入；probation 可注入带标记；存量 approved 兼容）', () => {
  it('retired 候选不被选中；probation/approved 可注入；probation 简报行带（试用期）', () => {
    const pool = [
      probationCand('exp-001'),
      { ...probationCand('exp-002'), status: 'approved' as const, probation: undefined },
      { ...probationCand('exp-003'), status: 'retired' as const },
      { ...probationCand('exp-004'), status: 'candidate' as const },
      { ...probationCand('exp-005'), status: 'rejected' as const },
    ]
    const selected = selectableExperiences(pool)
    expect(selected.map((c) => c.id).sort()).toEqual(['exp-001', 'exp-002'])
    const line = experienceBriefLine(selected)
    expect(line).toContain('exp-001')
    expect(line).toContain('（试用期）')
    expect(line).not.toContain('exp-003')
  })
})

// ---------- 回滚联动 ----------

describe('workbench 回滚联动（验收 5：HARNESS2_AUTO_ROLLBACK 未设不调）', () => {
  const rollbackSpy: ProbationRollbackFn = async () => { /* spy 由调用侧断言 */ }
  function makeRetiringStore(sourceProposalId?: string): void {
    seedBoard({
      done: ['T1'], cancelled: ['T2', 'T3', 'T4', 'T5', 'T6'],
      baselineDone: ['B1', 'B2', 'B3', 'B4', 'B5'], baselineCancel: ['B6'],
    })
    seedStore(
      [probationCand('exp-001', sourceProposalId ? { sourceProposalId } : {})],
      ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((t) => logRow(t)),
    )
  }

  it('验收 5：HARNESS2_AUTO_ROLLBACK 未设 WHEN 退役 THEN 不调 rollbackProposal', async () => {
    process.env.HERMES_HOME = home
    delete process.env.HARNESS2_AUTO_ROLLBACK
    makeRetiringStore('wb-prop-1')
    const spy = vi.fn(rollbackSpy)
    const results = await settleDueProbation({ rollback: spy })
    expect(results[0].verdict).toBe('probation_regression')
    expect(spy).not.toHaveBeenCalled()
  })

  it('门开＋有 sourceProposalId → 调 rollbackProposal（数据面自动、文件面显式）', async () => {
    process.env.HERMES_HOME = home
    process.env.HARNESS2_AUTO_ROLLBACK = '1'
    makeRetiringStore('wb-prop-1')
    const spy = vi.fn(rollbackSpy)
    const results = await settleDueProbation({ rollback: spy })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('wb-prop-1', expect.stringContaining('probation_regression'))
    expect(results[0].rollback).toBe('called')
    // 退役本身与回滚成败解耦：数据面已落 retired
    expect(listCandidates()[0].status).toBe('retired')
  })

  it('门开但无 sourceProposalId → 不调（无源提案不硬造回滚）；回滚抛异常 fail-soft 不撤销退役', async () => {
    process.env.HERMES_HOME = home
    process.env.HARNESS2_AUTO_ROLLBACK = '1'
    // 无 sourceProposalId
    makeRetiringStore(undefined)
    const spyA = vi.fn(rollbackSpy)
    const a = await settleDueProbation({ rollback: spyA })
    expect(spyA).not.toHaveBeenCalled()
    expect(a[0].rollback).toBe('skipped')
    // 有 id 但回滚失败（提案非 promoted 态等）→ 退役仍成立
    db.exec('DELETE FROM tasks')
    db.exec('DELETE FROM task_events')
    makeRetiringStore('wb-prop-2')
    const failing: ProbationRollbackFn = async () => { throw new Error('当前状态 draft 不可回滚') }
    const b = await settleDueProbation({ rollback: failing })
    expect(b[0].rollback).toBe('failed')
    expect(listCandidates()[0].status).toBe('retired')
  })
})
