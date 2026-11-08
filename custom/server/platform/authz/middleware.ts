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
    // N28-3（run28 收尾批）：JWT claims 无 profiles 字段时按用户名回填——「用户默认可访问
    // 与自己同名的 profile」。run28 实录：studio 签发的 JWT 只含 role/matrix_user_id，
    // canAccessProfile 仅 super_admin 直通，普通用户访问自己的 profile env 恒 403
    // （G4 能力探测 userenv 组两红→当轮拦截死锁的根因）。
    if (user && !Array.isArray(user.profiles) && user.username) {
      user.profiles = [user.username]
    }
    if (typeof profile !== 'string' || !profile || !canAccessProfile(user, profile)) {
      fail(ctx, 403, '无权访问该 profile')
      return
    }
    await next()
  }
}
