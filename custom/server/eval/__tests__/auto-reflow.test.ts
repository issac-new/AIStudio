// B4（挂账清偿批）守门：run 完成自动回流——失败样本幂等回流回归库、通过样本
// 不回流、密封源集结构性自拒如实计数、env 关停、重复触发幂等（created:false 不炸）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { autoReflowFailedSamples, autoReflowEnabled } from '../auto-reflow'
import { appendRun, createSet, getSet, listSets } from '../store'
import type { EvalRun } from '../types'

let dir: string
let setId: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auto-reflow-'))
  process.env.EVAL_STORE = dir
  delete process.env.EVAL_AUTO_REFLOW_ON_RUN
  // 一集两题：t1 有断言（可判失败/通过）、t2 无断言（attemptPassed 恒 false）
  const created = createSet({ name: '源集', track: 'process', tasks: [
    { id: 't1', problem: '题一', expectedBehavior: '对', rubric: [{ id: 'a1', text: '必须', expect: 'yes', kind: 'result' }] },
    { id: 't2', problem: '题二', expectedBehavior: '对', rubric: [{ id: 'a2', text: '必须', expect: 'yes', kind: 'result' }] },
  ] }, 'test')
  if (!created.ok) throw new Error('fixture 建集失败: ' + created.problems.join('；'))
  setId = created.set.id
})

afterEach(() => {
  delete process.env.EVAL_STORE
  delete process.env.EVAL_AUTO_REFLOW_ON_RUN
  rmSync(dir, { recursive: true, force: true })
})

function makeRun(attempts: EvalRun['attempts']): EvalRun {
  return {
    id: 'erun-x1', setId, setHash: 'h', target: {}, k: 1, status: 'done',
    attempts, aggregates: {} as EvalRun['aggregates'], createdAt: 1,
  }
}

describe('autoReflowFailedSamples', () => {
  it('失败样本回流回归库（幂等可重入）；通过样本不回流；结果摘要如实', () => {
    const set = getSet(setId)!
    const failAttempt = { taskId: 't1', sampleIdx: 1, verdicts: [{ assertionId: 'a1', value: 'no' as const, source: 's1' as never }], judgedAt: 1 }
    const passAttempt = { taskId: 't1', sampleIdx: 2, verdicts: [{ assertionId: 'a1', value: 'yes' as const, source: 's1' as never }], judgedAt: 1 }
    const run = makeRun([failAttempt, passAttempt])
    appendRun(run) // 生产链路 appendRun 先于自动回流（runner.ts 同序）
    const r1 = autoReflowFailedSamples(set, run)
    expect(r1.enabled).toBe(true)
    expect(r1.reflowed).toBe(1)
    // 回归库已建并含 re- 任务（listSets 是密封元数据面，题目走 getSet）
    const regMeta = listSets().find((s) => s.name === '回归样本库')
    expect(regMeta).toBeTruthy()
    const reg = getSet(regMeta!.id)!
    expect(reg.tasks.some((t) => t.origin?.runId === 'erun-x1' && t.origin?.taskId === 't1')).toBe(true)
    // 重放同 run：reflowTaskToSet 幂等（created:false 计 reflowed，不炸不重复）
    const r2 = autoReflowFailedSamples(set, run)
    expect(r2.reflowed).toBe(1)
    expect(getSet(regMeta!.id)!.tasks.filter((t) => t.origin?.runId === 'erun-x1').length).toBe(1)
  })

  it('EVAL_AUTO_REFLOW_ON_RUN=0 → enabled:false 不动账', () => {
    process.env.EVAL_AUTO_REFLOW_ON_RUN = '0'
    expect(autoReflowEnabled()).toBe(false)
    const set = getSet(setId)!
    const run = makeRun([{ taskId: 't2', sampleIdx: 1, verdicts: [{ assertionId: 'a2', value: 'no' as const, source: 's1' as never }], judgedAt: 1 }])
    appendRun(run)
    const r = autoReflowFailedSamples(set, run)
    expect(r).toEqual({ enabled: false, reflowed: 0, skipped: 0 })
    expect(listSets().some((s) => s.name === '回归样本库')).toBe(false)
  })
})
