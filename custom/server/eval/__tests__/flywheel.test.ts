// 飞轮台账/转化漏斗/通过率退化门守门（数据飞轮吸收轮件三）。
// 台账落盘走 EVAL_STORE tmpdir 隔离；漏斗与门为纯函数。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  flywheelReadoutOf, gateThresholds, listLedger, passRateGateOf, recordDistill, recordVariantBatch,
} from '../flywheel'
import type { EvalRun, EvalSet, RemediationRecord } from '../types'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flywheel-'))
  process.env.EVAL_STORE = join(dir, 'eval')
})

afterEach(() => {
  delete process.env.EVAL_STORE
  for (const k of ['FLYWHEEL_GATE_MIN_PASS_RATE', 'FLYWHEEL_GATE_MIN_SAMPLES']) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

const distillEntry = {
  taskId: 'bd-x1', sourceRunId: 'erun-1', sourceTaskId: 't1', sampleIdx: 1,
  rootCause: 'result_defect' as const, tabooActions: ['禁止重复失败'], failedSteps: 5, stepRedline: 7, targetSetId: 'eset-009',
}

describe('飞轮台账（幂等登记）', () => {
  it('提炼登记：重复来源（run+task+sample）跳过不重复记账', () => {
    const first = recordDistill(distillEntry)
    const second = recordDistill({ ...distillEntry, targetSetId: 'eset-other' })
    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.id).toBe(first.id)
    expect(listLedger().distills).toHaveLength(1)
  })

  it('变体批次登记：同蓝本同维度集跳过；维度集不同则另立批次', () => {
    const dims = ['syn', 'noise']
    const all = ['syn', 'noise', 'edge', 'implicit', 'multi']
    const a = recordVariantBatch({ blueprintTaskId: 'bd-x1', variantIds: ['v1', 'v2'], dimensions: dims, targetSetId: 'eset-009' })
    const b = recordVariantBatch({ blueprintTaskId: 'bd-x1', variantIds: ['v1', 'v2'], dimensions: ['noise', 'syn'], targetSetId: 'eset-009' })
    const c = recordVariantBatch({ blueprintTaskId: 'bd-x1', variantIds: [...all], dimensions: all, targetSetId: 'eset-009' })
    expect(a.duplicate).toBe(false)
    expect(b.duplicate).toBe(true) // 维度集相同（排序后比）
    expect(c.duplicate).toBe(false)
    expect(listLedger().variantBatches).toHaveLength(2)
  })
})

describe('转化漏斗（错误转化率）', () => {
  const set = (tasks: Array<Partial<import('../types').EvalTask>>, name = 's'): EvalSet => ({
    id: 'eset-001', name, track: 'e2e', sealed: false, contentHash: 'h', revision: 1, createdAt: 1,
    tasks: tasks.map((t, i) => ({ id: `t${i}`, problem: 'p', expectedBehavior: 'e', rubric: [], ...t })) as never,
  })
  const run = (attempts: Array<{ taskId: string; passed?: boolean }>): EvalRun => ({
    id: 'erun-1', setId: 'eset-001', target: {}, k: 3, status: 'done', createdAt: 1,
    attempts: attempts.map((a, i) => ({ taskId: a.taskId, sampleIdx: i + 1, verdicts: [], passed: a.passed })),
    aggregates: {} as never,
  })
  const remedi = (status: 'open' | 'closed'): RemediationRecord => ({
    id: `r-${status}`, runId: 'erun-1', setId: 'eset-001', setHash: 'h', taskId: 't1', status, rerunCount: 0, createdAt: 1, updatedAt: 1,
  })

  it('转化率=回流任务/失败样本，截顶 1；0 分母 null 不造数', () => {
    // 3 失败样本（同任务多样本），1 条回流任务 → 1/3 截顶逻辑正常
    const sets = [set([{ id: 're-a', origin: { runId: 'r', taskId: 'x', at: 1 } }], '回归样本库')]
    const readout = flywheelReadoutOf(sets, [run([{ taskId: 't1', passed: false }, { taskId: 't1', passed: false }, { taskId: 't1', passed: false }])], [], { distills: [], variantBatches: [] })
    expect(readout.funnel.badCases).toBe(3)
    expect(readout.funnel.reflowed).toBe(1)
    expect(readout.funnel.conversionRate).toBeCloseTo(1 / 3)
    // 幂等去重使分子可超分母口径 → 截顶
    const many = flywheelReadoutOf([set([
      { id: 're-a', origin: { runId: 'r', taskId: 'x', at: 1 } },
      { id: 're-b', origin: { runId: 'r', taskId: 'y', at: 1 } },
    ])], [run([{ taskId: 't1', passed: false }])], [], { distills: [], variantBatches: [] })
    expect(many.funnel.conversionRate).toBe(1)
    // 空账
    const empty = flywheelReadoutOf([], [], [], { distills: [], variantBatches: [] })
    expect(empty.funnel.conversionRate).toBeNull()
    expect(empty.funnel.badCases).toBe(0)
  })

  it('处置单开/闭、提炼与变体计数、根因聚类降序', () => {
    const ledger = {
      distills: [
        { ...distillEntry, id: 'fw-1', at: 1 },
        { ...distillEntry, id: 'fw-2', rootCause: 'action_loop' as const, at: 2 },
        { ...distillEntry, id: 'fw-3', rootCause: 'action_loop' as const, at: 3 },
      ],
      variantBatches: [{ id: 'fwv-1', blueprintTaskId: 'bd-x1', variantIds: ['v1', 'v2'], dimensions: ['syn'], targetSetId: 's', at: 1 }],
    }
    const readout = flywheelReadoutOf([], [], [remedi('open'), remedi('closed'), remedi('closed')], ledger)
    expect(readout.funnel.distilled).toBe(3)
    expect(readout.funnel.variantTasks).toBe(2)
    expect(readout.funnel.remediationOpen).toBe(1)
    expect(readout.funnel.remediationClosed).toBe(2)
    expect(readout.byRootCause[0]).toMatchObject({ rootCause: 'action_loop', count: 2 })
    expect(readout.byRootCause[1]).toMatchObject({ rootCause: 'result_defect', count: 1 })
  })

  it('集内变体任务计数（id 含 -cf 段即资产）', () => {
    const sets = [set([{ id: 'bd-x1-cfsyn1' }, { id: 'bd-x1-cfmulti2' }, { id: 't2' }])]
    expect(flywheelReadoutOf(sets, [], [], { distills: [], variantBatches: [] }).variantTasksInSets).toBe(2)
  })
})

describe('坏例通过率退化门（k 次采样容忍度 + 一票否决）', () => {
  const run = (opts: { k: number; attempts: Array<{ taskId: string; passed?: boolean }>; riskVeto?: boolean }): EvalRun => ({
    id: 'erun-9', setId: 'eset-009', target: {}, k: opts.k, status: 'done', createdAt: 1,
    attempts: opts.attempts.map((a, i) => ({ taskId: a.taskId, sampleIdx: i + 1, verdicts: [], passed: a.passed })),
    aggregates: { riskVeto: opts.riskVeto } as never,
  })

  it('无运行 → no_data；k<2 → insufficient（单跑不作门禁）', () => {
    expect(passRateGateOf(undefined).status).toBe('no_data')
    expect(passRateGateOf(run({ k: 1, attempts: [{ taskId: 't1' }] })).status).toBe('insufficient')
  })

  it('通过（4/5=0.8 不低于阈值；样本不足的任务不硬判）', () => {
    const attempts = [
      ...Array.from({ length: 4 }, () => ({ taskId: 't1', passed: true })),
      { taskId: 't1', passed: false },
      { taskId: 't2', passed: false }, // 仅 1 样本 < minSamples=3 → 不判复现
    ]
    const gate = passRateGateOf(run({ k: 5, attempts }))
    expect(gate.status).toBe('pass')
    expect(gate.tasks.find((t) => t.taskId === 't1')?.passRate).toBeCloseTo(0.8)
    expect(gate.reproduced).toEqual([])
  })

  it('复现（1/5=0.2 < 0.8）→ fail 一票否决，reproduced 列出任务', () => {
    const attempts = [
      ...Array.from({ length: 5 }, () => ({ taskId: 't1', passed: false })),
      ...Array.from({ length: 5 }, () => ({ taskId: 't2', passed: true })),
    ]
    const gate = passRateGateOf(run({ k: 5, attempts }))
    expect(gate.status).toBe('fail')
    expect(gate.reproduced).toEqual(['t1'])
    expect(gate.tasks[0].taskId).toBe('t1') // 通过率升序，最差在前
  })

  it('riskVeto 命中同样 fail', () => {
    const attempts = Array.from({ length: 5 }, () => ({ taskId: 't1', passed: true }))
    const gate = passRateGateOf(run({ k: 5, attempts, riskVeto: true }))
    expect(gate.status).toBe('fail')
    expect(gate.riskVeto).toBe(true)
  })

  it('阈值 env 可覆盖且显式入参优先', () => {
    process.env.FLYWHEEL_GATE_MIN_PASS_RATE = '0.5'
    expect(gateThresholds().minPassRate).toBe(0.5)
    expect(gateThresholds({ minPassRate: 0.9 }).minPassRate).toBe(0.9)
    process.env.FLYWHEEL_GATE_MIN_SAMPLES = '5'
    expect(gateThresholds().minSamples).toBe(5)
    // 3/5=0.6 ≥ 0.5 → pass（阈值放宽后不再判复现）
    const attempts = [
      ...Array.from({ length: 3 }, () => ({ taskId: 't1', passed: true })),
      ...Array.from({ length: 2 }, () => ({ taskId: 't1', passed: false })),
    ]
    expect(passRateGateOf(run({ k: 5, attempts })).status).toBe('pass')
  })
})
