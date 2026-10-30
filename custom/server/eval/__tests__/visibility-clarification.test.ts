// 隐藏断言可见性 + 澄清事实冻结守门（2026-10-30 HelixHarness 吸收轮）。
import { describe, expect, it } from 'vitest'
import { buildJudgeState } from '../judge'
import { publicSetView, publicTaskView } from '../rubric-visibility'
import { calibrationProblemsForRun, hashClarifications, type SetCalibration } from '../set-calibration'
import type { EvalSet, EvalTask } from '../types'

const task = (over: Partial<EvalTask> = {}): EvalTask => ({
  id: 't1',
  problem: 'p',
  expectedBehavior: 'b',
  rubric: [
    { id: 'a1', text: '可见断言', expect: 'yes', kind: 'result' },
    { id: 'a2', text: '隐藏断言', expect: 'yes', kind: 'result', hidden: true },
  ],
  ...over,
})

const set = (over: Partial<EvalSet> = {}): EvalSet => ({
  id: 'eset-001',
  name: 's',
  track: 'e2e',
  sealed: false,
  contentHash: 'h1',
  revision: 1,
  createdAt: 0,
  tasks: [task()],
  ...over,
})

describe('隐藏断言', () => {
  it('对外投影剔除隐藏断言，但明示条数', () => {
    const view = publicTaskView(task())
    expect(view.rubric.map((a) => a.id)).toEqual(['a1'])
    expect(view.hiddenAssertionCount).toBe(1)
    // 原对象不被改动（判分仍用全量 rubric）
    expect(task().rubric).toHaveLength(2)
  })

  it('集投影对每个任务生效', () => {
    const view = publicSetView(set())
    expect(view.tasks[0].rubric).toHaveLength(1)
    expect(view.tasks[0].hiddenAssertionCount).toBe(1)
  })

  it('隐藏断言仍在存储层的 rubric 内（判分口径不变）', () => {
    const s = set()
    expect(s.tasks[0].rubric.some((a) => a.hidden === true)).toBe(true)
  })
})

describe('澄清事实冻结', () => {
  it('裁判状态携带澄清事实；无澄清时字段缺席', () => {
    const config = { judgeBaseUrl: 'x', judgeModel: 'm', judgeModels: [], maxStateChars: 4000 } as never
    const withClr = buildJudgeState(task(), {}, config, {
      clarifications: [{ id: 'c1', question: '空输入如何处理？', answer: '返回空列表', frozenAt: 1 }],
    })
    expect(withClr.clarifications).toEqual([{ question: '空输入如何处理？', answer: '返回空列表' }])
    const without = buildJudgeState(task(), {}, config)
    expect('clarifications' in without).toBe(false)
  })

  it('澄清指纹与顺序无关，内容变化即变', () => {
    const a = hashClarifications([
      { id: '1', question: 'q1', answer: 'a1', frozenAt: 1 },
      { id: '2', question: 'q2', answer: 'a2', frozenAt: 2 },
    ])
    const b = hashClarifications([
      { id: '2', question: 'q2', answer: 'a2', frozenAt: 2 },
      { id: '1', question: 'q1', answer: 'a1', frozenAt: 1 },
    ])
    const c = hashClarifications([{ id: '1', question: 'q1', answer: 'a1-改', frozenAt: 1 }])
    expect(a).toBe(b)
    expect(c).not.toBe(a)
  })

  it('澄清变更使校准失效', () => {
    const cal: SetCalibration = {
      calibrated: true,
      calibratedAt: 1,
      setHash: 'h1',
      samples: 1,
      f2p: [],
      p2p: [],
      reasons: [],
      notes: [],
      clarificationsHash: hashClarifications([]),
    }
    expect(calibrationProblemsForRun(set({ calibration: cal }))).toEqual([])
    const changed = set({
      calibration: cal,
      clarifications: [{ id: 'c1', question: 'q', answer: 'a', frozenAt: 1 }],
    })
    expect(calibrationProblemsForRun(changed).join('')).toContain('澄清事实已变更')
  })
})
