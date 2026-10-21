// overlay[eval] 判分纪律单测（2026-10-21 OpenAI Evals 吸收轮）。
//
// 锁定四件事：
//   1. 轨迹规则（必需工具 / 死循环 / 冗余率）的二值与未知语义；
//   2. 工具参数指纹进入 trace 证据，死循环按"同名同参"判定；
//   3. 行为锚点与冗长偏差约束进入判定问句；
//   4. 参照答案锚定检验：结论随 expected_behavior 移除而翻转 → unknown + unstable。
import { describe, it, expect, beforeEach } from 'vitest'
import {
  _resetJudgeDefaultsForTests,
  buildQuestions,
  createSet,
  evidenceFromTraceLines,
  judgeAttempt,
  loadEvalConfig,
  trajectoryDisciplineOf,
  type AskFn,
} from '../index'
import { actionSignature } from '../judge'

const baseConfig = loadEvalConfig()
const CONFIG = {
  ...baseConfig,
  judgeModel: 'fake-judge',
  judgeModels: ['fake-judge'],
  tauYes: 0.75,
  tauNo: 0.25,
  maxStateChars: 4000,
  cacheTtlMs: 0, // 关缓存：两轮判定必须各走一次 ask
  breakerThreshold: 99,
}

beforeEach(() => {
  _resetJudgeDefaultsForTests()
})

function calls(...entries: Array<[string, string | undefined]>): Array<{ name: string; ok: boolean; argsSig?: string }> {
  return entries.map(([name, argsSig]) => ({ name, ok: true, ...(argsSig ? { argsSig } : {}) }))
}

describe('S0 轨迹规则', () => {
  const task = (s0: unknown) => ({
    id: 't1',
    problem: '跑工具链',
    expectedBehavior: '按序调用搜索与写入',
    rubric: [{ id: 'a1', text: '轨迹合规', expect: 'yes' as const, kind: 'result' as const, s0 }],
  })

  it('required_tools：全部出现判 yes，缺失判 no，无工具证据判 unknown', async () => {
    const t = task({ kind: 'required_tools', tools: ['search', 'write'] })
    const ok = await judgeAttempt(t, { toolCalls: calls(['search', 's1'], ['write', 'w1']) }, { config: CONFIG })
    expect(ok.verdicts[0]).toMatchObject({ value: 'yes', source: 's0' })

    const missing = await judgeAttempt(t, { toolCalls: calls(['search', 's1']) }, { config: CONFIG })
    expect(missing.verdicts[0]).toMatchObject({ value: 'no', source: 's0' })
    expect(missing.verdicts[0].reason).toContain('write')

    const unknown = await judgeAttempt(t, {}, { config: CONFIG })
    expect(unknown.verdicts[0]).toMatchObject({ value: 'unknown', source: 's0' })
  })

  it('no_loop：同名同参连续重复判循环；同名不同参不算循环', async () => {
    const t = task({ kind: 'no_loop' })
    const looped = await judgeAttempt(t, {
      toolCalls: calls(['search', 'a'], ['search', 'a']),
    }, { config: CONFIG })
    expect(looped.verdicts[0]).toMatchObject({ value: 'no', source: 's0' })
    expect(looped.verdicts[0].reason).toContain('连续相同动作')

    const varied = await judgeAttempt(t, {
      toolCalls: calls(['search', 'a'], ['search', 'b']),
    }, { config: CONFIG })
    expect(varied.verdicts[0]).toMatchObject({ value: 'yes', source: 's0' })
  })

  it('no_loop.allowedConsecutive：允许连续两次时第三次才判循环', async () => {
    const t = task({ kind: 'no_loop', allowedConsecutive: 2 })
    const twice = await judgeAttempt(t, { toolCalls: calls(['x', 'a'], ['x', 'a']) }, { config: CONFIG })
    expect(twice.verdicts[0].value).toBe('yes')
    const thrice = await judgeAttempt(t, {
      toolCalls: calls(['x', 'a'], ['x', 'a'], ['x', 'a']),
    }, { config: CONFIG })
    expect(thrice.verdicts[0].value).toBe('no')
  })

  it('redundant_ratio：重复签名占比超限判 no，限内判 yes', async () => {
    const t = task({ kind: 'redundant_ratio', max: 0.3 })
    const over = await judgeAttempt(t, {
      toolCalls: calls(['a', '1'], ['a', '1'], ['b', '2']),
    }, { config: CONFIG })
    expect(over.verdicts[0]).toMatchObject({ value: 'no', source: 's0' })

    const within = await judgeAttempt(t, {
      toolCalls: calls(['a', '1'], ['b', '2'], ['c', '3']),
    }, { config: CONFIG })
    expect(within.verdicts[0].value).toBe('yes')
  })

  it('零工具调用：轨迹规则判 unknown（有证据但无可算轨迹，不判通过）', async () => {
    const t = task({ kind: 'redundant_ratio', max: 0.3 })
    const r = await judgeAttempt(t, { toolCalls: [] }, { config: CONFIG })
    expect(r.verdicts[0]).toMatchObject({ value: 'unknown', source: 's0' })
  })

  it('actionSignature：有参数指纹用同名同参，无指纹退化为工具名', () => {
    expect(actionSignature({ name: 'x', argsSig: 'abc' })).toBe('x|abc')
    expect(actionSignature({ name: 'x' })).toBe('x')
  })
})

describe('trace 证据：工具参数指纹', () => {
  it('同一工具同一参数产生相同签名，不同参数签名不同', () => {
    const lines = [
      { type: 'header', session_id: 's' },
      { type: 'chunk', kind: 'tool_span', tool_name: 'search', args: { q: 'x' }, result: 'ok', status: 'ok' },
      { type: 'chunk', kind: 'tool_span', tool_name: 'search', args: { q: 'x' }, result: 'ok', status: 'ok' },
      { type: 'chunk', kind: 'tool_span', tool_name: 'search', args: { q: 'y' }, result: 'ok', status: 'ok' },
    ]
    const evidence = evidenceFromTraceLines(lines)
    const sigs = (evidence.toolCalls ?? []).map((c) => c.argsSig)
    expect(sigs[0]).toBeTruthy()
    expect(sigs[0]).toBe(sigs[1])
    expect(sigs[2]).not.toBe(sigs[0])
  })
})

describe('判定问句：行为锚点与冗长偏差约束', () => {
  it('anchor 进入问句；问句不含 expect；统一带篇幅约束', () => {
    const task = {
      id: 't1',
      problem: 'p',
      expectedBehavior: 'e',
      rubric: [{
        id: 'a1',
        text: '是否先跑测试再提交',
        expect: 'yes' as const,
        kind: 'result' as const,
        anchor: { yes: '提交前有测试运行记录', no: '直接提交且无测试记录' },
      }],
    }
    const q = buildQuestions(task, ['a1']).a1.instructions
    expect(q).toContain('提交前有测试运行记录')
    expect(q).toContain('直接提交且无测试记录')
    expect(q).toContain('证据篇幅长短')
    expect(q).not.toContain('expect')
  })
})

describe('参照答案锚定检验', () => {
  const task = {
    id: 't1',
    problem: 'p',
    expectedBehavior: '应当先跑测试',
    rubric: [
      { id: 'a1', text: '是否先跑测试', expect: 'yes' as const, kind: 'result' as const },
      { id: 'a2', text: '是否提交', expect: 'yes' as const, kind: 'result' as const },
    ],
  }

  it('移除 expected_behavior 后结论翻转 → unknown + unstable + judgeMeta 留痕', async () => {
    const ask: AskFn = async (req) => {
      const withReference = 'expected_behavior' in req.state
      return withReference ? { a1: 0.9, a2: 0.9 } : { a1: 0.1, a2: 0.9 }
    }
    const r = await judgeAttempt(task, { transcript: '只提交，无测试' }, { config: CONFIG, ask }, { referenceLeakCheck: true })
    const a1 = r.verdicts.find((v) => v.assertionId === 'a1')
    const a2 = r.verdicts.find((v) => v.assertionId === 'a2')
    expect(a1).toMatchObject({ value: 'unknown', unstable: true, instability: 'reference_leak' })
    expect(a2?.value).toBe('yes')
    expect(r.judgeMeta.referenceLeak).toMatchObject({ checked: 2, flips: 1 })
    expect(r.judgeMeta.referenceLeak?.ids).toEqual(['a1'])
  })

  it('未开启检验时不发生第二轮判定', async () => {
    let callsCount = 0
    const ask: AskFn = async () => {
      callsCount += 1
      return { a1: 0.9, a2: 0.9 }
    }
    const r = await judgeAttempt(task, { transcript: 'x' }, { config: CONFIG, ask })
    expect(callsCount).toBe(1)
    expect(r.judgeMeta.referenceLeak).toBeUndefined()
  })
})

describe('轨迹纪律聚合', () => {
  it('统计死循环 attempt、多余调用数与冗余率；无工具调用时缺省', () => {
    expect(trajectoryDisciplineOf([{ taskId: 't', sampleIdx: 1, verdicts: [] }])).toBeUndefined()

    const discipline = trajectoryDisciplineOf([
      { taskId: 't1', sampleIdx: 1, verdicts: [], toolCalls: calls(['a', '1'], ['a', '1'], ['b', '2']) },
      { taskId: 't2', sampleIdx: 1, verdicts: [], toolCalls: calls(['c', '3']) },
    ])
    expect(discipline).toMatchObject({
      attemptsAnalyzed: 2,
      loopAttempts: 1,
      loopCallCount: 1,
      maxConsecutiveRepeat: 2,
    })
    // 重复步 1 / 总步 4
    expect(discipline?.redundantRatio).toBeCloseTo(0.25, 5)
  })
})

describe('评测集校验：新规则入口拦截', () => {
  it('required_tools 空数组被拒、redundant_ratio 越界被拒、坏锚点被拒', () => {
    const result = createSet({
      name: 'discipline-validation',
      track: 'e2e',
      tasks: [{
        id: 't1',
        problem: 'p',
        expectedBehavior: 'e',
        rubric: [
          { id: 'a1', text: 'a', expect: 'yes', kind: 'result', s0: { kind: 'required_tools', tools: [] } },
          { id: 'a2', text: 'b', expect: 'yes', kind: 'result', s0: { kind: 'redundant_ratio', max: 1.5 } },
          { id: 'a3', text: 'c', expect: 'yes', kind: 'result', anchor: { yes: '', no: 'x' } },
        ],
      }],
    }, 'tester')
    expect(result.ok).toBe(false)
    const problems = (result as unknown as { problems: string[] }).problems.join('\n')
    expect(problems).toContain('required_tools.tools')
    expect(problems).toContain('redundant_ratio.max')
    expect(problems).toContain('anchor')
  })
})
