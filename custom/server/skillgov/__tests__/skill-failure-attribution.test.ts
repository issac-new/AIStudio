// 技能失败三分归因（2026-11-20 综述吸收轮 C）：五态判定全分支＋修复目标映射＋fail-soft。
import { describe, expect, it } from 'vitest'
import { attributeSkillFailure } from '../skill-failure-attribution'

describe('attributeSkillFailure 三分归因', () => {
  it('候选集为空→supply_gap：走供给阶梯，不混入三分', () => {
    const v = attributeSkillFailure({ skillInvoked: null, skillsAvailable: 0 })
    expect(v.kind).toBe('supply_gap')
    expect(v.fixTarget).toBe('skill_supply')
    expect(v.confidence).toBe('derived')
  })

  it('未选中但候选集有货→selection_miss：改路由不动技能本体', () => {
    const v = attributeSkillFailure({ skillInvoked: null, skillsAvailable: 4 })
    expect(v.kind).toBe('selection_miss')
    expect(v.fixTarget).toBe('route')
  })

  it('选对但完成步数<声明步数→execution_miss：Harness 完成检查', () => {
    const v = attributeSkillFailure({ skillInvoked: 'pm-planning', stepsDeclared: 8, stepsCompleted: 5 })
    expect(v.kind).toBe('execution_miss')
    expect(v.fixTarget).toBe('harness_completion_check')
    expect(v.rationale).toContain('Harness')
  })

  it('全部步骤执行完仍失败→skill_defect：修 Skill 本体', () => {
    const v = attributeSkillFailure({ skillInvoked: 'pm-planning', stepsDeclared: 8, stepsCompleted: 8 })
    expect(v.kind).toBe('skill_defect')
    expect(v.fixTarget).toBe('skill_body')
  })

  it('步骤不可观测＋签名词面→inferred 补位（跳步/缺步两向）', () => {
    expect(attributeSkillFailure({ skillInvoked: 'x', failureSignature: 'skipped-step: 验证未跑' }).kind).toBe('execution_miss')
    expect(attributeSkillFailure({ skillInvoked: 'x', failureSignature: 'missing-step: 缺少预检步' }).kind).toBe('skill_defect')
    expect(attributeSkillFailure({ skillInvoked: 'x', failureSignature: 'skipped-step' }).confidence).toBe('inferred')
  })

  it('信号不足→unknown fail-soft 不猜（不产出修复目标）', () => {
    const v = attributeSkillFailure({ skillInvoked: 'x' })
    expect(v.kind).toBe('unknown')
    expect(v.fixTarget).toBe('none')
    expect(v.rationale).toContain('观测')
  })

  it('空输入→unknown（绝不崩溃、不默认成任何一分）', () => {
    expect(attributeSkillFailure({}).kind).toBe('unknown')
  })

  it('每条判定带论文锚（Figure 8 三分映射可追溯）', () => {
    for (const sig of [
      { skillInvoked: null, skillsAvailable: 0 },
      { skillInvoked: null, skillsAvailable: 2 },
      { skillInvoked: 'x', stepsDeclared: 3, stepsCompleted: 1 },
      { skillInvoked: 'x', stepsDeclared: 3, stepsCompleted: 3 },
      {},
    ]) {
      expect(attributeSkillFailure(sig).paperAnchor).toContain('Figure 8')
    }
  })
})
