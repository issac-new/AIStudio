// overlay[eval] 百度评测范式轮单测：指标动作绑定 / 三角互证 / 能力维度覆盖 /
// 判词审计理由 / 人工覆盖留痕。判定端不依赖真端点（S0-only 或注入判词）。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  _useStoreDirForTests,
  aggregateRun,
  appendRun,
  coverageOfSets,
  createSet,
  EVAL_DIMENSIONS,
  evaluatorAuditOf,
  getRun,
  getSet,
  isDecoration,
  judgeAttempt,
  loadEvalConfig,
  METRIC_DEFS,
  METRIC_ACTIONS,
  recordHumanVerdict,
  summarizeConsumption,
  type EvalRun,
  type EvalSet,
} from '../index'

let storeDir: string
beforeAll(() => {
  storeDir = mkdtempSync(join(tmpdir(), 'eval-baidu-'))
  _useStoreDirForTests(storeDir)
})
afterAll(() => {
  rmSync(storeDir, { recursive: true, force: true })
})
beforeEach(() => {
  _useStoreDirForTests(storeDir)
})

function fixtureSet(): EvalSet {
  return {
    id: 'eset-fixture',
    name: 'fixture',
    track: 'e2e',
    sealed: false,
    createdAt: 1,
    tasks: [
      {
        id: 't1',
        problem: 'p',
        expectedBehavior: 'e',
        dimension: 'task_completion',
        rubric: [
          { id: 'a1', text: 'a1', expect: 'yes', kind: 'result' },
          { id: 'a2', text: 'a2', expect: 'yes', kind: 'result' },
        ],
      },
    ],
  }
}

function fixtureRun(): EvalRun {
  return {
    id: 'erun-fixture',
    setId: 'eset-fixture',
    target: {},
    k: 2,
    status: 'done',
    createdAt: 1,
    attempts: [
      {
        taskId: 't1',
        sampleIdx: 1,
        verdicts: [
          { assertionId: 'a1', value: 'yes', source: 's1', p: 0.9, reason: 'S1 yes p=0.90' },
          { assertionId: 'a2', value: 'unknown', source: 's1', reason: 'S1 unknown p=0.50' },
        ],
        judgeMeta: { backend: 'mock', latencyMs: 1, cached: false, online: true },
      },
    ],
    aggregates: {} as EvalRun['aggregates'],
  }
}

describe('指标注册表与动作绑定', () => {
  it('键唯一且每条至少一个动作', () => {
    const keys = METRIC_DEFS.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const def of METRIC_DEFS) {
      expect(def.drives.length).toBeGreaterThan(0)
      for (const action of def.drives) {
        expect(METRIC_ACTIONS.map((a) => a.key)).toContain(action)
      }
    }
  })

  it('装饰指标只认 report_only', () => {
    const sixDim = METRIC_DEFS.find((d) => d.key === 'six_dimensions')!
    expect(isDecoration(sixDim)).toBe(true)
    const passAtK = METRIC_DEFS.find((d) => d.key === 'pass_at_k')!
    expect(isDecoration(passAtK)).toBe(false)
  })

  it('零账本时全部未接线，装饰指标仍然计数', () => {
    const summary = summarizeConsumption({
      runs: [],
      iterations: 0,
      reflows: 0,
      dimensionTaggedTasks: 0,
      redteamRuns: 0,
    })
    expect(summary.summary.total).toBe(METRIC_DEFS.length)
    expect(summary.summary.wired).toBe(0)
    expect(summary.summary.decoration).toBe(summary.decorationKeys.length)
    expect(summary.decorationKeys).toContain('six_dimensions')
  })

  it('真实账本把对应指标接线', () => {
    const summary = summarizeConsumption({
      runs: [{
        aggregates: { passAt1: 1, passAtK: 1, riskVeto: false, releaseGate: { measuredCount: 4 } },
        attempts: [{ verdicts: [{ source: 'human', previousValue: 'no' }] }],
      }],
      iterations: 2,
      reflows: 1,
      dimensionTaggedTasks: 3,
      redteamRuns: 1,
    })
    expect(summary.wired.pass_at_k).toBe(true) // gate_block
    expect(summary.wired.unknown_ratio).toBe(true) // rubric_revise
    expect(summary.wired.risk_veto).toBe(true) // human_review
    expect(summary.wired.dimension_coverage).toBe(true) // dataset_curate
    expect(summary.wired.redteam_evasion_rate).toBe(true)
    expect(summary.wired.six_dimensions).toBe(false) // report_only
    const human = summary.observations.find((o) => o.action === 'human_review')!
    expect(human.observed).toBe(1)
  })
})

describe('评估器三角互证审计', () => {
  it('严格口径 unknown 不计通过，保守口径给出反事实差值', () => {
    const audit = evaluatorAuditOf(fixtureSet(), fixtureRun())
    expect(audit.bySource.s1).toBe(2)
    expect(audit.unknown.total).toBe(1)
    expect(audit.unknown.s1Ratio).toBe(0.5)
    expect(audit.policy.strict.passAt1).toBe(0)
    expect(audit.policy.conservative.passAt1).toBe(1)
    expect(audit.policy.delta.passAt1).toBe(1)
    expect(audit.riskLevel).toBe('high')
    expect(audit.audit.ratio).toBe(1)
  })

  it('人工覆盖方向区分误杀与假通过', () => {
    const set = fixtureSet()
    const run = fixtureRun()
    run.attempts[0]!.verdicts[0] = { assertionId: 'a1', value: 'yes', source: 'human', previousValue: 'no', reason: '人工仲裁（机判 no → 人工 yes）' }
    run.attempts[0]!.verdicts[1] = { assertionId: 'a2', value: 'no', source: 'human', previousValue: 'yes', reason: '人工仲裁（机判 yes → 人工 no）' }
    const audit = evaluatorAuditOf(set, run)
    expect(audit.human.overrides).toBe(2)
    expect(audit.human.falseKillCandidates).toBe(1)
    expect(audit.human.falsePassCandidates).toBe(1)
    expect(audit.riskLevel).toBe('high')
  })

  it('没有人工裁决时明确立审计缺口而非零风险', () => {
    const audit = evaluatorAuditOf(fixtureSet(), fixtureRun())
    expect(audit.notes.some((n) => n.includes('暂无人工裁决'))).toBe(true)
  })
})

describe('能力维度覆盖', () => {
  it('只统计显式标注，未标注单独计数', () => {
    const set: EvalSet = {
      ...fixtureSet(),
      tasks: [
        { id: 't1', problem: 'p', expectedBehavior: 'e', dimension: 'task_completion', rubric: [{ id: 'a', text: 'a', expect: 'yes', kind: 'result' }] },
        { id: 't2', problem: 'p', expectedBehavior: 'e', dimension: 'cost_loop', rubric: [{ id: 'a', text: 'a', expect: 'yes', kind: 'result' }] },
        { id: 't3', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a', text: 'a', expect: 'yes', kind: 'result' }] },
      ],
    }
    const cov = coverageOfSets([set])
    expect(cov.total).toBe(EVAL_DIMENSIONS.length)
    expect(cov.covered).toBe(2)
    expect(cov.untaggedTasks).toBe(1)
    expect(cov.taskTotal).toBe(3)
    expect(cov.dimensions.find((d) => d.key === 'task_completion')!.taskCount).toBe(1)
    expect(cov.dimensions.find((d) => d.key === 'tool_params')!.taskCount).toBe(0)
  })

  it('非法维度在建集时被拒绝', () => {
    const result = createSet({
      name: 'bad-dim',
      track: 'e2e',
      tasks: [{
        id: 't1', problem: 'p', expectedBehavior: 'e', dimension: 'nope',
        rubric: [{ id: 'a', text: 'a', expect: 'yes', kind: 'result' }],
      }],
    } as never)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.problems.join()).toContain('dimension')
  })
})

describe('判词审计理由与人工覆盖留痕', () => {
  it('S0 判词带可追问理由', async () => {
    const task = {
      id: 't1', problem: 'p', expectedBehavior: 'e',
      rubric: [{ id: 'a1', text: 'a1', expect: 'yes' as const, kind: 'result' as const, s0: { kind: 'regex' as const, pattern: 'ok' } }],
    }
    const result = await judgeAttempt(task, { transcript: 'all ok' }, { config: loadEvalConfig() })
    expect(result.verdicts[0]!.value).toBe('yes')
    expect(result.verdicts[0]!.source).toBe('s0')
    expect(result.verdicts[0]!.reason).toContain('S0 regex 命中')
  })

  it('人工裁决保留覆盖前机判并可审计', () => {
    const created = createSet({
      name: 'human-override',
      track: 'e2e',
      tasks: [{
        id: 't1', problem: 'p', expectedBehavior: 'e', dimension: 'task_completion',
        rubric: [{ id: 'a1', text: 'a1', expect: 'yes', kind: 'result' }],
      }],
    } as never)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const set = getSet(created.set.id)!
    const run: EvalRun = {
      id: 'erun-human',
      setId: set.id,
      target: {},
      k: 2,
      status: 'done',
      createdAt: 1,
      attempts: [{
        taskId: 't1', sampleIdx: 1,
        verdicts: [{ assertionId: 'a1', value: 'unknown', source: 's1', reason: 'S1 unknown' }],
      }],
      aggregates: {} as EvalRun['aggregates'],
    }
    appendRun(run)
    const config = loadEvalConfig()
    const result = recordHumanVerdict(run.id, 't1', 1, 'a1', 'yes', (r) => aggregateRun(set, r, config))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const verdict = result.run.attempts[0]!.verdicts[0]!
    expect(verdict.source).toBe('human')
    expect(verdict.previousValue).toBe('unknown')
    expect(verdict.reason).toContain('机判 unknown')
    expect(getRun(run.id)!.attempts[0]!.verdicts[0]!.previousValue).toBe('unknown')
  })
})
