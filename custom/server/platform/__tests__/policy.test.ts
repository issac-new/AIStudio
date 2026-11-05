import type { Context } from 'koa'
import { describe, expect, it, vi } from 'vitest'
import type { PlatformPrincipal } from '../../../platform/contracts/identity'
import {
  canAccessProfile,
  evaluateIdentityBinding,
  normalizeIssuerOrigin,
  requirePlatformSuperAdmin,
} from '../authz/policy'

function contextWith(user?: PlatformPrincipal): Context {
  return { state: user ? { user } : {} } as unknown as Context
}

describe('平台身份绑定', () => {
  it('拒绝同 MXID 的跨 origin 认领', () => {
    expect(evaluateIdentityBinding(
      { issuerOrigin: 'https://old.example', subject: '@alice:example' },
      { issuerOrigin: 'https://evil.example', subject: '@alice:example' },
    )).toEqual({ allowed: false, code: 'MATRIX_IDENTITY_CONFLICT' })
  })

  it('只在 subject 与规范化 origin 同时匹配时允许绑定', () => {
    expect(evaluateIdentityBinding(
      { issuerOrigin: 'https://Example.COM:443/idp', subject: '@alice:example' },
      { issuerOrigin: 'https://example.com', subject: '@alice:example' },
    )).toEqual({ allowed: true })
  })

  it('subject 不匹配时返回身份不存在', () => {
    expect(evaluateIdentityBinding(
      { issuerOrigin: 'https://old.example', subject: '@alice:example' },
      { issuerOrigin: 'https://old.example', subject: '@bob:example' },
    )).toEqual({ allowed: false, code: 'MATRIX_IDENTITY_NOT_FOUND' })
  })

  it('旧身份未绑定 origin 时拒绝自动认领', () => {
    expect(evaluateIdentityBinding(
      { issuerOrigin: null, subject: '@alice:example' },
      { issuerOrigin: 'https://old.example', subject: '@alice:example' },
    )).toEqual({ allowed: false, code: 'MATRIX_IDENTITY_ORIGIN_UNBOUND' })
  })

  it('issuer 规范化为 origin，忽略路径与默认端口', () => {
    expect(normalizeIssuerOrigin('http://Example.COM:80/idp')).toBe('http://example.com')
  })

  it.each([
    ['file:///tmp/idp', 'unsupported issuer protocol'],
    ['https://user:secret@example.com', 'issuer must be an origin'],
    ['https://example.com/idp?tenant=a', 'issuer must be an origin'],
    ['https://example.com/idp#fragment', 'issuer must be an origin'],
  ])('拒绝非法 issuer %s', (raw, message) => {
    expect(() => normalizeIssuerOrigin(raw)).toThrow(message)
  })
})

describe('profile 授权', () => {
  it('无身份没有任何 profile 权限', () => {
    expect(canAccessProfile(undefined, 'default')).toBe(false)
  })

  it('super_admin 不依赖 profile 绑定', () => {
    expect(canAccessProfile({ id: 1, role: 'super_admin' }, 'default')).toBe(true)
  })

  it('active 普通账号只能访问已绑定 profile', () => {
    const user: PlatformPrincipal = {
      id: 1,
      role: 'admin',
      status: 'active',
      profiles: ['alice'],
    }
    expect(canAccessProfile(user, 'alice')).toBe(true)
    expect(canAccessProfile(user, 'bob')).toBe(false)
  })

  it('空授权普通账号没有任何 profile 权限', () => {
    expect(canAccessProfile({ id: 1, role: 'admin', profiles: [] }, 'default')).toBe(false)
  })

  it('disabled 或缺授权面的普通账号不得访问已绑定 profile', () => {
    expect(canAccessProfile(
      { id: 1, role: 'admin', status: 'disabled', profiles: ['alice'] },
      'alice',
    )).toBe(false)
    expect(canAccessProfile({ id: 1, role: 'admin', status: 'active' }, 'alice')).toBe(false)
  })
})

describe('requirePlatformSuperAdmin', () => {
  it('无主体返回 401 且不进入后续中间件', async () => {
    const ctx = contextWith()
    const next = vi.fn(async () => {})

    await requirePlatformSuperAdmin(ctx, next)

    expect(ctx.status).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('普通 admin 返回 403 且不进入后续中间件', async () => {
    const ctx = contextWith({ id: 1, role: 'admin', status: 'active' })
    const next = vi.fn(async () => {})

    await requirePlatformSuperAdmin(ctx, next)

    expect(ctx.status).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('super_admin 通过且只调用一次后续中间件', async () => {
    const ctx = contextWith({ id: 1, role: 'super_admin' })
    const next = vi.fn(async () => {})

    await requirePlatformSuperAdmin(ctx, next)

    expect(next).toHaveBeenCalledTimes(1)
  })
})
