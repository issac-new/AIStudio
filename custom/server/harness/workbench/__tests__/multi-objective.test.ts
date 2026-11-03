// 多目标演化（Harmony Harness 吸收）纯函数测试：权重向量、Tchebycheff、分解代表解、
// 增益保留率、行为多样性（监测口径）。
import { describe, it, expect } from 'vitest'
import {
  behavioralDiversity,
  decomposeSearch,
  gainRetention,
  nonDominated,
  objectivePointsOf,
  tchebycheff,
  weightVectors,
  type ObjectivePoint,
} from '../multi-objective'

const pt = (id: string, quality: number, costUsd: number, safety: number | null = null): ObjectivePoint => ({
  variantId: id,
  label: id,
  quality,
  costUsd,
  safety,
})

describe('权重向量', () => {
  it('双目标：和为 1、端点覆盖；三目标：和为 1 且非负', () => {
    const two = weightVectors(5, 2)
    expect(two).toHaveLength(5)
    expect(two[0]).toEqual({ quality: 0, economy: 1, safety: 0 })
    expect(two[4].quality).toBeCloseTo(1, 4)
    for (const w of two) expect(w.quality + w.economy + w.safety).toBeCloseTo(1, 4)
    const three = weightVectors(5, 3)
    expect(three.length).toBeGreaterThanOrEqual(1)
    for (const w of three) {
      expect(w.quality + w.economy + w.safety).toBeCloseTo(1, 3)
      expect(w.safety).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('Tchebycheff 打分', () => {
  it('取各维加权差距的最大项：偏安全权重下安全差距主导', () => {
    const ideal = { quality: 1, economy: 1, safety: 1 }
    const p = { quality: 0.8, economy: 0.9, safety: 0.2 }
    const safetyHeavy = tchebycheff(p, { quality: 0.1, economy: 0.1, safety: 0.8 }, ideal)
    const qualityHeavy = tchebycheff(p, { quality: 0.8, economy: 0.1, safety: 0.1 }, ideal)
    // 安全差 0.8*0.8=0.64；质量差 0.8*0.2=0.16 → 偏安全分数更高（更差）
    expect(safetyHeavy).toBeGreaterThan(qualityHeavy)
    expect(safetyHeavy).toBeCloseTo(64, 2)
  })

  it('safety 缺席时不参与打分（退化为双目标，不把 null 当 0）', () => {
    const ideal = { quality: 1, economy: 1, safety: null }
    const s = tchebycheff({ quality: 0.5, economy: 0.5, safety: null }, { quality: 0.5, economy: 0.5, safety: 0.0 }, ideal)
    expect(s).toBeCloseTo(25, 2)
  })
})

describe('分解搜索', () => {
  it('三个候选各有擅长：不同权重子问题选出不同代表解（多样性由偏好保证）', () => {
    const points = [pt('fast', 0.8, 1), pt('cheap', 0.5, 0.1), pt('safe', 0.6, 0.5, 0.9)]
    const r = decomposeSearch(points, 3)
    expect(r.eligible).toBe(3)
    expect(r.objectives).toEqual(['quality', 'economy', 'safety'])
    const reps = new Set(r.subproblems.map((s) => s.representative?.variantId))
    expect(reps.size).toBeGreaterThanOrEqual(2)
    expect(r.frontier).toContain('fast')
  })

  it('空读数 → 不给结论（不猜）', () => {
    const r = decomposeSearch([])
    expect(r.eligible).toBe(0)
    expect(r.subproblems).toHaveLength(0)
    expect(r.note).toContain('缺证据不猜')
  })

  it('单点：所有子问题代表解都是它，前沿也是它', () => {
    const r = decomposeSearch([pt('only', 0.7, 0.3)])
    expect(r.subproblems.every((s) => s.representative?.variantId === 'only')).toBe(true)
    expect(r.frontier).toEqual(['only'])
  })

  it('支配关系：全面更差的候选不在前沿', () => {
    const points = [pt('good', 0.9, 0.2), pt('bad', 0.5, 0.9)]
    expect(nonDominated(points)).toEqual(['good'])
  })
})

describe('objectivePointsOf', () => {
  it('缺通过率/成本的候选被排除并说明原因；安全读数透传', () => {
    const { points, excluded } = objectivePointsOf({
      variants: [{ id: 'v1' }, { id: 'v2', label: '第二' }, { id: 'v3' }],
      probes: [
        { variantId: 'v1', status: 'recorded', evidence: { passAt1: 0.8, costUsd: 1, safetyRate: 0.9 } as never },
        { variantId: 'v2', status: 'recorded', evidence: { passAt1: 0.7, costUsd: null } as never },
        { variantId: 'v3', status: 'planned' },
      ],
    })
    expect(points).toHaveLength(1)
    expect(points[0].safety).toBe(0.9)
    expect(excluded.map((e) => e.variantId).sort()).toEqual(['v2', 'v3'])
  })
})

describe('增益保留率', () => {
  it('演化 +36.6pp / 留出 +20.0pp → 保留 55%（论文 SecRepoBench 口径）', () => {
    const r = gainRetention({ passAt1: 0.833, baselinePassAt1: 0.467, heldoutPassRate: 0.867, heldoutBaselinePassRate: 0.667 })
    expect(r.evolveGain).toBeCloseTo(0.366, 3)
    expect(r.heldoutGain).toBeCloseTo(0.2, 3)
    expect(r.retention).toBeCloseTo(0.5464, 3)
    expect(r.verdict).toContain('保留率')
  })

  it('增益未留住（<30%）判定为未迁移；缺留出基线不给数', () => {
    const low = gainRetention({ passAt1: 0.9, baselinePassAt1: 0.4, heldoutPassRate: 0.45, heldoutBaselinePassRate: 0.4 })
    expect(low.retention).toBeCloseTo(0.1, 3)
    expect(low.verdict).toContain('没留住')
    const unknown = gainRetention({ passAt1: 0.9, baselinePassAt1: 0.4, heldoutPassRate: 0.5, heldoutBaselinePassRate: null })
    expect(unknown.retention).toBeNull()
    expect(unknown.verdict).toContain('不猜')
  })

  it('演化集无增益时保留率无意义（不下结论）', () => {
    const r = gainRetention({ passAt1: 0.5, baselinePassAt1: 0.5, heldoutPassRate: 0.6, heldoutBaselinePassRate: 0.5 })
    expect(r.retention).toBeNull()
    expect(r.verdict).toContain('无意义')
  })
})

describe('行为多样性（监测口径）', () => {
  it('均值与最近邻距离都给出；完全相同文本最近邻为 0；均带「只能当监测」提示', () => {
    const same = behavioralDiversity(['a\nb\nc', 'a\nb\nc', 'x\ny'])
    expect(same.n).toBe(3)
    expect(same.nearestNeighborDistance).toBeCloseTo(1/3, 3) // 两个相同项互为最近邻(0)，第三项的最近邻是 1
    expect(same.note).toContain('只能当监测')
    const distinct = behavioralDiversity(['a\nb', 'c\nd', 'e\nf'])
    expect(distinct.meanDistance).toBeGreaterThan(0.9)
  })

  it('不足两条或全空 → null 不造数', () => {
    expect(behavioralDiversity(['']).meanDistance).toBeNull()
    expect(behavioralDiversity(['only']).nearestNeighborDistance).toBeNull()
  })
})
