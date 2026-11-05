import type Router from '@koa/router'
import type { Context, Next } from 'koa'
import type { PlatformPrincipal } from '../../../platform/contracts/identity'
import { fail } from '../../lib/http'
import { requireProfileParameterAccess } from './middleware'
import { requirePlatformSuperAdmin } from './policy'

export type PlatformRouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type PlatformRouteAccess = 'public' | 'authenticated' | 'profile' | 'super-admin'

export interface PlatformRoutePolicy {
  method: PlatformRouteMethod
  pathPattern: string
  access: PlatformRouteAccess
  profileParam?: string
}

interface RouterLayer {
  path?: string | RegExp
  methods?: string[]
  match(path: string): boolean
  captures(path: string): string[]
  params(path: string, captures: string[], existing?: Record<string, string>): Record<string, string>
}

const WRITE_METHODS = new Set<PlatformRouteMethod>(['POST', 'PUT', 'PATCH', 'DELETE'])
const POLICY_METHODS = new Set<PlatformRouteMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

function routeLayers(routers: Router[]): RouterLayer[] {
  return routers.flatMap((router) => router.stack as unknown as RouterLayer[])
    .filter((layer) => typeof layer.path === 'string' && Array.isArray(layer.methods))
}

function policyMatchesLayer(policy: PlatformRoutePolicy, layer: RouterLayer, method: PlatformRouteMethod): boolean {
  return policy.method === method && policy.pathPattern === layer.path
}

/** 启动期从真实 Router stack 对账；通配与未登记写面都直接阻断启动。 */
export function assertPlatformRoutePolicies(routers: Router[], policies: PlatformRoutePolicy[]): void {
  for (const policy of policies) {
    if (policy.pathPattern.includes('*') || policy.pathPattern.includes('(.*)')) {
      throw new Error(`Platform route policy wildcard paths are forbidden: ${policy.method} ${policy.pathPattern}`)
    }
  }

  const missing = new Set<string>()
  for (const layer of routeLayers(routers)) {
    const methods = new Set((layer.methods ?? []) as PlatformRouteMethod[])
    for (const method of methods) {
      if (!POLICY_METHODS.has(method) || !WRITE_METHODS.has(method)) continue
      if (!policies.some((policy) => policyMatchesLayer(policy, layer, method))) {
        missing.add(`${method} ${String(layer.path)}`)
      }
    }
  }
  if (missing.size > 0) {
    throw new Error(`Unregistered write routes: ${[...missing].join(', ')}`)
  }
}

function requestMethod(ctx: Context): PlatformRouteMethod | 'HEAD' | 'OPTIONS' | string {
  return ctx.method.toUpperCase()
}

function matchingPolicy(
  layers: RouterLayer[],
  policies: PlatformRoutePolicy[],
  method: string,
  path: string,
): { policy: PlatformRoutePolicy; layer: RouterLayer } | null {
  const routedMethod = method === 'HEAD' ? 'GET' : method
  for (const policy of policies) {
    if (policy.method !== routedMethod) continue
    const layer = layers.find((candidate) => candidate.path === policy.pathPattern && candidate.match(path))
    if (layer) return { policy, layer }
  }
  return null
}

/**
 * 请求期在指定 Router 范围内默认拒绝未登记写操作。范围由真实路由匹配决定，
 * 因而本中间件可挂在公开链与认证链而不拦截其他域的既有路由。
 */
export function enforcePlatformRoutePolicy(routers: Router[], policies: PlatformRoutePolicy[]) {
  const layers = routeLayers(routers)
  return async (ctx: Context, next: Next): Promise<void> => {
    const path = ctx.path
    const matchedLayers = layers.filter((layer) => layer.match(path))
    if (matchedLayers.length === 0) {
      await next()
      return
    }

    const method = requestMethod(ctx)
    const matched = matchingPolicy(matchedLayers, policies, method, path)
    if (!matched) {
      if (WRITE_METHODS.has(method as PlatformRouteMethod)) {
        fail(ctx, 403, '写路由未登记平台授权政策', { code: 'PLATFORM_POLICY_UNREGISTERED' })
        return
      }
      // 读路由缺政策时也不能落入公开面；至少保持认证默认。
      if (!ctx.state.user) {
        fail(ctx, 401, '需要登录后访问')
        return
      }
      await next()
      return
    }

    const { policy, layer } = matched
    if (policy.access === 'public') {
      await next()
      return
    }
    const user = ctx.state.user as PlatformPrincipal | undefined
    if (policy.access === 'authenticated') {
      if (!user) {
        fail(ctx, 401, '需要登录后访问')
        return
      }
      await next()
      return
    }
    if (policy.access === 'super-admin') {
      await requirePlatformSuperAdmin(ctx, next)
      return
    }

    const profileParam = policy.profileParam
    if (!profileParam) {
      fail(ctx, 403, 'profile 路由缺少归属参数登记', { code: 'PLATFORM_POLICY_UNREGISTERED' })
      return
    }
    ctx.params = layer.params(path, layer.captures(path), ctx.params)
    await requireProfileParameterAccess(profileParam)(ctx, next)
  }
}
