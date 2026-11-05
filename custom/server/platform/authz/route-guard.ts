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
  return policy.method === method && normalizePattern(policy.pathPattern) === normalizePattern(layer.path as string)
}

function isParamSegment(segment: string): boolean {
  return segment.startsWith(':')
}

/** 路径模式归一（P2 Task 4）：去尾斜杠（根 '/' 除外）——'/api/x' 与 '/api/x/' 是
 *  同一路由的两种写法，重叠判定与启动对账都必须在归一空间比对，否则一条尾斜杠
 *  就能绕过重叠守卫或制造假悬垂/假漏登记。 */
function normalizePattern(pathPattern: string): string {
  if (pathPattern === '/') return pathPattern
  return pathPattern.length > 1 && pathPattern.endsWith('/') ? pathPattern.slice(0, -1) : pathPattern
}

/**
 * P1 Task 1（终审前置③）：同 method 政策路径重叠守卫。两条政策在请求期可同时命中
 * 同一请求（等长模式且每一同位段「同为相等静态段」或「任一为参数段」）时，
 * matchingPolicy 按注册表数组顺序取先命中者——授权结果取决于条目顺序而非更具体的
 * 规则（静态路由会被排前的参数路由遮蔽，反之亦然）。重叠清单直接抛错；由
 * assertPlatformRoutePolicies 在启动对账点连带调用（union assert 同点）。
 */
export function assertNoPolicyPathOverlap(policies: PlatformRoutePolicy[]): void {
  for (let i = 0; i < policies.length; i++) {
    for (let j = i + 1; j < policies.length; j++) {
      const a = policies[i]
      const b = policies[j]
      if (a.method !== b.method) continue
      const sa = normalizePattern(a.pathPattern).split('/')
      const sb = normalizePattern(b.pathPattern).split('/')
      if (sa.length !== sb.length) continue
      const overlapping = sa.every((seg, k) => seg === sb[k] || isParamSegment(seg) || isParamSegment(sb[k]))
      if (overlapping) {
        throw new Error(
          `Platform route policies overlap: ${a.method} ${a.pathPattern} vs ${b.method} ${b.pathPattern} — 同一请求两者皆可命中，授权取决于注册表顺序；请消除重叠（参数段与静态段互斥改路径）`,
        )
      }
    }
  }
}

/** 启动期从真实 Router stack 对账；政策重叠、通配、RegExp 写面、悬垂政策与未登记写面都直接阻断启动。 */
export function assertPlatformRoutePolicies(routers: Router[], policies: PlatformRoutePolicy[]): void {
  assertNoPolicyPathOverlap(policies)

  for (const policy of policies) {
    if (policy.pathPattern.includes('*') || policy.pathPattern.includes('(.*)')) {
      throw new Error(`Platform route policy wildcard paths are forbidden: ${policy.method} ${policy.pathPattern}`)
    }
  }

  // Task3①：RegExp 写面按字符串政策对不上账，此前被 routeLayers 的字符串过滤静默吞掉
  // （启动对账不可见）——现在直接抛错。读面无强制登记，RegExp 读路由不在此列。
  const rawLayers = routers.flatMap((router) => router.stack as unknown as RouterLayer[])
    .filter((layer) => Array.isArray(layer.methods))
  for (const layer of rawLayers) {
    if (typeof layer.path === 'string') continue
    const writes = (layer.methods ?? [])
      .filter((method) => WRITE_METHODS.has(method as PlatformRouteMethod))
    if (writes.length > 0) {
      throw new Error(`Platform write routes with RegExp paths cannot be reconciled against string policies: ${writes.join('/')} ${String(layer.path)}`)
    }
  }

  const layers = rawLayers.filter((layer): layer is RouterLayer & { path: string } => typeof layer.path === 'string')

  // Task3②：双向对账——注册表政策也必须指向真实路由（方法+路径都一致），
  // 悬垂政策此前只有源序测试能发现，现在启动即失败。
  const dangling = policies.filter((policy) => !layers.some((layer) =>
    (layer.methods ?? []).includes(policy.method) && policyMatchesLayer(policy, layer, policy.method)))
  if (dangling.length > 0) {
    throw new Error(`Platform route policies without matching routes: ${dangling.map((policy) => `${policy.method} ${policy.pathPattern}`).join(', ')}`)
  }

  const missing = new Set<string>()
  for (const layer of layers) {
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
    const layer = layers.find((candidate) => normalizePattern(candidate.path as string) === normalizePattern(policy.pathPattern) && candidate.match(path))
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
