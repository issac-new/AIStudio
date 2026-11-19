// 结算建议与结算入参校验测试（spec 2026-11-19-ai-native-operating-model-design.md
// §4.2；Task 4）。裁决规则逐字来自任务简报：测量按合同版本绑定、operator
// 精确比较、四 verdict 分支；validateSettlementInput 把守 unknown 缺口字段。
import { describe, expect, it } from 'vitest'
import { suggestVerdict, validateSettlementInput } from '../settlement'
import type { OutcomeContract, OutcomeMeasurement } from '../types'

/** 三算子最小合同（Task 3 validate/state-machine 同款骨架）：gte/lte/eq 各一，
 *  target 取边界值以钉死「target 相等即 met」的精确比较。version 可变。 */
const atVersion = (version: number): OutcomeContract => ({
  schemaVersion: 1,
  outcomeId: 'oc-1',
  rootTaskId: 'task-1',
  version,
  title: '发布事故率下降',
  valueStatement: '降低发布流程引发的生产事故',
  ownerPersonId: 'p-1',
  measures: [
    {
      measureId: 'm-gte',
      name: '自动化覆盖率',
      definition: '发布流水线自动化覆盖率百分比',
      unit: '%',
      operator: 'gte',
      baseline: null,
      target: 80,
      sourceRef: 'ci://coverage',
    },
    {
      measureId: 'm-lte',
      name: '发布事故数',
      definition: '滚动 30 天内由发布直接引发的故障次数',
      unit: '次',
      operator: 'lte',
      target: 0,
      baseline: null,
      sourceRef: 'incidents://release',
    },
    {
      measureId: 'm-eq',
      name: '回滚时限达标',
      definition: '回滚是否在约定时限内完成（1=达标）',
      unit: '布尔',
      operator: 'eq',
      baseline: null,
      target: 1,
      sourceRef: 'ops://rollback',
    },
  ],
  acceptance: { statements: [], requiredEvidenceKinds: [] },
  scope: { included: ['发布流程'], excluded: [] },
  riskTier: 'medium',
  defaultReversibility: 'reversible',
  verificationOwnerId: 'p-2',
  contextPolicy: { allowedScopes: ['project'], excludedSourceKinds: [] },
  learningOptIn: false,
  status: 'observing',
  createdAt: 1,
  updatedAt: 1,
})

let seq = 0
/** 测量记录工厂：默认绑定 atVersion 的当前版本、available、observedAt 单调递增。 */
const meas = (over: Partial<OutcomeMeasurement>): OutcomeMeasurement => ({
  measurementId: `ms-${++seq}`,
  outcomeId: 'oc-1',
  measureId: 'm-gte',
  contractVersion: 2,
  actual: 100,
  availability: 'available',
  evidenceRefs: [],
  observedAt: 1000 + seq,
  recordedBy: 'p-3',
  recordedAt: 1000 + seq,
  ...over,
})

/** 三算子全 met（gte=80 恰达 target、lte=0 恰达 target、eq=1 恰达 target）。 */
const allMet = (): OutcomeMeasurement[] => [
  meas({ measureId: 'm-gte', actual: 80 }),
  meas({ measureId: 'm-lte', actual: 0 }),
  meas({ measureId: 'm-eq', actual: 1 }),
]

describe('suggestVerdict 四 verdict 分支', () => {
  it('全有值且全 met→achieved（三算子 target 相等的边界值都算 met）', () => {
    const r = suggestVerdict(atVersion(2), allMet())
    expect(r.verdict).toBe('achieved')
    expect(r.missingMeasureIds).toEqual([])
    expect(r.perMeasure).toEqual([
      { measureId: 'm-gte', met: true },
      { measureId: 'm-lte', met: true },
      { measureId: 'm-eq', met: true },
    ])
  })

  it('全有值部分 met→partial', () => {
    const r = suggestVerdict(atVersion(2), [
      meas({ measureId: 'm-gte', actual: 80 }),
      meas({ measureId: 'm-lte', actual: 2 }), // lte target=0，2>0 不 met
      meas({ measureId: 'm-eq', actual: 1 }),
    ])
    expect(r.verdict).toBe('partial')
    expect(r.perMeasure.map((p) => p.met)).toEqual([true, false, true])
  })

  it('全有值全不 met→missed', () => {
    const r = suggestVerdict(atVersion(2), [
      meas({ measureId: 'm-gte', actual: 79 }), // gte target=80，79<80 不 met
      meas({ measureId: 'm-lte', actual: 1 }),
      meas({ measureId: 'm-eq', actual: 0 }),
    ])
    expect(r.verdict).toBe('missed')
    expect(r.perMeasure.every((p) => p.met === false)).toBe(true)
  })

  it('任一 measure 缺当前版本测量→unknown＋missingMeasureIds', () => {
    const r = suggestVerdict(atVersion(2), [
      meas({ measureId: 'm-gte', actual: 80 }),
      // m-lte 缺
      meas({ measureId: 'm-eq', actual: 1 }),
    ])
    expect(r.verdict).toBe('unknown')
    expect(r.missingMeasureIds).toEqual(['m-lte'])
    // perMeasure 与合同 measures 同序同长：缺失位 met=null（其余位仍给出判定）
    expect(r.perMeasure).toEqual([
      { measureId: 'm-gte', met: true },
      { measureId: 'm-lte', met: null },
      { measureId: 'm-eq', met: true },
    ])
  })
})

describe('suggestVerdict 版本绑定与最新记录选取', () => {
  it('v2 合同只认 v2 测量：仅 v1 测量→全 missing→unknown（旧版本只作历史）', () => {
    const r = suggestVerdict(atVersion(2), [
      meas({ measureId: 'm-gte', contractVersion: 1, actual: 100 }),
      meas({ measureId: 'm-lte', contractVersion: 1, actual: 0 }),
      meas({ measureId: 'm-eq', contractVersion: 1, actual: 1 }),
    ])
    expect(r.verdict).toBe('unknown')
    expect(r.missingMeasureIds).toEqual(['m-gte', 'm-lte', 'm-eq'])
    expect(r.perMeasure.every((p) => p.met === null)).toBe(true)
  })

  it('同 measure 混版本：取当前版本记录，即使旧版本记录 observedAt 更新', () => {
    const r = suggestVerdict(atVersion(2), [
      // v1 记录更新更晚、值更好，但只作历史不参与选取
      meas({ measureId: 'm-gte', contractVersion: 1, actual: 90, observedAt: 9999 }),
      meas({ measureId: 'm-gte', contractVersion: 2, actual: 50, observedAt: 2000 }),
    ])
    expect(r.verdict).toBe('unknown') // m-lte/m-eq 仍缺当前版本测量
    expect(r.perMeasure[0]).toEqual({ measureId: 'm-gte', met: false }) // 50<80 不 met
  })

  it('同版本多条取 observedAt 最新一条', () => {
    const r = suggestVerdict(atVersion(2), [
      meas({ measureId: 'm-gte', actual: 50, observedAt: 100 }),
      meas({ measureId: 'm-gte', actual: 85, observedAt: 200 }),
      meas({ measureId: 'm-gte', actual: 60, observedAt: 150 }), // 非最新，被 200 覆盖
      ...allMet().filter((m) => m.measureId !== 'm-gte'),
    ])
    expect(r.verdict).toBe('achieved') // 200 那条 85≥80 → met
    expect(r.perMeasure[0]).toEqual({ measureId: 'm-gte', met: true })
  })

  it('observedAt 平局取数组中后到的记录（后写覆盖前写）', () => {
    const r = suggestVerdict(atVersion(2), [
      meas({ measureId: 'm-gte', actual: 85, observedAt: 500 }),
      meas({ measureId: 'm-gte', actual: 40, observedAt: 500 }), // 平局，后到胜
      ...allMet().filter((m) => m.measureId !== 'm-gte'),
    ])
    expect(r.perMeasure[0]).toEqual({ measureId: 'm-gte', met: false }) // 40<80
    expect(r.verdict).toBe('partial')
  })

  it('最新一条 availability 非 available→met:null→unknown（即使更早一条可用）', () => {
    for (const availability of ['pending', 'unavailable'] as const) {
      const r = suggestVerdict(atVersion(2), [
        meas({ measureId: 'm-gte', actual: 85, observedAt: 100 }),
        meas({ measureId: 'm-gte', actual: null, availability, observedAt: 200 }),
        ...allMet().filter((m) => m.measureId !== 'm-gte'),
      ])
      expect(r.verdict, availability).toBe('unknown')
      expect(r.perMeasure[0], availability).toEqual({ measureId: 'm-gte', met: null })
      // 不算 missing：测量存在、值不可用是证据缺口而非缺测量
      expect(r.missingMeasureIds, availability).toEqual([])
    }
  })

  it('actual=null→met:null→unknown', () => {
    const r = suggestVerdict(atVersion(2), [
      meas({ measureId: 'm-gte', actual: null }),
      ...allMet().filter((m) => m.measureId !== 'm-gte'),
    ])
    expect(r.verdict).toBe('unknown')
    expect(r.perMeasure[0]).toEqual({ measureId: 'm-gte', met: null })
    expect(r.missingMeasureIds).toEqual([])
  })

  it('跨 outcome 的测量不绑定（outcomeId 不符视同无记录，fail-closed）', () => {
    const r = suggestVerdict(atVersion(2), [
      meas({ measureId: 'm-gte', outcomeId: 'oc-other', actual: 85 }),
      ...allMet().filter((m) => m.measureId !== 'm-gte'),
    ])
    expect(r.verdict).toBe('unknown')
    expect(r.missingMeasureIds).toEqual(['m-gte'])
  })

  it('零度量合同（仅定性验收）→unknown：无量化依据不机器判绿', () => {
    const r = suggestVerdict({ ...atVersion(2), measures: [] }, allMet())
    expect(r.verdict).toBe('unknown')
    expect(r.perMeasure).toEqual([])
    expect(r.missingMeasureIds).toEqual([])
  })

  it('纯函数：入参数组不被就地修改', () => {
    const contract = atVersion(2)
    const measurements = allMet()
    const snapshot = JSON.stringify(measurements)
    suggestVerdict(contract, measurements)
    expect(JSON.stringify(measurements)).toBe(snapshot)
    expect(contract.version).toBe(2)
  })
})

describe('suggestVerdict gte/lte/eq 精确比较（target 相等边界）', () => {
  const cases: ReadonlyArray<readonly [string, number, boolean]> = [
    ['m-gte', 80, true], // gte：actual===target → met
    ['m-gte', 79.999, false], // gte：低于 target 一丝也不放
    ['m-lte', 0, true], // lte：actual===target → met
    ['m-lte', 0.001, false],
    ['m-eq', 1, true], // eq：精确相等
    ['m-eq', 1.0001, false],
  ]
  for (const [measureId, actual, wantMet] of cases) {
    it(`${measureId} actual=${actual} → met=${wantMet}`, () => {
      const r = suggestVerdict(atVersion(2), [
        meas({ measureId, actual }),
        ...allMet().filter((m) => m.measureId !== measureId),
      ])
      expect(r.perMeasure.find((p) => p.measureId === measureId)?.met).toBe(wantMet)
    })
  }
})

describe('validateSettlementInput', () => {
  const contract = atVersion(2)
  const measurements: OutcomeMeasurement[] = [
    ...allMet(),
    // 一条 v1 历史测量：id 合法存在于账上但不属当前版本，不得被结算引用
    meas({ measureId: 'm-gte', contractVersion: 1, measurementId: 'ms-v1-old', observedAt: 1 }),
  ]
  const currentIds = measurements
    .filter((m) => m.contractVersion === 2)
    .map((m) => m.measurementId)
  const base = {
    verdict: 'achieved' as const,
    rationale: '三个度量全部达标，证据链完整、可逐条复核，同意收口。', // 26 字 ≥ 20
    measurementIds: currentIds,
  }

  it('合法 achieved 输入：problems 为空', () => {
    expect(validateSettlementInput(base, contract, measurements)).toEqual({ problems: [] })
  })

  it('verdict=unknown 带 gapNote 与合法 nextReviewAt 通过', () => {
    const r = validateSettlementInput(
      {
        ...base,
        verdict: 'unknown',
        gapNote: 'm-gte 数据源断采，须补一季度观测',
        nextReviewAt: Date.now() + 86_400_000,
      },
      contract,
      measurements,
    )
    expect(r.problems).toEqual([])
  })

  it('verdict=unknown 缺 gapNote／gapNote 空白拒', () => {
    for (const gapNote of [undefined, '', '   ']) {
      const r = validateSettlementInput(
        { ...base, verdict: 'unknown', gapNote, nextReviewAt: 1000 },
        contract,
        measurements,
      )
      expect(r.problems.join(), `gapNote=${JSON.stringify(gapNote)}`).toContain('gapNote')
    }
  })

  it('verdict=unknown 缺／非法 nextReviewAt 拒（非数值、0、NaN、Infinity 均拒）', () => {
    for (const nextReviewAt of [undefined, 'tomorrow', 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = validateSettlementInput(
        { ...base, verdict: 'unknown', gapNote: '数据缺口说明', nextReviewAt },
        contract,
        measurements,
      )
      expect(r.problems.join(), `nextReviewAt=${String(nextReviewAt)}`).toContain('nextReviewAt')
    }
  })

  it('非 unknown verdict 不强制 gapNote/nextReviewAt（字段缺省不产生 problem）', () => {
    const r = validateSettlementInput(base, contract, measurements)
    expect(r.problems).toEqual([])
  })

  it('rationale trim 后 19 字拒、20 字过（中英混排按字符计）', () => {
    const nineteen = '一二三四五六七八九十一二三四五六七八九' // 19 字
    const twenty = `${nineteen}十` // 20 字
    const short = validateSettlementInput(
      { ...base, rationale: nineteen },
      contract,
      measurements,
    )
    expect(short.problems.join()).toContain('rationale')
    const ok = validateSettlementInput({ ...base, rationale: twenty }, contract, measurements)
    expect(ok.problems).toEqual([])
  })

  it('rationale 前后空白不计数：39 字＋两侧空白仍不足 20 的裸串拒', () => {
    const short = validateSettlementInput(
      { ...base, rationale: '   一二三四五六七八九   ' }, // trim 后 9 字
      contract,
      measurements,
    )
    expect(short.problems.join()).toContain('rationale')
  })

  it('measurementIds 超出当前版本测量 id 集→problem（含 v1 历史 id 与伪造 id）', () => {
    const r = validateSettlementInput(
      { ...base, measurementIds: [...currentIds, 'ms-v1-old', 'ms-forged'] },
      contract,
      measurements,
    )
    expect(r.problems.length).toBe(1)
    expect(r.problems[0]).toContain('ms-v1-old')
    expect(r.problems[0]).toContain('ms-forged')
  })

  it('measurementIds 为空数组合法（纯定性结算无量化引用）', () => {
    const r = validateSettlementInput({ ...base, measurementIds: [] }, contract, measurements)
    expect(r.problems).toEqual([])
  })

  it('measurementIds 非字符串数组拒', () => {
    for (const bad of ['ms-1', 42, { 0: 'ms-1' }]) {
      const r = validateSettlementInput(
        { ...base, measurementIds: bad },
        contract,
        measurements,
      )
      expect(r.problems.join(), String(bad)).toContain('measurementIds')
    }
  })

  it('verdict 非法枚举拒', () => {
    const r = validateSettlementInput(
      { ...base, verdict: 'done' },
      contract,
      measurements,
    )
    expect(r.problems.join()).toContain('verdict')
  })

  it('输入非对象拒（防御输入，不抛异常）', () => {
    for (const bad of [null, undefined, 'x', 42]) {
      const r = validateSettlementInput(bad, contract, measurements)
      expect(r.problems.length).toBeGreaterThan(0)
    }
  })
})
