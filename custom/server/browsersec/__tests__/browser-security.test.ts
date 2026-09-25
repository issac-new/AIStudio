// 浏览器安全层守门（antigravity：deny 优先/白名单外拒/独立 profile）。
import { describe, it, expect } from 'vitest'
import { browserVerdict, profileIsolation } from '../browser-security'

const policy = { allowlist: ['good.com'], denylist: ['evil.com'], isolatedProfile: true }

describe('浏览器准入（antigravity 语义）', () => {
  it('deny 优先于 allow（同域两表命中→拒）；白名单外拒', () => {
    expect(browserVerdict('https://api.good.com/x', policy)).toMatchObject({ verdict: 'allow' })
    expect(browserVerdict('https://sub.evil.com/', policy).verdict).toBe('deny')
    expect(browserVerdict('https://evil.com/', { allowlist: ['evil.com'], denylist: ['evil.com'], isolatedProfile: false }).verdict).toBe('deny')  // deny 优先
    expect(browserVerdict('https://other.com/', policy).reason).toContain('白名单外')
    expect(browserVerdict('https://any.com/', { allowlist: [], denylist: [], isolatedProfile: false }).verdict).toBe('allow')  // 空名单放行
  })

  it('独立 profile 语义', () => {
    expect(profileIsolation(policy)).toMatchObject({ isolated: true })
    expect(profileIsolation({ ...policy, isolatedProfile: false }).isolated).toBe(false)
  })
})
