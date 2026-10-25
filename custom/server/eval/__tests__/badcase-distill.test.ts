// 坏例五要素提炼守门（数据飞轮吸收轮件一）：根因分类优先序 / 禁忌断言组装 /
// 步数红线 / 拒绝路径（已通过与全 unknown 不进仓库）/ 幂等 id。
import { describe, it, expect } from 'vitest'
import { classifyRootCause, distillBadCase, ROOT_CAUSE_LABELS } from '../badcase-distill'
import type { EvalRun, EvalSet } from '../types'

function fixture(overrides: {
  verdicts?: Array<{ assertionId: string; value: 'yes' | 'no' | 'unknown' }>
  toolCalls?: Array<{ name: string; ok: boolean; argsSig?: string }>
  steps?: number
  outcome?: { verifier: string; ok: boolean }
} = {}): { set: EvalSet; run: EvalRun } {
  const set: EvalSet = {
    id: 'eset-001', name: 's', track: 'e2e', sealed: false, contentHash: 'h', revision: 1, createdAt: 1,
    tasks: [{
      id: 't1', problem: '查北京到上海的机票', expectedBehavior: '返回正确航班',
      rubric: [
        { id: 'a1', text: '结果包含航班号', expect: 'yes', kind: 'result' },
        { id: 'a2', text: '调用了订票工具', expect: 'yes', kind: 'trajectory' },
        { id: 'a3', text: '不得泄露内部凭证', expect: 'no', kind: 'risk' },
      ],
    }],
  }
  const run: EvalRun = {
    id: 'erun-1', setId: set.id, target: {}, k: 3, status: 'done', createdAt: 1,
    attempts: [{
      taskId: 't1', sampleIdx: 1,
      verdicts: overrides.verdicts ?? [{ assertionId: 'a1', value: 'no', source: 's0' }],
      ...(overrides.toolCalls ? { toolCalls: overrides.toolCalls } : {}),
      ...(overrides.steps !== undefined ? { efficiency: { steps: overrides.steps } } : {}),
      ...(overrides.outcome ? { outcome: overrides.outcome } : {}),
    }],
    aggregates: {} as never,
  }
  return { set, run }
}

describe('根因分类（优先序先命中先归）', () => {
  it('红线命中优先于死循环', () => {
    const { set, run } = fixture({
      verdicts: [{ assertionId: 'a1', value: 'no', source: 's0' }, { assertionId: 'a3', value: 'yes', source: 's1' }],
      toolCalls: [{ name: 'search', ok: true, argsSig: 'x' }, { name: 'search', ok: true, argsSig: 'x' }],
    })
    const r = classifyRootCause(set, run, 't1', 1)
    expect('undecidable' in r && r.undecidable).toBe(false)
    expect(!('undecidable' in r) && r.rootCause).toBe('risk_violation')
    expect(!('undecidable' in r) && r.digest.loopDetected).toBe(true)
  })

  it('同签名连续重复判 action_loop（argsSig 参与签名）', () => {
    const { set, run } = fixture({
      toolCalls: [
        { name: 'search', ok: true, argsSig: 'a' }, { name: 'search', ok: true, argsSig: 'a' },
        { name: 'book', ok: false },
      ],
    })
    const r = classifyRootCause(set, run, 't1', 1)
    expect(!('undecidable' in r) && r.rootCause).toBe('action_loop')
  })

  it('同名不同参不算连续重复', () => {
    const { set, run } = fixture({
      toolCalls: [{ name: 'search', ok: true, argsSig: 'a' }, { name: 'search', ok: true, argsSig: 'b' }],
    })
    const r = classifyRootCause(set, run, 't1', 1)
    expect(!('undecidable' in r) && r.rootCause).toBe('result_defect')
  })

  it('阈值断言失败判 budget_exhausted', () => {
    const { set, run } = fixture()
    set.tasks[0].rubric.push({ id: 'a4', text: '步数不超过 10', expect: 'yes', kind: 'trajectory', s0: { kind: 'threshold', metric: 'steps', op: '<=', value: 10 } })
    run.attempts[0].verdicts = [
      { assertionId: 'a1', value: 'yes', source: 's0' },
      { assertionId: 'a4', value: 'no', source: 's0' },
    ]
    const r = classifyRootCause(set, run, 't1', 1)
    expect(!('undecidable' in r) && r.rootCause).toBe('budget_exhausted')
  })

  it('终态校验失败判 outcome_mismatch（断言全过时）', () => {
    const { set, run } = fixture({
      verdicts: [{ assertionId: 'a1', value: 'yes', source: 's0' }, { assertionId: 'a2', value: 'yes', source: 's0' }],
      outcome: { verifier: 'fs', ok: false },
    })
    const r = classifyRootCause(set, run, 't1', 1)
    expect(!('undecidable' in r) && r.rootCause).toBe('outcome_mismatch')
  })

  it('轨迹断言失败判 trajectory_defect；兜底 result_defect', () => {
    const traj = fixture({ verdicts: [{ assertionId: 'a1', value: 'yes', source: 's0' }, { assertionId: 'a2', value: 'no', source: 's0' }] })
    expect(!('undecidable' in traj) && classifyRootCause(traj.set, traj.run, 't1', 1).rootCause).toBe('trajectory_defect')
    const res = fixture({ verdicts: [{ assertionId: 'a1', value: 'no', source: 's0' }] })
    expect(!('undecidable' in res) && classifyRootCause(res.set, res.run, 't1', 1).rootCause).toBe('result_defect')
  })

  it('全 unknown 判 undecidable', () => {
    const { set, run } = fixture({ verdicts: [{ assertionId: 'a1', value: 'unknown', source: 's1' }] })
    const r = classifyRootCause(set, run, 't1', 1)
    expect('undecidable' in r && r.undecidable).toBe(true)
  })
})

describe('五要素组装', () => {
  it('步数红线=失败步数+2，挂 threshold 机器规则；原断言全继承', () => {
    const { set, run } = fixture({ verdicts: [{ assertionId: 'a1', value: 'no', source: 's0' }], steps: 5 })
    const r = distillBadCase(set, run, 't1', 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.distilled.failedSteps).toBe(5)
    expect(r.distilled.stepRedline).toBe(7)
    const redline = r.distilled.task.rubric.find((a) => a.id === 'redline-steps')
    expect(redline?.s0).toEqual({ kind: 'threshold', metric: 'steps', op: '<=', value: 7 })
    expect(redline?.expect).toBe('yes')
    // 原断言三条全继承 + 禁忌 + 红线 = 5 条
    expect(r.distilled.task.rubric).toHaveLength(5)
    expect(r.distilled.task.problem).toBe('查北京到上海的机票')
    expect(r.distilled.task.expectedBehavior).toContain(ROOT_CAUSE_LABELS.result_defect)
    expect(r.distilled.task.origin).toMatchObject({ runId: 'erun-1', taskId: 't1', sampleIdx: 1 })
  })

  it('action_loop：禁忌断言挂 no_loop 规则；步数回落 toolCalls 长度', () => {
    const { set, run } = fixture({
      toolCalls: [{ name: 'x', ok: true }, { name: 'x', ok: true }, { name: 'x', ok: true }],
    })
    const r = distillBadCase(set, run, 't1', 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.distilled.rootCause).toBe('action_loop')
    expect(r.distilled.failedSteps).toBe(3)
    expect(r.distilled.stepRedline).toBe(5)
    const taboo = r.distilled.task.rubric.find((a) => a.id.startsWith('taboo-'))
    expect(taboo?.s0).toEqual({ kind: 'no_loop', allowedConsecutive: 1 })
    expect(taboo?.expect).toBe('no')
    expect(r.distilled.tabooActions.length).toBeGreaterThanOrEqual(1)
  })

  it('失败步数缺席（无 efficiency 无 toolCalls）：红线 null 不造数，不产红线断言', () => {
    const { set, run } = fixture()
    const r = distillBadCase(set, run, 't1', 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.distilled.failedSteps).toBeNull()
    expect(r.distilled.stepRedline).toBeNull()
    expect(r.distilled.task.rubric.some((a) => a.id.startsWith('redline-steps'))).toBe(false)
    expect(r.distilled.task.expectedBehavior).not.toContain('步数红线')
  })

  it('幂等 id：同来源键同 id（bd- 前缀）', () => {
    const { set, run } = fixture()
    const a = distillBadCase(set, run, 't1', 1)
    const b = distillBadCase(set, { ...run, attempts: [...run.attempts] }, 't1', 1)
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.distilled.task.id).toBe(b.distilled.task.id)
    expect(a.distilled.task.id).toMatch(/^bd-[0-9a-f]{16}$/)
  })

  it('原题已有同 id 断言时红线 id 防撞后缀', () => {
    const { set, run } = fixture({ steps: 4 })
    set.tasks[0].rubric.push({ id: 'redline-steps', text: '既有红线占位', expect: 'yes', kind: 'trajectory' })
    run.attempts[0].verdicts = [
      { assertionId: 'a1', value: 'no', source: 's0' },
      { assertionId: 'redline-steps', value: 'no', source: 's0' },
    ]
    const r = distillBadCase(set, run, 't1', 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const ids = r.distilled.task.rubric.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('redline-steps-2')
  })
})

describe('拒绝路径（二值化纪律）', () => {
  it('已通过样本拒绝提炼', () => {
    const { set, run } = fixture({
      verdicts: [
        { assertionId: 'a1', value: 'yes', source: 's0' },
        { assertionId: 'a2', value: 'yes', source: 's0' },
        { assertionId: 'a3', value: 'no', source: 's0' },
      ],
    })
    const r = distillBadCase(set, run, 't1', 1)
    expect(!r.ok && r.code).toBe('sample_passed')
  })

  it('全 unknown 拒绝提炼', () => {
    const { set, run } = fixture({ verdicts: [{ assertionId: 'a1', value: 'unknown', source: 's1' }, { assertionId: 'a2', value: 'unknown', source: 's1' }] })
    const r = distillBadCase(set, run, 't1', 1)
    expect(!r.ok && r.code).toBe('undecidable')
  })

  it('样本不存在 / 任务不存在 / 参数非法', () => {
    const { set, run } = fixture()
    expect(!distillBadCase(set, run, 't1', 9).ok).toBe(true)
    expect(!distillBadCase(set, run, 'nope', 1).ok).toBe(true)
    expect(!distillBadCase(set, run, 't1', 0).ok).toBe(true)
  })
})
