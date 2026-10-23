// 任务五档路由器守门（2026-10-23 挂账清偿 G2）。
// 锚：HarnessPro profile_rubric.md 门序 compact→research→deep→lean→standard。
import { describe, it, expect } from 'vitest'
import { PROFILE_PRESETS, presetsValid, routeTaskProfile, type TaskFacts } from '../task-router'
import { stageAt } from '../stage-ladder'

function facts(over: Partial<TaskFacts> = {}): TaskFacts {
  return {
    boundedDeterministic: false,
    uncertaintyCount: 3,
    directLocalCheck: false,
    evidenceResolvableHypotheses: 3,
    strongLocalOracle: 'none',
    multiSourceReconstruction: false,
    inaccessibleDecisiveSources: false,
    visualHiddenState: false,
    costlyEvaluations: false,
    ...over,
  }
}

describe('预设合法性', () => {
  it('五档全过 thresholdsValid；compact 最省、deep/research 高推理', () => {
    expect(presetsValid()).toBe(true)
    expect(PROFILE_PRESETS.compact.reasoningEffort).toBe('low')
    expect(PROFILE_PRESETS.deep.reasoningEffort).toBe('high')
    expect(PROFILE_PRESETS.research.reasoningEffort).toBe('high')
    expect(PROFILE_PRESETS.compact.ladder.finalizeAfter).toBeLessThan(PROFILE_PRESETS.deep.ladder.finalizeAfter + 0.06)
  })

  it('阶梯可被 stageAt 消费（档位→阶段判定连通）', () => {
    const { policy } = routeTaskProfile(facts())
    expect(stageAt(90, 100, policy.ladder)).toBe('strict')
    expect(stageAt(5, 100, policy.ladder)).toBe('normal')
  })
})

describe('门序命中（先中先用）', () => {
  it('Gate1 compact：视觉/隐藏态长交互', () => {
    const d = routeTaskProfile(facts({ visualHiddenState: true, multiSourceReconstruction: true }))
    expect(d.profile).toBe('compact') // compact 门先于 research
    expect(d.rationale).toContain('Gate1')
  })

  it('Gate1 compact：决定性源不可达（research 反例）', () => {
    const d = routeTaskProfile(facts({ multiSourceReconstruction: true, inaccessibleDecisiveSources: true }))
    expect(d.profile).toBe('compact')
  })

  it('Gate2 research：多源事实重建且源可达', () => {
    const d = routeTaskProfile(facts({ multiSourceReconstruction: true }))
    expect(d.profile).toBe('research')
    expect(d.rationale).toContain('Gate2')
  })

  it('Gate3 deep：强 oracle + 假设 ≥2 + 评估代价不吞迭代空间', () => {
    const d = routeTaskProfile(facts({ strongLocalOracle: 'explicit', evidenceResolvableHypotheses: 3 }))
    expect(d.profile).toBe('deep')
  })

  it('Gate3 降档：costlyEvaluations → standard（评估太贵，deep 回不了本）', () => {
    const d = routeTaskProfile(facts({ strongLocalOracle: 'explicit', evidenceResolvableHypotheses: 3, costlyEvaluations: true }))
    expect(d.profile).toBe('standard')
  })

  it('Gate4 lean：有界 + 不确定 ≤2 + 直接本地校验 + 假设 ≤2', () => {
    const d = routeTaskProfile(facts({
      boundedDeterministic: true, uncertaintyCount: 2, directLocalCheck: true, evidenceResolvableHypotheses: 2,
    }))
    expect(d.profile).toBe('lean')
    // 差一个条件（不确定项 3）→ 不中 lean
    const near = routeTaskProfile(facts({
      boundedDeterministic: true, uncertaintyCount: 3, directLocalCheck: true, evidenceResolvableHypotheses: 2,
    }))
    expect(near.profile).toBe('standard')
  })

  it('Gate5 standard 兜底；oracle 未知带注记（未知≠弱）', () => {
    const d = routeTaskProfile(facts())
    expect(d.profile).toBe('standard')
    expect(d.note).toContain('未知≠弱')
  })
})
