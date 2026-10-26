import { describe, expect, it } from 'vitest'
// @ts-expect-error - mjs 无独立类型声明，测试只消费导出函数
import { applySkillDirRegistration } from '../runtime/register-runtime.mjs'

describe('runtime external_dirs 注册（pua + 本仓技能）', () => {
  it('空配置可注册单个技能目录', () => {
    const reg = applySkillDirRegistration(null, '/repo/runtime/pua/skills')
    expect(reg.changed).toBe(true)
    expect(reg.nextText).toContain('/repo/runtime/pua/skills')
  })

  it('第二个目录追加时保留第一个目录', () => {
    const first = applySkillDirRegistration(null, '/repo/runtime/pua/skills')
    const second = applySkillDirRegistration(first.nextText, '/repo/runtime/hermes-skills')
    expect(second.changed).toBe(true)
    expect(second.nextText).toContain('/repo/runtime/pua/skills')
    expect(second.nextText).toContain('/repo/runtime/hermes-skills')
  })

  it('已注册目录幂等跳过', () => {
    const first = applySkillDirRegistration(null, '/repo/runtime/hermes-skills')
    const again = applySkillDirRegistration(first.nextText, '/repo/runtime/hermes-skills')
    expect(again.changed).toBe(false)
    expect(again.alreadyRegistered).toBe(true)
  })

  it('skills 不是映射时拒绝改写', () => {
    expect(() => applySkillDirRegistration('skills: 1\n', '/repo/runtime/hermes-skills')).toThrow(/不是映射/)
  })
})
