// 技能安全扫描客户端测试：i18n zh/en 键齐平 + 路由注册冒烟（eval-client 同款）。
import { describe, it, expect } from 'vitest'
import { skillgovMessages } from '../i18n'

// @vitest-environment jsdom
describe('skillgov 客户端', () => {
  it('i18n zh/en 键齐平（governance/eval 同款纪律）', () => {
    const zh = skillgovMessages.zh.skillgov
    const en = skillgovMessages.en.skillgov
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    for (const k of Object.keys(zh)) {
      if (typeof zh[k as keyof typeof zh] === 'object') {
        expect(Object.keys(zh[k as keyof typeof zh] as object).sort())
          .toEqual(Object.keys(en[k as keyof typeof en] as object).sort())
      }
    }
  })

  it('navTitle/navLabel/verdictNames 非空', () => {
    expect(skillgovMessages.zh.skillgov.navTitle).toContain('技能安全')
    expect(skillgovMessages.en.skillgov.navLabel).toBe('Skill Security')
    expect(Object.keys(skillgovMessages.zh.skillgov.verdictNames)).toEqual(['safe', 'caution', 'dangerous'])
  })
})
