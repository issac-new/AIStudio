/** eval → capability observations 投影测试（2026-11-19 调度智能批）。 */
import { describe, expect, it } from 'vitest'
import { observationsFromEvalRuns } from '../from-eval'
import { buildMatrix } from '../matrix'
import type { EvalRun, EvalSet } from '../../eval/types'

function makeSet(): EvalSet {
  return {
    id: 's1',
    name: 'S',
    track: 'e2e',
    contentHash: 'h1',
    tasks: [
      { id: 't1', problem: '', expectedBehavior: '', rubric: [], dimension: 'tool_params', difficulty: 'P1' },
      { id: 't2', problem: '', expectedBehavior: '', rubric: [], dimension: 'privilege_injection' },
      { id: 't3', problem: '', expectedBehavior: '', rubric: [] },
    ],
  } as unknown as EvalSet
}

function makeRun(over: Partial<EvalRun> = {}): EvalRun {
  return {
    id: 'r1',
    setId: 's1',
    setHash: 'h1',
    target: { model: 'GLM-5' },
    k: 1,
    status: 'done',
    attempts: [
      { taskId: 't1', sampleIdx: 1, passed: true, verdicts: [] },
      { taskId: 't2', sampleIdx: 1, passed: false, verdicts: [] },
      { taskId: 't3', sampleIdx: 1, passed: true, verdicts: [] },
    ],
    aggregates: {} as never,
    createdAt: 1_700_000_000_000,
    ...over,
  } as unknown as EvalRun
}

describe('observationsFromEvalRuns', () => {
  it('按 sampleIdx=1 每个 task 一条观测；未标维度跳过并计数', () => {
    const result = observationsFromEvalRuns({ runs: [makeRun()], setOf: () => makeSet() })
    expect(result.observations).toHaveLength(2)
    expect(result.sources).toEqual(['r1@s1'])
    expect(result.observations[0]).toMatchObject({
      model: 'GLM-5', category: 'ops', difficulty: 'P1', passed: 1, total: 1,
    })
    expect(result.observations[1]).toMatchObject({
      category: 'review', difficulty: null, passed: 0, total: 1,
    })
    expect(result.rejected).toContainEqual({
      runId: 'r1', taskId: 't3', reason: 'dimension_unmapped',
    })
  })

  it('投影结果可直接进 buildMatrix（minSamples=1）', () => {
    const { observations } = observationsFromEvalRuns({ runs: [makeRun()], setOf: () => makeSet() })
    const { matrix } = buildMatrix(observations, { minSamples: 1, now: 1_700_000_100_000 })
    expect(matrix.cells).toHaveLength(2)
    expect(matrix.cells.map((c) => c.passAt1).sort()).toEqual([0, 1])
    expect(matrix.cells.every((c) => c.insufficient === false)).toBe(true)
  })

  it('缺模型/集/过期集指纹的 run 被拒绝，不猜', () => {
    const noModel = observationsFromEvalRuns({
      runs: [makeRun({ target: { model: '' } })], setOf: () => makeSet(),
    })
    expect(noModel.observations).toHaveLength(0)
    expect(noModel.rejected[0].reason).toBe('model_missing')

    const stale = observationsFromEvalRuns({
      runs: [makeRun({ setHash: 'other' })], setOf: () => makeSet(),
    })
    expect(stale.observations).toHaveLength(0)
    expect(stale.rejected[0].reason).toBe('stale_set_hash')

    const noSet = observationsFromEvalRuns({ runs: [makeRun()], setOf: () => undefined })
    expect(noSet.rejected[0].reason).toBe('set_missing')
  })

  it('时间窗外的 run 跳过', () => {
    const result = observationsFromEvalRuns({
      runs: [makeRun()], setOf: () => makeSet(), maxAgeDays: 1, now: 1_700_000_000_000 + 3 * 86_400_000,
    })
    expect(result.observations).toHaveLength(0)
    expect(result.rejected[0].reason).toBe('outside_window')
  })

  it('只有 sampleIdx=2 的 task 记 no_pass_sample', () => {
    const run = makeRun({
      attempts: [{ taskId: 't1', sampleIdx: 2, passed: true, verdicts: [] }],
    })
    const result = observationsFromEvalRuns({ runs: [run], setOf: () => makeSet() })
    expect(result.observations).toHaveLength(0)
    expect(result.rejected[0]).toMatchObject({ taskId: 't1', reason: 'no_pass_sample' })
  })
})
