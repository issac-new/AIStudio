// 裁判校准与独立性守门（2026-10-23 HarnessPro 吸收轮 HP-6）。
// 论文实锚：LLM 裁判对失败案例召回仅 41.7%（盲目乐观）→ 换合成测试 83.3%；
// 腾讯文误区六：选手和裁判不能是同一个人。
import { describe, it, expect } from 'vitest'
import { evaluatorAuditOf } from '../evaluators'
import type { Attempt, EvalRun, EvalSet, AttemptVerdict } from '../types'

function makeSet(): EvalSet {
  return {
    id: 's-hp', name: 'HP 校准测试集', track: 'e2e', sealed: false, createdAt: 1,
    tasks: [{ id: 't1', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a1', text: '断言1', expect: 'yes', kind: 'result' }] }],
  }
}

function verdict(over: Partial<AttemptVerdict>): AttemptVerdict {
  return { assertionId: 'a1', value: 'unknown', source: 's0+s1', ...over }
}

function runOf(attempts: Attempt[], target: EvalRun['target'] = {}): EvalRun {
  return {
    id: 'r-hp', setId: 's-hp', target, k: 1, status: 'completed',
    attempts, aggregates: {} as EvalRun['aggregates'], createdAt: 1,
  }
}

function attemptOf(verdicts: AttemptVerdict[], judgeModels?: string[]): Attempt {
  return {
    taskId: 't1', sampleIdx: 1, verdicts,
    ...(judgeModels ? { judgeMeta: { online: true, models: judgeModels } as Attempt['judgeMeta'] } : {}),
  }
}

describe('judgeCalibration：S0 决定性样本上的失败召回', () => {
  it('结构化 conflictDirection：S0=no/S1=yes 记漏判失败，S1=no 记正确判负 → failureRecall', () => {
    const attempts = [attemptOf([
      verdict({ value: 'unknown', conflict: true, conflictDirection: 's0_no_s1_yes', reason: 'S0 no / S1 yes 相反 → unknown（进人工仲裁）' }),
      verdict({ value: 'no', conflict: false, reason: 'S0 no / S1 no 一致' }),
      verdict({ value: 'unknown', conflict: true, conflictDirection: 's0_yes_s1_no', reason: 'S0 yes / S1 no 相反 → unknown（进人工仲裁）' }),
    ])]
    const audit = evaluatorAuditOf(makeSet(), runOf(attempts))
    expect(audit.judgeCalibration.s0Decisive).toBe(3)
    expect(audit.judgeCalibration.judgeMissedFailure).toBe(1)
    expect(audit.judgeCalibration.judgeCorrectFailure).toBe(1)
    expect(audit.judgeCalibration.judgeFalseKill).toBe(1)
    expect(audit.judgeCalibration.failureRecall).toBeCloseTo(0.5, 3)
    expect(audit.notes.some((n) => n.includes('失败召回'))).toBe(true)
  })

  it('旧判词 reason 回退解析：无 conflictDirection 也能算（本仓自定契约）', () => {
    const attempts = [attemptOf([
      verdict({ value: 'unknown', conflict: true, reason: 'S0 no / S1 yes 相反 → unknown（进人工仲裁）' }),
      verdict({ value: 'no', reason: 'S0 no / S1 no 一致' }),
      verdict({ value: 'no', reason: 'S0 no / S1 no 一致' }),
    ])]
    const audit = evaluatorAuditOf(makeSet(), runOf(attempts))
    expect(audit.judgeCalibration.judgeMissedFailure).toBe(1)
    expect(audit.judgeCalibration.judgeCorrectFailure).toBe(2)
    expect(audit.judgeCalibration.failureRecall).toBeCloseTo(2 / 3, 3)
  })

  it('S1 abstain（unknown 取 S0）不进分母；无 S0 判负样本 → failureRecall=null 如实缺席', () => {
    const abstain = [attemptOf([verdict({ value: 'no', reason: 'S1 unknown（未答题），取 S0 no' })])]
    const a1 = evaluatorAuditOf(makeSet(), runOf(abstain))
    expect(a1.judgeCalibration.s0Decisive).toBe(0)
    expect(a1.judgeCalibration.failureRecall).toBeNull()

    const onlyYes = [attemptOf([verdict({ value: 'yes', reason: 'S0 yes / S1 yes 一致' })])]
    const a2 = evaluatorAuditOf(makeSet(), runOf(onlyYes))
    expect(a2.judgeCalibration.failureRecall).toBeNull()
  })
})

describe('judgeIndependence：选手与裁判同源检查（只报不拦）', () => {
  it('裁判模型与生成侧同源 → overlaps 非空 + note + riskLevel≥watch', () => {
    const audit = evaluatorAuditOf(makeSet(), runOf(
      [attemptOf([verdict({ value: 'yes', reason: 'S0 yes / S1 yes 一致' })], ['glm-5.2'])],
      { model: 'glm-5.2' },
    ))
    expect(audit.judgeIndependence.overlaps).toEqual(['glm-5.2'])
    expect(audit.judgeIndependence.generatorModel).toBe('glm-5.2')
    expect(audit.notes.some((n) => n.includes('同一个人'))).toBe(true)
    expect(audit.riskLevel).toBe('watch')
  })

  it('异源 → 空 overlaps + 独立性 note；缺任一侧信息 → 无推断', () => {
    const apart = evaluatorAuditOf(makeSet(), runOf(
      [attemptOf([verdict({ value: 'yes', reason: 'S0 yes / S1 yes 一致' })], ['gpt-5.5'])],
      { model: 'glm-5.2' },
    ))
    expect(apart.judgeIndependence.overlaps).toEqual([])
    expect(apart.notes.some((n) => n.includes('异源'))).toBe(true)

    const noInfo = evaluatorAuditOf(makeSet(), runOf([attemptOf([verdict({ value: 'yes' })])]))
    expect(noInfo.judgeIndependence.overlaps).toEqual([])
    expect(noInfo.judgeIndependence.generatorModel).toBeNull()
  })
})
