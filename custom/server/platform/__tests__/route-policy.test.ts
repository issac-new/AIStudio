import Router from '@koa/router'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Context, Next } from 'koa'
import { describe, expect, it, vi } from 'vitest'
import type { PlatformPrincipal } from '../../../platform/contracts/identity'
import { healthRoutes } from '../../../../vendor/hermes-studio/packages/server/src/modules/studio/routes/health'
import { authPublicRoutes } from '../../../../vendor/hermes-studio/packages/server/src/modules/studio/routes/auth'
import { approvalsRoutes } from '../../approval-inbox/pending-controller'
import { autonomyLadderRoutes } from '../../autonomyladder/autonomy-ladder-controller'
import { sessionModeRoutes } from '../../permmodes/session-mode-controller'
import { userenvRoutes } from '../../userenv/controller'
import {
  assertPlatformRoutePolicies,
  enforcePlatformRoutePolicy,
  type PlatformRoutePolicy,
} from '../authz/route-guard'
import { platformRoutePolicies } from '../../../../registries/server/platform-route-policy'

const managedRouters = [
  healthRoutes,
  authPublicRoutes,
  userenvRoutes,
  autonomyLadderRoutes,
  sessionModeRoutes,
  approvalsRoutes,
]

function routeKeys(routers: Router[]): string[] {
  return routers.flatMap((router) => router.stack).flatMap((layer) => {
    if (typeof layer.path !== 'string') return []
    return layer.methods
      .filter((method) => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
      .map((method) => `${method} ${layer.path}`)
  }).sort()
}

function policyKeys(policies: PlatformRoutePolicy[]): string[] {
  return policies.map((policy) => `${policy.method} ${policy.pathPattern}`).sort()
}

function contextFor(
  method: string,
  path: string,
  user?: PlatformPrincipal,
): Context {
  return {
    method,
    path,
    state: user ? { user } : {},
  } as unknown as Context
}

async function runGuard(
  routers: Router[],
  policies: PlatformRoutePolicy[],
  ctx: Context,
): Promise<Next> {
  const next = vi.fn(async () => {})
  await enforcePlatformRoutePolicy(routers, policies)(ctx, next)
  return next
}

describe('平台路由政策真实覆盖', () => {
  it('注册表与实际 Router stack 双向一致，公开和写端点均显式登记', () => {
    expect(policyKeys(platformRoutePolicies)).toEqual(routeKeys(managedRouters))
    expect(() => assertPlatformRoutePolicies(managedRouters, platformRoutePolicies)).not.toThrow()
  })

  it('生产 registerRoutes 启动对账，并在公开链与认证后分别执行请求政策', () => {
    const source = readFileSync(resolve(
      __dirname,
      '../../../../vendor/hermes-studio/packages/server/src/bootstrap/routes.ts',
    ), 'utf8')
    // 启动对账=两组并集一次完成（政策注册表是全量）；负例锚定旧形态——
    // 分组各传全量政策时，悬垂检查会把对方组的政策全部判悬垂、真实启动必抛（审查 Critical 1）。
    expect(source).toContain('assertPlatformRoutePolicies([...platformPublicRouters, ...platformProtectedRouters], platformRoutePolicies)')
    expect(source).not.toContain('assertPlatformRoutePolicies(platformPublicRouters, platformRoutePolicies)')
    expect(source).not.toContain('assertPlatformRoutePolicies(platformProtectedRouters, platformRoutePolicies)')
    const publicGuard = source.indexOf('app.use(enforcePlatformRoutePolicy(platformPublicRouters, platformRoutePolicies))')
    const auth = source.indexOf('authMiddleware.forEach((middleware) => app.use(middleware))')
    const protectedGuard = source.indexOf('app.use(enforcePlatformRoutePolicy(platformProtectedRouters, platformRoutePolicies))')
    expect(publicGuard).toBeGreaterThan(-1)
    expect(auth).toBeGreaterThan(publicGuard)
    expect(protectedGuard).toBeGreaterThan(auth)
  })

  it('生产调用形态真执行：两组并集对账一次不抛，双链 enforce 均可执行（Critical 1 回归，探针取反版）', async () => {
    // 复刻 753 注入后的生产调用形态：分组与 registry 与 bootstrap/routes.ts 完全一致
    const platformPublicRouters = [healthRoutes, authPublicRoutes]
    const platformProtectedRouters = [userenvRoutes, autonomyLadderRoutes, sessionModeRoutes, approvalsRoutes]
    expect(() => assertPlatformRoutePolicies([...platformPublicRouters, ...platformProtectedRouters], platformRoutePolicies))
      .not.toThrow()
    // 双链 enforce 同形态可执行：公开链健康检查直过；受保护链 profile 读走归属判定
    const pubNext = await runGuard(platformPublicRouters, platformRoutePolicies, contextFor('GET', '/health'))
    expect(pubNext).toHaveBeenCalledTimes(1)
    const admin = { id: 1, role: 'admin', status: 'active', profiles: ['alice'] } as const
    const ownNext = await runGuard(platformProtectedRouters, platformRoutePolicies, contextFor('GET', '/api/userenv/profiles/alice/env', admin))
    expect(ownNext).toHaveBeenCalledTimes(1)
  })

  it('实际写路由缺登记时启动失败并指出方法与路径', () => {
    const missingPut = platformRoutePolicies.filter((policy) => !(
      policy.method === 'PUT' && policy.pathPattern === '/api/userenv/profiles/:name/env'
    ))
    expect(() => assertPlatformRoutePolicies(managedRouters, missingPut))
      .toThrow('Unregistered write routes: PUT /api/userenv/profiles/:name/env')
  })

  it('新增写路由即使路径相似也不能复用旧政策', () => {
    const router = new Router({ prefix: '/api/userenv' })
    router.put('/profiles/:name/env', async () => {})
    router.post('/profiles/:name/rotate', async () => {})
    const policies = platformRoutePolicies.filter((policy) =>
      policy.method === 'PUT' && policy.pathPattern === '/api/userenv/profiles/:name/env')
    expect(() => assertPlatformRoutePolicies([router], policies))
      .toThrow('POST /api/userenv/profiles/:name/rotate')
  })

  // Task3① 负例：RegExp 写面在 stack 里曾因字符串过滤被静默吞掉（对账不可见）。
  it('RegExp 写路由无法与政策对账 → 启动直接失败，不再静默过滤', () => {
    const router = new Router()
    router.post(/\/api\/userenv\/profiles\/.+\/rotate/, async () => {})
    expect(() => assertPlatformRoutePolicies([router], [])).toThrow(/RegExp/)
  })

  it('RegExp 读路由不阻断启动（读面无强制登记，写面才是对账对象）', () => {
    const router = new Router()
    router.get(/\/api\/userenv\/profiles\/.+\/env/, async () => {})
    expect(() => assertPlatformRoutePolicies([router], [])).not.toThrow()
  })

  // Task3② 负例：启动对账补「多余政策」方向——注册表条目指向不存在路由也要阻断。
  it('政策指向不存在的路由 → 启动失败（双向对账，注册表不得悬垂）', () => {
    const ghost: PlatformRoutePolicy = {
      method: 'PUT',
      pathPattern: '/api/userenv/profiles/:name/ghost',
      access: 'profile',
      profileParam: 'name',
    }
    expect(() => assertPlatformRoutePolicies(managedRouters, [...platformRoutePolicies, ghost]))
      .toThrow(/ghost/)
  })

  it('政策方法与路由方法不一致也算悬垂（同路径不同 method 不算匹配）', () => {
    const router = new Router({ prefix: '/api/userenv' })
    router.put('/profiles/:name/env', async () => {})
    const wrongMethod: PlatformRoutePolicy = {
      method: 'POST',
      pathPattern: '/api/userenv/profiles/:name/env',
      access: 'profile',
      profileParam: 'name',
    }
    expect(() => assertPlatformRoutePolicies([router], [wrongMethod])).toThrow(/POST \/api\/userenv/)
  })

  it.each(['/**', '/api/userenv/**', '/api/userenv/(.*)'])('拒绝通配政策 %s', (pathPattern) => {
    const wildcard: PlatformRoutePolicy = {
      method: 'PUT',
      pathPattern,
      access: 'authenticated',
    }
    expect(() => assertPlatformRoutePolicies([userenvRoutes], [wildcard]))
      .toThrow('wildcard')
  })

  it('公开 Matrix/password 登录、健康检查和认证状态逐条标为 public', () => {
    const paths = [
      'POST /api/auth/login',
      'POST /api/auth/matrix-login',
      'GET /api/auth/status',
      'GET /livez',
      'GET /health',
    ]
    for (const key of paths) {
      const [method, ...path] = key.split(' ')
      expect(platformRoutePolicies).toContainEqual(expect.objectContaining({
        method,
        pathPattern: path.join(' '),
        access: 'public',
      }))
    }
  })

  it('userenv 两种方法都绑定 name，permmode 读绑定 profileId', () => {
    expect(platformRoutePolicies).toContainEqual({
      method: 'GET', pathPattern: '/api/userenv/profiles/:name/env', access: 'profile', profileParam: 'name',
    })
    expect(platformRoutePolicies).toContainEqual({
      method: 'PUT', pathPattern: '/api/userenv/profiles/:name/env', access: 'profile', profileParam: 'name',
    })
    expect(platformRoutePolicies).toContainEqual({
      method: 'GET', pathPattern: '/api/hermes/permmodes/session-mode/:profileId', access: 'profile', profileParam: 'profileId',
    })
  })

  it('自治写面、permmode 写面和整个审批收件箱均为 super-admin', () => {
    const writes = platformRoutePolicies.filter((policy) =>
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(policy.method)
      && (policy.pathPattern.startsWith('/api/hermes/autonomy-ladder')
        || policy.pathPattern.startsWith('/api/hermes/permmodes/session-mode')))
    expect(writes.length).toBe(4)
    expect(writes.every((policy) => policy.access === 'super-admin')).toBe(true)
    const approvals = platformRoutePolicies.filter((policy) => policy.pathPattern.startsWith('/api/approvals'))
    expect(approvals.length).toBeGreaterThan(0)
    expect(approvals.every((policy) => policy.access === 'super-admin')).toBe(true)
  })
})

describe('请求期平台路由政策', () => {
  it('显式公开健康检查不要求身份', async () => {
    const next = await runGuard([healthRoutes], platformRoutePolicies, contextFor('GET', '/health'))
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('已登记 authenticated 读路由无身份 401，普通 admin 可继续', async () => {
    const unauthenticated = contextFor('GET', '/api/hermes/autonomy-ladder/')
    const deniedNext = await runGuard([autonomyLadderRoutes], platformRoutePolicies, unauthenticated)
    expect(deniedNext).not.toHaveBeenCalled()
    expect(unauthenticated.status).toBe(401)

    const authenticated = contextFor('GET', '/api/hermes/autonomy-ladder/', {
      id: 1, role: 'admin', status: 'active', profiles: [],
    })
    const allowedNext = await runGuard([autonomyLadderRoutes], platformRoutePolicies, authenticated)
    expect(allowedNext).toHaveBeenCalledTimes(1)
  })

  it('profile 政策拒绝跨归属并允许本人与 super_admin', async () => {
    const admin = { id: 1, role: 'admin', status: 'active', profiles: ['alice'] } as const
    const denied = contextFor('GET', '/api/userenv/profiles/bob/env', admin)
    const deniedNext = await runGuard([userenvRoutes], platformRoutePolicies, denied)
    expect(deniedNext).not.toHaveBeenCalled()
    expect(denied.status).toBe(403)

    const own = contextFor('GET', '/api/userenv/profiles/alice/env', admin)
    expect((await runGuard([userenvRoutes], platformRoutePolicies, own))).toHaveBeenCalledTimes(1)
    const superAdmin = contextFor('GET', '/api/userenv/profiles/bob/env', { id: 2, role: 'super_admin' })
    expect((await runGuard([userenvRoutes], platformRoutePolicies, superAdmin))).toHaveBeenCalledTimes(1)
  })

  it('未登记写请求默认 403，且不执行后续副作用', async () => {
    const router = new Router()
    router.post('/api/userenv/profiles/:name/rotate', async () => {})
    const ctx = contextFor('POST', '/api/userenv/profiles/alice/rotate', { id: 1, role: 'super_admin' })
    const next = await runGuard([router], [], ctx)
    expect(next).not.toHaveBeenCalled()
    expect(ctx.status).toBe(403)
    expect(ctx.body).toMatchObject({ code: 'PLATFORM_POLICY_UNREGISTERED' })
    expect((ctx.body as { ok: boolean }).ok).toBe(false)
  })

  it('审批政策先于裁决处理器拒绝普通 admin', async () => {
    const ctx = contextFor('POST', '/api/approvals/fleet:s:a/decide', {
      id: 1, role: 'admin', status: 'active', profiles: ['alice'],
    })
    const next = await runGuard([approvalsRoutes], platformRoutePolicies, ctx)
    expect(next).not.toHaveBeenCalled()
    expect(ctx.status).toBe(403)
  })
})
