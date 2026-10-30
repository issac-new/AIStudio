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
  labelSetDimensions,
  loadEvalConfig,
  METRIC_DEFS,
  METRIC_ACTIONS,
  recordHumanVerdict,
  sealSet,
  summarizeConsumption,
  type EvalRun,
  type EvalSet,
} from '../index'
import { buildRedteamSeedTasks, dimensionForRedteamTaskId } from '../redteam-seed'
import { buildRedteamVariants } from '../redteam-variants'

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

// ---------- 能力维度标注通道（2026-10-30 run23 复盘：150 任务 unlabeled 根因） ----------

describe('能力维度标注通道（labelSetDimensions）', () => {
  it("显式 'unclassified' 算已归类：不计 untagged，也不冒充七维覆盖", () => {
    const set: EvalSet = {
      ...fixtureSet(),
      tasks: [
        { id: 'u1', problem: 'p', expectedBehavior: 'e', dimension: 'unclassified', rubric: [{ id: 'a', text: 'a', expect: 'yes', kind: 'result' }] },
        { id: 'u2', problem: 'p', expectedBehavior: 'e', dimension: 'task_completion', rubric: [{ id: 'a', text: 'a', expect: 'yes', kind: 'result' }] },
        { id: 'u3', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a', text: 'a', expect: 'yes', kind: 'result' }] },
      ],
    }
    const cov = coverageOfSets([set])
    expect(cov.untaggedTasks).toBe(1) // 只有 u3 真未标注
    expect(cov.unclassifiedTasks).toBe(1) // u1 显式归类但不在七维
    expect(cov.covered).toBe(1) // 覆盖只认七维
    expect(cov.dimensions.find((d) => d.key === 'task_completion')!.taskCount).toBe(1)
  })

  it('逐题 assignments：写入/清除/校验；变更走版本递增（不静默改资产）', () => {
    const created = createSet({
      name: '标注通道-逐题', track: 'e2e',
      tasks: [
        { id: 'd1', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a', text: 'a', expect: 'yes', kind: 'result' }] },
        { id: 'd2', problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a', text: 'a', expect: 'yes', kind: 'result' }] },
      ],
    } as never)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const before = getSet(created.set.id)!
    const r1 = labelSetDimensions(created.set.id, { assignments: { d1: 'tool_params', d2: 'unclassified' } })
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    expect(r1.result.updated).toBe(2)
    expect(r1.result.coverage.untaggedTasks).toBe(0)
    expect(r1.result.coverage.unclassifiedTasks).toBe(1)
    expect(r1.result.revision).toBe(before.revision + 1)
    expect(r1.result.contentHash).not.toBe(before.contentHash)

    // 值未变 → 不计变更、不递增版本
    const r2 = labelSetDimensions(created.set.id, { assignments: { d1: 'tool_params' } })
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(r2.result.updated).toBe(0)
    expect(r2.result.revision).toBe(r1.result.revision)

    // null = 清除标注，回到未标注
    const r3 = labelSetDimensions(created.set.id, { assignments: { d2: null } })
    expect(r3.ok).toBe(true)
    if (!r3.ok) return
    expect(r3.result.updated).toBe(1)
    expect(r3.result.coverage.untaggedTasks).toBe(1)

    // 未知 taskId / 非法维度 / 空请求 → 整单拒绝
    expect(labelSetDimensions(created.set.id, { assignments: { nope: 'tool_params' } }).ok).toBe(false)
    expect(labelSetDimensions(created.set.id, { assignments: { d1: 'bogus' as never } }).ok).toBe(false)
    expect(labelSetDimensions(created.set.id, {}).ok).toBe(false)
  })

  it("种子族批量回填（backfill='redteam-seed'）：rt-* 全部归类、七维与 unclassified 分开计", () => {
    const created = createSet({ name: '标注通道-红队', track: 'e2e', tasks: buildRedteamSeedTasks() } as never)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    // 旧种子（模拟 run23 存量：建集时未带维度）——清掉 dimension 后回填
    const set = getSet(created.set.id)!
    for (const t of set.tasks) delete t.dimension
    const cleared = labelSetDimensions(created.set.id, { assignments: Object.fromEntries(set.tasks.map((t) => [t.id, null])) })
    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(cleared.result.coverage.untaggedTasks).toBe(36)

    const filled = labelSetDimensions(created.set.id, { backfill: 'redteam-seed' })
    expect(filled.ok).toBe(true)
    if (!filled.ok) return
    expect(filled.result.updated).toBe(36)
    expect(filled.result.coverage.untaggedTasks).toBe(0)
    expect(filled.result.coverage.unclassifiedTasks).toBe(12) // cr×6 + sc×6
    expect(filled.result.coverage.dimensions.find((d) => d.key === 'privilege_injection')!.taskCount).toBe(24)
    // 显式标注优先于族默认：已标 task_completion 的不被回填覆盖
    const pinned = labelSetDimensions(created.set.id, { assignments: { 'rt-di-01': 'task_completion' } })
    expect(pinned.ok).toBe(true)
    const again = labelSetDimensions(created.set.id, { backfill: 'redteam-seed' })
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.result.updated).toBe(0)
    expect(getSet(created.set.id)!.tasks.find((t) => t.id === 'rt-di-01')!.dimension).toBe('task_completion')
  })

  it('种子与变体内建维度：变体继承父题维度（新集不再产生未标注）', () => {
    const seeds = buildRedteamSeedTasks()
    expect(seeds.every((t) => t.dimension !== undefined)).toBe(true)
    const variants = buildRedteamVariants()
    expect(variants).toHaveLength(114)
    const seedById = new Map(seeds.map((t) => [t.id, t]))
    for (const v of variants) {
      const parent = seedById.get(v.id.replace(/-v\d+$/, ''))!
      expect(v.dimension).toBe(parent.dimension)
    }
    expect(dimensionForRedteamTaskId('rt-cr-01')).toBe('unclassified')
    expect(dimensionForRedteamTaskId('rt-ii-03-v2')).toBe('privilege_injection')
    expect(dimensionForRedteamTaskId('unknown-task')).toBeUndefined()
  })

  it('密封集拒绝标注（不可改）', () => {
    const created = createSet({ name: '标注通道-密封', track: 'e2e', tasks: buildRedteamSeedTasks() } as never)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(sealSet(created.set.id, 'tester').ok).toBe(true)
    const r = labelSetDimensions(created.set.id, { backfill: 'redteam-seed' })
    expect(r.ok).toBe(false)
  })
})
