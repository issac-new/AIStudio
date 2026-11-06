import type { Context, Next } from 'koa'
import type { PlatformPrincipal } from '../../../platform/contracts/identity'
import { fail } from '../../lib/http'
import { canAccessProfile } from './policy'

/** 从路由路径参数提取 profile；未授权时不得进入任何资源探测或写处理器。 */
export function requireProfileParameterAccess(parameter: string) {
  return async (ctx: Context, next: Next): Promise<void> => {
    const user = ctx.state.user as PlatformPrincipal | undefined
    if (!user) {
      fail(ctx, 401, '需要登录后访问')
      return
    }
    const profile = ctx.params?.[parameter]
    if (typeof profile !== 'string' || !profile || !canAccessProfile(user, profile)) {
      fail(ctx, 403, '无权访问该 profile')
      return
    }
    await next()
  }
}
