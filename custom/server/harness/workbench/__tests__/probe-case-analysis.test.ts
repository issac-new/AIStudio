// 失败根因分布与逐题对错翻转（2026-11-26 Palantir 架构吸收轮）：评测运行 → 工作台读数。
// 夹具全在临时目录的评测库里，不触真评测库。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { caseFlipsOf, failureClustersOf } from '../evidence'
import { verificationTierOf } from '../loop-advice-tier'
import { diffSummary, sha256, variantSetDigest } from '../loop'
import type { Proposal, Variant } from '../types'

let dir = ''

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'probe-case-'))
  process.env.EVAL_STORE = join(dir, 'eval')
  const store = await import('../../../eval/store')
  store._useStoreDirForTests(process.env.EVAL_STORE)
})

afterEach(() => {
  delete process.env.EVAL_STORE
  rmSync(dir, { recursive: true, force: true })
})

const v = (assertionId: string, value: string) => ({ assertionId, value, source: 's0' })
const resultRubric = (id: string) => [{ id, text: id, expect: 'yes', kind: 'result' }]

function aggregates(passAt1: number) {
  return {
    taskCount: 1, passAt1, passAtK: passAt1,
    byLayer: { result: passAt1, trajectory: passAt1, risk: 'none' as const, efficiency: { avgTokens: 100, avgCostUsd: 0.01, avgSteps: 3, avgDurationMs: 500 } },
    unknownRatio: 0, rubricDrilldownHint: false, riskVeto: false, statisticallyInsufficient: false, judgeOnline: true,
  }
}

async function seed() {
  const store = await import('../../../eval/store')
  const made = store.createSet({
    name: '主评测集', track: 'e2e',
    tasks: [
      { id: 't-pass', problem: 'p', expectedBehavior: 'e', rubric: resultRubric('a1') },
      { id: 't-fix', problem: 'p', expectedBehavior: 'e', rubric: resultRubric('a1') },
      { id: 't-result', problem: 'p', expectedBehavior: 'e', rubric: resultRubric('a1') },
      { id: 't-risk', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'r1', text: 'r', expect: 'no', kind: 'risk' }] },
      { id: 't-traj', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a1', text: 't', expect: 'yes', kind: 'trajectory' }] },
      { id: 't-loop', problem: 'p', expectedBehavior: 'e', rubric: resultRubric('a1') },
      { id: 't-offline', problem: 'p', expectedBehavior: 'e', rubric: resultRubric('a1') },
      { id: 't-only-candidate', problem: 'p', expectedBehavior: 'e', rubric: resultRubric('a1') },
    ],
  })
  if (!made.ok) throw new Error(JSON.stringify(made))
  const setId = made.set.id
  const loop = [{ name: 'read', ok: true, argsSig: 'x' }, { name: 'read', ok: true, argsSig: 'x' }]
  store.appendRun({
    id: 'run-base', setId, target: {}, k: 3, status: 'done', createdAt: Date.now(), aggregates: aggregates(0.5),
    attempts: [
      { taskId: 't-pass', sampleIdx: 1, verdicts: [v('a1', 'yes')] },
      { taskId: 't-fix', sampleIdx: 1, verdicts: [v('a1', 'no')] },
      { taskId: 't-result', sampleIdx: 1, verdicts: [v('a1', 'no')] },
      { taskId: 't-risk', sampleIdx: 1, verdicts: [v('r1', 'no')] },
      { taskId: 't-loop', sampleIdx: 1, verdicts: [v('a1', 'yes')] },
    ],
  })
  store.appendRun({
    id: 'run-cand', setId, target: {}, k: 3, status: 'done', createdAt: Date.now(), aggregates: aggregates(0.5),
    attempts: [
      { taskId: 't-pass', sampleIdx: 1, verdicts: [v('a1', 'yes')] },
      // 第二样本失败不计：通过率与根因都只看首样本
      { taskId: 't-pass', sampleIdx: 2, verdicts: [v('a1', 'no')] },
      { taskId: 't-fix', sampleIdx: 1, verdicts: [v('a1', 'yes')] },
      { taskId: 't-result', sampleIdx: 1, verdicts: [v('a1', 'no')] },
      { taskId: 't-risk', sampleIdx: 1, verdicts: [v('r1', 'yes')] },
      { taskId: 't-traj', sampleIdx: 1, verdicts: [v('a1', 'no')] },
      { taskId: 't-loop', sampleIdx: 1, verdicts: [v('a1', 'no')], toolCalls: loop },
      { taskId: 't-offline', sampleIdx: 1, verdicts: [v('a1', 'unknown')] },
      { taskId: 't-only-candidate', sampleIdx: 1, verdicts: [v('a1', 'no')] },
    ],
  })
  store.appendRun({ id: 'run-no-attempts', setId, target: {}, k: 3, status: 'done', createdAt: Date.now(), aggregates: aggregates(0.5), attempts: [] })
  return setId
}

describe('失败根因分布', () => {
  it('首样本未通过的题逐题归类并计数；样例带题号，不带断言原文', async () => {
    await seed()
    const clusters = failureClustersOf('run-cand')
    expect(clusters).toEqual([
      { rootCause: 'result_defect', count: 2, sampleTaskIds: ['t-result', 't-only-candidate'] },
      { rootCause: 'action_loop', count: 1, sampleTaskIds: ['t-loop'] },
      { rootCause: 'risk_violation', count: 1, sampleTaskIds: ['t-risk'] },
      { rootCause: 'trajectory_defect', count: 1, sampleTaskIds: ['t-traj'] },
      { rootCause: 'undecidable', count: 1, sampleTaskIds: ['t-offline'] },
    ])
    // 首样本通过的 t-pass 与 t-fix 不在分布里；样例只有题号
    const ids = clusters!.flatMap((c) => c.sampleTaskIds)
    expect(ids).not.toContain('t-pass')
    expect(ids).not.toContain('t-fix')
    expect(JSON.stringify(clusters)).not.toContain('text')
  })

  it('没有失败题 → 空数组；运行没有样本 → 空数组；运行或试卷取不到 → 未采集', async () => {
    const setId = await seed()
    const store = await import('../../../eval/store')
    store.appendRun({
      id: 'run-all-pass', setId, target: {}, k: 3, status: 'done', createdAt: Date.now(), aggregates: aggregates(1),
      attempts: [{ taskId: 't-pass', sampleIdx: 1, verdicts: [v('a1', 'yes')] }],
    })
    expect(failureClustersOf('run-all-pass')).toEqual([])
    expect(failureClustersOf('run-no-attempts')).toEqual([])
    expect(failureClustersOf('run-missing')).toBeNull()
    expect(failureClustersOf('')).toBeNull()
  })

  it('同一根因超过三题：计数是实际题数，样例题号至多三个', async () => {
    const store = await import('../../../eval/store')
    const made = store.createSet({
      name: '结果缺陷集', track: 'e2e',
      tasks: ['d1', 'd2', 'd3', 'd4', 'd5'].map((id) => ({ id, problem: 'p', expectedBehavior: 'e', rubric: resultRubric('a1') })),
    })
    if (!made.ok) throw new Error(JSON.stringify(made))
    store.appendRun({
      id: 'run-five', setId: made.set.id, target: {}, k: 3, status: 'done', createdAt: Date.now(), aggregates: aggregates(0),
      attempts: ['d1', 'd2', 'd3', 'd4', 'd5'].map((taskId) => ({ taskId, sampleIdx: 1, verdicts: [v('a1', 'no')] })),
    })
    expect(failureClustersOf('run-five')).toEqual([{ rootCause: 'result_defect', count: 5, sampleTaskIds: ['d1', 'd2', 'd3'] }])
  })
})

describe('逐题对错翻转', () => {
  it('四类计数之和等于参与比较的题数；只在一份运行里出现的题不比', async () => {
    await seed()
    const flips = caseFlipsOf('run-base', 'run-cand')!
    expect(flips.fixed).toEqual(['t-fix'])
    expect(flips.broken).toEqual(['t-risk', 't-loop'])
    expect(flips.bothPassed).toBe(1)
    expect(flips.bothFailed).toBe(1)
    expect(flips.compared).toBe(5)
    expect(flips.fixed.length + flips.broken.length + flips.bothPassed + flips.bothFailed).toBe(flips.compared)
    // t-traj、t-offline、t-only-candidate 基线运行里没有，不参与比较
    expect([...flips.fixed, ...flips.broken]).not.toContain('t-traj')
  })

  it('基线运行取不到，或没有可比的题 → 未采集', async () => {
    await seed()
    expect(caseFlipsOf('run-missing', 'run-cand')).toBeNull()
    expect(caseFlipsOf(null, 'run-cand')).toBeNull()
    expect(caseFlipsOf('run-base', 'run-missing')).toBeNull()
    expect(caseFlipsOf('run-no-attempts', 'run-cand')).toBeNull()
  })
})

describe('验证层级同时看探针级与提案级的留出读数', () => {
  const NOW = new Date().toISOString()
  function proposalWith(heldout: Proposal['heldout'], probeHeldout: boolean): Proposal {
    const variants: Variant[] = [{ id: 'v1', label: 'v1', content: 'c', digest: sha256('c'), diffSummary: diffSummary('b', 'c') }]
    return {
      id: 'hw-tier', title: 't', hypothesis: 'h', surfaceKey: 'system_prompt', targetPath: 'profiles/p1/SOUL.md', risk: 'low', mode: 'sequential',
      domain: 'general', status: 'composed', budgetCapUsd: 5, evidenceRefs: [], experienceIds: [], baselineRunId: null, baseline: null,
      base: null, variants, heldout,
      approval: null, composition: { variantId: 'v1', digest: variants[0].digest, rationale: 'r', actor: 'a', at: NOW }, promotion: null, rollback: null,
      createdBy: 'a', createdAt: NOW, updatedAt: NOW,
      probes: [{
        id: 'pr-v1', variantId: 'v1', status: 'recorded', createdAt: NOW,
        evidence: {
          evalRunId: 'r', setId: 's', k: 3, passAt1: 0.5, passAtK: 0.5, resultPassRate: 0.5, trajectoryPassRate: 0.5, unknownRatio: 0,
          riskVeto: false, judgeOnline: false, statisticallyInsufficient: false, tokens: 1, costUsd: 1, steps: 1, latencyMs: 1,
          regression: { runId: 'rr', suiteName: 'reg', total: 1, failed: 0, failedTaskIds: [] },
          ...(probeHeldout ? { heldout: { runId: 'h', n: 1, passRate: 1 } } : {}),
        },
      }],
    }
  }
  it('提案级有留出读数 → 判到留出这一层级（此前生产上永远判不到）', () => {
    expect(verificationTierOf(proposalWith({ runId: 'h', n: 1, passRate: 1 }, false))).toBe('heldout')
  })
  it('两级都没有 → 仍是回归层级；探针级有 → 留出层级（原有行为不变）', () => {
    expect(verificationTierOf(proposalWith(null, false))).toBe('regression')
    expect(verificationTierOf(proposalWith(null, true))).toBe('heldout')
  })
})
