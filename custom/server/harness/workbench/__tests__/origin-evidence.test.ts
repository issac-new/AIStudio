// Harness² 回归证据门禁：诊断 run 不可作候选证据；历史 run 按冻结考卷读取。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _useStoreDirForTests, appendRun, appendTasksToSet, createSet } from '../../../eval/store'
import type { EvalRun } from '../../../eval/types'
import { readRegressionEvidence } from '../evidence'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'workbench-origin-evidence-'))
  _useStoreDirForTests(dir)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function aggregates(): EvalRun['aggregates'] {
  return {
    taskCount: 1,
    passAt1: 1,
    passAtK: 1,
    byLayer: {
      result: 1,
      trajectory: 1,
      risk: 'none',
      efficiency: { avgTokens: 10, avgCostUsd: 0, avgSteps: 1, avgDurationMs: 10 },
    },
    unknownRatio: 0,
    rubricDrilldownHint: false,
    riskVeto: false,
    statisticallyInsufficient: false,
    judgeOnline: true,
  }
}

function regressionSet() {
  const created = createSet({
    name: '回归样本库',
    track: 'e2e',
    tasks: [{ id: 'r1', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a1', text: 'ok', expect: 'yes', kind: 'result' }] }],
  }, 'tester')
  if (!created.ok) throw new Error(created.problems.join(','))
  return created.set
}

function runOf(set: { id: string; contentHash: string; revision: number }, mode: 'explicit' | 'origin' | 'mixed'): EvalRun {
  return {
    id: `run-${mode}`,
    setId: set.id,
    setHash: set.contentHash,
    setRevision: set.revision,
    target: {},
    k: 1,
    status: 'done',
    evidenceMode: mode,
    attempts: [{ taskId: 'r1', sampleIdx: 1, verdicts: [], passed: true }],
    aggregates: aggregates(),
    createdAt: Date.now(),
  }
}

describe('origin 回归证据边界', () => {
  it('origin/mixed 只能诊断，不能作为 Harness² 回归证据', () => {
    const set = regressionSet()
    appendRun(runOf(set, 'origin'))
    appendRun(runOf(set, 'mixed'))
    expect(readRegressionEvidence('run-origin')).toBeNull()
    expect(readRegressionEvidence('run-mixed')).toBeNull()
  })

  it('历史 run 按冻结 revision 统计，不受后续追加任务影响', () => {
    const set = regressionSet()
    appendRun(runOf(set, 'explicit'))
    const appended = appendTasksToSet(set.id, [{
      id: 'r2', problem: '新题', expectedBehavior: '新期望', rubric: [{ id: 'a1', text: 'ok', expect: 'yes', kind: 'result' }],
    }])
    expect(appended.ok).toBe(true)
    const evidence = readRegressionEvidence('run-explicit')
    expect(evidence).toMatchObject({ total: 1, failed: 0, failedTaskIds: [] })
  })
})
