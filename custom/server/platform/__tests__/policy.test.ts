import type { Context } from 'koa'
import { describe, expect, it, vi } from 'vitest'
import type { PlatformPrincipal } from '../../../platform/contracts/identity'
import {
  canAccessProfile,
  evaluateIdentityBinding,
  normalizeIssuerOrigin,
  requirePlatformSuperAdmin,
} from '../authz/policy'
import { requireProfileParameterAccess } from '../authz/middleware'

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

describe('requireProfileParameterAccess', () => {
  function profileContext(user: PlatformPrincipal | undefined, name?: string): Context {
    const ctx = contextWith(user)
    ;(ctx as Context & { params: Record<string, string> }).params = name === undefined ? {} : { name }
    return ctx
  }

  it('无身份 401，空授权与跨 profile 均为 403', async () => {
    const anonymous = profileContext(undefined, 'alice')
    const anonymousNext = vi.fn(async () => {})
    await requireProfileParameterAccess('name')(anonymous, anonymousNext)
    expect(anonymous.status).toBe(401)
    expect(anonymousNext).not.toHaveBeenCalled()

    for (const user of [
      { id: 1, role: 'admin', status: 'active', profiles: [] },
      { id: 1, role: 'admin', status: 'active', profiles: ['alice'] },
    ] as const) {
      const ctx = profileContext(user, user.profiles.length === 0 ? 'alice' : 'bob')
      const next = vi.fn(async () => {})
      await requireProfileParameterAccess('name')(ctx, next)
      expect(ctx.status).toBe(403)
      expect(next).not.toHaveBeenCalled()
    }
  })

  it('缺失 profile 参数不得被解释成不限制', async () => {
    const ctx = profileContext({ id: 1, role: 'admin', status: 'active', profiles: ['alice'] })
    const next = vi.fn(async () => {})
    await requireProfileParameterAccess('name')(ctx, next)
    expect(ctx.status).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('active 本人的 name 参数与 super_admin 均可进入后续中间件', async () => {
    const own = profileContext({ id: 1, role: 'admin', status: 'active', profiles: ['alice'] }, 'alice')
    const ownNext = vi.fn(async () => {})
    await requireProfileParameterAccess('name')(own, ownNext)
    expect(ownNext).toHaveBeenCalledTimes(1)

    const superAdmin = profileContext({ id: 2, role: 'super_admin' }, 'bob')
    const superNext = vi.fn(async () => {})
    await requireProfileParameterAccess('name')(superAdmin, superNext)
    expect(superNext).toHaveBeenCalledTimes(1)
  })

  // N29-17（run29 G4 实证）：toAuthenticatedUser 构造的 JWT principal 无 status 无 profiles
  // （username 在）——N28-3 只回填 profiles 时 canAccessProfile 的 status 条件恒假仍 403。
  it('JWT principal 缺 status 缺 profiles 时同名 profile 放行（status 缺场=在役）', async () => {
    const ctx = profileContext({ id: 3, username: 'fanfan', role: 'admin' }, 'fanfan')
    const next = vi.fn(async () => {})
    await requireProfileParameterAccess('name')(ctx, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(ctx.status).not.toBe(403)
  })

  it('显式 disabled 的 principal 不得被回填洗白', async () => {
    const ctx = profileContext({ id: 4, username: 'bob', role: 'admin', status: 'disabled' }, 'bob')
    const next = vi.fn(async () => {})
    await requireProfileParameterAccess('name')(ctx, next)
    expect(ctx.status).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  // N29-19：路径逃逸 profile 先于授权判 400（403 会伪装成授权问题，控制器 400 判被前置拦截不可达）
  it('profile 参数路径逃逸 → 400 invalid_profile（先于授权）', async () => {
    const ctx = profileContext({ id: 5, username: 'alice', role: 'admin', status: 'active', profiles: ['alice'] }, '..%2f..%2fetc')
    const next = vi.fn(async () => {})
    await requireProfileParameterAccess('name')(ctx, next)
    expect(ctx.status).toBe(400)
    expect(next).not.toHaveBeenCalled()
  })
})
